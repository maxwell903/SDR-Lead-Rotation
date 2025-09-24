// src/features/leadReplacement/LeadReplacement.tsx
import * as React from 'react';
import type { Lead, LeadEntry, SalesRep, MonthData } from '../types';

/** Lanes */
export type RotationLane = 'sub1k' | '1kplus';

/** Replacement record for an original/bad lead */
export interface ReplacementRecord {
  markId: string;
  leadId: string;
  repId: string;
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

export const buildLeadMap = (monthly: MonthlyStore): Map<string, Lead> => {
  const m = new Map<string, Lead>();
  Object.values(monthly).forEach(({ leads }) => {
    leads.forEach((l) => m.set(l.id, l));
  });
  return m;
};

export const buildLeadEntriesByLeadId = (monthly: MonthlyStore): Map<string, LeadEntry[]> => {
  const m = new Map<string, LeadEntry[]>();
  Object.values(monthly).forEach(({ entries }) => {
    entries.forEach((e) => {
      if (!e.leadId) return;
      const arr = m.get(e.leadId) || [];
      arr.push(e);
      m.set(e.leadId, arr);
    });
  });
  return m;
};

/** MARK an existing lead as needing replacement */
export const markLeadForReplacement = (
  state: ReplacementState,
  lead: Lead
): ReplacementState => {
  if (!lead?.id) return state;
  if (state.byLeadId[lead.id]) return state; // idempotent
  const rec: ReplacementRecord = {
    markId: `mark_${lead.id}`,
    leadId: lead.id,
    repId: lead.assignedTo,
    lane: laneFromUnits(lead.unitCount),
    accountNumber: lead.accountNumber,
    url: lead.url,
    markedAt: now(),
    get isClosed() { return Boolean(this.replacedByLeadId); },
  };
  return {
    byLeadId: { ...state.byLeadId, [lead.id]: rec },
    queue: [...state.queue, lead.id],
  };
};

/** APPLY replacement: newLead replaces originalLeadId */
export const applyReplacement = (
  state: ReplacementState,
  originalLeadId: string,
  newLead: Lead
): ReplacementState => {
  const rec = state.byLeadId[originalLeadId];
  if (!rec) return state;
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
};

/** UNDO by deleting the replacement lead (reopen original mark) */
export const undoReplacementByDeletingReplacementLead = (
  state: ReplacementState,
  replacementLeadId: string
): ReplacementState => {
  const byLeadId = { ...state.byLeadId };
  const originalId = Object.keys(byLeadId).find(
    (orig) => byLeadId[orig].replacedByLeadId === replacementLeadId
  );
  if (!originalId) return state;
  const rec = byLeadId[originalId];
  byLeadId[originalId] = {
    ...rec,
    replacedByLeadId: undefined,
    replacedAt: undefined,
    get isClosed() { return Boolean(this.replacedByLeadId); },
  };
  const queue = state.queue.includes(originalId) ? state.queue : [...state.queue, originalId];
  return { byLeadId, queue };
};

/** Delete guard rules */
export function canDeleteLead(
  state: ReplacementState,
  leadId: string
): { allowed: boolean; reason?: string; isOriginalWithClosedReplacement?: boolean } {
  const rec = state.byLeadId[leadId]; // original?
  if (rec) {
    if (rec.replacedByLeadId) {
      return {
        allowed: false,
        reason:
          'This lead was marked for replacement and already has a replacement. Delete the replacement lead first to unlock this one.',
        isOriginalWithClosedReplacement: true,
      };
    }
    return { allowed: true };
  }
  // is this a replacement?
  const wasReplacementFor = Object.values(state.byLeadId).find(
    (r) => r.replacedByLeadId === leadId
  );
  if (wasReplacementFor) return { allowed: true };
  return { allowed: true };
}

/** Build dropdown options for the Replace Lead toggle (usually open marks only) */
export function buildReplacementOptions(
  monthly: MonthlyStore,
  state: ReplacementState,
  salesReps: SalesRep[],
  { includeClosed = false }: { includeClosed?: boolean } = {}
): Array<{ leadId: string; repId: string; repName: string; accountNumber: string; url?: string; lane: RotationLane; markedAt: number }> {
  const options: Array<{ leadId: string; repId: string; repName: string; accountNumber: string; url?: string; lane: RotationLane; markedAt: number }> = [];
  const leadMap = buildLeadMap(monthly);

  state.queue.forEach((leadId) => {
    const rec = state.byLeadId[leadId];
    if (!rec) return;
    if (!includeClosed && rec.replacedByLeadId) return;
    const repName = salesReps.find((r) => r.id === rec.repId)?.name ?? rec.repId;
    const lead = leadMap.get(leadId);
    options.push({
      leadId,
      repId: rec.repId,
      repName,
      accountNumber: rec.accountNumber || lead?.accountNumber || '',
      url: rec.url || lead?.url || undefined,
      lane: rec.lane,
      markedAt: rec.markedAt,
    });
  });

  options.sort((a, b) => a.markedAt - b.markedAt); // FIFO
  return options;
}

/** Overlay rotation with open replacement marks */
export function overlayRotationWithReplacement(
  baseOrderRepIds: string[],
  expandedSequenceRepIds: string[],
  state: ReplacementState,
  lane: RotationLane
): { collapsedRepIds: string[]; expandedRepIds: string[] } {
  const openMarksGrouped = new Map<string, number>(); // repId -> earliest mark time
  state.queue.forEach((leadId) => {
    const rec = state.byLeadId[leadId];
    if (!rec) return;
    if (rec.lane !== lane) return;
    if (rec.replacedByLeadId) return;
    const curr = openMarksGrouped.get(rec.repId);
    openMarksGrouped.set(rec.repId, curr ? Math.min(curr, rec.markedAt) : rec.markedAt);
  });

  if (openMarksGrouped.size === 0) {
    return { collapsedRepIds: [...baseOrderRepIds], expandedRepIds: [...expandedSequenceRepIds] };
  }

  const openRepOrder = [...openMarksGrouped.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([repId]) => repId);

  const collapsedRepIds = [
    ...openRepOrder,
    ...baseOrderRepIds.filter((id) => !openMarksGrouped.has(id)),
  ];
  const expandedRepIds = [...openRepOrder, ...expandedSequenceRepIds];
  return { collapsedRepIds, expandedRepIds };
}

/** Calendar visuals (what to show for each entry) */
export function getCalendarEntryVisual(
  entry: LeadEntry,
  state: ReplacementState
): { isOriginalMarkedOpen: boolean; isOriginalMarkedClosed: boolean; isReplacementLead: boolean } {
  if (entry.type !== 'lead' || !entry.leadId) {
    return { isOriginalMarkedOpen: false, isOriginalMarkedClosed: false, isReplacementLead: false };
  }
  const rec = state.byLeadId[entry.leadId];
  if (rec) {
    return {
      isOriginalMarkedOpen: !rec.replacedByLeadId,
      isOriginalMarkedClosed: Boolean(rec.replacedByLeadId),
      isReplacementLead: false,
    };
  }
  const closed = Object.values(state.byLeadId).find((r) => r.replacedByLeadId === entry.leadId);
  if (closed) return { isOriginalMarkedOpen: false, isOriginalMarkedClosed: true, isReplacementLead: true };
  return { isOriginalMarkedOpen: false, isOriginalMarkedClosed: false, isReplacementLead: false };
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

/** Small “Mark for Replacement” button */
export const MarkForReplacementButton: React.FC<{
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}> = ({ onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title="Mark this lead as needing replacement"
    className="p-1 text-orange-600 hover:text-orange-700 disabled:opacity-50"
  >
    Replace
  </button>
);

/** Find the counterpart lead id for labels */
export function getReplacementPartnerLeadId(
  entry: LeadEntry,
  state: ReplacementState
): { partnerLeadId?: string; isOriginal?: boolean } {
  if (entry.type !== 'lead' || !entry.leadId) return {};
  const rec = state.byLeadId[entry.leadId];
  if (rec) return { partnerLeadId: rec.replacedByLeadId, isOriginal: true };
  const original = Object.values(state.byLeadId).find((r) => r.replacedByLeadId === entry.leadId);
  if (original) return { partnerLeadId: original.leadId, isOriginal: false };
  return {};
}

/** Assignment lock for replacement save */
export function getReplacementAssignment(
  originalLeadId: string,
  monthly: MonthlyStore,
  state: ReplacementState
): { repId: string; lane: RotationLane } | null {
  const rec = state.byLeadId[originalLeadId];
  if (rec) return { repId: rec.repId, lane: rec.lane };
  const lead = buildLeadMap(monthly).get(originalLeadId);
  if (lead) return { repId: lead.assignedTo, lane: laneFromUnits(lead.unitCount) };
  return null;
}

/** Time filter */
export type TimeFilter = 'day' | 'week' | 'month' | 'ytd' | 'alltime';

export function filterOpenMarksByTime(
  state: ReplacementState,
  lane: RotationLane,
  filter: TimeFilter,
  today: Date
): Array<ReplacementRecord> {
  const open: ReplacementRecord[] = [];
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  const startOf = {
    day: new Date(y, m, d),
    week: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
    month: new Date(y, m, 1),
    ytd: new Date(y, 0, 1),
    alltime: new Date(0),
  } as const;

  const start = filter === 'alltime' ? startOf.alltime
    : filter === 'ytd' ? startOf.ytd
    : filter === 'month' ? startOf.month
    : filter === 'week' ? startOf.week
    : startOf.day;

  for (const leadId of state.queue) {
    const rec = state.byLeadId[leadId];
    if (!rec) continue;
    if (rec.lane !== lane) continue;
    if (rec.replacedByLeadId) continue;
    if (rec.markedAt >= start.getTime() && rec.markedAt <= today.getTime()) {
      open.push(rec);
    }
  }
  open.sort((a, b) => a.markedAt - b.markedAt);
  return open;
}
