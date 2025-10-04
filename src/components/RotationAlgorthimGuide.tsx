// src/components/RotationAlgorithmGuide.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import type { Lane } from '../utils/rotationMath';
import { useHitCounts } from '../hooks/useHitCounts';
import type { Lead, LeadEntry, SalesRep } from '../types';
import type { ReplacementState } from '../features/leadReplacement';
import {
  auditEntriesForLane,
  countHits,
  generateRotationSequence,
} from '../utils/rotationMath';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  salesReps: SalesRep[];
  leads: Lead[];
  leadEntries: LeadEntry[];
  replacementState: ReplacementState;
  baseOrderSub1k: string[];
  baseOrder1kPlus: string[];
  lrlCountsAsZero: boolean;
};

const SLIDES = [
  'Key & Terms',
  'Base Orders (Live)',
  'Hit Calculation',
  'Per-Entry Audit',
  'Net Hits per Rep',
  'Pushback & Next',
  'Worked Example',
] as const;
type SlideKey = typeof SLIDES[number];

const RotationAlgorithmGuide: React.FC<Props> = ({
  isOpen,
  onClose,
  salesReps,
  leads,
  leadEntries,
  replacementState,
  baseOrderSub1k,
  baseOrder1kPlus,
  lrlCountsAsZero,
}) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const clampIndex = useCallback(
    (n: number) => Math.min(Math.max(n, 0), SLIDES.length - 1),
    []
  );
  const goPrev = useCallback(() => setSlideIndex((i) => clampIndex(i - 1)), [clampIndex]);
  const goNext = useCallback(() => setSlideIndex((i) => clampIndex(i + 1)), [clampIndex]);
  const goTo = useCallback((n: number) => setSlideIndex(clampIndex(n)), [clampIndex]);

  // Keyboard handlers (ESC to close, arrows to navigate)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, goPrev, goNext]);

  const { getNetHitsForRep, getHitRecordsForRep, getNetHitsForLane } = useHitCounts();

const calculateCustomHits = useCallback(async (repId: string, lane: Lane) => {
  try {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    const dbLane = lane === '1kplus' ? '1kplus' : 'sub1k';
    
    // Get net hits from database
    const netHits = await getNetHitsForRep(repId, dbLane, month, year);
    
    // Get detailed records for breakdown
    const records = await getHitRecordsForRep(repId, dbLane, month, year);
    
    // Count only the *positive* instances for NL/LRL/SKIP, and only the *negative* for MFR,
   // so the visual breakdown matches the net math and doesn't double-count reversals.
    const breakdown = { NL: 0, MFR: 0, LRL: 0, LTR: 0, skips: 0 };
    records.forEach(record => {
      const v = Number((record as any).hit_value ?? 0);
      switch ((record as any).hit_type) {
        case 'NL':
          if (v > 0) breakdown.NL++;
          break;
       case 'MFR':
          if (v < 0) breakdown.MFR++;
          break;
        case 'MFR_UNMARK':
          if (v > 0) breakdown.NL++; // Count unmarked MFRs as NL since they're back to normal
          break;
        case 'LRL':
          if (v > 0) breakdown.LRL++;
          break;
        case 'SKIP':
          if (v > 0) breakdown.skips++;
          break;
        // LTR stays neutral/hidden in breakdown for now
      }
    });
    
    return { netHits, breakdown };
  } catch (error) {
    console.error('Error fetching hit counts:', error);
    // Fallback to old calculation if database fails
    return { netHits: 0, breakdown: { NL: 0, MFR: 0, LRL: 0, LTR: 0, skips: 0 } };
  }
}, [getNetHitsForRep, getHitRecordsForRep]);

  // Derived data using custom calculation
  const [hitsSub1k, setHitsSub1k] = useState<Map<string, number>>(new Map());
const [hits1kPlus, setHits1kPlus] = useState<Map<string, number>>(new Map());

const [repHitData, setRepHitData] = useState<Map<string, { netHits: number; breakdown: { NL: number; MFR: number; LRL: number; LTR: number; skips: number; } }>>(new Map());

useEffect(() => {
  const loadAllHitData = async () => {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    const hitDataMap = new Map();
    
    // Load data for all reps in both lanes
    const allRepIds = [...new Set([...baseOrderSub1k, ...baseOrder1kPlus])];
    
    for (const repId of allRepIds) {
      // Load sub1k data
      try {
        const sub1kResult = await calculateCustomHits(repId, 'sub1k');
        hitDataMap.set(`${repId}-sub1k`, sub1kResult);
      } catch (error) {
        console.error(`Error loading sub1k data for ${repId}:`, error);
        hitDataMap.set(`${repId}-sub1k`, { netHits: 0, breakdown: { NL: 0, MFR: 0, LRL: 0, LTR: 0, skips: 0 } });
      }
      
      // Load 1kplus data  
      try {
        const over1kResult = await calculateCustomHits(repId, '1kplus');
        hitDataMap.set(`${repId}-1kplus`, over1kResult);
      } catch (error) {
        console.error(`Error loading 1kplus data for ${repId}:`, error);
        hitDataMap.set(`${repId}-1kplus`, { netHits: 0, breakdown: { NL: 0, MFR: 0, LRL: 0, LTR: 0, skips: 0 } });
      }
    }
    
    setRepHitData(hitDataMap);
  };
  
  loadAllHitData();
  // Re-fetch whenever anything DB-driven that could affect hits changes
}, [baseOrderSub1k, baseOrder1kPlus, calculateCustomHits, leads, leadEntries, replacementState]);


useEffect(() => {
  const loadHitCounts = async () => {
    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      
      const sub1kHits = await getNetHitsForLane('sub1k', month, year);
      const over1kHits = await getNetHitsForLane('1kplus', month, year);
      
      setHitsSub1k(sub1kHits);
      setHits1kPlus(over1kHits);
    } catch (error) {
      console.error('Error loading hit counts:', error);
    }
  };
  
  loadHitCounts();
  // Same: refresh the lane maps when DB-backed props change
}, [getNetHitsForLane, baseOrderSub1k, baseOrder1kPlus, leads, leadEntries, replacementState]);

  const seqSub1k = useMemo(
    () => generateRotationSequence(baseOrderSub1k, hitsSub1k, 200),
    [baseOrderSub1k, hitsSub1k]
  );
  const seq1kPlus = useMemo(
    () => generateRotationSequence(baseOrder1kPlus, hits1kPlus, 200),
    [baseOrder1kPlus, hits1kPlus]
  );

  const nextSub1k = seqSub1k[0]?.repId ?? baseOrderSub1k[0] ?? '';
  const next1kPlus = seq1kPlus[0]?.repId ?? baseOrder1kPlus[0] ?? '';

  const auditSub1k = useMemo(
    () => auditEntriesForLane('sub1k', { entries: leadEntries, leads, replacementState, lrlCountsAsZero }),
    [leadEntries, leads, replacementState, lrlCountsAsZero]
  );
  const audit1kPlus = useMemo(
    () => auditEntriesForLane('1kplus', { entries: leadEntries, leads, replacementState, lrlCountsAsZero }),
    [leadEntries, leads, replacementState, lrlCountsAsZero]
  );

  if (!isOpen) return null;

  // Slide rendering function
  const Slide: React.FC = () => {
    switch (SLIDES[slideIndex]) {
      case 'Key & Terms':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-blue-800 mb-3">Rotation Algorithm Overview</h2>
              <p className="text-gray-700 leading-relaxed">
                Our lead rotation system uses a net scoring approach where different lead types add or subtract from a rep's total hits.
                The rep with the lowest net score gets the next lead. When every rep's hit count is at the same number this means you are at the original order.
              </p>
            </div>
            
            <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-800 mb-4">Key Terms & Scoring</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="bg-green-100 rounded-lg p-3 border border-green-200">
                    <div className="font-bold text-gray-800">NL - Normal Lead</div>
                    <div className="text-gray-700 text-sm">Standard lead assignment = <span className="font-bold text-green-700">+1 hit</span></div>
                  </div>
                  <div className="bg-red-100 rounded-lg p-3 border border-red-200">
                    <div className="font-bold text-gray-800">MFR - Marked For Replacement</div>
                    <div className="text-gray-700 text-sm">Bad lead that needs replacing = <span className="font-bold text-red-700">-1 hit</span></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-green-100 rounded-lg p-3 border border-green-200">
                    <div className="font-bold text-gray-800">LRL - Lead Replacing Lead</div>
                    <div className="text-gray-700 text-sm">
                      Replacement leads that close out a mark. We credit <span className="font-bold text-gray-700">= 0 hits</span> 
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 border border-gray-200">
                    <div className="font-bold text-gray-800">LTR - Lead That's Replaced</div>
                    <div className="text-gray-700 text-sm">Original replaced lead = <span className="font-bold text-gray-700">0 hits</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">Net Scoring System</h4>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    Each rep accumulates a net hit score. Normal leads (+1) and bad leads requiring replacement (-1) 
                    affect the score, while replacement leads (+0) are given a nuetral value. This is intentional and is meant to be a free lead. 
                    The rep with the lowest net score receives the next lead assignment. The tie breaker is the original order.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'Base Orders (Live)':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-blue-800 mb-3">Current Base Orders</h2>
              <p className="text-gray-700">
                These are your current rotation orders from the Rep Manager. The algorithm uses these as the foundation, 
                then adjusts based on net hit scores.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">Sub 1K Rotation</h3>
                <div className="space-y-2">
                  {baseOrderSub1k.length > 0 ? (
                    baseOrderSub1k.map((repId, idx) => {
                      const rep = salesReps.find(r => r.id === repId);
                      const isNext = repId === nextSub1k;
                      const netHits = hitsSub1k.get(repId) || 0;
                      return (
                        <div
                          key={repId}
                          className={`rounded-lg p-3 border ${
                            isNext 
                              ? 'bg-orange-100 border-orange-300 ring-2 ring-orange-400' 
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-800">
                                {idx + 1}. {rep?.name || repId}
                              </span>
                              <div className="text-xs text-gray-600">
                                Net: {netHits >= 0 ? '+' : ''}{netHits} hits
                              </div>
                            </div>
                            {isNext && (
                              <span className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                                NEXT
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 italic text-center py-4">No reps configured</div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">1K+ Rotation</h3>
                <div className="space-y-2">
                  {baseOrder1kPlus.length > 0 ? (
                    baseOrder1kPlus.map((repId, idx) => {
                      const rep = salesReps.find(r => r.id === repId);
                      const isNext = repId === next1kPlus;
                      const netHits = hits1kPlus.get(repId) || 0;
                      return (
                        <div
                          key={repId}
                          className={`rounded-lg p-3 border ${
                            isNext 
                              ? 'bg-orange-100 border-orange-300 ring-2 ring-orange-400' 
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-800">
                                {idx + 1}. {rep?.name || repId}
                              </span>
                              <div className="text-xs text-gray-600">
                                Net: {netHits >= 0 ? '+' : ''}{netHits} hits
                              </div>
                            </div>
                            {isNext && (
                              <span className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                                NEXT
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 italic text-center py-4">No 1K+ capable reps</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'Hit Calculation':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-blue-800 mb-3">How Net Hits Are Calculated</h2>
              <p className="text-gray-700">
                Each lead type contributes differently to a rep's net hit score.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="bg-green-50 rounded-xl p-5 border border-green-200">
                <h3 className="text-lg font-semibold text-green-800 mb-3">Positive Scoring (+1)</h3>
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <div className="font-bold text-gray-800">Normal Leads (NL)</div>
                  <div className="text-gray-700 text-sm">
                    Standard lead assignments that count toward the rep's rotation position.
                    Each normal lead adds +1 to their net hit count.
                  </div>
                </div>
              </div>

              <div className="bg-red-50 rounded-xl p-5 border border-red-200">
                <h3 className="text-lg font-semibold text-red-800 mb-3">Negative Scoring (-1)</h3>
                <div className="bg-white rounded-lg p-3 border border-red-100">
                  <div className="font-bold text-gray-800">Marked For Replacement (MFR)</div>
                  <div className="text-gray-700 text-sm">
                    Bad leads that need to be replaced. These subtract -1 from the rep's hit count,
                    effectively moving them forward in the rotation to compensate for the poor lead quality.
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Neutral Scoring (0)</h3>
                <div className="space-y-2">
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="font-bold text-gray-800">Lead Replacing Lead (LRL)</div>
                    <div className="text-gray-700 text-sm">
                      Replacement leads that replace marked leads. Each LRL adds nothing to hit count . Lead that was NL (+1) and the MFR (-1) and LRL (0) all net to 0 hits resulting in a 'Free Lead' with that LRL. This is intended to make up for the time they were skipped while the NL was not marked for replacment.
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="font-bold text-gray-800">Lead That's Replaced (LTR)</div>
                    <div className="text-gray-700 text-sm">
                      Original leads that have been replaced. These become neutral and don't count toward hits. It just shows the account number of the lead you replaced it with.
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                      <h4 className="font-semibold text-gray-800 mb-2">Example Calculation</h4>
                    {/* Hover/focus overlay that says "fill this" */}
                    <div
                      className="relative group font-mono text-sm text-gray-700 bg-white rounded p-2 border"
                      tabIndex={0}
                    >
                      <span>
                        Rep A: 3 NL + 1(1 NL → 1 MFR → (1 LRL ⇄ 1 LTR) = 3(+1) + 1(1 - 1 + (0 + 0)) = +3 net hits
                      </span>
                      <span
                        className="pointer-events-none absolute inset-0 grid place-items-center rounded bg-white/95 text-orange-700 font-semibold
                                   opacity-0 scale-95 transition-all duration-200
                                   group-hover:opacity-100 group-hover:scale-100
                                   group-focus-within:opacity-100 group-focus-within:scale-100"
                        aria-hidden="true"
                      >
                       Deletes of any type just reverses the action
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'Per-Entry Audit':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-blue-800 mb-3">Entry-by-Entry Analysis</h2>
              <p className="text-gray-700">
                Live audit showing how each lead entry contributes to net hit calculations.
              </p>
            </div>

            <div className="grid gap-6">
              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">Sub 1K Entries</h3>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {auditSub1k.length > 0 ? (
                    auditSub1k.map((item, idx) => {
                      const lead = item.leadId ? leads.find(l => l.id === item.leadId) : null;
                      const rep = salesReps.find(r => r.id === item.repId);
                      const leadDisplay = item.type === 'lead' ? 
                        (lead ? `Lead ${lead.id.slice(0, 8)}...` : 'Unknown Lead') : 
                        item.type.toUpperCase();
                      
                      // Custom hit calculation based on new logic
                      let hitValue = 0;
                      let hitColor = 'bg-gray-100 text-gray-600';
                      if (item.reason.includes('skip')) {
                        hitValue = 1;
                        hitColor = 'bg-blue-100 text-blue-800';
                      } else if (item.reason.includes('marked')) {
                        hitValue = -1;
                        hitColor = 'bg-red-100 text-red-800';
                      } else if (item.reason.includes('LRL')) {
                        hitValue = 0;
                        hitColor = 'bg-gray-100 text-gray-600';
                      } else if (item.counted === 1) {
                        hitValue = 1;
                        hitColor = 'bg-green-100 text-green-800';
                      }
                      
                      return (
                        <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-800">{leadDisplay}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${hitColor}`}>
                              {hitValue > 0 ? '+' : ''}{hitValue} hit{Math.abs(hitValue) !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {rep?.name || item.repId} • {item.reason}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 italic text-center py-4">No entries found</div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">1K+ Entries</h3>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {audit1kPlus.length > 0 ? (
                    audit1kPlus.map((item, idx) => {
                      const lead = item.leadId ? leads.find(l => l.id === item.leadId) : null;
                      const rep = salesReps.find(r => r.id === item.repId);
                      const leadDisplay = item.type === 'lead' ? 
                        (lead ? `Lead ${lead.id.slice(0, 8)}...` : 'Unknown Lead') : 
                        item.type.toUpperCase();
                      
                      // Custom hit calculation based on new logic
                      let hitValue = 0;
                      let hitColor = 'bg-gray-100 text-gray-600';
                      if (item.reason.includes('skip')) {
                        hitValue = 1;
                        hitColor = 'bg-blue-100 text-blue-800';
                      } else if (item.reason.includes('marked')) {
                        hitValue = -1;
                        hitColor = 'bg-red-100 text-red-800';
                      } else if (item.reason.includes('LRL')) {
                        hitValue = 0;
                        hitColor = 'bg-gray-100 text-gray-600';
                      } else if (item.counted === 1) {
                        hitValue = 1;
                        hitColor = 'bg-green-100 text-green-800';
                      }
                      
                      return (
                        <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-800">{leadDisplay}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${hitColor}`}>
                              {hitValue > 0 ? '+' : ''}{hitValue} hit{Math.abs(hitValue) !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {rep?.name || item.repId} • {item.reason}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 italic text-center py-4">No entries found</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'Net Hits per Rep':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-blue-800 mb-3">Current Net Hit Totals</h2>
              <p className="text-gray-700">
                Net hit scores determine each rep's position in the rotation queue. Lower scores = sooner turn.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">Sub 1K Net Scores</h3>
                <div className="space-y-2">
                  {baseOrderSub1k.map((repId) => {
                    const rep = salesReps.find(r => r.id === repId);
                    const hitData = repHitData.get(`${repId}-sub1k`) || { netHits: 0, breakdown: { NL: 0, MFR: 0, LRL: 0, LTR: 0, skips: 0 } };
                    const { netHits, breakdown } = hitData;
                    
                    return (
                        <div key={repId} className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-800">{rep?.name || repId}</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            netHits < 0 
                                ? 'bg-green-100 text-green-800'
                                : netHits === 0 
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                            {netHits >= 0 ? '+' : ''}{netHits} net
                            </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                            {breakdown.NL > 0 && `${breakdown.NL} NL`}
                            {breakdown.MFR > 0 && `${breakdown.NL > 0 ? ', ' : ''}${breakdown.MFR} MFR`}
                            {breakdown.LRL > 0 && `${(breakdown.NL > 0 || breakdown.MFR > 0) ? ', ' : ''}${breakdown.LRL} LRL`}
                            {breakdown.LTR > 0 && `${(breakdown.NL > 0 || breakdown.MFR > 0 || breakdown.LRL > 0) ? ', ' : ''}${breakdown.LTR} LTR`}
                            {(breakdown.NL + breakdown.MFR + breakdown.LRL + breakdown.LTR) === 0 && 'No activity'}
                        </div>
                        </div>
                    );
                    })}
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">1K+ Net Scores</h3>
                <div className="space-y-2">
                  {baseOrder1kPlus.map((repId) => {
                    const rep = salesReps.find(r => r.id === repId);
                    const hitData = repHitData.get(`${repId}-1kplus`) || { netHits: 0, breakdown: { NL: 0, MFR: 0, LRL: 0, LTR: 0, skips: 0 } };
                    const { netHits, breakdown } = hitData;
                    
                    return (
                        <div key={repId} className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-800">{rep?.name || repId}</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            netHits < 0 
                                ? 'bg-green-100 text-green-800'
                                : netHits === 0 
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                            {netHits >= 0 ? '+' : ''}{netHits} net
                            </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                            {breakdown.NL > 0 && `${breakdown.NL} NL`}
                            {breakdown.MFR > 0 && `${breakdown.NL > 0 ? ', ' : ''}${breakdown.MFR} MFR`}
                            {breakdown.LRL > 0 && `${(breakdown.NL > 0 || breakdown.MFR > 0) ? ', ' : ''}${breakdown.LRL} LRL`}
                            {breakdown.LTR > 0 && `${(breakdown.NL > 0 || breakdown.MFR > 0 || breakdown.LRL > 0) ? ', ' : ''}${breakdown.LTR} LTR`}
                            {(breakdown.NL + breakdown.MFR + breakdown.LRL + breakdown.LTR) === 0 && 'No activity'}
                        </div>
                        </div>
                    );
                    })}
                </div>
              </div>
            </div>
          </div>
        );

      case 'Pushback & Next':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-blue-800 mb-3">Pushback Calculation</h2>
              <p className="text-gray-700">
                How net hit scores translate into rotation position changes.
              </p>
            </div>

            <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
              <h3 className="text-lg font-semibold text-orange-800 mb-4">Net Score Logic</h3>
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-orange-100">
                  <div className="font-bold text-gray-800 mb-2">Each Net Hit = One Full Cycle Back</div>
                  <div className="text-gray-700 text-sm">
                    A rep's net hit score determines how many complete rotation cycles they're pushed back.
                    Negative scores (from MFR leads) actually move reps forward in the queue.
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-orange-100">
                  <div className="font-bold text-gray-800 mb-2">Example with 5 Reps (A, B, C, D, E)</div>
                  <div className="text-gray-700 text-sm space-y-1">
                    <div>• Rep A: +2 net hits → moves back 10 positions (2 × 5)</div>
                    <div>• Rep B: -1 net hits → moves forward 5 positions (1 × 5)</div>
                    <div>• Rep C: 0 net hits → stays in original position</div>
                  </div>
                </div>

                <div className="bg-orange-100 rounded-lg p-3 border border-orange-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">Current Cycle Size (Sub 1K)</span>
                    <span className="font-bold text-orange-800">{baseOrderSub1k.length} reps</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="font-medium text-gray-800">Current Cycle Size (1K+)</span>
                    <span className="font-bold text-orange-800">{baseOrder1kPlus.length} reps</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">Next: Sub 1K</h4>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="font-bold text-gray-800">
                    {salesReps.find(r => r.id === nextSub1k)?.name || nextSub1k || 'None'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {hitsSub1k.get(nextSub1k) || 0} net hits
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">Next: 1K+</h4>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="font-bold text-gray-800">
                    {salesReps.find(r => r.id === next1kPlus)?.name || next1kPlus || 'None'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {hits1kPlus.get(next1kPlus) || 0} net hits
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

         case 'Worked Example':
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-blue-800 mb-3">OOO & Skip Entries Explained</h2>
        <p className="text-gray-700">
          Understanding how Out of Office (OOO) and Skip entries affect the rotation.
        </p>
      </div>

      {/* Skip Entries Section */}
      <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
        <h3 className="text-lg font-semibold text-yellow-800 mb-4 flex items-center gap-2">
          <span className="bg-yellow-600 text-white px-2 py-1 rounded text-sm">SKP</span>
          Skip Entries
        </h3>
        
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 border border-yellow-100">
            <div className="font-bold text-gray-800 mb-2">What is a Skip?</div>
            <div className="text-gray-700 text-sm">
              A Skip entry counts as <span className="font-bold text-yellow-700">+1 hit</span> for a rep without assigning an actual lead. 
              Used when a rep needs to be pushed back in rotation for any reason but is typically added after giving a lead to a Rep that is Directly after an OOO.
              
            </div>
            <div className="font-bold text-gray-700 text-sm">
              Example:
            </div>
             <div className="text-gray-700 text-sm">
               Orig Order: 1.A, 2.B, 3.C
            </div>
            <div className="text-gray-700 text-sm">
              B is marked as OOO at 2:00pm: Give Lead to C at 2:05 pm and add a Skip to B at 2:05pm so B moves back one cycle.
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-yellow-100">
            <div className="font-bold text-gray-800 mb-2">Rotation Target Options</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-700 min-w-20">Sub 1K:</span>
                <span className="text-gray-600">Only affects the Sub $1K rotation (+1 hit in that lane only)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-700 min-w-20">1K+:</span>
                <span className="text-gray-600">Only affects the $1K+ rotation (+1 hit in that lane only)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-700 min-w-20">Both:</span>
                <span className="text-gray-600">Affects both rotations (+1 hit in Sub 1K AND +1 hit in 1K+)</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-100 rounded-lg p-3 border border-yellow-200">
            <div className="font-mono text-sm text-gray-800">
              <strong>Example:</strong> Rep A gets a Skip with target "both"<br/>
              Result: Rep A gets +1 in Sub 1K rotation AND +1 in 1K+ rotation<br/>
              Effect: Rep A moves back one full cycle in BOTH rotations
            </div>
          </div>
        </div>
      </div>

      {/* OOO Entries Section */}
      <div className="bg-red-50 rounded-xl p-5 border border-red-200">
        <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
          <span className="bg-red-600 text-white px-2 py-1 rounded text-sm">OOO</span>
          Out of Office Entries
        </h3>
        
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 border border-red-100">
            <div className="font-bold text-gray-800 mb-2">What is OOO?</div>
            <div className="text-gray-700 text-sm">
              An OOO entry <span className="font-bold text-red-700">completely removes a rep from rotation</span> for the specified lane(s). 
              The rep is temporarily excluded from receiving leads until the OOO entry is removed.
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-red-100">
            <div className="font-bold text-gray-800 mb-2">Rotation Target Options</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-700 min-w-20">Sub 1K:</span>
                <span className="text-gray-600">Rep excluded from Sub $1K rotation only</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-700 min-w-20">1K+:</span>
                <span className="text-gray-600">Rep excluded from $1K+ rotation only</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-700 min-w-20">Both:</span>
                <span className="text-gray-600">Rep excluded from both rotations (fully out of office)</span>
              </div>
            </div>
          </div>

          <div className="bg-red-100 rounded-lg p-3 border border-red-200">
            <div className="font-mono text-sm text-gray-800">
              <strong>Example:</strong> Rep B has OOO with target "both"<br/>
              Result: Rep B is removed from both rotation calculations<br/>
              Effect: Other reps continue in normal rotation order; Rep B receives no leads
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 mt-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <strong>Important:</strong> If ALL reps in a rotation are OOO, the system displays 
                "We are closed" for that rotation. No leads can be assigned until at least one rep returns.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Differences */}
      <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-800 mb-4">Key Differences</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <div className="font-bold text-yellow-700 mb-2">Skip (SKP)</div>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>Adds +1 hit to rep's count</li>
              <li>Rep stays in rotation</li>
              <li>Moves rep back one cycle</li>
              <li>Used for temporary adjustments</li>
            </ul>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <div className="font-bold text-red-700 mb-2">Out of Office (OOO)</div>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>Removes rep from rotation</li>
              <li>No hits added</li>
              <li>Rep receives no leads</li>
              <li>Used for absences/vacations</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

      

      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotation-algorithm-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="absolute left-1/2 top-1/2 w-[92vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-blue-50 shadow-2xl border border-blue-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-200 bg-blue-600 rounded-t-2xl">
          <h3 id="rotation-algorithm-title" className="text-lg font-bold text-white">
            Rotation Algorithm Guide - Net Scoring System
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg hover:bg-blue-500 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 min-h-[420px] max-h-[60vh] overflow-y-auto">
          <Slide />
        </div>

        {/* Footer / Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-blue-200 bg-white rounded-b-2xl">
          <button
            onClick={goPrev}
            disabled={slideIndex === 0}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-3 w-3 rounded-full transition-all ${
                  i === slideIndex 
                    ? 'bg-blue-600 ring-2 ring-blue-300' 
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to slide ${i + 1}: ${SLIDES[i]}`}
              />
            ))}
          </div>
          
          <button
            onClick={goNext}
            disabled={slideIndex === SLIDES.length - 1}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-gray-700"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        {/* Slide indicator */}
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2">
          <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
            {slideIndex + 1} of {SLIDES.length}: {SLIDES[slideIndex]}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RotationAlgorithmGuide;