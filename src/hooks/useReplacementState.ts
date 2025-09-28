// hooks/useReplacementState.ts
import { useState, useEffect, useCallback } from 'react';
import { ReplacementService } from '../services/replacementService';
import { supabase } from '../lib/supabase';
import { ReplacementState, ReplacementRecord } from '../features/leadReplacement';
import { Lead } from '../types';

export const useReplacementState = () => {
  const [replacementState, setReplacementState] = useState<ReplacementState>({
    byLeadId: {},
    queue: [],
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convert array of records to ReplacementState format
  const recordsToState = (records: ReplacementRecord[]): ReplacementState => {
    const byLeadId: { [leadId: string]: ReplacementRecord } = {};
    const queue: string[] = [];

    records.forEach(record => {
      byLeadId[record.leadId] = record;
      // Only add to queue if not replaced yet
      if (!record.replacedByLeadId) {
        queue.push(record.leadId);
      }
    });

    return { byLeadId, queue };
  };

  // Load initial data from database
  const loadReplacementMarks = useCallback(async () => {
    try {
      setLoading(true);
      const records = await ReplacementService.getAllReplacementMarks();
      const newState = recordsToState(records);
      setReplacementState(newState);
      setError(null);
      console.log('Replacement marks loaded:', newState);
    } catch (err) {
      console.error('Error loading replacement marks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load replacement marks');
    } finally {
      setLoading(false);
    }
  }, []);

// IMPROVED: Set up real-time subscription with debouncing for replacement_marks table
useEffect(() => {
  loadReplacementMarks();

  let timeoutId: NodeJS.Timeout;
  
  const channel = supabase
    .channel('replacement_marks_changes')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'replacement_marks' 
    }, (payload) => {
      console.log('Replacement marks changed:', payload);
      
      // FIXED: Debounce rapid changes to prevent race conditions
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        loadReplacementMarks();
      }, 100); // 100ms debounce
    })
    .subscribe();

  return () => {
    clearTimeout(timeoutId);
    supabase.removeChannel(channel);
  };
}, [loadReplacementMarks]);

  // Mark lead for replacement (save to database)
  const markLeadForReplacement = useCallback(async (lead: Lead) => {
    try {
      // Check if already marked
      if (replacementState.byLeadId[lead.id]) {
        console.log('Lead already marked for replacement:', lead.id);
        return;
      }

      // Determine lane based on unit count
      const lane = lead.unitCount >= 1000 ? 'over1k' : 'sub1k';

      const record = await ReplacementService.createReplacementMark({
        leadId: lead.id,
        repId: lead.assignedTo,
        lane: lane as any,
        accountNumber: lead.accountNumber || '',
        url: lead.url || '',
        replacedByLeadId: undefined,
        replacedAt: undefined,
      });

      // Update local state immediately for better UX
      setReplacementState(prev => ({
        byLeadId: { ...prev.byLeadId, [lead.id]: record },
        queue: [...prev.queue, lead.id],
      }));

      setError(null);
      
    } catch (err) {
      console.error('Error marking lead for replacement:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark lead for replacement');
      await loadReplacementMarks();
    }
  }, [replacementState, loadReplacementMarks]);

  // Apply replacement (save to database)
  const applyReplacement = useCallback(async (originalLeadId: string, newLead: Lead) => {
    try {
      const record = replacementState.byLeadId[originalLeadId];
      if (!record) {
        throw new Error('Original lead not marked for replacement');
      }

      if (record.replacedByLeadId) {
        throw new Error('Lead already has a replacement');
      }

      const updatedRecord = await ReplacementService.updateReplacementMark(
        record.markId, 
        newLead.id
      );

      setReplacementState(prev => {
        // Remove from queue since it's now closed
        const newQueue = prev.queue.filter(id => id !== originalLeadId);
        
        return {
          byLeadId: { ...prev.byLeadId, [originalLeadId]: updatedRecord },
          queue: newQueue,
        };
      });

       setError(null);
      
      console.log('Replacement applied successfully:', {
        originalLeadId,
        newLeadId: newLead.id,
        updatedRecord
      });
      

      setError(null);
    } catch (err) {
      console.error('Error applying replacement:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply replacement');
      await loadReplacementMarks();
    }
  }, [replacementState, loadReplacementMarks]);

  // Remove lead mark (delete from database)
  const removeLeadMark = useCallback(async (leadId: string) => {
    try {
      const record = replacementState.byLeadId[leadId];
      if (!record) {
        console.log('Lead not marked for replacement:', leadId);
        return;
      }

      if (record.replacedByLeadId) {
        throw new Error('Cannot remove mark: lead already has a replacement. Delete replacement first.');
      }

      await ReplacementService.deleteReplacementMark(record.markId);

      // Update local state immediately
      setReplacementState(prev => {
        const newByLeadId = { ...prev.byLeadId };
        delete newByLeadId[leadId];
        const newQueue = prev.queue.filter(id => id !== leadId);
        return { byLeadId: newByLeadId, queue: newQueue };
      });

      setError(null);
    } catch (err) {
      console.error('Error removing lead mark:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove lead mark');
      await loadReplacementMarks();
    }
  }, [replacementState, loadReplacementMarks]);

  // Undo replacement (update database)
  const undoReplacement = useCallback(async (replacementLeadId: string) => {
    try {
      const originalId = Object.keys(replacementState.byLeadId).find(
        orig => replacementState.byLeadId[orig].replacedByLeadId === replacementLeadId
      );

      if (!originalId) {
        throw new Error('Cannot find original lead for replacement');
      }

      const record = replacementState.byLeadId[originalId];
      const updatedRecord = await ReplacementService.undoReplacement(record.markId);

      // Update local state immediately
      setReplacementState(prev => {
        const queue = prev.queue.includes(originalId) ? prev.queue : [...prev.queue, originalId];
        return {
          byLeadId: { ...prev.byLeadId, [originalId]: updatedRecord },
          queue,
        };
      });

      setError(null);
    } catch (err) {
      console.error('Error undoing replacement:', err);
      setError(err instanceof Error ? err.message : 'Failed to undo replacement');
      await loadReplacementMarks();
    }
  }, [replacementState, loadReplacementMarks]);

  return {
    replacementState,
    loading,
    error,
    markLeadForReplacement,
    applyReplacement,
    removeLeadMark,
    undoReplacement,
    loadReplacementMarks, // Expose for manual refresh if needed
  };
};