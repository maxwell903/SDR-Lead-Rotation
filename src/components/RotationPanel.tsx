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
  hits: number; // number of skips + leads (excluding marked leads)
  nextPosition: number; // next position in reordered sequence
  isNext: boolean; // true if this is the very next person up
  /** Display position that reflects any overlay (e.g., replacement bump-to-top). */
  displayPosition?: number;
  /** Flag to indicate this rep has open replacement marks */
  hasOpenReplacements?: boolean;
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

  // UPDATED: Hit counting logic that excludes ALL marked leads (both open and closed)
  const countHits = (baseOrder: string[], isOver1k: boolean): Map<string, number> => {
    const filteredEntries = getFilteredEntries(leadEntries);
    const leadsMap = new Map(leads.map(l => [l.id, l]));
    const hitCounts = new Map<string, number>();

    // Initialize all reps in this rotation with 0 hits
    baseOrder.forEach(repId => hitCounts.set(repId, 0));

    // UPDATED: Exclude ALL marked leads, not just closed ones
    const markedLeadIds = new Set<string>();
    for (const rec of Object.values(replacementState.byLeadId || {})) {
      if (rec && rec.leadId) {
        markedLeadIds.add(rec.leadId);
      }
    }

    filteredEntries.forEach(entry => {
      // Only count hits for reps that are in this specific rotation
      if (!baseOrder.includes(entry.repId)) {
        return;
      }

      let qualifies = false;

      if (entry.type === 'skip') {
        qualifies = true;
      } else if (entry.type === 'lead' && entry.leadId) {
        // UPDATED: Skip counting ANY marked lead (open or closed)
        if (markedLeadIds.has(entry.leadId)) {
          qualifies = false;
        } else {
          const lead = leadsMap.get(entry.leadId);
          if (lead) {
            const leadIsOver1k = lead.unitCount >= 1000;
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

  // Generate rotation sequence based on hits
  const generateRotationSequence = (
    baseOrder: string[], 
    hitCounts: Map<string, number>, 
    maxPositions: number = 100
  ): Array<{ position: number; repId: string }> => {
    if (baseOrder.length === 0) return [];

    const rotationSize = baseOrder.length;
    const sequence: Array<{ position: number; repId: string }> = [];
    
    // Generate sequence by cycling through base order and accounting for hits
    for (let pos = 1; pos <= maxPositions; pos++) {
      const repIndex = (pos - 1) % rotationSize;
      const repId = baseOrder[repIndex];
      const hits = hitCounts.get(repId) || 0;
      
      // Calculate how many cycles this rep has been pushed back
      const repPositionsSkipped = Math.floor((pos - 1 - repIndex) / rotationSize);
      if (repPositionsSkipped < hits) {
        // Skip this position for this rep (they've been pushed back)
        continue;
      }
      
      sequence.push({
        position: sequence.length + 1,
        repId
      });
    }
    
    return sequence;
  };

  // UPDATED: Get open replacement marks in chronological order
  const getOpenRepOrder = (lane: 'sub1k' | '1kplus'): string[] => {
    try {
      const open = filterOpenMarksByTime(replacementState, lane as any, timeFilter as any, new Date());
      const repOrder: string[] = [];
      
      // Sort by mark time to maintain FIFO order
      open.sort((a, b) => a.markedAt - b.markedAt);
      
      for (const rec of open) {
        if (rec.repId && !repOrder.includes(rec.repId)) {
          repOrder.push(rec.repId);
        }
      }
      return repOrder;
    } catch (error) {
      console.error('Error getting open rep order:', error);
      return [];
    }
  };

  // UPDATED: Generate rotation items for collapsed view
  const generateRotationItems = (baseOrder: string[], isOver1k: boolean): RotationItem[] => {
    if (baseOrder.length === 0) return [];

    const hitCounts = countHits(baseOrder, isOver1k);
    const rotationSequence = generateRotationSequence(baseOrder, hitCounts, visiblePositions);
    
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

  // UPDATED: Generate expanded view
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

  // UPDATED: Apply replacement overlay for collapsed view
  // UPDATED: Apply replacement overlay for collapsed view
  // Rules:
  //  • Reps with OPEN replacement marks are bumped to the top (FIFO) and shown as positions 1..N
  //  • All other reps KEEP their true "nextPosition" number (so gaps like "15. Andrej" are preserved)
  //  • Only one row per rep (first appearance semantics)
  const overlayCollapsed = (items: RotationItem[], lane: 'sub1k' | '1kplus'): RotationItem[] => {
    try {
      const openOrder = getOpenRepOrder(lane);
      if (openOrder.length === 0) {
        // No overlay: keep original nextPosition numbers as displayPosition
        return items.map((item, index) => ({
          ...item,
          displayPosition: item.nextPosition,
          isNext: index === 0
        }));
      }

      const itemsByRepId = new Map(items.map(i => [i.repId, i]));
      const openIndex = new Map(openOrder.map((id, idx) => [id, idx])); // repId -> 0-based open rank

      // Compose: open reps first (tagged), then remaining reps in their existing order
      const finalItems: RotationItem[] = [];

      openOrder.forEach(repId => {
        const base = itemsByRepId.get(repId);
        if (base) {
          finalItems.push({
            ...base,
            hasOpenReplacements: true
          });
        }
      });

      items.forEach(item => {
        if (!openIndex.has(item.repId)) {
          finalItems.push(item);
        }
      });

      // Assign displayPosition:
      //  – Open reps get 1..N
      //  – Everyone else keeps their true nextPosition
      return finalItems.map((item, index) => ({
        ...item,
        displayPosition: openIndex.has(item.repId)
          ? (openIndex.get(item.repId)! + 1)
          : item.nextPosition,
        isNext: index === 0
      }));
    } catch (error) {
      console.error('Error in overlayCollapsed:', error);
      return items;
    }
  };

  // UPDATED: Apply replacement overlay for expanded view
  const overlayExpanded = (expandedItems: RotationItem[], lane: 'sub1k' | '1kplus'): RotationItem[] => {
    try {
      const openOrder = getOpenRepOrder(lane);
      if (openOrder.length === 0) {
        return expandedItems.map((item, index) => ({
          ...item,
          displayPosition: index + 1,
          isNext: index === 0
        }));
      }

      // For expanded view, we want to show the reps with open replacements at the top
      // then continue with the normal sequence
      const openRepIds = new Set(openOrder);
      const finalItems: RotationItem[] = [];
      
      // Add open reps first (in chronological order)
      openOrder.forEach(repId => {
        const item = expandedItems.find(ei => ei.repId === repId);
        if (item) {
          finalItems.push({
            ...item,
            hasOpenReplacements: true
          });
        }
      });
      
      // Add remaining items from expanded sequence, skipping duplicates
      // Add the full expanded sequence (including open reps again so "everything in between" is visible)
      expandedItems.forEach(item => {
        finalItems.push(item);
      });
      
      // Renumber display positions
      return finalItems.map((item, index) => ({
        ...item,
        displayPosition: index + 1,
        isNext: index === 0
      }));
    } catch (error) {
      console.error('Error in overlayExpanded:', error);
      return expandedItems;
    }
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
    
    // Count replacement statistics
    let leadsNeedingReplacement = 0;
    try {
      const openSub = filterOpenMarksByTime(replacementState, 'sub1k' as any, timeFilter as any, new Date());
      const openOver = filterOpenMarksByTime(replacementState, '1kplus' as any, timeFilter as any, new Date());
      leadsNeedingReplacement = openSub.length + openOver.length;
    } catch (error) {
      console.error('Error calculating replacement stats:', error);
    }
    
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

  // Memoized rotation data with error boundaries
  const sub1kItems = useMemo(() => {
    try {
      return generateRotationItems(rotationState.normalRotationSub1k, false);
    } catch (error) {
      console.error('Error generating sub1k items:', error);
      return [];
    }
  }, [rotationState.normalRotationSub1k, leadEntries, leads, timeFilter, salesReps, replacementState]);

  const over1kItems = useMemo(() => {
    try {
      return generateRotationItems(rotationState.normalRotationOver1k, true);
    } catch (error) {
      console.error('Error generating over1k items:', error);
      return [];
    }
  }, [rotationState.normalRotationOver1k, leadEntries, leads, timeFilter, salesReps, replacementState]);

  const sub1kExpanded = useMemo(() => {
    try {
      return generateExpandedView(rotationState.normalRotationSub1k, false);
    } catch (error) {
      console.error('Error generating sub1k expanded:', error);
      return [];
    }
  }, [rotationState.normalRotationSub1k, leadEntries, leads, timeFilter, salesReps, visiblePositions, replacementState]);

  const over1kExpanded = useMemo(() => {
    try {
      return generateExpandedView(rotationState.normalRotationOver1k, true);
    } catch (error) {
      console.error('Error generating over1k expanded:', error);
      return [];
    }
  }, [rotationState.normalRotationOver1k, leadEntries, leads, timeFilter, salesReps, visiblePositions, replacementState]);

  // Apply replacement overlay with error handling
  const sub1kItemsOverlayed = useMemo(() => {
    try {
      return overlayCollapsed(sub1kItems, 'sub1k');
    } catch (error) {
      console.error('Error overlaying sub1k collapsed:', error);
      return sub1kItems;
    }
  }, [sub1kItems, replacementState, timeFilter]);

  const sub1kExpandedOverlayed = useMemo(() => {
    try {
      return overlayExpanded(sub1kExpanded, 'sub1k');
    } catch (error) {
      console.error('Error overlaying sub1k expanded:', error);
      return sub1kExpanded;
    }
  }, [sub1kExpanded, replacementState, timeFilter]);

  const over1kItemsOverlayed = useMemo(() => {
    try {
      return overlayCollapsed(over1kItems, '1kplus');
    } catch (error) {
      console.error('Error overlaying over1k collapsed:', error);
      return over1kItems;
    }
  }, [over1kItems, replacementState, timeFilter]);

  const over1kExpandedOverlayed = useMemo(() => {
    try {
      return overlayExpanded(over1kExpanded, '1kplus');
    } catch (error) {
      console.error('Error overlaying over1k expanded:', error);
      return over1kExpanded;
    }
  }, [over1kExpanded, replacementState, timeFilter]);

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

  // Enhanced rotation item rendering with replacement indicators and explicit "Replacement" suffix
  const renderRotationItem = (item: RotationItem) => (
    <div 
      key={`${item.repId}-${item.nextPosition}`}
      className={`flex items-center justify-between px-3 py-2 text-sm rounded border ${
        item.hasOpenReplacements 
          ? 'bg-orange-50 border-orange-200 text-orange-800'
          : item.isNext 
            ? 'bg-blue-50 border-blue-200 text-blue-800' 
            : 'bg-white border-gray-200 text-gray-800'
      }`}
    >
      <div className="flex items-center space-x-3">
        <span className={`font-medium ${
          item.hasOpenReplacements 
            ? 'text-orange-700' 
            : item.isNext 
              ? 'text-blue-700' 
              : 'text-gray-600'
        }`}>
          {(item.displayPosition ?? item.nextPosition)}.
        </span>
        <span className={`${
          item.hasOpenReplacements 
            ? 'font-semibold' 
            : item.isNext 
              ? 'font-semibold' 
              : 'font-medium'
        }`}>
          {item.name}
        </span>
        {item.hasOpenReplacements && (
          <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded-full">
            Needs Replacement
          </span>
        )}
        {item.isNext && !item.hasOpenReplacements && (
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
            Hits are triggers that cause a Sales Rep to get bumped down to their next turn. Hits include adding a Skip or a Lead to a Sales Rep's cell. Leads marked for replacement do not count as hits.
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
  /**
   * Build the top "Replacement queue" list for expanded view.
   * Numbering is local (1..N), no "Next" badge, always shows the orange "Needs Replacement" chip.
   */
  const buildReplacementQueueItems = (
    lane: 'sub1k' | '1kplus',
    expandedItems: RotationItem[],
    collapsedItems: RotationItem[]
  ): RotationItem[] => {
    const openIds = getOpenRepOrder(lane); // FIFO repId[]
    if (!openIds.length) return [];

    // Quick lookup from either expanded or collapsed lists
    const byRep = new Map<string, RotationItem>();
    [...expandedItems, ...collapsedItems].forEach(i => byRep.set(i.repId, i));

    return openIds.map((repId, idx) => {
      const base = byRep.get(repId);
      if (base) {
        return {
          ...base,
          // Local numbering 1..N for the queue
          displayPosition: idx + 1,
          // Guard against key collisions in renderRotationItem (which keys by nextPosition)
          nextPosition: -1000 - idx,
          isNext: false,
          hasOpenReplacements: true,
        };
      }
      // Fallback if rep isn’t in the visible windows yet
      const rep = salesReps.find(r => r.id === repId);
      const baseOrder = lane === 'sub1k'
        ? rotationState.normalRotationSub1k
        : rotationState.normalRotationOver1k;
      return {
        repId,
        name: rep?.name ?? 'Unknown',
        originalPosition: Math.max(1, baseOrder.indexOf(repId) + 1),
        hits: 0,
        nextPosition: -1100 - idx,
        displayPosition: idx + 1,
        isNext: false,
        hasOpenReplacements: true,
      };
    });
  };

  /**
   * Build the "Original Order" section for expanded view.
   * Numbering continues AFTER the expanded list length (offset).
   * These are reference rows only (no "Next", no replacement chip).
   */
  const buildOriginalOrderItems = (
    baseOrder: string[],
    offset: number,
    sampleItems: RotationItem[]
  ): RotationItem[] => {
    if (!baseOrder?.length) return [];
    const byRep = new Map<string, RotationItem>();
    sampleItems.forEach(i => byRep.set(i.repId, i));

    return baseOrder.map((repId, idx) => {
      const base = byRep.get(repId);
      if (base) {
        return {
          ...base,
          displayPosition: offset + idx + 1,
          nextPosition: -2000 - idx, // avoid key collisions
          isNext: false,
          hasOpenReplacements: false,
        };
      }
      const rep = salesReps.find(r => r.id === repId);
      return {
        repId,
        name: rep?.name ?? 'Unknown',
        originalPosition: idx + 1,
        hits: 0,
        nextPosition: -2100 - idx,
        displayPosition: offset + idx + 1,
        isNext: false,
        hasOpenReplacements: false,
      };
    });
  };

  // Render rotation lane
  const renderRotationLane = (
    title: string,
    items: RotationItem[],
    expandedItems: RotationItem[],
    expanded: boolean,
    onToggleExpanded: () => void,
    lane: 'sub1k' | '1kplus',
    baseOrder: string[]
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
                <div>• Leads marked for replacement do not count as hits</div>
                <div>• Reps with open replacement marks are bumped to the top</div>
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
            {/* Section A: Replacement queue (FIFO, local numbering 1..N) */}
            {(() => {
              const repl = buildReplacementQueueItems(lane, expandedItems, items);
              if (!repl.length) return null;
              return (
                <div className="px-3 py-2 border-b bg-orange-50/50">
                  <div className="text-[10px] uppercase tracking-wide text-orange-700 font-semibold mb-1">
                    Leads Marked for Replacement
                  </div>
                  {repl.map(renderRotationItem)}
                </div>
              );
            })()}

            {/* Section B: Full upcoming rotation (everything in between, starts at 1) */}
            <div className="py-1">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-600 font-semibold">
                Full Upcoming Rotation
              </div>
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
            </div>

            {/* Section C: Original Order (continues numbering after Section B) */}
            <div className="px-3 py-2 border-t">
              <div className="text-[10px] uppercase tracking-wide text-gray-600 font-semibold mb-1">
                Original Order
              </div>
              {buildOriginalOrderItems(baseOrder, expandedItems.length, [...expandedItems, ...items]).map(
                renderRotationItem
              )}
            </div>
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
          <div>• Each hit moves rep back one full cycle</div>
          <div>• Leads marked for replacement do not count as hits</div>
          <div>• Reps with open replacement marks are prioritized to the top</div>
          <div>• Sub 1K and 1K+ rotations are completely separate</div>
          <div>• Formula: Next Position = Original + (Hits × Cycle Size)</div>
          <div>• Tracking: {getTimeFilterLabel(timeFilter)} 
            {timeFilter === 'week' && ' (7 days)'} 
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
          () => setExpandedSub1k(!expandedSub1k),
          'sub1k',
          rotationState.normalRotationSub1k
        )}
        
        {renderRotationLane(
          '1K+ Rotation',
          over1kItemsOverlayed,
          over1kExpandedOverlayed,
          expandedOver1k,
          () => setExpandedOver1k(!expandedOver1k),
          '1kplus',
          rotationState.normalRotationOver1k
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