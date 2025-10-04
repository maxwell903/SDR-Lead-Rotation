// src/services/nonLeadEntriesService.ts
import { supabase } from '../lib/supabase';
import { logAction } from './actionTracker';
import { createHitCount } from './hitCountsService';

export interface NonLeadEntry {
  id: string;
  repId: string;
  entryType: 'OOO' | 'SKP';
  day: number;
  month: number;
  year: number;
  time?: string; // For OOO entries only
  rotationTarget?: 'sub1k' | 'over1k' | 'both';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// DB row shape
type DBNonLeadEntryRow = {
  id: string;
  rep_id: string | null;
  entry_type: string | null;
  day: number | null;
  month: number | null;
  year: number | null;
  time: string | null;
  rotation_target: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Convert DB row to frontend type
const rowToNonLeadEntry = (r: DBNonLeadEntryRow): NonLeadEntry => ({
  id: r.id,
  repId: r.rep_id ?? '',
  entryType: (r.entry_type as 'OOO' | 'SKP') ?? 'SKP',
  day: r.day ?? 1,
  month: r.month ?? 1,
  year: r.year ?? new Date().getFullYear(),
  time: r.time ?? undefined,
  rotationTarget: r.rotation_target as 'sub1k' | 'over1k' | 'both' | undefined,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

// Convert frontend type to DB row
const nonLeadEntryToRow = (entry: NonLeadEntry): Partial<DBNonLeadEntryRow> => ({
  id: entry.id,
  rep_id: entry.repId,
  entry_type: entry.entryType,
  day: entry.day,
  month: entry.month,
  year: entry.year,
  time: entry.time ?? null,
  rotation_target: entry.rotationTarget ?? null,
});

/** CREATE a non-lead entry (OOO or Skip) */
export async function createNonLeadEntry(
  input: Omit<NonLeadEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<NonLeadEntry> {
  const id = `${input.entryType.toLowerCase()}_${Date.now()}`;
  const newEntry: NonLeadEntry = { ...input, id };

  const { data, error } = await supabase
    .from('non_lead_entries')
    .insert(nonLeadEntryToRow(newEntry))
    .select()
    .single();

  if (error) throw error;

  const created = rowToNonLeadEntry(data as DBNonLeadEntryRow);

  // Create hit count records based on entry type
  try {
    const lanes =
      created.rotationTarget === 'over1k' ? ['1kplus'] :
      created.rotationTarget === 'sub1k' ? ['sub1k'] :
      ['sub1k', '1kplus'];

    for (const lane of lanes) {
      if (created.entryType === 'OOO') {
        
        await createHitCount({
          repId: created.repId,
          hitType: 'OOO',
          hitValue: 0,
          lane: lane as 'sub1k' | '1kplus',
          month: created.month,
          year: created.year,
        });
      } else if (created.entryType === 'SKP') {
        // Skip: type = "SKP", hits = +1
        await createHitCount({
          repId: created.repId,
          hitType: 'SKIP',
          hitValue: 1,
          lane: lane as 'sub1k' | '1kplus',
          month: created.month,
          year: created.year,
        });
      }
    }
  } catch (hitError) {
    console.error('Failed to create hit count for non-lead entry:', hitError);
  }

  await logAction({
    actionType: 'CREATE',
    tableName: 'non_lead_entries' as any,
    recordId: created.id,
    newData: created,
  });

  return created;
}

/** READ all non-lead entries */
export async function listNonLeadEntries(filters?: {
  month?: number;
  year?: number;
  repId?: string;
}): Promise<NonLeadEntry[]> {
  let query = supabase.from('non_lead_entries').select('*');

  if (filters?.month) {
    query = query.eq('month', filters.month);
  }
  if (filters?.year) {
    query = query.eq('year', filters.year);
  }
  if (filters?.repId) {
    query = query.eq('rep_id', filters.repId);
  }

  const { data, error } = await query.order('day', { ascending: true });

  if (error) throw error;
  return (data as DBNonLeadEntryRow[] | null)?.map(rowToNonLeadEntry) ?? [];
}

/** DELETE a non-lead entry */
export async function deleteNonLeadEntry(id: string): Promise<void> {
  // First, get the entry to create reverse hit count
  const { data: entryData, error: fetchError } = await supabase
    .from('non_lead_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;
  
  const entry = rowToNonLeadEntry(entryData as DBNonLeadEntryRow);

  // Create reverse hit count records
  try {
    const lanes =
      entry.rotationTarget === 'over1k' ? ['1kplus'] :
      entry.rotationTarget === 'sub1k' ? ['sub1k'] :
      ['sub1k', '1kplus'];

    for (const lane of lanes) {
      if (entry.entryType === 'OOO') {
        // Delete OOO: reverses the original OOO entry (type = "OOO", hits = 0)
        await createHitCount({
          repId: entry.repId,
          hitType: 'OOO',
          hitValue: 0,
          lane: lane as 'sub1k' | '1kplus',
          month: entry.month,
          year: entry.year,
        });
      } else if (entry.entryType === 'SKP') {
        // Delete Skip: reverses the original skip (type = "SKP", hits = +1 to reverse the -1)
        await createHitCount({
          repId: entry.repId,
          hitType: 'SKIP',
          hitValue: -1,
          lane: lane as 'sub1k' | '1kplus',
          month: entry.month,
          year: entry.year,
        });
      }
    }
  } catch (hitError) {
    console.error('Failed to create reverse hit count:', hitError);
  }

  // Delete the entry
  const { error: deleteError } = await supabase
    .from('non_lead_entries')
    .delete()
    .eq('id', id);

  if (deleteError) throw deleteError;

  await logAction({
    actionType: 'DELETE',
    tableName: 'non_lead_entries' as any,
    recordId: id,
    oldData: entry,
  });
}

/** Subscribe to non-lead entries changes */
export function subscribeNonLeadEntries(
  callback: (payload: any) => void
): () => void {
  const channel = supabase
    .channel('non_lead_entries_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'non_lead_entries',
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}