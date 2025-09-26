// hooks/useReplacementState.ts
import { useState, useEffect, useCallback } from 'react';
import { ReplacementService } from '../services/replacementService';
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
    } catch (err) {
      console.error('Error loading replacement marks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load replacement marks');
    } finally {
      setLoading(false);
    }
  }, []);

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
    }
  }, [replacementState]);

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

      // Update local state
      setReplacementState(prev => ({
        ...prev,
        byLeadId: { ...prev.byLeadId, [originalLeadId]: updatedRecord },
      }));

      setError(null);
    } catch (err) {
      console.error('Error applying replacement:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply replacement');
    }
  }, [replacementState]);

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

      // Update local state
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
    }
  }, [replacementState]);

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

      // Update local state
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
    }
  }, [replacementState]);

  // Handle real-time updates
  useEffect(() => {
    const handleRealtimeChange = (payload: any) => {
      console.log('Replacement marks real-time update:', payload);
      
      // Reload all data to ensure consistency
      // In production, you might want to handle individual changes more efficiently
      loadReplacementMarks();
    };

    // Subscribe to real-time changes
    const subscription = ReplacementService.subscribeToChanges(handleRealtimeChange);

    return () => {
      ReplacementService.unsubscribeFromChanges(subscription);
    };
  }, [loadReplacementMarks]);

  // Load initial data
  useEffect(() => {
    loadReplacementMarks();
  }, [loadReplacementMarks]);

  return {
    replacementState,
    loading,
    error,
    markLeadForReplacement,
    applyReplacement,
    removeLeadMark,
    undoReplacement,
    reload: loadReplacementMarks,
  };
};