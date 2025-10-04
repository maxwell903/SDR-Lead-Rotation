import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Clock, ChevronRight, Minimize2, Maximize2, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getNetHitCounts, subscribeHitCounts } from '../services/hitCountsService';
import type { SalesRep } from '../types';

interface ReplacementLead {
  id: string;
  repId: string;
  repName: string;
  leadId: string;
  markedAt: Date;
  lane: string;
}

interface RotationPanelMK2Props {
  salesReps: SalesRep[];
  viewingMonth: number; 
  viewingYear: number;  
  onOpenAlgorithm?: () => void;
}

interface RotationItem {
  repId: string;
  name: string;
  originalPosition: number;
  hits: number;
  nextPosition: number;
  displayPosition?: number;
  isNext: boolean;
  hasOpenReplacements?: boolean;
}

const RotationPanelMK2: React.FC<RotationPanelMK2Props> = ({ 
  salesReps, 
  viewingMonth,
  viewingYear,
  onOpenAlgorithm 
}) => {
  const [hitsSub1k, setHitsSub1k] = useState<Map<string, number>>(new Map());
  const [hits1kPlus, setHits1kPlus] = useState<Map<string, number>>(new Map());
  const [replacementMarks, setReplacementMarks] = useState<ReplacementLead[]>([]);
  const [oooReps, setOooReps] = useState<Set<string>>(new Set());
  const [expandedSub1k, setExpandedSub1k] = useState(false);
  const [expanded1kPlus, setExpanded1kPlus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [oooTargets, setOooTargets] = useState<Map<string, string>>(new Map());

  const [refreshKey, setRefreshKey] = useState(0);
  
  const month = viewingMonth + 1; // Convert from 0-based to 1-based
  const year = viewingYear;

  const loadHitCounts = useCallback(async () => {
    try {
      const sub1kHits = await getNetHitCounts({ lane: 'sub1k' });
      const over1kHits = await getNetHitCounts({ lane: '1kplus' });
      
      setHitsSub1k(sub1kHits);
      setHits1kPlus(over1kHits);
      
      // 🔥 CRITICAL: Force component to re-render with new data
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error loading hit counts:', error);
    }
  }, []);
  
  const loadReplacementMarks = useCallback(async () => {
    try {
      const { data: replacementData, error } = await supabase
        .from('replacement_marks')
        .select('id, lead_id, rep_id, lane, marked_at')
        .is('replaced_by_lead_id', null)
        .order('marked_at', { ascending: true });
  
      if (error) throw error;
  
      const replacements: ReplacementLead[] = (replacementData || []).map((mark: any) => {
        const rep = salesReps.find(r => r.id === mark.rep_id);
        return {
          id: mark.id,
          repId: mark.rep_id,
          repName: rep?.name || 'Unknown',
          leadId: mark.lead_id,
          markedAt: new Date(mark.marked_at),
          lane: mark.lane
        };
      });
  
      setReplacementMarks(replacements);
      
      // 🔥 CRITICAL: Force re-render when replacements change
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error loading replacement marks:', error);
    }
  }, [salesReps]);

  const parseTimeString = (timeStr: string, day: number, month: number, year: number): Date | null => {
  if (!timeStr) return null;
  
  try {
    // Handle both "HH:MM" and "HH:MM AM/PM" formats
    const timeParts = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeParts) return null;
    
    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const meridiem = timeParts[3]?.toUpperCase();
    
    // Convert to 24-hour format if AM/PM is specified
    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }
    
    // Create date object for today with the specified time
    const oooDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return oooDateTime;
  } catch (error) {
    console.error('Error parsing time string:', timeStr, error);
    return null;
  }
};

  
  const loadOOOStatus = useCallback(async () => {
  try {
    const now = new Date();
    const today = {
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear()
    };
    
    // Get OOO entries from non_lead_entries table for today
    const { data: oooData, error } = await supabase
      .from('non_lead_entries')
      .select('rep_id, time, rotation_target')
      .eq('entry_type', 'OOO')
      .eq('day', today.day)
      .eq('month', today.month)
      .eq('year', today.year);

    if (error) throw error;

    const oooSet = new Set<string>();
    const oooTargets = new Map<string, string>(); // repId -> rotation_target
    
    // Only add to OOO set if the time has passed
    oooData?.forEach((entry: any) => {
      if (!entry.rep_id) return;
      
      // If no time specified, assume they're OOO immediately
      if (!entry.time) {
        oooSet.add(entry.rep_id);
        oooTargets.set(entry.rep_id, entry.rotation_target || 'both');
        return;
      }
      
      // Parse the OOO time (format: "HH:MM" or "HH:MM AM/PM")
      const oooTime = parseTimeString(entry.time, today.day, today.month, today.year);
      
      // Only mark as OOO if the specified time has passed
      if (oooTime && now >= oooTime) {
        oooSet.add(entry.rep_id);
        oooTargets.set(entry.rep_id, entry.rotation_target || 'both');
      }
    });
    
    setOooReps(oooSet);
    setOooTargets(oooTargets); // You'll need to add this state
  } catch (error) {
    console.error('Error loading OOO status:', error);
  }
}, []);


useEffect(() => {
    console.log('🔄 Setting up real-time subscriptions for rotation panel');
    
    // 1. Subscribe to rep_hit_counts changes
    const unsubscribeHits = subscribeHitCounts(() => {
      console.log('🔔 Hit counts changed - refreshing rotation panel');
      loadHitCounts();
    });

    // 2. Subscribe to replacement_marks changes
    const replacementChannel = supabase
      .channel('replacement_marks_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'replacement_marks' 
      }, () => {
        console.log('🔔 Replacement marks changed - reloading');
        loadReplacementMarks();
      })
      .subscribe();

    // 3. 🔥 CRITICAL: Subscribe to leads table changes (triggers hit count updates)
    const leadsChannel = supabase
      .channel('leads_rotation_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'leads' 
      }, () => {
        console.log('🔔 Leads changed - reloading hit counts');
        loadHitCounts();
        loadReplacementMarks();
      })
      .subscribe();

    // 4. 🔥 CRITICAL: Subscribe to non_lead_entries (SKIPs and OOOs)
    const nonLeadEntriesChannel = supabase
      .channel('non_lead_entries_rotation_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'non_lead_entries' 
      }, () => {
        console.log('🔔 Non-lead entries changed - reloading everything');
        loadOOOStatus();
        loadHitCounts(); // SKIPs create hit counts!
      })
      .subscribe();

    // 5. Subscribe to sales_reps changes
    const repsChannel = supabase
      .channel('sales_reps_rotation_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'sales_reps' 
      }, () => {
        console.log('🔔 Sales reps changed - reloading hit counts');
        loadHitCounts();
      })
      .subscribe();

    // Cleanup all subscriptions
    return () => {
      console.log('🧹 Cleaning up rotation panel subscriptions');
      unsubscribeHits();
      supabase.removeChannel(replacementChannel);
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(nonLeadEntriesChannel);
      supabase.removeChannel(repsChannel);
    };
  }, [loadHitCounts, loadReplacementMarks, loadOOOStatus]);
  

  // Initial load
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      await Promise.all([
        loadHitCounts(),
        loadReplacementMarks(),
        loadOOOStatus()
      ]);
      setLoading(false);
    };
    
    loadAllData();
  }, [loadHitCounts, loadReplacementMarks, loadOOOStatus]);

 // Reload when salesReps changes (separate from subscriptions)
 useEffect(() => {
   console.log('SalesReps changed - reloading replacement marks');
   loadReplacementMarks();
 }, [salesReps, loadReplacementMarks])
  
 // In RotationPanelMK2.tsx - Replace your subscription useEffect with this enhanced version:

useEffect(() => {
  console.log('🔄 Setting up real-time subscriptions for rotation panel');
  
  // 1. Subscribe to rep_hit_counts changes (ALREADY WORKING!)
  const unsubscribeHits = subscribeHitCounts(() => {
    console.log('🔔 Hit counts changed - refreshing rotation panel');
    loadHitCounts();
  });

  // 2. Subscribe to replacement_marks changes
  const replacementChannel = supabase
    .channel('replacement_marks_changes')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'replacement_marks' 
    }, () => {
      console.log('🔔 Replacement marks changed - reloading');
      loadReplacementMarks();
    })
    .subscribe();

  // 3. Subscribe to lead_entries changes - NOW ALSO REFRESHES HIT COUNTS!
  const entriesChannel = supabase
    .channel('lead_entries_rotation_changes')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'lead_entries' 
    }, () => {
      console.log('🔔 Lead entries changed - reloading OOO AND hit counts');
      loadOOOStatus();
      loadHitCounts(); // ✅ ADDED: Also refresh hit counts when lead entries change
    })
    .subscribe();

  // 4. Subscribe to non_lead_entries changes - NOW ALSO REFRESHES HIT COUNTS!
  const nonLeadEntriesChannel = supabase
    .channel('non_lead_entries_rotation_changes')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'non_lead_entries' 
    }, () => {
      console.log('🔔 Non-lead entries changed - reloading OOO AND hit counts');
      loadOOOStatus();
      loadHitCounts(); // ✅ ADDED: Also refresh hit counts when OOO/SKP entries change
    })
    .subscribe();

  // 5. Subscribe to sales_reps changes
  const repsChannel = supabase
    .channel('sales_reps_rotation_changes')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'sales_reps' 
    }, () => {
      console.log('🔔 Sales reps changed - reloading hit counts');
      loadHitCounts();
    })
    .subscribe();

  // Cleanup all subscriptions
  return () => {
    console.log('🧹 Cleaning up rotation panel subscriptions');
    unsubscribeHits();
    supabase.removeChannel(replacementChannel);
    supabase.removeChannel(entriesChannel);
    supabase.removeChannel(nonLeadEntriesChannel);
    supabase.removeChannel(repsChannel);
  };
}, [loadHitCounts, loadReplacementMarks, loadOOOStatus]);

  // Get active reps for a lane (filtering out inactive and OOO)
  const getActiveRepsForLane = useCallback((lane: 'sub1k' | '1kplus'): SalesRep[] => {
  let reps = salesReps.filter(rep => rep.status === 'active');
  
  // Filter for 1k+ capable reps only for 1kplus lane
  if (lane === '1kplus') {
    reps = reps.filter(rep => {
      const params = rep.parameters as any;
      return params?.canHandle1kPlus === true;
    });
  }
   // Exclude OOO reps based on their rotation target
  reps = reps.filter(rep => {
    if (!oooReps.has(rep.id)) return true;
    
    const target = oooTargets.get(rep.id);
    if (!target || target === 'both') return false; // Exclude from both lanes
    if (target === 'sub1k' && lane === 'sub1k') return false; // Exclude from sub1k only
    if (target === 'over1k' && lane === '1kplus') return false; // Exclude from 1k+ only
    
    return true; // Include if target doesn't affect this lane
  });
  
  return reps;
}, [salesReps, oooReps, oooTargets]);

// Auto-refresh every 2 minutes
useEffect(() => {
  // Initial load
  loadOOOStatus();
  
  // Set up 2-minute interval
  const oooInterval = setInterval(() => {
    loadOOOStatus();
  }, 2 * 60 * 1000); // 2 minutes in milliseconds
  
  return () => clearInterval(oooInterval);
}, [loadOOOStatus]);

useEffect(() => {
  const checkMidnightReset = () => {
    const now = new Date();
    const secondsUntilMidnight = (24 * 60 * 60) - 
      (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    
    // Set timeout to trigger at midnight
    const midnightTimeout = setTimeout(() => {
      console.log('Midnight reset - clearing OOO status');
      loadOOOStatus(); // This will reload for the new day
      
      // Set up next midnight check
      checkMidnightReset();
    }, secondsUntilMidnight * 1000);
    
    return () => clearTimeout(midnightTimeout);
  };
  
  const cleanup = checkMidnightReset();
  return cleanup;
}, [loadOOOStatus]);
  
  // Get original order for a lane
  const getOriginalOrder = useCallback((lane: 'sub1k' | '1kplus'): string[] => {
    const reps = getActiveRepsForLane(lane);
    const orderField = lane === 'sub1k' ? 'sub1kOrder' : 'over1kOrder';
    
    return reps
      .sort((a, b) => {
        const orderA = (a as any)[orderField] || 0;
        const orderB = (b as any)[orderField] || 0;
        return orderA - orderB;
      })
      .map(r => r.id);
  }, [getActiveRepsForLane]);
  
  // Generate rotation sequence (for expanded view)
  const generateRotationSequence = useCallback((
    baseOrder: string[],
    hitCounts: Map<string, number>
  ): Array<{ position: number; repId: string }> => {
    if (baseOrder.length === 0) return [];
  
    const sequence: Array<{ position: number; repId: string }> = [];
    const repHits = baseOrder.map(repId => ({
      repId,
      hits: hitCounts.get(repId) || 0
    }));
  
    let position = 1;
    let completedOriginalCycle = false;
  
    while (!completedOriginalCycle && sequence.length < 1000) {
      // Find rep with lowest hits
      const sortedReps = [...repHits].sort((a, b) => {
        if (a.hits !== b.hits) return a.hits - b.hits;
        return baseOrder.indexOf(a.repId) - baseOrder.indexOf(b.repId);
      });
  
      const nextRep = sortedReps[0];
      sequence.push({ position: position++, repId: nextRep.repId });
      nextRep.hits += 1;
  
      // Check if we've completed a cycle matching original order
      if (sequence.length >= baseOrder.length) {
        const lastSegment = sequence.slice(-baseOrder.length);
        const matchesOriginal = lastSegment.every(
          (item, idx) => item.repId === baseOrder[idx]
        );
        if (matchesOriginal) {
          completedOriginalCycle = true;
        }
      }
    }
  
    return sequence;
  }, []);
  
  // Get replacement order for a lane
  const getReplacementOrder = useCallback((lane: 'sub1k' | '1kplus'): ReplacementLead[] => {
    return replacementMarks
      .filter(mark => mark.lane === lane)
      .sort((a, b) => a.markedAt.getTime() - b.markedAt.getTime());
  }, [replacementMarks]);

  // Generate collapsed view items
  const generateCollapsedView = useCallback((
    baseOrder: string[],
    hitCounts: Map<string, number>,
    lane: 'sub1k' | '1kplus'
  ): RotationItem[] => {
    if (baseOrder.length === 0) return [];
  
    const sequence = generateRotationSequence(baseOrder, hitCounts);
    const seenReps = new Set<string>();
    const items: RotationItem[] = [];
    
    for (const seqItem of sequence) {
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
    
    // Overlay replacement order
    const replacements = getReplacementOrder(lane);
    if (replacements.length > 0) {
      const repWithReplacements = new Set(replacements.map(r => r.repId));
      return items.map((item, index) => ({
        ...item,
        hasOpenReplacements: repWithReplacements.has(item.repId),
        displayPosition: repWithReplacements.has(item.repId) 
          ? replacements.findIndex(r => r.repId === item.repId) + 1
          : item.nextPosition,
        isNext: index === 0
      })).sort((a, b) => {
        const aHasRep = a.hasOpenReplacements ? 1 : 0;
        const bHasRep = b.hasOpenReplacements ? 1 : 0;
        if (aHasRep !== bHasRep) return bHasRep - aHasRep;
        return (a.displayPosition || a.nextPosition) - (b.displayPosition || b.nextPosition);
      });
    }
    
    return items.sort((a, b) => a.nextPosition - b.nextPosition);
  }, [generateRotationSequence, salesReps, getReplacementOrder]);
  
  // Generate expanded view items
  const generateExpandedView = useCallback((
    baseOrder: string[],
    hitCounts: Map<string, number>,
    lane: 'sub1k' | '1kplus'
  ): { 
    replacementQueue: RotationItem[]; 
    currentOrder: RotationItem[]; 
    originalOrder: RotationItem[] 
  } => {
    if (baseOrder.length === 0) {
      return { replacementQueue: [], currentOrder: [], originalOrder: [] };
    }
  
    // Generate replacement queue
    const replacements = getReplacementOrder(lane);
    const replacementQueue: RotationItem[] = replacements.map((mark, idx) => {
      const rep = salesReps.find(r => r.id === mark.repId);
      const originalPosition = baseOrder.indexOf(mark.repId) + 1;
      const hits = hitCounts.get(mark.repId) || 0;
      
      return {
        repId: mark.repId,
        name: rep?.name || mark.repId,
        originalPosition,
        hits,
        nextPosition: idx + 1,
        displayPosition: idx + 1,
        isNext: idx === 0,
        hasOpenReplacements: true
      };
    });
  
    // Generate current order sequence
    const sequence = generateRotationSequence(baseOrder, hitCounts);
    const currentOrder: RotationItem[] = sequence.map((seqItem, idx) => {
      const rep = salesReps.find(r => r.id === seqItem.repId);
      const originalPosition = baseOrder.indexOf(seqItem.repId) + 1;
      const hits = hitCounts.get(seqItem.repId) || 0;
      
      return {
        repId: seqItem.repId,
        name: rep?.name || seqItem.repId,
        originalPosition,
        hits,
        nextPosition: seqItem.position,
        displayPosition: replacementQueue.length + idx + 1,
        isNext: replacementQueue.length === 0 && idx === 0,
        hasOpenReplacements: false
      };
    });
  
    // Generate original order (reference section)
    const originalOrder: RotationItem[] = baseOrder.map((repId, idx) => {
      const rep = salesReps.find(r => r.id === repId);
      const hits = hitCounts.get(repId) || 0;
      
      return {
        repId,
        name: rep?.name || repId,
        originalPosition: idx + 1,
        hits,
        nextPosition: -1,
        displayPosition: replacementQueue.length + currentOrder.length + idx + 1,
        isNext: false,
        hasOpenReplacements: false
      };
    });
  
    return { replacementQueue, currentOrder, originalOrder };
  }, [generateRotationSequence, salesReps, getReplacementOrder]);

  // Compute orders for sub1k
  const baseOrderSub1k = useMemo(() => getOriginalOrder('sub1k'), [getOriginalOrder]);
  const sub1kCollapsed = useMemo(
    () => generateCollapsedView(baseOrderSub1k, hitsSub1k, 'sub1k'),
    [generateCollapsedView, baseOrderSub1k, hitsSub1k]
  );
  const sub1kExpanded = useMemo(
    () => generateExpandedView(baseOrderSub1k, hitsSub1k, 'sub1k'),
    [generateExpandedView, baseOrderSub1k, hitsSub1k]
  );
  
  // Compute orders for 1k+
  const baseOrder1kPlus = useMemo(() => getOriginalOrder('1kplus'), [getOriginalOrder]);
  const over1kCollapsed = useMemo(
    () => generateCollapsedView(baseOrder1kPlus, hits1kPlus, '1kplus'),
    [generateCollapsedView, baseOrder1kPlus, hits1kPlus]
  );
  const over1kExpanded = useMemo(
    () => generateExpandedView(baseOrder1kPlus, hits1kPlus, '1kplus'),
    [generateExpandedView, baseOrder1kPlus, hits1kPlus]
  );

  // Render functions
  const renderRotationItem = (item: RotationItem, showHits: boolean = true) => {
    return (
      <div
        key={`${item.repId}-${item.displayPosition || item.nextPosition}`}
        className={`flex items-center justify-between py-2 px-3 rounded transition-all ${
          item.hasOpenReplacements 
            ? 'bg-orange-50 border border-orange-200' 
            : item.isNext 
              ? 'bg-blue-50 border border-blue-200 font-semibold' 
              : 'hover:bg-gray-50'
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
                : ''
          }`}>
            {item.name}
          </span>
          {item.hasOpenReplacements && (
            <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full border border-orange-300">
              Needs Replacement
            </span>
          )}
        </div>
        {showHits && (
          <span className="text-xs text-gray-500">
            {item.hits} hit{item.hits !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  };
  
  const renderRotationLane = (
    title: string,
    collapsedItems: RotationItem[],
    expandedData: { replacementQueue: RotationItem[]; currentOrder: RotationItem[]; originalOrder: RotationItem[] },
    expanded: boolean,
    onToggleExpanded: () => void,
    lane: 'sub1k' | '1kplus'
  ) => {
    const hasReplacements = expandedData.replacementQueue.length > 0;
    
    // Check if all reps are OOO for this lane
    const allOOO = collapsedItems.length === 0 && expandedData.currentOrder.length === 0;
    
    if (allOOO) {
      return (
        <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-6 text-center">
          <Clock className="mx-auto mb-2 text-gray-500" size={32} />
          <h3 className="font-semibold text-gray-700 mb-1">{title}</h3>
          <p className="text-gray-600">We are closed</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h4 className="font-medium text-gray-700 text-sm">{title}</h4>
            <div className="group relative">
              <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
              <div className="hidden group-hover:block absolute left-4 top-0 w-80 px-3 py-2 bg-black text-white text-xs rounded whitespace-normal z-20">
                <div className="font-medium mb-1">How the rotation works:</div>
                <div className="space-y-1">
                  <div>• Reps start in their original order</div>
                  <div>• Each hit (lead or skip) moves that rep back one full cycle</div>
                  <div>• Reps with open replacements are bumped to the top</div>
                  <div>• {expanded ? 'Expanded view shows the complete sequence' : 'Collapsed view shows when each rep comes up next'}</div>
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onToggleExpanded}
            className="flex items-center space-x-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span>{expanded ? 'Collapse' : 'Expand'}</span>
          </button>
        </div>
  
        <div className="rounded-lg border bg-white divide-y">
          {expanded ? (
            <>
              
              
              {/* Current Order Section */}
              <div className="p-3">
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  CURRENT ORDER
                </div>
                <div className="space-y-1">
                  {expandedData.currentOrder.map(item => renderRotationItem(item, true))}
                </div>
              </div>
              
              {/* Original Order Section */}
              <div className="p-3 bg-gray-50">
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  ORIGINAL ORDER
                </div>
                <div className="space-y-1">
                  {expandedData.originalOrder.map(item => renderRotationItem(item, false))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 space-y-1">
              {collapsedItems.map(item => renderRotationItem(item, true))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Rotation Panel</h3>
        {onOpenAlgorithm && (
          <button
            type="button"
            onClick={onOpenAlgorithm}
            className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <span>Rotation Algorithm</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
  
      {/* Sub 1k Rotation */}
      <div className="space-y-2">
        <h4 className="text-md font-semibold text-gray-800">Sub $1K Rotation</h4>
        {renderRotationLane(
          'Current Order',
          sub1kCollapsed,
          sub1kExpanded,
          expandedSub1k,
          () => setExpandedSub1k(!expandedSub1k),
          'sub1k'
        )}
      </div>
  
      {/* 1k+ Rotation */}
      <div className="space-y-2">
        <h4 className="text-md font-semibold text-gray-800">$1K+ Rotation</h4>
        {renderRotationLane(
          'Current Order',
          over1kCollapsed,
          over1kExpanded,
          expanded1kPlus,
          () => setExpanded1kPlus(!expanded1kPlus),
          '1kplus'
        )}
      </div>
    </div>
  );
};

export default RotationPanelMK2;