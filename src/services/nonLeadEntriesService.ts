// src/services/nonLeadEntriesService.ts
import { supabase } from '../lib/supabase';
import { logAction } from './actionTracker';
import { getRepHitTotal, logAuditAction } from './auditLogger';
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

  // ✅ STEP 1: Get current total BEFORE creating hit counts
  const laneValue = created.rotationTarget === 'over1k' ? '1kplus' : 
                    created.rotationTarget === 'sub1k' ? 'sub1k' : 'both';

  let totalBeforeAction = 0;
  if (created.entryType === 'SKP') {
    const lane = laneValue === 'both' ? 'sub1k' : laneValue as 'sub1k' | '1kplus';
    
    try {
      const { getRepHitTotal } = await import('./auditLogger');
      totalBeforeAction = await getRepHitTotal(
        created.repId,
        lane,
        created.month,
        created.year
      );
    } catch (err) {
      console.error('Failed to get current hit total:', err);
    }
  }

  // ✅ STEP 2: Create hit counts (NO AUDIT LOGGING HERE!)
  try {
    const lanes = created.rotationTarget === 'over1k' ? ['1kplus'] :
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

 // ✅ STEP 3: Log audit actions (TWO ROWS for 'both', ONE ROW otherwise)
  if (created.entryType === 'OOO') {
    if (laneValue === 'both') {
      // Log two separate rows for OOO
      await logAuditAction({
        actionSubtype: 'OOO',
        tableName: 'non_lead_entries',
        recordId: created.id,
        affectedRepId: created.repId,
        timeInput: created.time || '',
        hitValueChange: 0,
        lane: 'sub1k',
        actionDay: created.day,
        actionMonth: created.month,
        actionYear: created.year
      });
      await logAuditAction({
        actionSubtype: 'OOO',
        tableName: 'non_lead_entries',
        recordId: created.id,
        affectedRepId: created.repId,
        timeInput: created.time || '',
        hitValueChange: 0,
        lane: '1kplus',
        actionDay: created.day,
        actionMonth: created.month,
        actionYear: created.year
      });
    } else {
      // Single row for specific lane
      await logAuditAction({
        actionSubtype: 'OOO',
        tableName: 'non_lead_entries',
        recordId: created.id,
        affectedRepId: created.repId,
        timeInput: created.time || '',
        hitValueChange: 0,
        lane: laneValue as any,
        actionDay: created.day,
        actionMonth: created.month,
        actionYear: created.year
      });
    }
  } else if (created.entryType === 'SKP') {
    if (laneValue === 'both') {
      // Get totals for BOTH lanes
      let totalSub1k = 0;
      let total1kplus = 0;
      try {
        const { getRepHitTotal } = await import('./auditLogger');
        totalSub1k = await getRepHitTotal(created.repId, 'sub1k', created.month, created.year);
        total1kplus = await getRepHitTotal(created.repId, '1kplus', created.month, created.year);
      } catch (err) {
        console.error('Failed to get hit totals for both lanes:', err);
      }
      
      // Log two separate rows for SKIP
      await logAuditAction({
        actionSubtype: 'SKIP',
        tableName: 'non_lead_entries',
        recordId: created.id,
        affectedRepId: created.repId,
        timeInput: created.time || '',
        hitValueChange: 1,
        hitValueTotal: totalSub1k,
        lane: 'sub1k',
        actionDay: created.day,
        actionMonth: created.month,
        actionYear: created.year
      });
      await logAuditAction({
        actionSubtype: 'SKIP',
        tableName: 'non_lead_entries',
        recordId: created.id,
        affectedRepId: created.repId,
        timeInput: created.time || '',
        hitValueChange: 1,
        hitValueTotal: total1kplus,
        lane: '1kplus',
        actionDay: created.day,
        actionMonth: created.month,
        actionYear: created.year
      });
    } else {
      // Single row for specific lane (existing logic)
      await logAuditAction({
        actionSubtype: 'SKIP',
        tableName: 'non_lead_entries',
        recordId: created.id,
        affectedRepId: created.repId,
        timeInput: created.time || '',
        hitValueChange: 1,
        hitValueTotal: totalBeforeAction,
        lane: laneValue as any,
        actionDay: created.day,
        actionMonth: created.month,
        actionYear: created.year
      });
    }
  }

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
// Fix for deleteNonLeadEntry in nonLeadEntriesService.ts
// This handles DELETE_OOO and DELETE_SKIP

export async function deleteNonLeadEntry(id: string): Promise<void> {
  // First, get the entry to create reverse hit count
  const { data: entryData, error: fetchError } = await supabase
    .from('non_lead_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;
  
  const entry = rowToNonLeadEntry(entryData as DBNonLeadEntryRow);

  // ✅ Get total BEFORE creating reverse hit counts
  const laneValue = entry.rotationTarget === 'over1k' ? '1kplus' : 
                    entry.rotationTarget === 'sub1k' ? 'sub1k' : 'both';
  const lane = laneValue === 'both' ? 'sub1k' : laneValue as 'sub1k' | '1kplus';
  
  let totalBeforeAction = 0;
  try {
    const { getRepHitTotal } = await import('./auditLogger');
    totalBeforeAction = await getRepHitTotal(
      entry.repId,
      lane,
      entry.month,
      entry.year
    );
  } catch (err) {
    console.error('Failed to get current hit total:', err);
  }

  // Create reverse hit count records
  try {
    const lanes =
      entry.rotationTarget === 'over1k' ? ['1kplus'] :
      entry.rotationTarget === 'sub1k' ? ['sub1k'] :
      ['sub1k', '1kplus'];

    for (const targetLane of lanes) {
      if (entry.entryType === 'OOO') {
        // Delete OOO: reverses the original OOO entry (type = "OOO", hits = 0)
        await createHitCount({
          repId: entry.repId,
          hitType: 'OOO',
          hitValue: 0,
          lane: targetLane as 'sub1k' | '1kplus',
          month: entry.month,
          year: entry.year,
        });
      } else if (entry.entryType === 'SKP') {
        // Delete Skip: reverses the original skip (type = "SKP", hits = -1)
        await createHitCount({
          repId: entry.repId,
          hitType: 'SKIP',
          hitValue: -1,
          lane: targetLane as 'sub1k' | '1kplus',
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


  // ✅ Audit logging (TWO ROWS for 'both', ONE ROW otherwise)
  const { logAuditAction } = await import('./auditLogger');
  
  if (entry.entryType === 'OOO') {
    if (laneValue === 'both') {
      // Log two separate rows for DELETE_OOO
      await logAuditAction({
        actionSubtype: 'DELETE_OOO',
        tableName: 'non_lead_entries',
        recordId: id,
        affectedRepId: entry.repId,
        timeInput: entry.time || '',
        hitValueChange: 0,
        lane: 'sub1k',
        actionDay: entry.day,
        actionMonth: entry.month,
        actionYear: entry.year
      });
      await logAuditAction({
        actionSubtype: 'DELETE_OOO',
        tableName: 'non_lead_entries',
        recordId: id,
        affectedRepId: entry.repId,
        timeInput: entry.time || '',
        hitValueChange: 0,
        lane: '1kplus',
        actionDay: entry.day,
        actionMonth: entry.month,
        actionYear: entry.year
      });
    } else {
      // Single row for specific lane
      await logAuditAction({
        actionSubtype: 'DELETE_OOO',
        tableName: 'non_lead_entries',
        recordId: id,
        affectedRepId: entry.repId,
        timeInput: entry.time || '',
        hitValueChange: 0,
        hitValueTotal: totalBeforeAction,
        lane: laneValue as any,
        actionDay: entry.day,
        actionMonth: entry.month,
        actionYear: entry.year
      });
    }
  } else if (entry.entryType === 'SKP') {
    if (laneValue === 'both') {
      // Get totals for BOTH lanes
      let totalSub1k = 0;
      let total1kplus = 0;
      try {
        const { getRepHitTotal } = await import('./auditLogger');
        totalSub1k = await getRepHitTotal(entry.repId, 'sub1k', entry.month, entry.year);
        total1kplus = await getRepHitTotal(entry.repId, '1kplus', entry.month, entry.year);
      } catch (err) {
        console.error('Failed to get hit totals for both lanes:', err);
      }
      
      // Log two separate rows for DELETE_SKIP
      await logAuditAction({
        actionSubtype: 'DELETE_SKIP',
        tableName: 'non_lead_entries',
        recordId: id,
        affectedRepId: entry.repId,
        timeInput: entry.time || '',
        hitValueChange: -1,
        hitValueTotal: totalSub1k,
        lane: 'sub1k',
        actionDay: entry.day,
        actionMonth: entry.month,
        actionYear: entry.year
      });
      await logAuditAction({
        actionSubtype: 'DELETE_SKIP',
        tableName: 'non_lead_entries',
        recordId: id,
        affectedRepId: entry.repId,
        timeInput: entry.time || '',
        hitValueChange: -1,
        hitValueTotal: total1kplus,
        lane: '1kplus',
        actionDay: entry.day,
        actionMonth: entry.month,
        actionYear: entry.year
      });
    } else {
      // Single row for specific lane (existing logic)
      await logAuditAction({
        actionSubtype: 'DELETE_SKIP',
        tableName: 'non_lead_entries',
        recordId: id,
        affectedRepId: entry.repId,
        timeInput: entry.time || '',
        hitValueChange: -1,
        hitValueTotal: totalBeforeAction,
        lane: laneValue as any,
        actionDay: entry.day,
        actionMonth: entry.month,
        actionYear: entry.year
      });
    }
  }
  
}

export async function updateNonLeadEntry(
  id: string,
  updates: Partial<Omit<NonLeadEntry, 'id' | 'repId' | 'entryType' | 'createdAt' | 'updatedAt'>>
): Promise<NonLeadEntry> {
  // First, get the existing entry
  const { data: existingData, error: fetchError } = await supabase
    .from('non_lead_entries')
    .select()
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;
  if (!existingData) throw new Error('Entry not found');

  const existingEntry = rowToNonLeadEntry(existingData as DBNonLeadEntryRow);

  // Track what changed for audit trail
  const dateChanged = 
    (updates.day !== undefined && updates.day !== existingEntry.day) ||
    (updates.month !== undefined && updates.month !== existingEntry.month) ||
    (updates.year !== undefined && updates.year !== existingEntry.year);

  const timeChanged = updates.time !== existingEntry.time;
  const targetChanged = updates.rotationTarget !== existingEntry.rotationTarget;

  // If rotation target changed, we need to handle hit counts
  if (targetChanged && updates.rotationTarget) {
    const oldLanes = existingEntry.rotationTarget === 'over1k' ? ['1kplus'] :
                     existingEntry.rotationTarget === 'sub1k' ? ['sub1k'] :
                     ['sub1k', '1kplus'];
    
    const newLanes = updates.rotationTarget === 'over1k' ? ['1kplus'] :
                     updates.rotationTarget === 'sub1k' ? ['sub1k'] :
                     ['sub1k', '1kplus'];

    // Remove old hit counts
    for (const lane of oldLanes) {
      const reverseValue = existingEntry.entryType === 'SKP' ? -1 : 0;
      await createHitCount({
        repId: existingEntry.repId,
        hitType: existingEntry.entryType === 'OOO' ? 'OOO' : 'SKIP',
        hitValue: reverseValue,
        lane: lane as 'sub1k' | '1kplus',
        month: existingEntry.month,
        year: existingEntry.year,
      });
    }

    // Add new hit counts
    for (const lane of newLanes) {
      const hitValue = existingEntry.entryType === 'SKP' ? 1 : 0;
      await createHitCount({
        repId: existingEntry.repId,
        hitType: existingEntry.entryType === 'OOO' ? 'OOO' : 'SKIP',
        hitValue: hitValue,
        lane: lane as 'sub1k' | '1kplus',
        month: updates.month ?? existingEntry.month,
        year: updates.year ?? existingEntry.year,
      });
    }
  }

  // If date changed, handle hit count movement
  if (dateChanged && (updates.day || updates.month || updates.year)) {
    const newMonth = updates.month ?? existingEntry.month;
    const newYear = updates.year ?? existingEntry.year;
    
    // Only handle if month/year changed (moving across months)
    if (newMonth !== existingEntry.month || newYear !== existingEntry.year) {
      const lanes = existingEntry.rotationTarget === 'over1k' ? ['1kplus'] :
                    existingEntry.rotationTarget === 'sub1k' ? ['sub1k'] :
                    ['sub1k', '1kplus'];

      // Remove from old month
      for (const lane of lanes) {
        const reverseValue = existingEntry.entryType === 'SKP' ? -1 : 0;
        await createHitCount({
          repId: existingEntry.repId,
          hitType: existingEntry.entryType === 'OOO' ? 'OOO' : 'SKIP',
          hitValue: reverseValue,
          lane: lane as 'sub1k' | '1kplus',
          month: existingEntry.month,
          year: existingEntry.year,
        });
      }

      // Add to new month
      for (const lane of lanes) {
        const hitValue = existingEntry.entryType === 'SKP' ? 1 : 0;
        await createHitCount({
          repId: existingEntry.repId,
          hitType: existingEntry.entryType === 'OOO' ? 'OOO' : 'SKIP',
          hitValue: hitValue,
          lane: lane as 'sub1k' | '1kplus',
          month: newMonth,
          year: newYear,
        });
      }
    }
  }

  // 🔧 FIX: Update the entry FIRST, THEN log audit
  const { data, error } = await supabase
    .from('non_lead_entries')
    .update({
      ...nonLeadEntryToRow({ ...existingEntry, ...updates }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  const updated = rowToNonLeadEntry(data as DBNonLeadEntryRow);

  // 🔧 FIX: Wait a moment to ensure DB write is committed before logging audit
  await new Promise(resolve => setTimeout(resolve, 50));

  // Log to audit trail AFTER database update is committed
  const { logAuditAction } = await import('./auditLogger');
  const laneValue = updated.rotationTarget === 'over1k' ? '1kplus' : 
                    updated.rotationTarget === 'sub1k' ? 'sub1k' : 'both';
  
  let totalBeforeAction = 0;
  if (updated.entryType === 'SKP') {
    const lane = laneValue === 'both' ? 'sub1k' : laneValue as 'sub1k' | '1kplus';
    try {
      const { getRepHitTotal } = await import('./auditLogger');
      totalBeforeAction = await getRepHitTotal(
        updated.repId,
        lane,
        updated.month,
        updated.year
      );
    } catch (err) {
      console.error('Failed to get current hit total:', err);
    }
  }

  const actionSubtype = updated.entryType === 'OOO' ? 'OOO' : 'SKIP';
  
  await logAuditAction({
    actionSubtype: actionSubtype as any,
    tableName: 'non_lead_entries',
    recordId: updated.id,
    affectedRepId: updated.repId,
    timeInput: updated.time || '',
    hitValueChange: updated.entryType === 'SKP' ? 1 : 0,
    hitValueTotal: totalBeforeAction,
    lane: laneValue as any,
    actionDay: updated.day,
    actionMonth: updated.month,
    actionYear: updated.year,
  });

  return updated;
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