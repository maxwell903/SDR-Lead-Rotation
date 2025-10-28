// src/hooks/useNonLeadEntries.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { NonLeadEntry } from '../services/nonLeadEntriesService';
import {
  listNonLeadEntries,
  createNonLeadEntry,
  updateNonLeadEntry,
  deleteNonLeadEntry,
} from '../services/nonLeadEntriesService';

/**
 * Real-time, optimistic hook for OOO/SKP (non_lead_entries)
 * Mirrors the behavior of useLeads so calendar updates instantly for all users.
 */
export function useNonLeadEntries(month: number, year: number) {
  type State = { entries: NonLeadEntry[]; loading: boolean; error: string | null };
  const [state, setState] = useState<State>({ entries: [], loading: true, error: null });

  // Keep a live pointer to entries for the subscription callback
const entriesRef = useRef<NonLeadEntry[]>([]);
useEffect(() => {
  entriesRef.current = state.entries;
}, [state.entries]);

  // ---------- helpers ----------
  const upsertLocal = useCallback((row: NonLeadEntry) => {
    setState((s) => {
      const i = s.entries.findIndex((e) => e.id === row.id);
      if (i === -1) return { ...s, entries: [row, ...s.entries] };
      const copy = s.entries.slice();
      copy[i] = row;
      return { ...s, entries: copy };
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setState((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
  }, []);

  

  const isInScope = useCallback(
    (row: Partial<NonLeadEntry> | null | undefined) => {
      return !!row && row.month === month && row.year === year;
    },
    [month, year]
  );

  // ---------- initial load ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const rows = await listNonLeadEntries({ month, year });
        if (!cancelled) {
          // de-dupe + stable sort by (day asc, time asc; SKP entries last within day if no time)
          const seen = new Set<string>();
          const deduped = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
          deduped.sort((a, b) => {
            if (a.day !== b.day) return a.day - b.day;
            const at = a.time ? a.time : '99:99';
            const bt = b.time ? b.time : '99:99';
            return at.localeCompare(bt);
          });
          setState({ entries: deduped, loading: false, error: null });
        }
      } catch (e: any) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: e?.message ?? 'Failed to load non-lead entries',
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, year]);

// ---------- realtime subscription ----------
useEffect(() => {
  const channel = supabase
    .channel(`non_lead_entries:${year}-${month}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'non_lead_entries',
      },
      (payload: any) => {
        const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const rowNew = payload.new ? normalizeRow(payload.new) : undefined;
        const rowOld = payload.old ? normalizeRow(payload.old) : undefined;

        // INSERT: always has "new"
        if (event === 'INSERT') {
          if (rowNew && isInScope(rowNew)) {
            upsertLocal(rowNew);
          }
          return;
        }

        // UPDATE: "new" may be partial if replica identity isn't FULL
        if (event === 'UPDATE') {
          const id = (rowNew?.id ?? rowOld?.id) as string | undefined;
          if (!id) return;

          // Use what we have: merge payload.new into the existing record (if any)
          const prev = entriesRef.current.find(e => e.id === id);
          const merged: NonLeadEntry | undefined = prev
            ? ({ ...prev, ...(rowNew || {}) } as NonLeadEntry)
            : (rowNew as NonLeadEntry | undefined);

          // If we can’t build a meaningful row, bail
          if (!merged) return;

          const wasInScope = prev ? isInScope(prev) : (rowOld ? isInScope(rowOld) : false);
          const nowInScope = isInScope(merged);

          if (nowInScope) {
            upsertLocal(merged);
          } else if (wasInScope && !nowInScope) {
            removeLocal(id);
          }
          return;
        }

        // DELETE: "old" may only include PK if replica identity isn't FULL
        if (event === 'DELETE') {
          const id = (rowOld?.id ?? rowNew?.id) as string | undefined;
          if (!id) return;

          // Only remove if the entry exists in the current month/year
          const existsHere = entriesRef.current.some(e => e.id === id);
          if (existsHere) {
            removeLocal(id);
          }
        }
      }
    )
    .subscribe((status) => {
      console.log('📡 non_lead_entries channel status:', status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, [month, year, upsertLocal, removeLocal, isInScope]);


  

  // ---------- optimistic actions ----------
  const addNonLead = useCallback(
    async (input: Omit<NonLeadEntry, 'id'>) => {
      
      // FINAL BODY (keep this)
const created = await createNonLeadEntry(input);
return created;

    },
    []
  );

  const updateNonLead = useCallback(async (id: string, patch: Partial<NonLeadEntry>) => {
   // No optimistic merge; rely on Realtime UPDATE to update state
   await updateNonLeadEntry(id, patch);
  }, []);

  const removeNonLead = useCallback(async (id: string) => {
    // No optimistic remove; rely on Realtime DELETE to update state
    await deleteNonLeadEntry(id);
  }, []);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const rows = await listNonLeadEntries({ month, year });
      setState((s) => ({ ...s, entries: rows, loading: false }));
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? 'Failed to refresh non-lead entries',
      }));
    }
  }, [month, year]);

  return {
  entries: state.entries,
  loading: state.loading,
  error: state.error,
  addNonLead,
  updateNonLead,
  removeNonLead,
  refresh,

  // Backward-compat aliases (so App.tsx can keep old names):
  addNonLeadEntry: addNonLead,
  removeNonLeadEntry: removeNonLead,
  updateEntry: updateNonLead,
};

}

// Normalize DB row (snake_case) into our NonLeadEntry shape if necessary.
// If your service already returns camelCase, this function just returns the object unchanged.
function normalizeRow(row: any): NonLeadEntry {
  if (!row) return row;
  if ('repId' in row) return row as NonLeadEntry;
  return {
    id: row.id,
    repId: row.rep_id,
    entryType: row.entry_type,
    day: row.day,
    month: row.month,
    year: row.year,
    time: row.time ?? undefined,
    toTime: row.to_time ?? undefined,
    rotationTarget: row.rotation_target ?? undefined,
    createdBy: row.created_by ?? undefined,
  } as NonLeadEntry;
}

export type { NonLeadEntry };
