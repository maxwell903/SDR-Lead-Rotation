// src/hooks/useNonLeadEntries.ts
import { useEffect, useState, useCallback } from 'react';
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

  const replaceTempId = useCallback((tempId: string, realId: string) => {
    setState((s) => {
      const i = s.entries.findIndex((e) => e.id === tempId);
      if (i === -1) return s;
      const copy = s.entries.slice();
      copy[i] = { ...copy[i], id: realId };
      return { ...s, entries: copy };
    });
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
    // one channel per month/year so switching months tears down correctly
    const channel = supabase
      .channel(`non_lead_entries:${year}-${month}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'non_lead_entries' },
        (payload: any) => {
          const row = normalizeRow(payload.new);
          if (isInScope(row)) upsertLocal(row);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'non_lead_entries' },
        (payload: any) => {
          const rowNew = normalizeRow(payload.new);
          const rowOld = normalizeRow(payload.old);
          // moved out of scope
          if (isInScope(rowOld) && !isInScope(rowNew)) {
            removeLocal(rowOld.id);
            return;
          }
          // moved into scope or updated within scope
          if (isInScope(rowNew)) upsertLocal(rowNew);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'non_lead_entries' },
        (payload: any) => {
          const row = normalizeRow(payload.old);
          if (isInScope(row)) removeLocal(row.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [month, year, upsertLocal, removeLocal, isInScope]);

  // ---------- optimistic actions ----------
  const addNonLead = useCallback(
    async (input: Omit<NonLeadEntry, 'id'>) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: NonLeadEntry = { id: tempId, ...input };
      upsertLocal(optimistic);
      try {
        const created = await createNonLeadEntry(input);
        replaceTempId(tempId, created.id);
        return created;
      } catch (e) {
        removeLocal(tempId);
        throw e;
      }
    },
    [upsertLocal, replaceTempId, removeLocal]
  );

  const updateNonLead = useCallback(
    async (id: string, patch: Partial<NonLeadEntry>) => {
      const before = state.entries.find((e) => e.id === id);
      if (before) upsertLocal({ ...before, ...patch });
      try {
        await updateNonLeadEntry(id, patch);
      } catch (e) {
        if (before) upsertLocal(before);
        throw e;
      }
    },
    [state.entries, upsertLocal]
  );

  const removeNonLead = useCallback(
    async (id: string) => {
      const before = state.entries.find((e) => e.id === id);
      removeLocal(id);
      try {
        await deleteNonLeadEntry(id);
      } catch (e) {
        if (before) upsertLocal(before);
        throw e;
      }
    },
    [state.entries, removeLocal, upsertLocal]
  );

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
    rotationTarget: row.rotation_target ?? undefined,
    createdBy: row.created_by ?? undefined,
  } as NonLeadEntry;
}

export type { NonLeadEntry };
