// services/replacementService.ts
import { supabase } from '../lib/supabase';
import { ReplacementRecord } from '../features/leadReplacement';
import { createHitCount } from './hitCountsService';

export interface DbReplacementMark {
  id: string;
  lead_id: string;
  rep_id: string;
  lane: string;
  marked_at: string;
  replaced_by_lead_id?: string;
  account_number?: string;
  url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Convert DB record to app format
const dbToAppFormat = (dbRecord: DbReplacementMark): ReplacementRecord => ({
  markId: dbRecord.id,
  leadId: dbRecord.lead_id,
  repId: dbRecord.rep_id,
  lane: dbRecord.lane as any,
  accountNumber: dbRecord.account_number || '',
  url: dbRecord.url || '',
  markedAt: new Date(dbRecord.marked_at).getTime(),
  replacedByLeadId: dbRecord.replaced_by_lead_id,
  replacedAt: dbRecord.replaced_by_lead_id ? new Date(dbRecord.updated_at).getTime() : undefined,
  get isClosed() { return Boolean(this.replacedByLeadId); },
});

// Convert app format to DB format
const appToDbFormat = (appRecord: Partial<ReplacementRecord>) => ({
  lead_id: appRecord.leadId,
  rep_id: appRecord.repId,
  lane: appRecord.lane,
  marked_at: appRecord.markedAt ? new Date(appRecord.markedAt).toISOString() : undefined,
  replaced_by_lead_id: appRecord.replacedByLeadId,
  account_number: appRecord.accountNumber,
  url: appRecord.url,
});

export class ReplacementService {
  // Create new replacement mark
  static async createReplacementMark(record: Omit<ReplacementRecord, 'markId' | 'markedAt' | 'isClosed'>): Promise<ReplacementRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  console.log('Creating replacement mark with lane:', record.lane);

  const dbData = {
    lead_id: record.leadId,
    rep_id: record.repId,
    lane: record.lane,  // This is already normalized (RotationLane type)
    marked_at: new Date().toISOString(),
    account_number: record.accountNumber,
    url: record.url,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from('replacement_marks')
    .insert(dbData)
    .select()
    .single();

  if (error) throw error;
  
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  
  // ✅ record.lane is already type RotationLane ('sub1k' | '1kplus')
  // No normalization needed - it's already correct
  
  // ✅ STEP 1: Get current total BEFORE creating hit count
  let totalBeforeAction = 0;
  try {
    const { getRepHitTotal } = await import('./auditLogger');
    totalBeforeAction = await getRepHitTotal(
      record.repId,
      record.lane,  // Already normalized
      month,
      year
    );
  } catch (err) {
    console.error('Failed to get current hit total:', err);
  }

  // ✅ STEP 2: Create the hit count (-1 for MFR)
  try {
    console.log('Creating MFR hit with lane:', record.lane);
    
    await createHitCount({
      repId: record.repId,
      hitType: 'MFR',
      hitValue: -1,
      lane: record.lane,  // Already normalized
      month,
      year
    });
  } catch (hitError) {
    console.error('Failed to store hit count for marked lead:', hitError);
  }

  // ✅ STEP 3: Log to audit trail with BEFORE value
  try {
    const { logAuditAction } = await import('./auditLogger');
    
    await logAuditAction({
      actionSubtype: 'NL_TO_MFR',
      tableName: 'replacement_marks',
      recordId: data.id,
      affectedRepId: record.repId,
      accountNumber: record.accountNumber,
      hitValueTotal: totalBeforeAction,
      hitValueChange: -1,
      lane: record.lane,  // Already normalized
    });
  } catch (auditError) {
    console.error('Failed to log mark for replacement:', auditError);
  }
    
  return dbToAppFormat(data);
}

  // Fix for updateReplacementMark in replacementService.ts
// This function is called when creating an LRL, but it needs better audit support

static async updateReplacementMark(markId: string, replacedByLeadId: string): Promise<ReplacementRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  
  console.log('Updating replacement mark:', {
    markId,
    replacedByLeadId,
    userId: user.id
  });

  const { data, error } = await supabase
    .from('replacement_marks')
    .update({ 
      replaced_by_lead_id: replacedByLeadId,
      updated_at: new Date().toISOString()
    })
    .eq('id', markId)
    .select()
    .single();

  if (error) throw error;
  console.log('Replacement mark updated successfully:', { markId, replacedByLeadId });
  
  // ✅ Store hit count for replacement lead (LRL = 0)
  try {
    const currentDate = new Date();
    console.log('Creating LRL hit count with value 0');
    
    const normalizedLane: 'sub1k' | '1kplus' = 
      data.lane === '1kplus' ? '1kplus' : 'sub1k';
    
    await createHitCount({
      repId: data.rep_id,
      hitType: 'LRL',
      hitValue: 0,
      lane: normalizedLane,
      month: currentDate.getMonth() + 1,
      year: currentDate.getFullYear()
    });
    
    console.log('LRL hit recorded with 0 value');
  } catch (hitError) {
    console.error('Failed to store LRL hit count:', hitError);
  }
  
  // NOTE: The audit logging for MFR_TO_LRL is now handled in createLeadWithReplacement
  // where we have access to the new lead's account number and can get the BEFORE value
  // This function just creates the hit count record
  
  return dbToAppFormat(data);
}
  

// This ensures audit logging ALWAYS happens for MFR → NL (unmark)
// Complete fixed version of deleteReplacementMark in replacementService.ts
// This ensures audit logging ALWAYS happens for MFR → NL (unmark)

static async deleteReplacementMark(markId: string): Promise<void> {
      // 1) Read the mark we're about to remove
      const { data: mark, error: fetchError } = await supabase
        .from('replacement_marks')
        .select('*')
        .eq('id', markId)
        .single();
      if (fetchError) throw fetchError;
      if (!mark) throw new Error('Replacement mark not found');

      console.log('🟡 Unmarking lead (MFR → NL):', {
        markId,
        leadId: mark.lead_id,
        repId: mark.rep_id,
        lane: mark.lane
      });

      // ✅ 2) Normalize lane from database (handles legacy 'over1k', '1k+', etc.)
      const normalizedLane: 'sub1k' | '1kplus' = 
        (mark.lane === '1kplus' || mark.lane === 'over1k' || mark.lane === '1k+')
          ? '1kplus' 
          : 'sub1k';
      
      // ✅ 3) Use SAME timestamp for all operations
      const operationDate = new Date();
      const month = operationDate.getMonth() + 1;
      const year = operationDate.getFullYear();
      
      
      // 4) Delete the mark from database FIRST
      const { error: deleteError } = await supabase
        .from('replacement_marks')
        .delete()
        .eq('id', markId);
      if (deleteError) throw deleteError;
      console.log('✅ Replacement mark deleted from database');

      // 5) NOW get total AFTER deletion but BEFORE creating new hit
      let totalBeforeAction = 0;
      try {
        const { getRepHitTotal } = await import('./auditLogger');
        totalBeforeAction = await getRepHitTotal(
          mark.rep_id,
          normalizedLane,
          month,
          year
        );
        console.log('📊 Total before creating MFR_UNMARK hit:', totalBeforeAction);
      } catch (err) {
        console.error('Failed to get current hit total:', err);
      }

      // 6) Create compensating hit count (MFR_UNMARK = +1)
      // ❌ REMOVE: leadEntryId: mark.lead_id,
      await createHitCount({
        repId: mark.rep_id,
        // ✅ NO leadEntryId field here!
        hitType: 'MFR_UNMARK',
        hitValue: 1,
        lane: normalizedLane,
        month,
        year,
      });
      console.log('✅ MFR_UNMARK hit count created');

      // 7) Log to audit trail
      const { logAuditAction } = await import('./auditLogger');
      await logAuditAction({
        actionSubtype: 'MFR_TO_NL',
        tableName: 'replacement_marks',
        recordId: markId,
        affectedRepId: mark.rep_id,
        accountNumber: mark.account_number || '',
        hitValueTotal: totalBeforeAction,
        hitValueChange: 1,
        lane: normalizedLane,
      });
      
      console.log('✅ MFR_TO_NL audit log created successfully');

    }


    
  // Undo replacement (clear replaced_by_lead_id)
  static async undoReplacement(markId: string): Promise<ReplacementRecord> {
    console.log('Undoing replacement for mark:', markId);
    const { data, error } = await supabase
      .from('replacement_marks')
      .update({ 
        replaced_by_lead_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', markId)
      .select()
      .single();

    if (error) throw error;
    console.log('Replacement undone successfully:', markId);
    return dbToAppFormat(data);
  }

  // Get all replacement marks
  static async getAllReplacementMarks(): Promise<ReplacementRecord[]> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .order('marked_at', { ascending: true });

    if (error) throw error;
    console.log('Loaded replacement marks:', data?.length || 0);

    return data.map(dbToAppFormat);
  }

  // Get replacement marks by lead ID
  static async getReplacementMarkByLeadId(leadId: string): Promise<ReplacementRecord | null> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    if (data) {
      console.log('Found replacement mark for lead:', leadId, data);
    }
    
    return data ? dbToAppFormat(data) : null;
  }

  // Get replacement marks by rep ID
  static async getReplacementMarksByRepId(repId: string): Promise<ReplacementRecord[]> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('rep_id', repId)
      .order('marked_at', { ascending: true });

    if (error) throw error;
    
    return data.map(dbToAppFormat);
  }

  // Get replacement marks by lane
  static async getReplacementMarksByLane(lane: string): Promise<ReplacementRecord[]> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('lane', lane)
      .order('marked_at', { ascending: true });

    if (error) throw error;
    
    return data.map(dbToAppFormat);
  }

  // Get open (unreplaced) replacement marks
  static async getOpenReplacementMarks(): Promise<ReplacementRecord[]> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .is('replaced_by_lead_id', null)
      .order('marked_at', { ascending: true });

    if (error) throw error;
    
    return data.map(dbToAppFormat);
  }

  // Get closed (replaced) replacement marks
  static async getClosedReplacementMarks(): Promise<ReplacementRecord[]> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .not('replaced_by_lead_id', 'is', null)
      .order('marked_at', { ascending: true });

    if (error) throw error;
    
    return data.map(dbToAppFormat);
  }

  // Check if a lead is marked for replacement
  static async isLeadMarkedForReplacement(leadId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('id')
      .eq('lead_id', leadId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return Boolean(data);
  }

  // Check if a lead is a replacement lead (LRL)
  static async isReplacementLead(leadId: string): Promise<{ isReplacement: boolean; originalLeadId?: string }> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('lead_id')
      .eq('replaced_by_lead_id', leadId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return {
      isReplacement: Boolean(data),
      originalLeadId: data?.lead_id
    };
  }

  // Get replacement statistics
  static async getReplacementStats(): Promise<{
    totalMarks: number;
    openMarks: number;
    closedMarks: number;
    byLane: { sub1k: number; '1kplus': number };
  }> {
    const [allMarks, openMarks] = await Promise.all([
      this.getAllReplacementMarks(),
      this.getOpenReplacementMarks()
    ]);

    const byLane = { sub1k: 0, '1kplus': 0 };
    allMarks.forEach(mark => {
      if (mark.lane === 'sub1k') byLane.sub1k++;
      else if (mark.lane === '1kplus') byLane['1kplus']++;
    });

    return {
      totalMarks: allMarks.length,
      openMarks: openMarks.length,
      closedMarks: allMarks.length - openMarks.length,
      byLane
    };
  }
}