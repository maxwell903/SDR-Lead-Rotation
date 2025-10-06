// src/hooks/useNonLeadEntries.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  NonLeadEntry, 
  createNonLeadEntry, 
  listNonLeadEntries, 
  deleteNonLeadEntry,
  updateNonLeadEntry,
  subscribeNonLeadEntries 
} from '../services/nonLeadEntriesService';
import { supabase } from '../lib/supabase';

type State = {
  entries: NonLeadEntry[];
  loading: boolean;
  error: string | null;
};






/**
 * React hook that exposes CRUD + realtime for non-lead entries (OOO & Skip).
 * Follows the same pattern as useLeads.ts for consistency.
 */
export function useNonLeadEntries(month?: number, year?: number) {
  const [state, setState] = useState<State>({ entries: [], loading: true, error: null });
  const busy = useRef(false);
  const refreshTimer = useRef<number | null>(null);

  // Dedupe helper to prevent duplicate IDs
  const dedupeById = <T extends { id: string }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of arr) {
      const id = item?.id;
      if (!id || !seen.has(id)) {
        if (id) seen.add(id);
        out.push(item);
      }
    }
    return out;
  };

  const refresh = useCallback(async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));
      const entries = await listNonLeadEntries(
        month !== undefined && year !== undefined 
          ? { month, year } 
          : undefined
      );
      setState({ entries: dedupeById(entries), loading: false, error: null });
    } catch (e: any) {
      setState({ entries: [], loading: false, error: e?.message ?? 'Failed to load non-lead entries' });
    }
  }, [month, year]);

 
  useEffect(() => {
  console.log('[useNonLeadEntries] Setting up subscription');
  
  // Initial load
  refresh();
  
  // ✅ FIX: Use SHARED channel name so ALL users get updates
  const channel = supabase
    .channel('non_lead_entries_changes')  // ✅ Same channel for all users
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'non_lead_entries',
    }, (payload) => {
      console.log('[useNonLeadEntries] 📢 Database change detected:', payload.eventType);
      
      // Clear any pending timer
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
      }
      
      // ✅ Debounce for 200ms and use refresh() which has fresh month/year
      refreshTimer.current = window.setTimeout(() => {
        console.log('[useNonLeadEntries] ⚡ Executing debounced refresh');
        refresh(); // ✅ This captures current month/year from closure!
        refreshTimer.current = null;
      }, 200);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[useNonLeadEntries] ✅ Subscription active for channel:', channel.topic);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[useNonLeadEntries] ❌ Subscription error');
      }
    });
  
  // Cleanup
  return () => {
    console.log('[useNonLeadEntries] 🧹 Cleaning up subscription');
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
    }
    supabase.removeChannel(channel);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [refresh]); // ✅ CRITICAL: Only depend on refresh, NOT month/year!



  /**
   * Create a single non-lead entry
   */
  const addNonLeadEntry = async (entry: Omit<NonLeadEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
  if (busy.current) return;
  busy.current = true;
  
  try {
    const created = await createNonLeadEntry(entry);
    // ✅ Don't update local state - let subscription broadcast to ALL users
    console.log('[useNonLeadEntries] Created entry, waiting for subscription update:', created.id);
    return created;
  } catch (e: any) {
    setState(s => ({ ...s, error: e?.message ?? 'Failed to create non-lead entry' }));
    throw e;
  } finally {
    busy.current = false;
  }
};
  /**
   * Delete a single non-lead entry
   */
  const removeNonLeadEntry = async (id: string) => {
  if (busy.current) return;
  busy.current = true;
  
  try {
    await deleteNonLeadEntry(id);
    // ✅ Don't update local state - let subscription broadcast to ALL users
    console.log('[useNonLeadEntries] Deleted entry, waiting for subscription update:', id);
  } catch (e: any) {
    setState(s => ({ ...s, error: e?.message ?? 'Failed to delete non-lead entry' }));
    throw e;
  } finally {
    busy.current = false;
  }
};


  const updateEntry = async (
  id: string, 
  updates: Partial<Omit<NonLeadEntry, 'id' | 'repId' | 'entryType' | 'createdAt' | 'updatedAt'>>
) => {
  if (busy.current) return;
  busy.current = true;
  
  try {
    const updated = await updateNonLeadEntry(id, updates);
    // ✅ Don't update local state - let subscription broadcast to ALL users
    console.log('[useNonLeadEntries] Updated entry, waiting for subscription update:', updated.id);
    return updated;
  } catch (e: any) {
    setState(s => ({ ...s, error: e?.message ?? 'Failed to update non-lead entry' }));
    throw e;
  } finally {
    busy.current = false;
  }
};

  

  return {
    entries: state.entries,
    loading: state.loading,
    error: state.error,
    addNonLeadEntry,
    removeNonLeadEntry,
    updateEntry,
    refresh,
  };






  
}

