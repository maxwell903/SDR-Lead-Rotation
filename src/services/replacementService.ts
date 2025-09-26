// services/replacementService.ts
import { supabase } from '../lib/supabase';
import { ReplacementRecord } from '../features/leadReplacement';

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

    const dbData = {
      ...appToDbFormat(record),
      marked_at: new Date().toISOString(),
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from('replacement_marks')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return dbToAppFormat(data);
  }

  // Update replacement mark (apply replacement)
  static async updateReplacementMark(markId: string, replacedByLeadId: string): Promise<ReplacementRecord> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

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
    return dbToAppFormat(data);
  }

  // Delete replacement mark
  static async deleteReplacementMark(markId: string): Promise<void> {
    const { error } = await supabase
      .from('replacement_marks')
      .delete()
      .eq('id', markId);

    if (error) throw error;
  }

  // Undo replacement (clear replaced_by_lead_id)
  static async undoReplacement(markId: string): Promise<ReplacementRecord> {
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
    return dbToAppFormat(data);
  }

  // Get all replacement marks
  static async getAllReplacementMarks(): Promise<ReplacementRecord[]> {
    const { data, error } = await supabase
      .from('replacement_marks')
      .select('*')
      .order('marked_at', { ascending: true });

    if (error) throw error;
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
    return data ? dbToAppFormat(data) : null;
  }

  // ENHANCED: Subscribe to real-time changes with better event handling
  static subscribeToChanges(callback: (payload: any) => void) {
    console.log('Setting up real-time subscription for replacement_marks');
    
    return supabase
      .channel('replacement_marks_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'replacement_marks' 
        }, 
        (payload) => {
          console.log('Real-time replacement mark change detected:', payload);
          
          // Enhanced payload with event type
          const enhancedPayload = {
            ...payload,
            eventType: payload.eventType || 'UPDATE', // Fallback
          };
          
          callback(enhancedPayload);
        }
      )
      .subscribe((status) => {
        console.log('Replacement marks subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to replacement marks changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to replacement marks changes');
        }
      });
  }

  // Unsubscribe from real-time changes
  static unsubscribeFromChanges(subscription: any) {
    console.log('Unsubscribing from replacement marks changes');
    return supabase.removeChannel(subscription);
  }
}