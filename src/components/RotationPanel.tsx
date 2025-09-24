import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronUp, HelpCircle, Minimize2, Maximize2, Calendar, Clock, BarChart3 } from 'lucide-react';
import type { SalesRep, RotationState, Lead, LeadEntry } from '../types';
import {
  ReplacementState,
  filterOpenMarksByTime,
} from '../features/leadReplacement.tsx';

type TimeFilter = 'day' | 'week' | 'month' | 'ytd' | 'alltime';

interface RotationItem {
  repId: string;
  name: string;
  originalPosition: number; // 1-based position in base order
  hits: number; // number of skips + leads
  nextPosition: number; // next position in reordered sequence
  isNext: boolean; // true if this is the very next person up
  /** Display position that reflects any overlay (e.g., replacement bump-to-top). */
  displayPosition?: number;
}

interface RotationPanelProps {
  salesReps: SalesRep[];
  rotationState: RotationState;
  onUpdateRotation: (state: RotationState) => void;
  leadEntries: LeadEntry[];
  leads: Lead[];
  // NEW: lead-replacement state
  replacementState: ReplacementState;
}

const RotationPanel: React.FC<RotationPanelProps> = ({ 
  salesReps, 
  rotationState, 
  onUpdateRotation, 
  leadEntries, 
  leads,
  replacementState,
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('alltime');
  const [expandedSub1k, setExpandedSub1k] = useState(false);
  const [expandedOver1k, setExpandedOver1k] = useState(false);
  const [visiblePositions, setVisiblePositions] = useState(20);

  // Get current date for filtering
  const getCurrentEST = (): Date => {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  };

  const currentDate = getCurrentEST();

  // Get time filter description for tooltips
  const getTimeFilterDescription = (filter: TimeFilter): string => {
    const now = currentDate;
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    switch (filter) {
      case 'day':
        return `Today only: ${now.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}`;
        
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 6);
        return `Last 7 days: ${weekStart.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })} - ${now.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })}`;
        
      case 'month':
        return `Entire ${now.toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric' 
        })} (${new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })} - ${new Date(currentYear, currentMonth + 1, 0).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })})`;
        
      case 'ytd':
        const yearStart = new Date(currentYear, 0, 1);
        return `Year-to-date: ${yearStart.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })} - ${now.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })} (${Math.ceil((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24))} days)`;
        
      case 'alltime':
        return 'All historical data since system implementation';
        
      default:
        return '';
    }
  };

  // Filter entries based on time period
  const getFilteredEntries = (entries: LeadEntry[]): LeadEntry[] => {
    const now = currentDate;
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return entries.filter(entry => {
      switch (timeFilter) {
        case 'day':
          // Just the current day
          return entry.day === currentDay && 
                 entry.month === currentMonth && 
                 entry.year === currentYear;
                 
        case 'week':
          // Current day and 6 days before (7 days total)
          const entryDate = new Date(entry.year, entry.month, entry.day);
          const weekStartDate = new Date(now);
          weekStartDate.setDate(now.getDate() - 6); // 6 days before
          const weekEndDate = new Date(now);
          return entryDate >= weekStartDate && entryDate <= weekEndDate;
          
        case 'month':
          // Entire calendar month regardless of current day
          return entry.month === currentMonth && entry.year === currentYear;
          
        case 'ytd':
          // From January 1st of current year to current date
          const entryDateYtd = new Date(entry.year, entry.month, entry.day);
          const yearStart = new Date(currentYear, 0, 1); // January 1st
          const yearEnd = new Date(now);
          return entry.year === currentYear && entryDateYtd >= yearStart && entryDateYtd <= yearEnd;
          
        case 'alltime':
          return true;
          
        default:
          return true;
      }
    });
  };

  // Count hits (skips + qualified leads) for each rep - only for reps in this specific rotation
  const countHits = (baseOrder: string[], isOver1k: boolean): Map<string, number> => {
    const filteredEntries = getFilteredEntries(leadEntries);
    const leadsMap = new Map(leads.map(l => [l.id, l]));
    const hitCounts = new Map<string, number>();

    // Initialize all reps in this rotation with 0 hits
    baseOrder.forEach(repId => hitCounts.set(repId, 0));

    // Treat a closed replacement pair (original + replacement) as ONE hit:
    // - Don't count the original lead once it has a replacement.
    const closedOriginalLeadIds = new Set<string>();
    for (const rec of Object.values(replacementState.byLeadId)) {
      if (rec.replacedByLeadId) {
        closedOriginalLeadIds.add(rec.leadId);
      }
    }

    filteredEntries.forEach(entry => {
      // Only count hits for reps that are in this specific rotation
      if (!baseOrder.includes(entry.repId)) {
        return; // Skip this entry if rep is not in this rotation
      }

      let qualifies = false;

      if (entry.type === 'skip') {
        // Skips count for whichever rotation this rep belongs to
        qualifies = true;
        } else if (entry.type === 'lead' && entry.leadId) {
        // Skip counting the ORIGINAL lead if it has been replaced (closed pair).
          if (closedOriginalLeadIds.has(entry.leadId)) {
            qualifies = false;
          } else {
            const lead = leadsMap.get(entry.leadId);
            if (lead) {
              const leadIsOver1k = lead.unitCount >= 1000;
              // Only count leads that match this rotation type
              qualifies = isOver1k ? leadIsOver1k : !leadIsOver1k;
          }
        }
      }

      if (qualifies) {
        hitCounts.set(entry.repId, (hitCounts.get(entry.repId) || 0) + 1);
      }
    });

    return hitCounts;
  };

  // Generate rotation sequence using the hit-based removal algorithm
  const generateRotationSequence = (
    baseOrder: string[], 
    hitCounts: Map<string, number>, 
    maxPositions: number = 100
  ): Array<{ position: number; repId: string }> => {
    if (baseOrder.length === 0) return [];

    const rotationSize = baseOrder.length;
    
    // Generate infinite sequence up to maxPositions
    const infiniteSequence: Array<{ position: number; repId: string }> = [];
    for (let pos = 1; pos <= maxPositions; pos++) {
      const repIndex = (pos - 1) % rotationSize;
      infiniteSequence.push({
        position: pos,
        repId: baseOrder[repIndex]
      });
    }
    
    // Remove positions for each rep based on their hit count
    let filteredSequence = [...infiniteSequence];
    
    for (const [repId, hits] of hitCounts) {
      let removedCount = 0;
      filteredSequence = filteredSequence.filter(item => {
        if (item.repId === repId && removedCount < hits) {
          removedCount++;
          return false; // Remove this position
        }
        return true; // Keep this position
      });
    }
    
    // Renumber the sequence
    const finalSequence = filteredSequence.map((item, index) => ({
      ...item,
      position: index + 1
    }));
    
    return finalSequence;
  };

  // Generate rotation items for display
  const generateRotationItems = (baseOrder: string[], isOver1k: boolean): RotationItem[] => {
    if (baseOrder.length === 0) return [];

    const hitCounts = countHits(baseOrder, isOver1k);
    const rotationSequence = generateRotationSequence(baseOrder, hitCounts, visiblePositions * 2);
    
    // Create items showing first appearance of each rep
    const seenReps = new Set<string>();
    const items: RotationItem[] = [];
    
    for (const seqItem of rotationSequence) {
      if (!seenReps.has(seqItem.repId)) {
        seenReps.add(seqItem.repId);
        const rep = salesReps.find(r => r.id === seqItem.repId);
        const originalPosition = baseOrder.indexOf(seqItem.repId) + 1;
        const hits = hitCounts.get(seqItem.repId) || 0;
        
        items.push({
          repId: seqItem.repId,
          name: rep?.name || seqItem.repId,
          originalPosition,
          hits,
          nextPosition: seqItem.position,
          isNext: seqItem.position === 1
        });
      }
    }
    
    // Sort by next position
    items.sort((a, b) => a.nextPosition - b.nextPosition);
    
    return items;
  };

  // Generate expanded view showing the full sequence
  const generateExpandedView = (baseOrder: string[], isOver1k: boolean): RotationItem[] => {
    if (baseOrder.length === 0) return [];

    const hitCounts = countHits(baseOrder, isOver1k);
    const rotationSequence = generateRotationSequence(baseOrder, hitCounts, visiblePositions);
    
    return rotationSequence.map(seqItem => {
      const rep = salesReps.find(r => r.id === seqItem.repId);
      const originalPosition = baseOrder.indexOf(seqItem.repId) + 1;
      const hits = hitCounts.get(seqItem.repId) || 0;
      
      return {
        repId: seqItem.repId,
        name: rep?.name || seqItem.repId,
        originalPosition,
        hits,
        nextPosition: seqItem.position,
        isNext: seqItem.position === 1
      };
    });
  };

  // NEW — Replacement overlay helpers (time-aware)
  const getOpenRepOrder = (lane: 'sub1k' | '1kplus'): string[] => {
    const open = filterOpenMarksByTime(replacementState, lane as any, timeFilter as any, new Date());
    const order: string[] = [];
    for (const rec of open) {
      if (!order.includes(rec.repId)) order.push(rec.repId);
    }
    return order;
  };

  const overlayCollapsed = (items: RotationItem[], lane: 'sub1k' | '1kplus'): RotationItem[] => {
    const openOrder = getOpenRepOrder(lane);
    if (openOrder.length === 0) return items;
    const byId = new Map(items.map(i => [i.repId, i]));
    const head: RotationItem[] = [];
    openOrder.forEach(id => { const it = byId.get(id); if (it) head.push(it); });
    const tail = items.filter(i => !openOrder.includes(i.repId));
    const merged = [...head, ...tail];
    // Renumber for display so labels match the visible order (1..n)
    return merged.map((i, idx) => ({
      ...i,
      isNext: idx === 0,
      displayPosition: idx + 1,
    }));
  };

  const overlayExpanded = (expandedItems: RotationItem[], lane: 'sub1k' | '1kplus'): RotationItem[] => {
    const openOrder = getOpenRepOrder(lane);
    if (openOrder.length === 0) return expandedItems;
    const firstByRep = new Map<string, RotationItem>();
    for (const it of expandedItems) {
      if (!firstByRep.has(it.repId)) firstByRep.set(it.repId, it);
    }
    const head: RotationItem[] = [];
    openOrder.forEach((id, idx) => {
      const src = firstByRep.get(id);
      if (src) head.push({ ...src, isNext: idx === 0 });
    });
    // Keep the rest, but don't highlight them as next
    const rest = expandedItems.map(i => ({ ...i, isNext: false }));
    const merged = [...head, ...rest];
    // Renumber display positions across the merged list
    return merged.map((i, idx) => ({
      ...i,
      isNext: idx === 0,
      displayPosition: idx + 1,
    }));
  };

  // Calculate statistics for the summary
  const calculateStatistics = () => {
    const filteredEntries = getFilteredEntries(leadEntries);
    const leadsMap = new Map(leads.map(l => [l.id, l]));
    
    // Count leads per rep
    const leadCounts = new Map<string, number>();
    const oooEntries = new Set<string>(); // repId + day combinations with OOO
    
    salesReps.forEach(rep => leadCounts.set(rep.id, 0));
    
    filteredEntries.forEach(entry => {
      if (entry.type === 'lead' && entry.leadId) {
        leadCounts.set(entry.repId, (leadCounts.get(entry.repId) || 0) + 1);
      } else if (entry.type === 'ooo') {
        oooEntries.add(`${entry.repId}-${entry.day}`);
      }
    });
    
    const leadCountValues = Array.from(leadCounts.values());
    const totalLeads = leadCountValues.reduce((sum, count) => sum + count, 0);
    
    // Find reps with most/least leads
    let mostLeadsCount = Math.max(...leadCountValues);
    let leastLeadsCount = Math.min(...leadCountValues);
    
    if (totalLeads === 0) {
      mostLeadsCount = 0;
      leastLeadsCount = 0;
    }
    
    const mostLeadsReps = salesReps.filter(rep => 
      leadCounts.get(rep.id) === mostLeadsCount && mostLeadsCount > 0
    ).map(rep => rep.name);
    
    const leastLeadsReps = salesReps.filter(rep => 
      leadCounts.get(rep.id) === leastLeadsCount
    ).map(rep => rep.name);
    
    
    
    const openSub = filterOpenMarksByTime(replacementState, 'sub1k' as any, timeFilter as any, new Date());
    const openOver = filterOpenMarksByTime(replacementState, '1kplus' as any, timeFilter as any, new Date());
    const leadsNeedingReplacement = openSub.length + openOver.length;
    
    // Original order
    const originalSub1kOrder = salesReps
      .filter(rep => rep.status === 'active')
      .sort((a, b) => a.sub1kOrder - b.sub1kOrder)
      .map(rep => rep.name);
    
    const originalOver1kOrder = salesReps
      .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
      .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0))
      .map(rep => rep.name);
    
    return {
      totalLeads,
      mostLeadsReps,
      mostLeadsCount,
      leastLeadsReps,
      leastLeadsCount,
      leadsNeedingReplacement,
      leadsReplaced: 0, // Placeholder for future functionality
      originalSub1kOrder,
      originalOver1kOrder
    };
  };

  // Memoized rotation data
  const sub1kItems = useMemo(() => 
    generateRotationItems(rotationState.normalRotationSub1k, false), 
    [rotationState.normalRotationSub1k, leadEntries, leads, timeFilter, salesReps]
  );

  const over1kItems = useMemo(() => 
    generateRotationItems(rotationState.normalRotationOver1k, true), 
    [rotationState.normalRotationOver1k, leadEntries, leads, timeFilter, salesReps]
  );

  const sub1kExpanded = useMemo(() => 
    generateExpandedView(rotationState.normalRotationSub1k, false), 
    [rotationState.normalRotationSub1k, leadEntries, leads, timeFilter, salesReps, visiblePositions]
  );

  const over1kExpanded = useMemo(() => 
    generateExpandedView(rotationState.normalRotationOver1k, true), 
    [rotationState.normalRotationOver1k, leadEntries, leads, timeFilter, salesReps, visiblePositions]
  );

  // NEW — Apply replacement overlay (time-aware)
  const sub1kItemsOverlayed = useMemo(
    () => overlayCollapsed(sub1kItems, 'sub1k'),
    [sub1kItems, replacementState, timeFilter]
  );
  const sub1kExpandedOverlayed = useMemo(
    () => overlayExpanded(sub1kExpanded, 'sub1k'),
    [sub1kExpanded, replacementState, timeFilter]
  );

  const over1kItemsOverlayed = useMemo(
    () => overlayCollapsed(over1kItems, '1kplus'),
    [over1kItems, replacementState, timeFilter]
  );
  const over1kExpandedOverlayed = useMemo(
    () => overlayExpanded(over1kExpanded, '1kplus'),
    [over1kExpanded, replacementState, timeFilter]
  );


  const statistics = useMemo(() => calculateStatistics(), [leadEntries, leads, timeFilter, salesReps]);

  // Update rotation state when next person changes
  useEffect(() => {
    const nextSub1k = sub1kItemsOverlayed.find(item => item.isNext)?.repId || '';
    const next1kPlus = over1kItemsOverlayed.find(item => item.isNext)?.repId || '';

    if (nextSub1k !== rotationState.nextSub1k || next1kPlus !== rotationState.next1kPlus) {
      onUpdateRotation({
        ...rotationState,
        nextSub1k,
        next1kPlus
      });
    }
  }, [sub1kItemsOverlayed, over1kItemsOverlayed, rotationState, onUpdateRotation]);

  // Render individual rotation item
  const renderRotationItem = (item: RotationItem) => (
    <div 
      key={`${item.repId}-${item.nextPosition}`}
      className={`flex items-center justify-between px-3 py-2 text-sm rounded border ${
        item.isNext 
          ? 'bg-blue-50 border-blue-200 text-blue-800' 
          : 'bg-white border-gray-200 text-gray-800'
      }`}
    >
      <div className="flex items-center space-x-3">
        <span className={`font-medium ${item.isNext ? 'text-blue-700' : 'text-gray-600'}`}>
          {(item.displayPosition ?? item.nextPosition)}.
        </span>
        <span className={`${item.isNext ? 'font-semibold' : 'font-medium'}`}>
          {item.name}
        </span>
        {item.isNext && (
          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
            Next
          </span>
        )}
      </div>
      <div className="flex items-center space-x-2 text-xs">
        <div className="group relative">
          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded cursor-help">
            {item.hits} hit{item.hits !== 1 ? 's' : ''}
          </span>
          <div className="hidden group-hover:block absolute right-0 bottom-6 w-64 px-3 py-2 bg-black text-white text-xs rounded whitespace-normal z-20">
            Hits are triggers that cause a Sales Rep to get bumped down to their next turn. Hits include adding a Skip or a Lead to a Sales Rep's cell.
          </div>
        </div>
        <div className="group relative">
          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded cursor-help">
            Orig #{item.originalPosition}
          </span>
          <div className="hidden group-hover:block absolute right-0 bottom-6 w-60 px-3 py-2 bg-black text-white text-xs rounded whitespace-normal z-20">
            This Original Number is the original position of the Sales Rep given no parameters and given no Hits.
          </div>
        </div>
      </div>
    </div>
  );

  // Render rotation lane
  const renderRotationLane = (
    title: string,
    items: RotationItem[],
    expandedItems: RotationItem[],
    expanded: boolean,
    onToggleExpanded: () => void
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h4 className="font-medium text-gray-700 text-sm">{title}</h4>
          <div className="group relative">
            <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
            <div className="hidden group-hover:block absolute left-4 top-0 w-80 px-3 py-2 bg-black text-white text-xs rounded whitespace-normal z-20">
              <div className="font-medium mb-1">How the rotation sorting works:</div>
              <div className="space-y-1">
                <div>• Reps start in their original order (set in Rep Manager)</div>
                <div>• Each "hit" (lead or skip) moves that rep back one full cycle</div>
                <div>• The system shows either each rep's next turn, or the full reordered sequence</div>
                <div>• {expanded ? 'Expanded view shows the complete upcoming rotation order' : 'Collapsed view shows when each rep comes up next'}</div>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={onToggleExpanded}
          className="flex items-center space-x-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          <span>{expanded ? 'Collapse' : 'Expand'}</span>
        </button>
      </div>

      <div className="rounded-lg border bg-white divide-y">
        {expanded ? (
          <>
            {expandedItems.map(renderRotationItem)}
            {expandedItems.length >= visiblePositions && (
              <div className="p-2">
                <button
                  onClick={() => setVisiblePositions(prev => prev + 10)}
                  className="w-full text-xs text-gray-600 hover:text-gray-800 py-1"
                >
                  <ChevronRight className="w-3 h-3 inline mr-1" />
                  Show 10 more positions
                </button>
              </div>
            )}
          </>
        ) : (
          items.map(renderRotationItem)
        )}
      </div>
    </div>
  );

  const timeFilterOptions: { key: TimeFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'day', label: 'Today', icon: <Clock className="w-3 h-3" /> },
    { key: 'week', label: 'Week', icon: <Calendar className="w-3 h-3" /> },
    { key: 'month', label: 'Month', icon: <Calendar className="w-3 h-3" /> },
    { key: 'ytd', label: 'YTD', icon: <BarChart3 className="w-3 h-3" /> },
    { key: 'alltime', label: 'All Time', icon: <BarChart3 className="w-3 h-3" /> }
  ];

  const getTimeFilterLabel = (filter: TimeFilter): string => {
    const option = timeFilterOptions.find(opt => opt.key === filter);
    return option?.label || '';
  };

  return (
    <div className="space-y-4">
      {/* Time Filter Tabs */}
      <div className="bg-white border rounded-lg p-1 relative">
        <div className="absolute top-1 right-1">
          <div className="group relative">
            <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
            <div className="hidden group-hover:block absolute right-0 top-4 w-72 px-3 py-2 bg-black text-white text-xs rounded whitespace-normal z-20">
              <div className="font-medium mb-1">Time Filter Ranges:</div>
              <div className="space-y-1">
                {timeFilterOptions.map(option => (
                  <div key={option.key}>
                    <span className="font-medium">{option.label}:</span> {getTimeFilterDescription(option.key)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {timeFilterOptions.map(option => (
            <button
              key={option.key}
              onClick={() => setTimeFilter(option.key)}
              className={`flex items-center justify-center space-x-1 px-1 py-1.5 text-xs rounded transition-colors ${
                timeFilter === option.key
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Next Up Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Sub 1K Next:</div>
          <div className="font-medium text-gray-800">
            {sub1kItemsOverlayed.find(item => item.isNext)?.name || 'None'}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">1K+ Next:</div>
          <div className="font-medium text-gray-800">
            {over1kItemsOverlayed.find(item => item.isNext)?.name || 'None'}
          </div>
        </div>
      </div>

      {/* Algorithm Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="text-xs text-blue-700 mb-1 font-medium">Rotation Algorithm:</div>
        <div className="text-xs text-blue-600 space-y-1">
          <div>• Each hit moves rep back one full cycle (8 positions)</div>
          <div>• Sub 1K and 1K+ rotations are completely separate</div>
          <div>• Formula: Next Position = Original + (Hits × Cycle Size)</div>
          <div>• Tracking: {getTimeFilterLabel(timeFilter)} 
            {timeFilter === 'week' && ' (8 days)'} 
            {timeFilter === 'ytd' && ' (Jan 1 - Today)'}
          </div>
        </div>
      </div>

      {/* Rotation Lanes */}
      <div className="space-y-4">
        {renderRotationLane(
          'Sub 1K Rotation',
          sub1kItemsOverlayed,
          sub1kExpandedOverlayed,
          expandedSub1k,
          () => setExpandedSub1k(!expandedSub1k)
        )}
        
        {renderRotationLane(
          '1K+ Rotation',
          over1kItemsOverlayed,
          over1kExpandedOverlayed, 
          expandedOver1k,       
          () => setExpandedOver1k(!expandedOver1k)
        )}
      </div>

      {/* Enhanced Summary Stats */}
      <div className="bg-gray-50 border rounded-lg p-3 space-y-3">
        <div className="text-xs text-gray-600 mb-2 font-medium">
          Rotation Summary ({getTimeFilterLabel(timeFilter)})
        </div>
        
        {/* Original Order */}
        <div className="space-y-2">
          <div className="text-xs text-gray-500 font-medium">Original Order (Rep Manager):</div>
          <div className="text-xs space-y-1">
            <div>
              <span className="text-blue-600 font-medium">Sub 1K:</span> 
              <span className="ml-2">{statistics.originalSub1kOrder.join(' → ')}</span>
            </div>
            <div>
              <span className="text-green-600 font-medium">1K+:</span> 
              <span className="ml-2">{statistics.originalOver1kOrder.join(' → ')}</span>
            </div>
          </div>
        </div>

        {/* Lead Statistics */}
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Total Leads ({getTimeFilterLabel(timeFilter)}):</span>
            <span className="font-medium text-green-600">{statistics.totalLeads}</span>
          </div>
          
          {statistics.totalLeads > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Most Leads ({getTimeFilterLabel(timeFilter)}):</span>
                <span className="font-medium text-blue-600">
                  {statistics.mostLeadsReps.join(', ')} ({statistics.mostLeadsCount})
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-500">Least Leads ({getTimeFilterLabel(timeFilter)}):</span>
                <span className="font-medium text-orange-600">
                  {statistics.leastLeadsReps.join(', ')} ({statistics.leastLeadsCount})
                </span>
              </div>
            </>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-500">Total Hit Count:</span>
            <span className="font-medium">
              Sub 1K: {sub1kItems.reduce((sum, item) => sum + item.hits, 0)} | 
              1K+: {over1kItems.reduce((sum, item) => sum + item.hits, 0)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Leads Needing Replacement:</span>
            <span className="font-medium text-red-600">{statistics.leadsNeedingReplacement}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Leads Replaced:</span>
            <span className="font-medium text-gray-500">{statistics.leadsReplaced} (Future Feature)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RotationPanel;