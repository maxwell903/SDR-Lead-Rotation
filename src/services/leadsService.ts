import { supabase } from '../lib/supabase'
import { logAction } from './actionTracker'
import { ReplacementService } from './replacementService'
import { createHitCount } from './hitCountsService'
import type { Lead, LeadEntry } from '../types'
import { ReplacementState } from '../features/leadReplacement'
import { logAuditAction, getRepHitTotal } from './auditLogger';
import { checkAndDecrementCushion } from './cushionService';

// DB row shape (snake_case from your schema)
type DBLeadRow = {
  id: string
  account_number: string | null
  url: string | null
  property_types: string[] | null
  unit_count: number | null
  assigned_to: string | null
  date: string | null
  comments: string[] | null
  month: number | null
  year: number | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

// Convert DB row to frontend Lead type
const rowToLead = (r: DBLeadRow): Lead => ({
  id: r.id,
  accountNumber: r.account_number ?? '',
  url: r.url ?? '',
  propertyTypes: (r.property_types ?? []) as Lead['propertyTypes'],
  unitCount: r.unit_count ?? 0,
  assignedTo: r.assigned_to ?? '',
  date: r.date ? new Date(r.date) : new Date(),
  comments: r.comments ?? [],
  month: r.month ?? new Date().getMonth() + 1,
  year: r.year ?? new Date().getFullYear(),
})

// Convert frontend Lead to DB row
const leadToRow = (lead: Lead): Partial<DBLeadRow> => ({
  id: lead.id,
  account_number: lead.accountNumber,
  url: lead.url,
  property_types: lead.propertyTypes,
  unit_count: lead.unitCount,
  assigned_to: lead.assignedTo,
  date: lead.date?.toISOString(),
  comments: lead.comments,
  month: lead.month,
  year: lead.year,
})

/** READ all leads */
export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return (data as DBLeadRow[] | null)?.map(rowToLead) ?? []
}

function getDateComponents(date: Date): { day: number; month: number; year: number } {
  return {
    day: date.getDate(),
    month: date.getMonth() + 1,  // JavaScript months are 0-indexed
    year: date.getFullYear()
  };
}

/** CREATE one lead */
export async function createLead(
  input: Omit<Lead, 'id'> & { id?: string }
): Promise<Lead> {
  const id = input.id ?? `lead_${Date.now()}`
  const newLead: Lead = { ...input, id }
  
  const { data, error } = await supabase
    .from('leads')
    .insert(leadToRow(newLead))
    .select()
    .single()
  
  if (error) throw error
  
  const created = rowToLead(data as DBLeadRow)
  
  // Determine lane from unit count
  const lane: 'sub1k' | '1kplus' = (created.unitCount >= 1000) ? '1kplus' : 'sub1k';

  // ⭐ NEW: Check cushion before creating hit count
  const { shouldRecordHit, newCushionValue } = await checkAndDecrementCushion(
    created.assignedTo,
    lane
  );

  console.log(`🎯 Lead assignment - Rep: ${created.assignedTo}, Lane: ${lane}, Cushion: ${newCushionValue}, Record Hit: ${shouldRecordHit}`);

  // Only create hit count if cushion allows it
  if (shouldRecordHit) {
    // Get total BEFORE creating the hit
    const totalBefore = await getRepHitTotal(created.assignedTo, lane, created.month, created.year);
    
    await createHitCount({
      repId: created.assignedTo,
      leadEntryId: undefined, // Will be set when lead entry is created
      hitType: 'NL',
      hitValue: 1,
      lane,
      month: created.month,
      year: created.year,
    });

    // Log audit action
    await logAuditAction({
  actionSubtype: 'ADD_NL',  // ✅ Correct - use actionSubtype with proper value
  tableName: 'leads',  // ✅ Add required tableName
  recordId: created.id,  // ✅ Add required recordId
  affectedRepId: created.assignedTo,  // ✅ Change repId to affectedRepId
  accountNumber: created.accountNumber,
  lane,
  hitValueChange: 1,
  hitValueTotal: totalBefore + 1,
  actionDay: created.date.getDate(),  // ✅ Change day to actionDay
  actionMonth: created.month,  // ✅ Change month to actionMonth
  actionYear: created.year,  // ✅ Change year to actionYear
});
  } else {
    // Log that lead was assigned but no hit recorded due to cushion
    await logAction({
      actionType: 'CREATE',
      tableName: 'leads',
      recordId: created.id,
      newData: {
        assigned_to: created.assignedTo,
        cushion_absorbed: true,
        cushion_remaining: newCushionValue,
        lane
      }
    });
  }

  return created;
}

/** CREATE LRL lead with replacement relationship */
/** CREATE LRL lead with replacement relationship */
// Fix for createLeadWithReplacement in leadsService.ts
// This logs the MFR → LRL transition

export async function createLeadWithReplacement(
  input: Omit<Lead, 'id'> & { id?: string },
  originalLeadIdToReplace: string
): Promise<Lead> {
  const id = input.id ?? `lead_${Date.now()}`
  const newLead: Lead = { ...input, id }
  
  console.log('🔵 START: createLeadWithReplacement', {
    newLeadId: id,
    originalLeadId: originalLeadIdToReplace
  });
  
  // Insert lead WITHOUT creating a hit count
  console.log('🔵 Step 1: Inserting lead into database (NO HIT COUNT)');
  const { data, error } = await supabase
    .from('leads')
    .insert(leadToRow(newLead))
    .select()
    .single()
  
  if (error) throw error
  console.log('✅ Lead inserted successfully:', data.id);
  
  const created = rowToLead(data as DBLeadRow)
   const { day, month, year } = getDateComponents(created.date);
  
  // Apply the replacement relationship
  let replacementLane: 'sub1k' | '1kplus' = 'sub1k'; // Default
  let repId: string = '';
  
  try {
    console.log('🔵 Step 2: Finding replacement mark');
    const { data: markData, error: markError } = await supabase
      .from('replacement_marks')
      .select('id, lane, rep_id, account_number')
      .eq('lead_id', originalLeadIdToReplace)
      .single()
    
    if (markError) throw markError
    if (!markData) throw new Error('Original lead not marked for replacement')
    
    // Store the lane and rep for audit logging
    replacementLane = markData.lane as 'sub1k' | '1kplus';
    repId = markData.rep_id;
    
    console.log('✅ Found replacement mark:', markData.id, 'lane:', markData.lane);
    
    // ✅ STEP 2.5: Get total BEFORE updating the mark (which creates LRL hit)
    let totalBeforeAction = 0;
    try {
      const { getRepHitTotal } = await import('./auditLogger');
      totalBeforeAction = await getRepHitTotal(
        repId,
        replacementLane,
        created.month,
        created.year
      );
      console.log('📊 Total before LRL:', totalBeforeAction);
    } catch (err) {
      console.error('Failed to get current hit total:', err);
    }
    
    console.log('🔵 Step 3: Updating replacement mark (THIS WILL CREATE LRL 0)');
    await ReplacementService.updateReplacementMark(markData.id, created.id)
    console.log('✅ LRL 0 hit count created');
    
    // ✅ Log to audit trail with BEFORE value
    console.log('🔵 Step 4: Logging to audit trail');
    try {
      const { logAuditAction } = await import('./auditLogger');
      
      await logAuditAction({
        actionSubtype: 'MFR_TO_LRL',
        tableName: 'leads',
        recordId: created.id,
        affectedRepId: repId,
        accountNumber: created.accountNumber,
        hitValueChange: 0,  // LRL adds 0 hits
        hitValueTotal: totalBeforeAction,  
        lane: replacementLane,
        actionDay: day,      
        actionMonth: month,  
        actionYear: year     
      });
      console.log('✅ Audit log created');
    } catch (auditError) {
      console.error('Failed to log replacement to audit:', auditError);
    }
    
    console.log('✅ END: createLeadWithReplacement complete');
    
  } catch (replacementError) {
    console.error('❌ Error applying replacement:', replacementError)
    await supabase.from('leads').delete().eq('id', created.id)
    throw new Error('Failed to create replacement relationship')
  }
  
  return created
}

/** UPDATE one lead by id */
export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
  // Get old data for logging
  const { data: oldData } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!oldData) throw new Error('Lead not found')
  
  const oldLead = rowToLead(oldData as DBLeadRow)
  
  
  // Check if assigned_to is changing (rep transfer)
const isRepTransfer = patch.assignedTo && patch.assignedTo !== oldLead.assignedTo

// NEW: Check if unit_count is changing AND crosses lane threshold
const isUnitCountChange = patch.unitCount !== undefined && patch.unitCount !== oldLead.unitCount
const oldLane = (oldLead.unitCount ?? 0) >= 1000 ? '1kplus' : 'sub1k'
const newLane = (patch.unitCount ?? 0) >= 1000 ? '1kplus' : 'sub1k'
const isLaneChange = isUnitCountChange && oldLane !== newLane

 // Block lane-crossing edits
  if (isUnitCountChange && oldLane !== newLane) {
    throw new Error('Cannot change unit count across lane threshold. Delete and recreate instead.')
  }

   // Block rep transfers
  if (isRepTransfer) {
    throw new Error('Cannot transfer lead to different rep. Delete and recreate instead.')
  }



// Determine lead type before the update (needed for both rep transfer AND lane change)
let leadType: 'NL' | 'MFR' | 'LRL' = 'NL'

// Check lead type if we need it (for rep transfer OR lane change)
if (isRepTransfer || isLaneChange) {
  // Check if this lead is marked for replacement
  const { data: markData } = await supabase
    .from('replacement_marks')
    .select('*')
    .eq('lead_id', id)
    .maybeSingle()
  
  // Check if this lead is a replacement for another
  const { data: replacementData } = await supabase
    .from('replacement_marks')
    .select('*')
    .eq('replaced_by_lead_id', id)
    .maybeSingle()
  
  if (markData && !markData.replaced_by_lead_id) {
    leadType = 'MFR'
  } else if (replacementData) {
    leadType = 'LRL'
  }
}
 
  
    // Never allow id to be updated in the payload
  const payload = { ...leadToRow(patch as Lead) } as any;
  delete payload.id;
  const { data, error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  
  const updated = rowToLead(data as DBLeadRow)

   const { data: replacementMark } = await supabase
    .from('replacement_marks')
    .select('*')
    .eq('lead_id', id)
    .maybeSingle()

    // Check if this is an LRL (replacement lead)
  const { data: isLRL } = await supabase
    .from('replacement_marks')
    .select('id')
    .eq('replaced_by_lead_id', id)
    .maybeSingle()

  const isMFR = replacementMark && !replacementMark.replaced_by_lead_id
  const isLTR = replacementMark && replacementMark.replaced_by_lead_id
  const isReplacementLead = !!isLRL

// NEW: Handle lane change with hit compensation (unit count crossed 1000 threshold)
// Handle lane change with hit compensation
if (isLaneChange) {
  const now = new Date()
  const repId = oldLead.assignedTo
  
  console.log(`Lane change detected for lead ${id}: ${oldLane} -> ${newLane} (type: ${leadType})`)
  
  try {
    const oldHitValue = leadType === 'MFR' ? -1 : 1
    await createHitCount({
      repId,
      // ❌ REMOVED: leadEntryId: id,
      hitType: leadType,
      hitValue: -oldHitValue,
      lane: oldLane as 'sub1k' | '1kplus',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
    
    await createHitCount({
      repId,
      // ❌ REMOVED: leadEntryId: id,
      hitType: leadType,
      hitValue: oldHitValue,
      lane: newLane as 'sub1k' | '1kplus',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
    
    console.log(`Successfully moved ${leadType} hit from ${oldLane} to ${newLane}`)
  } catch (hitError) {
    console.error('Failed to write hit compensation for lane change:', hitError)
  }
}

// Handle rep transfer with hit compensation
if (isRepTransfer) {
  const now = new Date()
  const oldRepId = oldLead.assignedTo
  const newRepId = updated.assignedTo
  const units = updated.unitCount ?? 0
  const lane: 'sub1k' | '1kplus' = units >= 1000 ? '1kplus' : 'sub1k'
  
  console.log(`Transferring lead ${id} from ${oldRepId} to ${newRepId} (type: ${leadType})`)
  
  try {
    const oldHitValue = leadType === 'MFR' ? -1 : leadType === 'LRL' ? 0 : 1
    await createHitCount({
      repId: oldRepId,
      // ❌ REMOVED: leadEntryId: id,
      hitType: leadType,
      hitValue: -oldHitValue,
      lane,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
    
    await createHitCount({
      repId: newRepId,
      // ❌ REMOVED: leadEntryId: id,
      hitType: leadType,
      hitValue: oldHitValue,
      lane,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
    
    console.log(`Successfully transferred ${leadType} hit from ${oldRepId} to ${newRepId}`)
  } catch (hitError) {
    console.error('Failed to write hit compensation for rep transfer:', hitError)
  }
}

// Handle rep transfer with hit compensation
if (isRepTransfer) {
  const now = new Date()
  const oldRepId = oldLead.assignedTo
  const newRepId = updated.assignedTo
  const units = updated.unitCount ?? 0
  const lane: 'sub1k' | '1kplus' = units >= 1000 ? '1kplus' : 'sub1k'
  
  console.log(`Transferring lead ${id} from ${oldRepId} to ${newRepId} (type: ${leadType})`)
  
  try {
    // Remove hit from old rep
    const oldHitValue = leadType === 'MFR' ? -1 : leadType === 'LRL' ? 1 : 1
    await createHitCount({
      repId: oldRepId,
      leadEntryId: id,
      hitType: leadType,
      hitValue: -oldHitValue, // Negate the original value
      lane,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
    
    // Add hit to new rep
    await createHitCount({
      repId: newRepId,
      leadEntryId: id,
      hitType: leadType,
      hitValue: oldHitValue, // Original value
      lane,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
    
    console.log(`Successfully transferred ${leadType} hit from ${oldRepId} to ${newRepId}`)
  } catch (hitError) {
    console.error('Failed to write hit compensation for rep transfer:', hitError)
  }
}






const { day, month, year } = getDateComponents(updated.date);
  
  await logAuditAction({
    actionSubtype: 'UPDATE_LEAD',
    tableName: 'leads',
    recordId: id,
    affectedRepId: updated.assignedTo,
    accountNumber: updated.accountNumber,
    actionDay: day,      
    actionMonth: month,  
    actionYear: year     
  });


return updated
}



// replacementService.ts - Enhanced replacement application
export async function dbApplyReplacement(
  originalLeadId: string, 
  newLead: Lead
): Promise<void> {
  try {
    // Find the replacement mark for the original lead
    const { data: markData, error: markError } = await supabase
      .from('replacement_marks')
      .select('id')
      .eq('lead_id', originalLeadId)
      .single();
    
    if (markError) throw markError;
    if (!markData) throw new Error('Original lead not marked for replacement');
    
    // Update the replacement mark with the new lead ID
    await ReplacementService.updateReplacementMark(markData.id, newLead.id);
    
    console.log('LRL replacement applied successfully:', {
      originalLeadId,
      newLeadId: newLead.id,
      markId: markData.id
    });
    
  } catch (error) {
    console.error('Error applying LRL replacement:', error);
    throw error;
  }
}

// Enhanced replacement state helper functions
// Enhanced replacement state helper functions with hit calculation logic
export function getLRLVisualState(entry: LeadEntry, replacementState: ReplacementState): {
  isLRL: boolean;
  isRLBR: boolean; 
  isNeedsReplacement: boolean;
  partnerLeadId?: string;
  partnerAccountNumber?: string;
  hitValue: number; // NL = +1, LRL = 0, RLBR = 0, NA = 0, MFR = -1
} {
  if (!entry.leadId || !replacementState) {
    // For non-lead entries or when no replacement state
    if (entry.type === 'skip') {
      return { isLRL: false, isRLBR: false, isNeedsReplacement: false, hitValue: 1 };
    }
    if (entry.type === 'lead') {
      return { isLRL: false, isRLBR: false, isNeedsReplacement: false, hitValue: 1 }; // NL = +1
    }
    return { isLRL: false, isRLBR: false, isNeedsReplacement: false, hitValue: 0 }; // NA = 0
  }
  
  // Check if this lead is marked for replacement
  const replacementRecord = replacementState.byLeadId[entry.leadId];
  if (replacementRecord) {
    const isReplaced = Boolean(replacementRecord.replacedByLeadId);
    return {
      isLRL: false,
      isRLBR: isReplaced,
      isNeedsReplacement: !isReplaced,
      partnerLeadId: replacementRecord.replacedByLeadId,
      partnerAccountNumber: replacementRecord.accountNumber,
      hitValue: isReplaced ? 0 : -1 // RLBR = 0 hits, MFR = -1 hits
    };
  }
  
  // Check if this lead is a replacement for another lead (LRL)
  const originalRecord = Object.values(replacementState.byLeadId).find(
    record => record.replacedByLeadId === entry.leadId
  );
  
  if (originalRecord) {
    return {
      isLRL: true,
      isRLBR: false,
      isNeedsReplacement: false,
      partnerLeadId: originalRecord.leadId,
      partnerAccountNumber: originalRecord.accountNumber,
      hitValue: 0 // LRL = +0 hit
    };
  }
  
  // Normal lead (NL)
  return { 
    isLRL: false, 
    isRLBR: false, 
    isNeedsReplacement: false, 
    hitValue: 1 // NL = +1 hit
  };
}

// Helper function to calculate hit value for rotation logic
export function getEntryHitValue(entry: LeadEntry, replacementState: ReplacementState): number {
  const visual = getLRLVisualState(entry, replacementState);
  return visual.hitValue;
}

/** UPSERT many leads (insert/update by id) */
export async function upsertLeads(leads: Lead[]): Promise<Lead[]> {
  if (!leads.length) return []
  
  const payload = leads.map(leadToRow)
  const { data, error } = await supabase
    .from('leads')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
  
  if (error) throw error
  
  const upserted = (data as DBLeadRow[] | null)?.map(rowToLead) ?? []
  
  // Log actions for each lead
  for (const lead of upserted) {
    await logAction({
      actionType: 'UPDATE', // Upsert is treated as update
      tableName: 'leads',
      recordId: lead.id,
      newData: lead
    })
  }
  
  return upserted
}

// Complete replacement for deleteLeadWithReplacementHandling in leadsService.ts
// Replace the entire function starting around line 540

export async function deleteLeadWithReplacementHandling(leadId: string): Promise<void> {
  console.log(`Starting deletion process for lead: ${leadId}`);
  
  try {
    // ✅ Step 1: Check replacement status BEFORE deletion
    const { data: isReplacementData } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('replaced_by_lead_id', leadId)
      .maybeSingle();
    
    const { data: hasReplacementData } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle();
    
    // Step 2: Handle cascading deletions for replacement relationships
    if (isReplacementData) {
      // This lead is an LRL, need to unmark the original
      console.log(`Lead ${leadId} is an LRL, unmarking original lead ${isReplacementData.lead_id}`);
      await ReplacementService.undoReplacement(isReplacementData.id);
    }
    
    if (hasReplacementData?.replaced_by_lead_id) {
      // This lead has been replaced (RLBR), also delete the replacement
      console.log(`Lead ${leadId} has replacement ${hasReplacementData.replaced_by_lead_id}, deleting it first`);
      await deleteLeadWithReplacementHandling(hasReplacementData.replaced_by_lead_id);
    }
    
    if (hasReplacementData && !hasReplacementData.replaced_by_lead_id) {
      // This lead is marked but not replaced (MFR), remove the mark
      console.log(`Lead ${leadId} is marked for replacement, removing mark`);
      await ReplacementService.deleteReplacementMark(hasReplacementData.id);
    }
    
    // Step 3: Get old data BEFORE deletion for audit logging
    const { data: oldData } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    
    if (!oldData) {
      console.log(`Lead ${leadId} not found, may have been deleted in cascade`);
      return;
    }
    
    // Step 4: Delete the lead itself
    console.log(`Deleting lead from database: ${leadId}`);
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId);
    
    if (deleteError) throw deleteError;

    // Step 5: Create compensating hit and log to audit
    try {
      const now = new Date();
      const old = oldData as any;
      const repId = (old?.assigned_to ?? '') as string;
      const units = (old?.unit_count ?? 0) as number;
      const lane: 'sub1k' | '1kplus' = units >= 1000 ? '1kplus' : 'sub1k';
      const accountNumber = old?.account_number ?? '';

      // Determine the lead type from the data we fetched earlier
      const isMFR = hasReplacementData && !hasReplacementData.replaced_by_lead_id;
      const isLRL = isReplacementData;
      
      // ✅ Get total BEFORE creating compensating hit
      let totalBeforeAction = 0;
      try {
        const { getRepHitTotal } = await import('./auditLogger');
        totalBeforeAction = await getRepHitTotal(
          repId,
          lane,
          now.getMonth() + 1,
          now.getFullYear()
        );
      } catch (err) {
        console.error('Failed to get current hit total:', err);
      }

      const leadDate = old?.date ? new Date(old.date) : new Date();
      const day = leadDate.getDate();
      const leadMonth = leadDate.getMonth() + 1;
      const leadYear = leadDate.getFullYear();
      
      // Create compensating hit count and log to audit
      if (isLRL) {
        console.log('Deleting LRL lead - recording LRL 0 (no rotation impact)');
        await createHitCount({
          repId,
          hitType: 'LRL',
          hitValue: -1,
          lane,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          
        });
        
        // ✅ Log DELETE_LRL to audit
        const { logAuditAction } = await import('./auditLogger');
        await logAuditAction({
          actionSubtype: 'DELETE_LRL',
          tableName: 'leads',
          recordId: leadId,
          affectedRepId: repId,
          accountNumber: accountNumber,
          hitValueChange: 0,
          hitValueTotal: totalBeforeAction,  // ✅ BEFORE value
          lane: lane,
          actionDay: day,          // ✅ ADD
          actionMonth: leadMonth,  // ✅ ADD
          actionYear: leadYear     // ✅ ADD
          
        });
        
      } else if (isMFR) {
        console.log('Deleting MFR lead - recording MFR 0 for audit');
        await createHitCount({
          repId,
          hitType: 'MFR',
          hitValue: 0,
          lane,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
        
        // ✅ Log DELETE_MFR to audit
        const { logAuditAction } = await import('./auditLogger');
        await logAuditAction({
          actionSubtype: 'DELETE_MFR',
          tableName: 'leads',
          recordId: leadId,
          affectedRepId: repId,
          accountNumber: accountNumber,
          hitValueChange: 0,
          hitValueTotal: totalBeforeAction,  // ✅ BEFORE value
          lane: lane,
          actionDay: day,          // ✅ ADD
          actionMonth: leadMonth,  // ✅ ADD
          actionYear: leadYear     // ✅ ADD
        });
        
      } else {
        console.log('Deleting NL lead - compensating with NL -1');
        await createHitCount({
          repId,
          hitType: 'NL',
          hitValue: -1,
          lane,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
        
        // ✅ Log DELETE_NL to audit
        const { logAuditAction } = await import('./auditLogger');
        await logAuditAction({
          actionSubtype: 'DELETE_NL',
          tableName: 'leads',
          recordId: leadId,
          affectedRepId: repId,
          accountNumber: accountNumber,
          hitValueChange: -1,
          hitValueTotal: totalBeforeAction,  // ✅ BEFORE value
          lane: lane,
          actionDay: day,          // ✅ ADD
          actionMonth: leadMonth,  // ✅ ADD
          actionYear: leadYear     // ✅ ADD
        });
      }
    } catch (compErr) {
      console.error('Failed to write compensating hit on lead delete:', compErr);
    }
    
    console.log(`Successfully deleted lead with replacement handling: ${leadId}`);
    
  } catch (error) {
    console.error(`Error in enhanced lead deletion for ${leadId}:`, error);
    throw error;
  }
}

/** Helper function to check if a lead can be safely deleted */
export async function checkLeadDeletionStatus(leadId: string): Promise<{
  canDelete: boolean
  isReplacement: boolean
  hasReplacement: boolean
  replacementLeadId?: string
  originalLeadId?: string
  warningMessage?: string
}> {
  try {
    // Check if this lead is a replacement
    const { data: isReplacementData } = await supabase
      .from('replacement_marks')
      .select('lead_id')
      .eq('replaced_by_lead_id', leadId)
      .maybeSingle()
    
    // Check if this lead has a replacement
    const { data: hasReplacementData } = await supabase
      .from('replacement_marks')
      .select('replaced_by_lead_id')
      .eq('lead_id', leadId)
      .maybeSingle()
    
    const isReplacement = Boolean(isReplacementData)
    const hasReplacement = Boolean(hasReplacementData?.replaced_by_lead_id)
    
    let warningMessage: string | undefined
    
    if (isReplacement && hasReplacement) {
      warningMessage = 'This lead is both a replacement and has its own replacement. Deletion will cascade through the chain.'
    } else if (isReplacement) {
      warningMessage = 'This lead is replacing another lead. Deletion will reopen the original replacement request.'
    } else if (hasReplacement) {
      warningMessage = 'This lead has a replacement. Deletion will also remove the replacement lead.'
    }
    
    return {
      canDelete: true, // Enhanced deletion can always handle it
      isReplacement,
      hasReplacement,
      replacementLeadId: hasReplacementData?.replaced_by_lead_id,
      originalLeadId: isReplacementData?.lead_id,
      warningMessage
    }
  } catch (error) {
    console.error('Error checking lead deletion status:', error)
    return {
      canDelete: false,
      isReplacement: false,
      hasReplacement: false,
      warningMessage: 'Error checking deletion status'
    }
  }
}

/** DELETE many leads by ids with replacement handling */
export async function deleteLeadsWithReplacementHandling(ids: string[]): Promise<void> {
  if (!ids.length) return
  
  console.log(`Starting batch deletion with replacement handling for ${ids.length} leads`)
  
  // Process each lead individually to handle replacement logic
  for (const id of ids) {
    await deleteLeadWithReplacementHandling(id)
  }
  
  console.log(`Completed batch deletion with replacement handling`)
}

/** Simple DELETE functions (legacy - for backwards compatibility) */
export async function deleteLeads(ids: string[]): Promise<void> {
  console.warn('Using legacy deleteLeads function - consider using deleteLeadsWithReplacementHandling for better replacement support')
  
  if (!ids.length) return
  
  // Get old data for logging
  const { data: oldData } = await supabase
    .from('leads')
    .select('*')
    .in('id', ids)
  
  const { error } = await supabase
    .from('leads')
    .delete()
    .in('id', ids)
  
  if (error) throw error
  
  // Log deletion actions
  if (oldData) {
    for (const row of oldData) {
      await logAction({
        actionType: 'DELETE',
        tableName: 'leads',
        recordId: row.id,
        oldData: rowToLead(row as DBLeadRow)
      })
    }
  }

  

}

/** Simple DELETE one lead by id (legacy - for backwards compatibility) */
export async function deleteLead(id: string): Promise<void> {
  console.warn('Using legacy deleteLead function - consider using deleteLeadWithReplacementHandling for better replacement support')
  await deleteLeads([id])
}

/** Realtime subscription */
export function subscribeLeads(onChange: () => void): () => void {
  const channel = supabase
    .channel('leads_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, onChange)
    .subscribe()

  // Cleanup must be synchronous for React
  return () => {
    void supabase.removeChannel(channel) // fire and forget
  }
}