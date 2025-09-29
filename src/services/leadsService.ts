import { supabase } from '../lib/supabase'
import { logAction } from './actionTracker'
import { ReplacementService } from './replacementService'
import { createHitCount } from './hitCountsService'
import type { Lead, LeadEntry } from '../types'
import { ReplacementState } from '../features/leadReplacement'

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
  
  // Store hit count for normal lead (NL = +1)
  try {
    const lane = (created.unitCount >= 1000) ? '1kplus' : 'sub1k';
    await createHitCount({
      repId: created.assignedTo,
      hitType: 'NL',
      hitValue: 1,
      lane,
      month: created.month,
      year: created.year
    });
  } catch (hitError) {
    console.error('Failed to store hit count for new lead:', hitError);
    // Don't fail the lead creation if hit count storage fails
  }
  
  await logAction({
    actionType: 'CREATE',
    tableName: 'leads',
    recordId: created.id,
    newData: created
  })
  
  return created
}

/** CREATE LRL lead with replacement relationship */
  /** CREATE LRL lead with replacement relationship */
export async function createLeadWithReplacement(
  input: Omit<Lead, 'id'> & { id?: string },
  originalLeadIdToReplace: string
): Promise<Lead> {
  const id = input.id ?? `lead_${Date.now()}`
  const newLead: Lead = { ...input, id }
  
  // Create the new lead first (without hit count - it will be added when we apply replacement)
  const { data, error } = await supabase
    .from('leads')
    .insert(leadToRow(newLead))
    .select()
    .single()
  
  if (error) throw error
  
  const created = rowToLead(data as DBLeadRow)
  
  // Apply the replacement relationship
  try {
    // Find the replacement mark for the original lead
    const { data: markData, error: markError } = await supabase
      .from('replacement_marks')
      .select('id')
      .eq('lead_id', originalLeadIdToReplace)
      .single()
    
    if (markError) throw markError
    if (!markData) throw new Error('Original lead not marked for replacement')
    
    // Update the replacement mark with the new lead ID
    // Update the replacement mark with the new lead ID
    // This now creates the LRL hit count inside updateReplacementMark
    await ReplacementService.updateReplacementMark(markData.id, created.id)
    
    console.log('LRL replacement applied successfully:', {
      originalLeadId: originalLeadIdToReplace,
      newLeadId: created.id,
      markId: markData.id
    })
    
  } catch (replacementError) {
    console.error('Error applying replacement:', replacementError)
    // Rollback the lead creation if replacement fails
    await supabase.from('leads').delete().eq('id', created.id)
    throw new Error('Failed to create replacement relationship')
  }
  
  await logAction({
    actionType: 'CREATE',
    tableName: 'leads',
    recordId: created.id,
    newData: created
  })
  
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
  
  await logAction({
    actionType: 'UPDATE',
    tableName: 'leads',
    recordId: id,
    oldData: oldData ? rowToLead(oldData as DBLeadRow) : null,
    newData: updated
  })
  
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

/** ENHANCED DELETE with replacement cascade handling */
export async function deleteLeadWithReplacementHandling(leadId: string): Promise<void> {
  console.log(`Starting enhanced deletion for lead: ${leadId}`)
  
  try {
    // Step 1: Check if this lead is a replacement for another lead
    const { data: isReplacementData, error: isReplacementError } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('replaced_by_lead_id', leadId)
      .maybeSingle()
    
    if (isReplacementError) throw isReplacementError
    
    if (isReplacementData) {
      console.log(`Lead ${leadId} is a replacement lead, reopening original mark: ${isReplacementData.lead_id}`)
      // This lead replaced another - reopen the original mark
      await ReplacementService.undoReplacement(isReplacementData.id)
    }
    
    
    // Step 2: Check if this lead has a replacement
    const { data: hasReplacementData, error: hasReplacementError } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle()
    
    if (hasReplacementError) throw hasReplacementError
    
    if (hasReplacementData && hasReplacementData.replaced_by_lead_id) {
      console.log(`Lead ${leadId} has replacement ${hasReplacementData.replaced_by_lead_id}, deleting replacement first`)
      // This lead has a replacement - delete replacement first (recursive call)
      await deleteLeadWithReplacementHandling(hasReplacementData.replaced_by_lead_id)
    }
    
    // Step 3: Remove any replacement marks for this lead
    if (hasReplacementData) {
      console.log(`Removing replacement mark for lead: ${leadId}`)
      await ReplacementService.deleteReplacementMark(hasReplacementData.id)
    }
    
    // Step 4: Get old data for logging before deletion
    const { data: oldData } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()
    
    // Step 5: Finally delete the lead itself
    console.log(`Deleting lead from database: ${leadId}`)
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
    
    if (deleteError) throw deleteError


   // Step 5.1: Compensating hit to reverse this lead's counted contribution
    // - If this lead is an LRL replacement => write LRL = -1
    // - If this lead is a marked MFR => no compensation (already at 0)
    // - Else normal lead => write NL = -1
    try {
      // We fetched these above; both variables are in this function’s scope:
      //   const { data: isReplacementData } = supabase.from('replacement_marks').eq('replaced_by_lead_id', leadId).maybeSingle()
      //   const { data: hasReplacementData } = supabase.from('replacement_marks').eq('lead_id', leadId).maybeSingle()
      //
      // We also fetched oldData above for logging; use it for lane/rep:
      //   const { data: oldData } = supabase.from('leads').select('*').eq('id', leadId).single()
      const now = new Date();
      const old = oldData as any; // DB row
      const repId = (old?.assigned_to ?? '') as string;
      const units = (old?.unit_count ?? 0) as number;
      const lane: 'sub1k' | '1kplus' = units >= 1000 ? '1kplus' : 'sub1k';

      // Determine the lead type and apply appropriate compensating hit
      const isMFR = hasReplacementData && !hasReplacementData.replaced_by_lead_id;
      const isLRL = isReplacementData;
      
      if (isLRL) {
        // This lead was an LRL – negate its previous +1
        console.log('Deleting LRL lead - compensating with LRL -1');
        await createHitCount({
          repId,
          leadEntryId: leadId,
          hitType: 'LRL',
          hitValue: -1,
          lane,
          month: now.getMonth() + 1,
          year:  now.getFullYear(),
        });
      } else if (isMFR) {
        // This lead is marked as MFR (not yet replaced) - send hit_value: 0
        // User wants explicit 0 record for DELETE MFR for audit purposes
        console.log('Deleting MFR lead - recording MFR 0 for audit');
        await createHitCount({
          repId,
          leadEntryId: leadId,
          hitType: 'MFR',
          hitValue: 0,
          lane,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        });
      } else {
        // Normal counted lead (NL) — negate its previous +1
        console.log('Deleting NL lead - compensating with NL -1');
        await createHitCount({
          repId,
          leadEntryId: leadId,
          hitType: 'NL',
          hitValue: -1,
          lane,
          month: now.getMonth() + 1,
          year:  now.getFullYear(),
        });
      }
    } catch (compErr) {
      console.error('Failed to write compensating hit on lead delete:', compErr);
    }
    
    // Step 6: Log the deletion
    if (oldData) {
      await logAction({
        actionType: 'DELETE',
        tableName: 'leads',
        recordId: leadId,
        oldData: rowToLead(oldData as DBLeadRow)
      })
    }
    
    console.log(`Successfully deleted lead with replacement handling: ${leadId}`)
    
  } catch (error) {
    console.error(`Error in enhanced lead deletion for ${leadId}:`, error)
    throw error
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