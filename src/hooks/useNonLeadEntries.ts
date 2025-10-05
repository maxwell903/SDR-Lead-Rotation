// src/hooks/useNonLeadEntries.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  NonLeadEntry, 
  createNonLeadEntry, 
  listNonLeadEntries, 
  deleteNonLeadEntry,
  subscribeNonLeadEntries 
} from '../services/nonLeadEntriesService';

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
  
  // Subscribe to changes with INCREASED DEBOUNCE for database transaction commit
  const unsubscribe = subscribeNonLeadEntries((payload) => {
    console.log('[useNonLeadEntries] Database change detected:', payload.eventType);
    
    // Clear any pending timer
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
    }
    
    // Debounce for 150ms to ensure DB transaction is committed (increased from 60ms)
    refreshTimer.current = window.setTimeout(() => {
      console.log('[useNonLeadEntries] ⚡ Executing debounced refresh for calendar');
      refresh();
      refreshTimer.current = null;
    }, 150);
  });
  
  // Cleanup
  return () => {
    console.log('[useNonLeadEntries] Cleaning up subscription');
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
    }
    unsubscribe();
  };
}, [refresh]);
  

  /**
   * Create a single non-lead entry
   */
  const addNonLeadEntry = async (entry: Omit<NonLeadEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
        
    try {
      const created = await createNonLeadEntry(entry);
      setState(s => ({ ...s, entries: dedupeById([created, ...s.entries]) }));
     // Don't update local state - let the subscription broadcast to all users
     console.log('[useNonLeadEntries] Created entry, waiting for subscription update:', created.id);
      return created;
    } catch (e: any) {
      
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
      setState(s => ({ 
        ...s, 
        entries: s.entries.filter(e => e.id !== id) 
      }));
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete non-lead entry' }));
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
    refresh,
  };
}