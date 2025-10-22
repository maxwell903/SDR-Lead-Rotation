// src/features/leadReplacement.tsx
import * as React from 'react';
import type { Lead, LeadEntry, SalesRep, MonthData } from '../types';

/** Lanes */
export type RotationLane = 'sub1k' | '1kplus';

/** Replacement record for an original/bad lead */
export interface ReplacementRecord {
  markId: string;
  leadId: string;
  repId: string;
  wasCushionLead: boolean;
  lane: RotationLane;
  accountNumber: string;
  url?: string;
  markedAt: number;
  replacedByLeadId?: string;
  replacedAt?: number;
  get isClosed(): boolean;
}

/** In-memory state */
export interface ReplacementState {
  byLeadId: Record<string, ReplacementRecord>;
  queue: string[]; // original leadIds in the order they were marked
}

export const createEmptyReplacementState = (): ReplacementState => ({
  byLeadId: {},
  queue: [],
});

/** helpers */
const laneFromUnits = (unitCount?: number): RotationLane =>
  unitCount && unitCount >= 1000 ? '1kplus' : 'sub1k';

const now = () => Date.now();

export type MonthlyStore = Record<string, MonthData>;

// FIXED: More robust lead map building with null checks
export const buildLeadMap = (monthly: MonthlyStore): Map<string, Lead> => {
  const m = new Map<string, Lead>();
  try {
    Object.values(monthly || {}).forEach(({ leads }) => {
      if (leads && Array.isArray(leads)) {
        leads.forEach((l) => {
          if (l && l.id) {
            m.set(l.id, l);
          }
        });
      }
    });
  } catch (error) {
    console.error('Error building lead map:', error);
  }
  return m;
};

// FIXED: More robust lead entries mapping with null checks
export const buildLeadEntriesByLeadId = (monthly: MonthlyStore): Map<string, LeadEntry[]> => {
  const m = new Map<string, LeadEntry[]>();
  try {
    Object.values(monthly || {}).forEach(({ entries }) => {
      if (entries && Array.isArray(entries)) {
        entries.forEach((e) => {
          if (!e || !e.leadId) return;
          const arr = m.get(e.leadId) || [];
          arr.push(e);
          m.set(e.leadId, arr);
        });
      }
    });
  } catch (error) {
    console.error('Error building lead entries map:', error);
  }
  return m;
};

/** MARK an existing lead as needing replacement */
export const markLeadForReplacement = (
  state: ReplacementState,
  lead: Lead
): ReplacementState => {
  if (!lead?.id) {
    console.warn('Cannot mark lead for replacement: invalid lead');
    return state;
  }
  
  if (state.byLeadId[lead.id]) {
    console.log('Lead already marked for replacement:', lead.id);
    return state; // idempotent
  }
  
  try {
    const rec: ReplacementRecord = {
      markId: `mark_${lead.id}`,
      leadId: lead.id,
      repId: lead.assignedTo,
       wasCushionLead: lead.wasCushionLead ?? false,
      lane: laneFromUnits(lead.unitCount),
      accountNumber: lead.accountNumber || '',
      url: lead.url,
      markedAt: now(),
      get isClosed() { return Boolean(this.replacedByLeadId); },
      
    };
    
    return {
      byLeadId: { ...state.byLeadId, [lead.id]: rec },
      queue: [...state.queue, lead.id],
    };
  } catch (error) {
    console.error('Error marking lead for replacement:', error);
    return state;
  }
};

/** APPLY replacement: newLead replaces originalLeadId */
export const applyReplacement = (
  state: ReplacementState,
  originalLeadId: string,
  newLead: Lead
): ReplacementState => {
  if (!originalLeadId || !newLead?.id) {
    console.warn('Cannot apply replacement: invalid parameters');
    return state;
  }
  
  const rec = state.byLeadId[originalLeadId];
  if (!rec) {
    console.warn('Cannot apply replacement: original lead not marked for replacement');
    return state;
  }
  
  if (rec.replacedByLeadId) {
    console.warn('Lead already has a replacement:', originalLeadId);
    return state;
  }
  
  try {
    const updated: ReplacementRecord = {
      ...rec,
      replacedByLeadId: newLead.id,
      replacedAt: now(),
      get isClosed() { return Boolean(this.replacedByLeadId); },
    };
    
    return {
      ...state,
      byLeadId: { ...state.byLeadId, [originalLeadId]: updated },
    };
  } catch (error) {
    console.error('Error applying replacement:', error);
    return state;
  }
};

/** REMOVE replacement mark (unmark lead without deleting) */
export const removeLeadMark = (
  state: ReplacementState,
  leadId: string
): ReplacementState => {
  if (!leadId) {
    console.warn('Cannot remove mark: invalid lead ID');
    return state;
  }
  
  try {
    const rec = state.byLeadId[leadId];
    if (!rec) {
      console.warn('Lead not marked for replacement:', leadId);
      return state; // Lead wasn't marked anyway
    }
    
    if (rec.replacedByLeadId) {
      console.warn('Cannot remove mark: lead already has a replacement. Delete replacement first.');
      return state;
    }
    
    // Remove from state completely
    const newByLeadId = { ...state.byLeadId };
    delete newByLeadId[leadId];
    
    const newQueue = state.queue.filter(id => id !== leadId);
    
    return {
      byLeadId: newByLeadId,
      queue: newQueue
    };
  } catch (error) {
    console.error('Error removing lead mark:', error);
    return state;
  }
};

/** UNDO by deleting the replacement lead (reopen original mark) */
export const undoReplacementByDeletingReplacementLead = (
  state: ReplacementState,
  replacementLeadId: string
): ReplacementState => {
  if (!replacementLeadId) {
    console.warn('Cannot undo replacement: invalid replacement lead ID');
    return state;
  }
  
  try {
    const byLeadId = { ...state.byLeadId };
    const originalId = Object.keys(byLeadId).find(
      (orig) => byLeadId[orig].replacedByLeadId === replacementLeadId
    );
    
    if (!originalId) {
      console.warn('Cannot find original lead for replacement:', replacementLeadId);
      return state;
    }
    
    const rec = byLeadId[originalId];
    if (!rec) {
      console.warn('Cannot find replacement record for:', originalId);
      return state;
    }
    
    byLeadId[originalId] = {
      ...rec,
      replacedByLeadId: undefined,
      replacedAt: undefined,
      get isClosed() { return Boolean(this.replacedByLeadId); },
    };
    
    // Ensure the original is back in the queue if not already there
    const queue = state.queue.includes(originalId) ? state.queue : [...state.queue, originalId];
    
    return { byLeadId, queue };
  } catch (error) {
    console.error('Error undoing replacement:', error);
    return state;
  }
};



/** Build dropdown options for the Replace Lead toggle (usually open marks only) */
/** Build dropdown options for the Replace Lead toggle (uses DB data only) */
export function buildReplacementOptions(
  state: ReplacementState,
  salesReps: SalesRep[],
  { includeClosed = false }: { includeClosed?: boolean } = {}
): Array<{ leadId: string; repId: string; repName: string; accountNumber: string; url?: string; lane: RotationLane; markedAt: number }> {
  const options: Array<{ leadId: string; repId: string; repName: string; accountNumber: string; url?: string; lane: RotationLane; markedAt: number }> = [];
  
  try {
    const repsMap = new Map(salesReps.map(r => [r.id, r.name]));

    if (!state?.queue || !Array.isArray(state.queue)) {
      return options;
    }

    state.queue.forEach((leadId) => {
      if (!leadId) return;
      
      const rec = state.byLeadId[leadId];
      if (!rec) return;
      
      // Skip closed replacements unless explicitly requested
      if (!includeClosed && rec.replacedByLeadId) return;
      
      const repName = repsMap.get(rec.repId) || rec.repId || 'Unknown Rep';
      
      options.push({
        leadId,
        repId: rec.repId || '',
        repName,
        accountNumber: rec.accountNumber || 'Unknown Account',
        url: rec.url || undefined,
        lane: rec.lane || 'sub1k',
        markedAt: rec.markedAt || 0,
      });
    });

    // Sort by mark time (FIFO)
    options.sort((a, b) => a.markedAt - b.markedAt);
  } catch (error) {
    console.error('Error building replacement options:', error);
  }
  
  return options;
}

/** Overlay rotation with open replacement marks */
export function overlayRotationWithReplacement(
  baseOrderRepIds: string[],
  expandedSequenceRepIds: string[],
  state: ReplacementState,
  lane: RotationLane
): { collapsedRepIds: string[]; expandedRepIds: string[] } {
  // Default fallback
  const fallback = { 
    collapsedRepIds: [...(baseOrderRepIds || [])], 
    expandedRepIds: [...(expandedSequenceRepIds || [])] 
  };
  
  try {
    if (!state?.queue || !Array.isArray(state.queue)) {
      return fallback;
    }

    const openMarksGrouped = new Map<string, number>(); // repId -> earliest mark time
    
    state.queue.forEach((leadId) => {
      if (!leadId) return;
      
      const rec = state.byLeadId[leadId];
      if (!rec) return;
      if (rec.lane !== lane) return;
      if (rec.replacedByLeadId) return; // Skip closed replacements
      
      const curr = openMarksGrouped.get(rec.repId);
      openMarksGrouped.set(rec.repId, curr ? Math.min(curr, rec.markedAt) : rec.markedAt);
    });

    if (openMarksGrouped.size === 0) {
      return fallback;
    }

    // Sort open reps by mark time (FIFO)
    const openRepOrder = [...openMarksGrouped.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([repId]) => repId);

    const collapsedRepIds = [
      ...openRepOrder,
      ...baseOrderRepIds.filter((id) => id && !openMarksGrouped.has(id)),
    ];
    
    const expandedRepIds = [...openRepOrder, ...expandedSequenceRepIds];
    
    return { collapsedRepIds, expandedRepIds };
  } catch (error) {
    console.error('Error overlaying rotation with replacement:', error);
    return fallback;
  }
}

/** Calendar visuals (what to show for each entry) */
export function getCalendarEntryVisual(
  entry: LeadEntry,
  state: ReplacementState
): { isOriginalMarkedOpen: boolean; isOriginalMarkedClosed: boolean; isReplacementLead: boolean } {
  const fallback = { isOriginalMarkedOpen: false, isOriginalMarkedClosed: false, isReplacementLead: false };
  
  if (!entry || entry.type !== 'lead' || !entry.leadId || !state) {
    return fallback;
  }
  
  try {
    const rec = state.byLeadId[entry.leadId];
    if (rec) {
      // This entry is an original lead that was marked for replacement
      return {
        isOriginalMarkedOpen: !rec.replacedByLeadId,
        isOriginalMarkedClosed: Boolean(rec.replacedByLeadId),
        isReplacementLead: false,
      };
    }
    const originalRecord = Object.values(state.byLeadId || {}).find((r) => 
    // Check if this is a replacement lead
    
      r && r.replacedByLeadId === entry.leadId
    );
    
    if (originalRecord) {
    // This entry is a replacement lead (LRL)
      return { 
        isOriginalMarkedOpen: false, 
        isOriginalMarkedClosed: false, 
        isReplacementLead: true 
      };
    }
    
    return fallback;
  } catch (error) {
    console.error('Error getting calendar entry visual:', error);
    return fallback;
  }
}

/** Tiny pill indicators for calendar */
export const ReplacementPill: React.FC<{
  relation: 'needs' | 'replaces';
  text: string;
}> = ({ relation, text }) => {
  const base =
    relation === 'needs'
      ? 'bg-orange-100 text-orange-800 border border-orange-200'
      : 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${base}`}>
      {text}
    </span>
  );
};



/** Find the counterpart lead id for labels */
export function getReplacementPartnerLeadId(
  entry: LeadEntry,
  state: ReplacementState
): { partnerLeadId?: string; isOriginal?: boolean } {
  if (!entry || entry.type !== 'lead' || !entry.leadId || !state) {
    return {};
  }
  
  try {
    const rec = state.byLeadId[entry.leadId];
    if (rec) {
      return { partnerLeadId: rec.replacedByLeadId, isOriginal: true };
    }
    
    const original = Object.values(state.byLeadId || {}).find((r) => 
      r && r.replacedByLeadId === entry.leadId
    );
    
    if (original) {
      return { partnerLeadId: original.leadId, isOriginal: false };
    }
    
    return {};
  } catch (error) {
    console.error('Error getting replacement partner:', error);
    return {};
  }
}

/** Assignment lock for replacement save */
export function getReplacementAssignment(
  originalLeadId: string,
  monthly: MonthlyStore,
  state: ReplacementState
): { repId: string; lane: RotationLane } | null {
  if (!originalLeadId || !state) {
    return null;
  }
  
  try {
    const rec = state.byLeadId[originalLeadId];
    if (rec) {
      return { repId: rec.repId, lane: rec.lane };
    }
    
    const lead = buildLeadMap(monthly || {}).get(originalLeadId);
    if (lead) {
      return { repId: lead.assignedTo, lane: laneFromUnits(lead.unitCount) };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting replacement assignment:', error);
    return null;
  }
}

/** Time filter */
export type TimeFilter = 'day' | 'week' | 'month' | 'ytd' | 'alltime';

// FIXED: More robust time filtering with better error handling
export function filterOpenMarksByTime(
  state: ReplacementState,
  lane: RotationLane,
  filter: TimeFilter,
  today: Date
): Array<ReplacementRecord> {
  const open: ReplacementRecord[] = [];
  
  try {
    if (!state?.queue || !Array.isArray(state.queue) || !today) {
      return open;
    }

    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();

    // Create time boundaries more safely
    let startTime: number;
    const endTime = today.getTime();

    switch (filter) {
      case 'day':
        startTime = new Date(y, m, d).getTime();
        break;
      case 'week':
        startTime = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).getTime();
        break;
      case 'month':
        startTime = new Date(y, m, 1).getTime();
        break;
      case 'ytd':
        startTime = new Date(y, 0, 1).getTime();
        break;
      case 'alltime':
      default:
        startTime = 0;
        break;
    }

    for (const leadId of state.queue) {
      if (!leadId) continue;
      
      const rec = state.byLeadId[leadId];
      if (!rec) continue;
      if (rec.lane !== lane) continue;
      if (rec.replacedByLeadId) continue; // Skip closed replacements
      
      // Check time bounds
      const markTime = rec.markedAt || 0;
      if (markTime >= startTime && markTime <= endTime) {
        open.push(rec);
      }
    }
    
    // Sort by mark time (FIFO)
    open.sort((a, b) => (a.markedAt || 0) - (b.markedAt || 0));
  } catch (error) {
    console.error('Error filtering open marks by time:', error);
  }
  
  return open;
}