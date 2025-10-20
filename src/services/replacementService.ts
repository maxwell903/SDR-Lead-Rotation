// services/replacementService.ts
import { supabase } from '../lib/supabase';
import { ReplacementRecord } from '../features/leadReplacement';
import { createHitCount } from './hitCountsService';

function getDateComponents(date: Date): { day: number; month: number; year: number } {
  return {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
}

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
  static async createReplacementMark(params: {
  leadId: string;
  repId: string;
  lane: 'sub1k' | '1kplus';
  accountNumber?: string;
  url?: string;
  replacedByLeadId?: string;
  replacedAt?: number;
  day?: number;
  month?: number;
  year?: number;
}): Promise<ReplacementRecord> {
  const { leadId, repId, lane, accountNumber, url } = params;
  
  // Get lead data including cushion status
  const { data: leadData } = await supabase
    .from('leads')
    .select('date, month, year, was_cushion_lead')
    .eq('id', leadId)
    .single();
  
  if (!leadData) throw new Error('Lead not found');
  
  // ✅ SIMPLIFIED: Just read the field
  const isCushionLead = leadData.was_cushion_lead ?? false;
  
  
  // Create the replacement mark
  const { data, error } = await supabase
    .from('replacement_marks')
    .insert({
      lead_id: leadId,
      rep_id: repId,
      lane,
      account_number: accountNumber || null,
      url: url || null
    })
    .select()
    .single();

  if (error) throw error;

  // ✅ Only create hit count if NOT a cushion lead
  if (!isCushionLead) {
    const currentDate = new Date();
    await createHitCount({
      repId,
      hitType: 'MFR',
      hitValue: 0,
      lane,
      month: currentDate.getMonth() + 1,
      year: currentDate.getFullYear()
    });
    console.log('MFR hit recorded with -1 value');
  } else {
    console.log('Cushion lead marked for replacement - no hit adjustment');
  }

  // ✅ Log to audit
  const leadDate = new Date(leadData.date);
  const { logAuditAction } = await import('./auditLogger');
  await logAuditAction({
    actionSubtype: 'NL_TO_MFR',
    tableName: 'replacement_marks',
    recordId: leadId,
    affectedRepId: repId,
    accountNumber: accountNumber || '',
    hitValueChange: isCushionLead ? 0 : 0,
    lane: lane,
    actionDay: leadDate.getDate(),
    actionMonth: leadData.month,
    actionYear: leadData.year
  });

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

  // ✅ Check if already replaced BEFORE attempting update
  const { data: existingMark, error: checkError } = await supabase
    .from('replacement_marks')
    .select('*')
    .eq('id', markId)
    .single();
  
  if (checkError) throw checkError;
  
  // ✅ If already replaced, throw specific error
  if (existingMark.replaced_by_lead_id) {
    console.warn('⚠️ Mark already has replacement:', existingMark.replaced_by_lead_id);
    throw new Error('REPLACEMENT_ALREADY_EXISTS');
  }
  
  // ✅ Check if the original MFR was a cushion lead
  const { data: leadData } = await supabase
    .from('leads')
    .select('date, month, year, was_cushion_lead')
    .eq('id', existingMark.lead_id)
    .single();
  
  if (!leadData) throw new Error('Original lead not found');
  
  // ✅ Check cushion status
  const isCushionLead = leadData.was_cushion_lead ?? false;
  
  // ✅ Now safe to update
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
  
  // ✅ Store hit count for replacement lead (LRL)
  // Only create hit if the original MFR was NOT a cushion lead
  if (!isCushionLead) {
    try {
      const currentDate = new Date();
      console.log('Creating LRL hit count with value 1');
      
      const normalizedLane: 'sub1k' | '1kplus' = 
        data.lane === '1kplus' ? '1kplus' : 'sub1k';
      
      await createHitCount({
        repId: data.rep_id,
        hitType: 'LRL',
        hitValue: 1,
        lane: normalizedLane,
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear()
      });
      
      console.log('LRL hit recorded with 1 value');
    } catch (hitError) {
      console.error('Failed to store LRL hit count:', hitError);
    }
  } else {
    console.log('LRL replacing cushion lead - no hit adjustment');
  }
  
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

  // ✅ Fetch the lead to get its date and cushion status
  const { data: leadData } = await supabase
    .from('leads')
    .select('date, was_cushion_lead')
    .eq('id', mark.lead_id)
    .single();
  
  if (!leadData) throw new Error('Lead not found for replacement mark');
  
  const leadDate = new Date(leadData.date);
  const { day, month, year } = getDateComponents(leadDate);

  console.log('🟡 Unmarking lead (MFR → NL):', {
    markId,
    leadId: mark.lead_id,
    repId: mark.rep_id,
    lane: mark.lane
  });

  // ✅ Normalize lane from database (handles legacy 'over1k', '1k+', etc.)
  const normalizedLane: 'sub1k' | '1kplus' = 
    (mark.lane === '1kplus' || mark.lane === 'over1k' || mark.lane === '1k+')
      ? '1kplus' 
      : 'sub1k';
  
  // ✅ Check if this was a cushion lead
  const isCushionLead = leadData.was_cushion_lead ?? false;
  
  // 3) Use SAME timestamp for all operations
  const operationDate = new Date();
  
  // 4) Delete the mark from database FIRST
  const { error: deleteError } = await supabase
    .from('replacement_marks')
    .delete()
    .eq('id', markId);
  if (deleteError) throw deleteError;
  console.log('✅ Replacement mark deleted from database');

  // 5) Get total BEFORE creating new hit (only if not cushion)
  let totalBeforeAction = 0;
  if (!isCushionLead) {
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
  }

  // 6) Create compensating hit count (only if NOT cushion lead)
  if (!isCushionLead) {
    await createHitCount({
      repId: mark.rep_id,
      hitType: 'MFR_UNMARK',
      hitValue: 0,
      lane: normalizedLane,
      month,
      year,
    });
    console.log('✅ MFR_UNMARK hit count created');
  } else {
    console.log('Cushion lead unmarked - no hit adjustment');
  }

  // 7) Log to audit trail
  const { logAuditAction } = await import('./auditLogger');
  await logAuditAction({
    actionSubtype: 'MFR_TO_NL',
    tableName: 'replacement_marks',
    recordId: markId,
    affectedRepId: mark.rep_id,
    accountNumber: mark.account_number || '',
    hitValueTotal: totalBeforeAction,
    hitValueChange: isCushionLead ? 0 : 0,
    lane: normalizedLane,
    actionDay: day,      
    actionMonth: month,  
    actionYear: year     
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