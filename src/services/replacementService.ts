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
  lane: dbRecord.lane as any, // Assuming lane enum
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

  console.log('Creating replacement mark with lane:', record.lane); // Debug log

  const dbData = {
    lead_id: record.leadId,
    rep_id: record.repId,
    lane: record.lane,  // IMPORTANT: Pass lane directly without transformation
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
  
  // Store hit count for marked lead (MFR = -1)
  try {
    const currentDate = new Date();
    
    console.log('Writing MFR hit with lane:', record.lane); // Debug log
    
    await createHitCount({
      repId: record.repId,
      hitType: 'MFR',
      hitValue: -1,
      lane: record.lane,  // CRITICAL: Use the lane directly from record
      month: currentDate.getMonth() + 1,
      year: currentDate.getFullYear()
    });
  } catch (hitError) {
    console.error('Failed to store hit count for marked lead:', hitError);
  }
  
  return dbToAppFormat(data);
}

  // Update replacement mark (apply replacement)
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
    console.log('Replacement mark updated successfully:', { markId, replacedByLeadId }); // ADD THIS LINE
    // Store hit count for replacement lead (LRL = +1)
    try {
      const currentDate = new Date();
      await createHitCount({
        repId: data.rep_id,
        leadEntryId: replacedByLeadId,
        hitType: 'LRL',
        hitValue: 1,
        lane: data.lane === '1kplus' ? '1kplus' : 'sub1k',
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear()
      });
    } catch (hitError) {
      console.error('Failed to store hit count for LRL:', hitError);
      // Don't fail the replacement if hit count storage fails
    }
    
    return dbToAppFormat(data);
  }
  static async deleteReplacementMark(markId: string): Promise<void> {
  // 1) Read the mark we're about to remove
  const { data: mark, error: fetchError } = await supabase
    .from('replacement_marks')
    .select('*')
    .eq('id', markId)
    .single();
  if (fetchError) throw fetchError;

  // 2) Delete the mark
  const { error } = await supabase
    .from('replacement_marks')
    .delete()
    .eq('id', markId);
  if (error) throw error;
    console.log('Replacement mark deleted successfully:', markId); // ADD THIS LINE


  // 3) Compensating hit: Use MFR_UNMARK to return to NL status
  try {
    const now = new Date();
    
    // CRITICAL: Normalize lane - ensure it's '1kplus' not 'over1k'
    const normalizedLane: 'sub1k' | '1kplus' = 
      mark.lane === 'over1k' || mark.lane === '1kplus' || mark.lane === '1k+' 
        ? '1kplus' 
        : 'sub1k';
    
    console.log('Writing MFR_UNMARK hit with lane:', normalizedLane); // Debug log
    
    await createHitCount({
      repId: mark.rep_id,
      leadEntryId: mark.lead_id,
      hitType: 'MFR_UNMARK',
      hitValue: 1,
      lane: normalizedLane,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
  } catch (hitError) {
    console.error('Failed to write MFR_UNMARK hit:', hitError);
  }
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

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "not found"
    
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