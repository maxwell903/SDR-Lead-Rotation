// src/utils/rotationMath.ts
// Shared rotation math so UI + slideshow stay in sync.

export type Lane = 'sub1k' | '1kplus';

export type SalesRep = { id: string; name: string };
export type Lead = { id: string; unitCount?: number | null };
export type LeadEntry = {
  id: string;
  repId: string;
  type: 'lead' | 'skip' | 'ooo' | 'next';
  leadId?: string | null;
  day?: number;
  month?: number;
  year?: number;
};
export type ReplacementRecord = {
  leadId: string;               // original lead-id
  replacedByLeadId?: string | null; // the LRL lead-id (if replaced)
  lane?: Lane;
  repId?: string;
  accountNumber?: string;
  markedAt?: string | number | Date;
  replacedAt?: string | number | Date | null;
};
export type ReplacementState = {
  byLeadId: Record<string, ReplacementRecord>;
};

export function isOver1k(lead?: Lead | null): boolean {
  return !!lead && (lead.unitCount ?? 0) >= 1000;
}

export function countHits(
  baseOrder: string[],
  lane: Lane,
  opts: {
    entries: LeadEntry[];
    leads: Lead[];
    replacementState: ReplacementState | null | undefined;
    lrlCountsAsZero: boolean;
  }
): Map<string, number> {
  const { entries, leads, replacementState, lrlCountsAsZero } = opts;
  const hitCounts = new Map<string, number>();
  baseOrder.forEach((repId) => hitCounts.set(repId, 0));

  const leadsMap = new Map<string, Lead>(leads.map((l) => [l.id, l]));
  const marked = new Set<string>(); // all MFR/RLBR originals
  const lrlSet = new Set<string>(); // replacement leads (LRL)

  if (replacementState?.byLeadId) {
    for (const rec of Object.values(replacementState.byLeadId)) {
      if (rec?.leadId) marked.add(rec.leadId);
      if (rec?.replacedByLeadId) lrlSet.add(rec.replacedByLeadId);
    }
  }

  const laneIsOver = lane === '1kplus';

  for (const e of entries) {
    if (!baseOrder.includes(e.repId)) continue;

    let qualifies = false;
    if (e.type === 'skip') {
      // Skip counts for both lanes
      qualifies = true;
    } else if (e.type === 'lead' && e.leadId) {
      if (marked.has(e.leadId)) {
        // Exclude MFR & RLBR originals
        qualifies = false;
      } else if (lrlCountsAsZero && lrlSet.has(e.leadId)) {
        // Optionally exclude LRLs
        qualifies = false;
      } else {
        const lead = leadsMap.get(e.leadId);
        const laneMatch = laneIsOver ? isOver1k(lead) : !isOver1k(lead);
        qualifies = !!laneMatch;
      }
    }

    if (qualifies) {
      hitCounts.set(e.repId, (hitCounts.get(e.repId) || 0) + 1);
    }
  }

  return hitCounts;
}

export function generateRotationSequence(
  baseOrder: string[],
  hitCounts: Map<string, number>,
  maxPositions: number = 100
): Array<{ position: number; repId: string }> {
  if (!baseOrder.length) return [];
  const rotationSize = baseOrder.length;
  const sequence: Array<{ position: number; repId: string }> = [];

  for (let pos = 1; pos <= maxPositions; pos++) {
    const repIndex = (pos - 1) % rotationSize;
    const repId = baseOrder[repIndex];
    const hits = hitCounts.get(repId) || 0;

    // How many full cycles this rep has been pushed back
    const repPositionsSkipped = Math.floor((pos - 1 - repIndex) / rotationSize);
    if (repPositionsSkipped < hits) {
      // still being pushed back
      continue;
    }
    sequence.push({ position: sequence.length + 1, repId });
  }

  return sequence;
}

export function auditEntriesForLane(
  lane: Lane,
  opts: {
    entries: LeadEntry[];
    leads: Lead[];
    replacementState: ReplacementState | null | undefined;
    lrlCountsAsZero: boolean;
  }
): Array<{
  entryId: string;
  repId: string;
  type: LeadEntry['type'];
  leadId?: string | null;
  counted: 0 | 1;
  reason: string;
}> {
  const { entries, leads, replacementState, lrlCountsAsZero } = opts;
  const leadsMap = new Map<string, Lead>(leads.map((l) => [l.id, l]));
  const marked = new Set<string>();
  const lrlSet = new Set<string>();

  if (replacementState?.byLeadId) {
    for (const rec of Object.values(replacementState.byLeadId)) {
      if (rec?.leadId) marked.add(rec.leadId);
      if (rec?.replacedByLeadId) lrlSet.add(rec.replacedByLeadId);
    }
  }

  const isLaneOver = lane === '1kplus';
  const rows: Array<{
    entryId: string;
    repId: string;
    type: LeadEntry['type'];
    leadId?: string | null;
    counted: 0 | 1;
    reason: string;
  }> = [];

  for (const e of entries) {
    let counted = 0;
    let reason = 'N/A → 0';

    if (e.type === 'skip') {
      counted = 1;
      reason = 'skip → +1 (both lanes)';
    } else if (e.type === 'lead' && e.leadId) {
      if (marked.has(e.leadId)) {
        counted = 0;
        reason = 'marked (MFR/RLBR original) → 0';
      } else if (lrlCountsAsZero && lrlSet.has(e.leadId)) {
        counted = 0;
        reason = 'LRL excluded → 0';
      } else {
        const lead = leadsMap.get(e.leadId);
        const match = isLaneOver ? isOver1k(lead) : !isOver1k(lead);
        if (match) {
          counted = 1;
          reason = 'lead in lane → +1';
        } else {
          counted = 0;
          reason = 'lead not in lane → 0';
        }
      }
    }

    rows.push({
      entryId: e.id,
      repId: e.repId,
      type: e.type,
      leadId: e.leadId,
      counted: counted as 0 | 1,
      reason,
    });
  }
  return rows;
}
