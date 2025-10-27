import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Settings, UserPlus } from 'lucide-react';
import CalendarGrid from './components/CalendarGrid';
import RotationPanel from './components/RotationPanel';
import SalesRepManager from './components/SalesRepManager';
import LeadModal from './components/LeadModal';
import LeadReservationModal from './components/LeadReservationMadal';
import ParametersPanel from './components/ParametersPanel';
import { SalesRep, Lead, RotationState, LeadEntry, MonthData } from './types';
import { useReplacementState } from './hooks/useReplacementState';
import { createHitCount } from './services/hitCountsService';
import RotationAlgorithmGuide from './components/RotationAlgorthimGuide';
import {
  ReplacementState,
  createEmptyReplacementState,
  markLeadForReplacement,
  applyReplacement,
  undoReplacementByDeletingReplacementLead,
  removeLeadMark,
  RotationLane,
} from './features/leadReplacement';
import RotationPanelMK2 from './components/RotationPanelMK2';
import ConnectionTest from './components/ConnectionTest';
import { useSalesReps } from './hooks/useSupabaseData';
import AuthWrapper from './components/AuthWrapper';
import { useLeads } from './hooks/useLeads';
import EditLeadModal from './components/EditLeadModal';
import { useNonLeadEntries } from './hooks/useNonLeadEntries';
import AuditTrail from './components/AuditTrail';
import NonLeadEntryModal from './components/NonLeadEntry';
import { useAuth } from './hooks/useAuth';
import { 
  subscribeToReservations, 
  releaseReservationByRepId,
  deleteReservationByRepId,
  deleteReservationOnLeadAssignment,
  type LeadReservation 
} from './services/leadReservationService';



const generateUniqueId = (prefix: string = 'entry'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${performance.now()}`;
};

// Utility function to check for duplicate entries
const checkForDuplicateEntry = (
  existingEntries: LeadEntry[], 
  newEntry: Partial<LeadEntry>,
  excludeId?: string
): LeadEntry | null => {
  return existingEntries.find(entry => {
    // Skip the entry we're updating
    if (excludeId && entry.id === excludeId) return false;
    
    // Check for duplicate non-lead entries (same type, day, rep)
    if (newEntry.type !== 'lead' && entry.type === newEntry.type) {
      return entry.day === newEntry.day && 
             entry.repId === newEntry.repId &&
             entry.month === newEntry.month &&
             entry.year === newEntry.year;
    }
    
    // Check for duplicate leads (same account number, month, year)
    if (newEntry.type === 'lead' && entry.type === 'lead') {
      return entry.value === newEntry.value && // account number
             entry.month === newEntry.month &&
             entry.year === newEntry.year;
    }
    
    return false;
  }) || null;
};

// Utility function to safely add entry to state
const safeAddEntryToState = (
  currentEntries: LeadEntry[], 
  newEntry: LeadEntry
): LeadEntry[] => {
  // Check for duplicates first
  const duplicate = checkForDuplicateEntry(currentEntries, newEntry);
  if (duplicate) {
    console.warn('Duplicate entry detected, not adding:', { duplicate, newEntry });
    return currentEntries; // Return unchanged
  }
  
  // Add the new entry
  return [...currentEntries, newEntry];
};

// Utility function to safely update entry in state
const safeUpdateEntryInState = (
  currentEntries: LeadEntry[], 
  entryId: string, 
  updatedEntry: Partial<LeadEntry>
): LeadEntry[] => {
  const entryIndex = currentEntries.findIndex(e => e.id === entryId);
  if (entryIndex === -1) {
    console.warn('Entry not found for update:', entryId);
    return currentEntries;
  }
  
  const updatedFullEntry = { ...currentEntries[entryIndex], ...updatedEntry };
  
  // Check if update would create a duplicate
  const duplicate = checkForDuplicateEntry(currentEntries, updatedFullEntry, entryId);
  if (duplicate) {
    console.warn('Update would create duplicate, cancelling:', { duplicate, updatedEntry });
    return currentEntries; // Return unchanged
  }
  
  const newEntries = [...currentEntries];
  newEntries[entryIndex] = updatedFullEntry;
  return newEntries;
};




const updateMonthlyDataSafely = (
  setMonthlyData: React.Dispatch<React.SetStateAction<{ [key: string]: any }>>,
  monthKey: string,
  currentMonthData: any,
  updateFn: (entries: LeadEntry[]) => LeadEntry[]
) => {
  setMonthlyData(prev => {
    const currentData = prev[monthKey] || currentMonthData;
    const updatedEntries = updateFn(currentData.entries || []);
    
    return {
      ...prev,
      [monthKey]: {
        ...currentData,
        entries: updatedEntries
      }
    };
  });
};

// Utility functions
const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

const formatMonth = (date: Date): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const getCurrentEST = (): Date => {
  const now = new Date();
  const est = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  return est;
};

// UPDATED: Calculate who's next based on hit counts (skips + qualifying leads) - excludes marked leads
const calculateNextInRotation = (
  baseOrder: string[], 
  entries: LeadEntry[], 
  leads: Lead[], 
  is1kPlus: boolean = false,
  replacementState: ReplacementState
): string => {
  if (!baseOrder.length) return '';
  
  // Count hits (skips + qualifying leads) for each rep
  const hits = new Map<string, number>();
  
  // Initialize all reps with 0 hits
  baseOrder.forEach(repId => hits.set(repId, 0));
  
  // UPDATED: Track ALL marked leads, not just closed ones
  const markedLeadIds = new Set<string>();
  for (const rec of Object.values(replacementState.byLeadId || {})) {
    if (rec && rec.leadId) {
      markedLeadIds.add(rec.leadId);
    }
  }
  
  // Count each skip and qualifying lead individually
  entries.forEach(entry => {
    // Only count entries for reps that are in this specific rotation
    if (!baseOrder.includes(entry.repId)) {
      return; // Skip this entry if rep is not in this rotation
    }

    if (entry.type === 'skip') {
      // Each skip counts as a hit
      hits.set(entry.repId, (hits.get(entry.repId) || 0) + 1);
    } else if (entry.type === 'lead' && entry.leadId) {
      // UPDATED: Skip counting ANY marked lead (open or closed)
      if (markedLeadIds.has(entry.leadId)) {
        return; // Don't count marked leads as hits
      }
      
      // Lead counts as hit if it qualifies for this lane
      const lead = leads.find(l => l.id === entry.leadId);
      if (lead) {
        const leadIs1kPlus = lead.unitCount >= 1000;
        // Only count leads that match this rotation type
        if (leadIs1kPlus === is1kPlus) {
          hits.set(entry.repId, (hits.get(entry.repId) || 0) + 1);
        }
      }
    }
  });

  // Find minimum hits among reps in this rotation
  const hitValues = Array.from(hits.values());
  const minHits = Math.min(...hitValues);
  
  // Find first rep in base order with minimum hits
  for (const repId of baseOrder) {
    if (hits.get(repId) === minHits) {
      return repId;
    }
  }
  
  return baseOrder[0];
};

const initialReps: SalesRep[] = [
  {
    id: '1',
    name: 'Laura',
    parameters: {
      propertyTypes: ['MFH', 'MF', 'SFH', 'Commercial'],
      maxUnits: null,
      canHandle1kPlus: true
    },
    rotationOrder: 1,
    sub1kOrder: 1,
    over1kOrder: 1,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '2',
    name: 'Matt',
    parameters: {
      propertyTypes: ['MFH', 'MF', 'SFH', 'Commercial'],
      maxUnits: null,
      canHandle1kPlus: false
    },
    rotationOrder: 2,
    sub1kOrder: 2,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '3',
    name: 'Dan',
    parameters: {
      propertyTypes: ['MFH', 'MF', 'SFH', 'Commercial'],
      maxUnits: null,
      canHandle1kPlus: true
    },
    rotationOrder: 3,
    sub1kOrder: 3,
    over1kOrder: 2,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '4',
    name: 'Joe',
    parameters: {
      propertyTypes: ['MF', 'SFH', 'MFH', 'Commercial'],
      maxUnits: null,
      canHandle1kPlus: false
    },
    rotationOrder: 4,
    sub1kOrder: 4,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '5',
    name: 'Ryan',
    parameters: {
      propertyTypes: ['MFH', 'MF', 'SFH'],
      maxUnits: null,
      canHandle1kPlus: false
    },
    rotationOrder: 5,
    sub1kOrder: 5,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '6',
    name: 'Evan',
    parameters: {
      propertyTypes: ['MFH', 'SFH'],
      maxUnits: null,
      canHandle1kPlus: false
    },
    rotationOrder: 6,
    sub1kOrder: 6,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '7',
    name: 'Chris',
    parameters: {
      propertyTypes: ['MFH', 'SFH'],
      maxUnits: 200,
      canHandle1kPlus: false
    },
    rotationOrder: 7,
    sub1kOrder: 7,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  },
  {
    id: '8',
    name: 'Andrej',
    parameters: {
      propertyTypes: ['MFH', 'SFH'],
      maxUnits: 200,
      canHandle1kPlus: false
    },
    rotationOrder: 8,
    sub1kOrder: 8,
    status: 'active',
     cushionSub1kOriginal: 0,      // Ã¢â€ Â ADD THIS
  cushion1kPlusOriginal: 0,
  }
];

export default function App() {
  // 1) All hooks at the top Ã¢â‚¬â€œ never behind conditionals or early returns
  const { salesReps, loading: repsLoading, error: repsError, updateSalesReps } = useSalesReps();
   const { user } = useAuth();
  const { 
  leads: dbLeads, 
  loading: leadsLoading, 
  addLead,
  addLeadWithReplacement,  // Ã¢â€ Â ADD THIS LINE
  updateLead, 
  removeLead, 
  checkDeletionStatus 
} = useLeads();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [monthlyData, setMonthlyData] = useState<{ [key: string]: MonthData }>({});
  const [rotationState, setRotationState] = useState<RotationState>({
    sub1kRotation: [],
    over1kRotation: [],
    nextSub1k: '1',
    next1kPlus: '1',
    actualRotationSub1k: [],
    actualRotationOver1k: [],
    skips: {},
    normalRotationSub1k: [],
    normalRotationOver1k: []
  });

   const { 
    entries: dbNonLeadEntries, 
    entries: nonLeadEntries,
    addNonLeadEntry, 
    removeNonLeadEntry,
    updateEntry,
    loading: nonLeadEntriesLoading 
  } = useNonLeadEntries(currentDate.getMonth() + 1, currentDate.getFullYear());

    
  const {
    replacementState,
    loading: replacementLoading,
    error: replacementError,
    markLeadForReplacement: dbMarkLeadForReplacement,
    applyReplacement: dbApplyReplacement,
    removeLeadMark: dbRemoveLeadMark,
    undoReplacement: dbUndoReplacement,
  } = useReplacementState();

  const [showAlgorithmGuide, setShowAlgorithmGuide] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showRepManager, setShowRepManager] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LeadEntry | null>(null);
  const [activeSaveOperations, setActiveSaveOperations] = useState<Set<string>>(new Set());
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [dbLoadingMessage, setDbLoadingMessage] = useState('');
  const [editingNonLeadEntry, setEditingNonLeadEntry] = useState<any | null>(null);
  const [showNonLeadEntryModal, setShowNonLeadEntryModal] = useState(false);
  const [reservations, setReservations] = useState<Map<string, LeadReservation>>(new Map());
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [reservedRepId, setReservedRepId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ 
  day: number; 
  repId: string;
  month: number;  // ADDED
  year: number;   // ADDED
} | null>(null);

  

  // 2) Derived values (fine to compute every render)
  const daysInMonth = getDaysInMonth(currentDate);
  const monthName = formatMonth(currentDate);
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  
   const currentMonthData: MonthData = useMemo(() => {
    const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    
    // Get current month's leads from database
    const currentMonthLeads = dbLeads.filter(lead => 
      lead.month === currentDate.getMonth() + 1 && 
      lead.year === currentDate.getFullYear()
    );
    
    // Convert DB leads to LeadEntry format for calendar display
    const entriesFromDbLeads = currentMonthLeads.map(lead => ({
      id: `lead_${lead.id}`,
      day: new Date(lead.date).getDate(),
      repId: lead.assignedTo,
      type: 'lead' as const,
      value: lead.accountNumber,
      url: lead.url || undefined,
      comments: lead.comments || [],
      leadId: lead.id,
      month: currentDate.getMonth(),
      year: currentDate.getFullYear(),
      unitCount: lead.unitCount || undefined,
      rotationTarget: (lead.unitCount || 0) >= 1000 ? 'over1k' as const : 'sub1k' as const,
      propertyTypes: lead.propertyTypes || [],
    }));
    
    // Convert DB non-lead entries to LeadEntry format for calendar display
     const entriesFromDbNonLeads = dbNonLeadEntries.map(entry => ({
      id: entry.id,
      day: entry.day,
      repId: entry.repId,
      type: entry.entryType === 'OOO' ? 'ooo' as const : 'skip' as const,
      value: entry.entryType,
      month: currentDate.getMonth(),
      year: currentDate.getFullYear(),
      rotationTarget: entry.rotationTarget as 'sub1k' | 'over1k' | 'both' | undefined,
      time: entry.time, // Include time for OOO entries
      comments: [],
      propertyTypes: [],
    }));
    
    return {
      month: currentDate.getMonth(),
      year: currentDate.getFullYear(),
      leads: currentMonthLeads,
      entries: [...entriesFromDbLeads, ...entriesFromDbNonLeads]
    };
  }, [currentDate, dbLeads, dbNonLeadEntries, replacementState]);

  

  // UPDATED: Enhanced rotation state calculation with forceRefresh dependency
  useEffect(() => {
    const sub1kReps = salesReps
      .filter(rep => rep.status === 'active')
      .sort((a, b) => a.sub1kOrder - b.sub1kOrder);
    const over1kReps = salesReps
      .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
      .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));

    const baseOrderSub1k = sub1kReps.map(rep => rep.id);
    const baseOrderOver1k = over1kReps.map(rep => rep.id);

    const nextSub1k = calculateNextInRotation(baseOrderSub1k, currentMonthData.entries, currentMonthData.leads, false, replacementState);
    const next1kPlus = calculateNextInRotation(baseOrderOver1k, currentMonthData.entries, currentMonthData.leads, true, replacementState);
    
    const skipCounts: { [repId: string]: number } = {};

    
    currentMonthData.entries.forEach(entry => {
      if (entry.type === 'skip') {
        skipCounts[entry.repId] = (skipCounts[entry.repId] || 0) + 1;
      }
    });

    setRotationState(prev => ({
      ...prev,
      normalRotationSub1k: baseOrderSub1k,
      normalRotationOver1k: baseOrderOver1k,
      actualRotationSub1k: [...baseOrderSub1k],
      actualRotationOver1k: [...baseOrderOver1k],
      nextSub1k,
      next1kPlus,
      skips: skipCounts
    }));
   }, [salesReps, currentMonthData, replacementState]); // UPDATED: Use currentMonthData instead of monthKey/monthlyData

     useEffect(() => {
    console.log('🔄 Setting up reservation subscription in App.tsx');
    const unsubscribe = subscribeToReservations((newReservations) => {
      console.log('📊 Received reservation update:', newReservations.size, 'active reservations');
      setReservations(newReservations);
    });

    return () => {
      console.log('🔄 Cleaning up reservation subscription');
      unsubscribe();
    };
  }, []);

  // Define all useCallback hooks BEFORE early returns
  const handleReserveRep = useCallback((repId: string, lane: 'sub1k' | '1kplus', reservationData?: any) => {
    setReservedRepId(repId);
    
    // Immediately update local reservations state (don't wait for subscription)
    if (reservationData) {
      setReservations(prev => {
        const newMap = new Map(prev);
        newMap.set(repId, reservationData);
        return newMap;
      });
    }
    
    setShowReservationModal(false);
    // Now open the lead modal for this rep
    // We'll set selectedCell to today's date for this rep
    const today = new Date();
    setSelectedCell({
      day: today.getDate(),
      repId: repId,
      month: today.getMonth(),
      year: today.getFullYear()
    });
    setShowLeadModal(true);
  }, []);

  const handleReleaseReservation = useCallback(async (repId: string) => {
    try {
      await releaseReservationByRepId(repId);
      setReservedRepId(null);
    } catch (error) {
      console.error('Error releasing reservation:', error);
    }
  }, []);

  const handleDeleteReservation = useCallback(async (repId: string) => {
  try {
    console.log('ðŸ—‘ï¸ App: Deleting reservation for rep:', repId);
    await deleteReservationByRepId(repId);
    setReservedRepId(null);
  } catch (error) {
    console.error('âŒ App: Error deleting reservation:', error);
  }
}, []);

  // 4) Render guards AFTER all hooks
  if (repsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales reps...</p>
        </div>
      </div>
    );
  }
  
  if (repsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="mb-4">Error loading sales reps: {repsError}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // App.tsx
const getEligibleReps = (leadData: any): SalesRep[] => {
  const isOver1k = (leadData?.unitCount ?? 0) >= 1000;

  return salesReps.filter(rep => {
    if (rep.status !== 'active') return false;
    if (isOver1k && !rep.parameters.canHandle1kPlus) return false;
    if (rep.parameters.maxUnits && leadData.unitCount > rep.parameters.maxUnits) return false;

    // Property types are OPTIONAL Ã¢â‚¬â€ only enforce if some are selected.
    if (Array.isArray(leadData.propertyTypes) && leadData.propertyTypes.length > 0) {
      // Rep must support ALL selected types (README spec)
      const supportsAll = leadData.propertyTypes.every((t: string) =>
        rep.parameters.propertyTypes.includes(t as any)
      );
      if (!supportsAll) return false;
    }

    return true;
  });
};


  const getReplacementAssignment = (originalLeadId: string) => {
    const rec = replacementState.byLeadId[originalLeadId];
    if (rec) {
      return { repId: rec.repId, lane: rec.lane };
    }
    
    // Fallback: search for lead in monthly data
    for (const monthData of Object.values(monthlyData)) {
      const lead = monthData.leads.find(l => l.id === originalLeadId);
      if (lead) {
        return { 
          repId: lead.assignedTo, 
          lane: (lead.unitCount >= 1000 ? 'over1k' : 'sub1k') as RotationLane
        };
      }
    }
    
    return null;
  };

  const getNextInRotation = (leadData: any): string | null => {
    const eligibleReps = getEligibleReps(leadData);
    const isOver1k = leadData.unitCount >= 1000;
    
    // Get the base order for this lane
    const baseOrder = isOver1k ? rotationState.normalRotationOver1k : rotationState.normalRotationSub1k;
    
    // Calculate next based on current data
    const nextRepId = calculateNextInRotation(baseOrder, currentMonthData.entries, currentMonthData.leads, isOver1k, replacementState);
    
    // Verify the calculated next rep is eligible for this specific lead
    if (eligibleReps.some(rep => rep.id === nextRepId)) {
      return nextRepId;
    }
    
    // Fallback: find first eligible rep in rotation order
    for (const repId of baseOrder) {
      if (eligibleReps.some(rep => rep.id === repId)) {
        return repId;
      }
    }
    
    return eligibleReps[0]?.id || null;
  };

  // Helper: normalize lane
  const getLaneFromUnits = (units?: number) =>
    (units ?? 0) >= 1000 ? ('1kplus' as const) : ('sub1k' as const);


  const updateRotationAfterAssignment = (assignedRepId: string, isOver1k: boolean, isSkip: boolean = false) => {
    // The rotation state will be automatically recalculated in the useEffect
    // when the monthlyData changes, so we don't need to manually update it here
    
    // Update skip count for legacy compatibility if needed
    if (isSkip) {
      setRotationState(prev => ({
        ...prev,
        skips: {
          ...prev.skips,
          [assignedRepId]: (prev.skips[assignedRepId] || 0) + 1
        }
      }));
    }
  };

   

  

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : addMonths(currentDate, -1));
  };

  

  const handleUpdateEntry = async (entryId: string, updatedData: any) => {
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const existingEntry = currentMonthData.entries.find(e => e.id === entryId);
  
  if (!existingEntry) {
    console.warn('Entry not found for update:', entryId);
    return;
  }

  // Handle non-lead entries locally (keep this as requested)
  if (updatedData.type !== 'lead') {
    updateMonthlyDataSafely(setMonthlyData, monthKey, currentMonthData, (entries) => {
      const updatedEntry = {
        type: updatedData.type,
        value: updatedData.type.toUpperCase(),
        repId: updatedData.assignedTo || existingEntry.repId,
        rotationTarget: updatedData.rotationTarget || existingEntry.rotationTarget
      };
      
      return safeUpdateEntryInState(entries, entryId, updatedEntry);
    });
    
    setShowLeadModal(false);
    setSelectedCell(null);
    setEditingEntry(null);
    return;
  }

  // Handle lead updates - database ONLY
  if (!existingEntry.leadId) {
    console.warn('Lead entry missing leadId:', entryId);
    return;
  }

  setIsDbLoading(true);
  setDbLoadingMessage('Updating lead...');
  
  try {
    await updateLead(existingEntry.leadId, {
      accountNumber: updatedData.accountNumber,
      url: updatedData.url,
      propertyTypes: updatedData.propertyTypes,
      unitCount: updatedData.unitCount,
      assignedTo: updatedData.assignedTo,
      comments: updatedData.comments || []
    });
    
    // Database subscription will handle UI updates
    setShowLeadModal(false);
    setSelectedCell(null);
    setEditingEntry(null);
    
  } catch (error) {
    console.error('Failed to update lead:', error);
    alert('Failed to update lead. Please try again.');
  } finally {
    setIsDbLoading(false);
    setDbLoadingMessage('');
  }
};


// In App.tsx, find the handleAddLead function and replace it with this fixed version:

const handleAddLead = async (leadData: any) => {
  // Generate unique operation ID for tracking
  const operationId = generateUniqueId('save_lead');
  setActiveSaveOperations(prev => new Set(prev).add(operationId));

  // FIXED: Extract month/year from the ACTUAL selected date, not the current viewing month
  const selectedDate = leadData.day !== undefined && leadData.month !== undefined && leadData.year !== undefined
    ? new Date(leadData.year, leadData.month, leadData.day)
    : new Date();
  
  const leadMonth = selectedDate.getMonth();
  const leadYear = selectedDate.getFullYear();
  
  // Use current viewing month for local state management
  const viewingMonth = currentDate.getMonth();
  const viewingYear = currentDate.getFullYear();
  const monthKey = `${viewingYear}-${viewingMonth}`;

  // Handle updates to existing entries
  if (leadData.isEditing && leadData.editingEntryId) {
    await handleUpdateEntry(leadData.editingEntryId, leadData);
    return;
  }

   // Handle non-lead entries (skip, ooo) - save to database
  if (leadData.type && leadData.type !== 'lead' && leadData.type !== 'next') {
  try {
    setIsDbLoading(true);
    setDbLoadingMessage(`Creating ${leadData.type === 'ooo' ? 'OOO' : 'Skip'} entry...`);

    await addNonLeadEntry({
      repId: leadData.assignedTo || selectedCell?.repId || salesReps[0].id,
      entryType: leadData.type === 'ooo' ? 'OOO' : 'SKP',
      day: selectedCell?.day || new Date().getDate(),
      month: leadMonth + 1,
      year: leadYear,
      time: leadData.oooTime, // Ã¢Å“â€¦ FIXED: Pass time for both OOO and Skip
      rotationTarget: leadData.rotationTarget || 'both',
    });

    setShowLeadModal(false);
    setSelectedCell(null);
  } catch (error) {
    console.error('Failed to create non-lead entry:', error);
    alert('Failed to create entry. Please try again.');
  } finally {
    setIsDbLoading(false);
    setDbLoadingMessage('');
  }
  return;
}

  // Handle NEXT entries in local state only (legacy behavior)
   if (leadData.type === 'next') {
    const newEntry: LeadEntry = {
      id: generateUniqueId('next'),
      day: selectedCell?.day || new Date().getDate(),
      repId: leadData.assignedTo || selectedCell?.repId || salesReps[0].id,
      type: 'next',
      value: 'NEXT',
      month: viewingMonth,
      year: viewingYear,
      rotationTarget: leadData.rotationTarget || 'both',
      comments: [],
      propertyTypes: [],
    };
    
    updateMonthlyDataSafely(setMonthlyData, monthKey, currentMonthData, (entries) => {
      return safeAddEntryToState(entries, newEntry);
    });

    setShowLeadModal(false);
    setSelectedCell(null);
    return;
  }

  // Handle LEAD entries - save to database
  const assignedRepId = leadData.assignedTo || selectedCell?.repId || salesReps[0]?.id;

  if (!assignedRepId) {
    alert('No sales rep selected');
    return;
  }

  try {
    // Determine if this is a replacement lead
    const isReplacementLead = leadData.replaceToggle && leadData.originalLeadIdToReplace;
    
    setIsDbLoading(true);
    setDbLoadingMessage(isReplacementLead ? 'Creating replacement lead...' : 'Saving lead...');

    let newLead: Lead;
    
    // FIXED: Use different functions based on lead type
    if (isReplacementLead) {
      // For LRL: use addLeadWithReplacement (creates lead + applies replacement with LRL 0)
      newLead = await addLeadWithReplacement({
        accountNumber: leadData.accountNumber,
        url: leadData.url,
        propertyTypes: leadData.propertyTypes,
        unitCount: leadData.unitCount,
        assignedTo: assignedRepId,
        date: selectedDate,
        comments: leadData.comments || [],
        month: leadMonth + 1,
        year: leadYear
      }, leadData.originalLeadIdToReplace);
      
      console.log('Replacement lead created successfully:', newLead.id);
    } else {
      // For normal leads: use addLead (creates lead with NL +1)
      newLead = await addLead({
        accountNumber: leadData.accountNumber,
        url: leadData.url,
        propertyTypes: leadData.propertyTypes,
        unitCount: leadData.unitCount,
        assignedTo: assignedRepId,
        date: selectedDate,
        comments: leadData.comments || [],
        month: leadMonth + 1,
        year: leadYear
      });
      
      console.log('Normal lead created successfully:', newLead.id);

    // Auto-delete reservation if this rep was reserved for this lane
    const lane = leadData.unitCount >= 1000 ? '1kplus' : 'sub1k';
    const reservation = reservations.get(assignedRepId);
    if (reservation && reservation.lane === lane) {
      console.log('🎯 Auto-deleting reservation for rep:', assignedRepId, 'lane:', lane);
      await deleteReservationOnLeadAssignment(assignedRepId, lane);
      setReservations(prev => {
        const newMap = new Map(prev);
        newMap.delete(assignedRepId);
        return newMap;
      });
    }
    }

    // Database subscription will handle UI updates
    setShowLeadModal(false);
    setSelectedCell(null);
    
  } catch (error) {
    console.error('Failed to save lead:', error);
    alert('Failed to save lead. Please try again.');
    
    // Don't close modal on error - let user try again
    throw error; // Re-throw so LeadModal knows there was an error
  } finally {
    // Always clean up operation tracking
    setActiveSaveOperations(prev => {
      const newSet = new Set(prev);
      newSet.delete(operationId);
      console.log('Completed save operation:', operationId);
      return newSet;
    });
    
    // Clear loading state
    setIsDbLoading(false);
    setDbLoadingMessage('');
  }
};

  

  const handleCellClick = (day: number, repId: string, month: number, year: number) => {
  setSelectedCell({ day, repId, month, year }); // Now includes month and year
  setShowLeadModal(true);
};

  const handleDeleteEntry = async (entryId: string) => {
    const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    const entry = currentMonthData.entries.find(e => e.id === entryId);
    
    // Add loading state for database operations
    if (entry?.type === 'lead') {
      setIsDbLoading(true);
      setDbLoadingMessage('Deleting lead...');
    }
    
    try {
    
    // Enhanced guard: Check if lead can be deleted and show warnings
if (entry?.type === 'lead' && entry.leadId) {
  try {
    // NEW: Check if this is an Open MFR (marked but not yet replaced)
    const recForOriginal = replacementState.byLeadId?.[entry.leadId];
    const isOpenMFR = !!recForOriginal && !recForOriginal.replacedByLeadId;
    const isRLBR = !!recForOriginal && !!recForOriginal.replacedByLeadId;
    
    // NEW: Block deletion of Open MFR
    if (isOpenMFR) {
      alert(
        'Cannot delete an Open MFR (orange box).\n\n' +
        'To delete this lead:\n' +
        '1. First unmark it for replacement\n' +
        '2. Then delete it as a normal lead'
      );
      return;
    }
    
    // NEW: Block deletion of RLBR (grey box - replaced lead)
    if (isRLBR) {
      alert(
        'Cannot delete a Replaced Lead (grey box).\n\n' +
        'To remove this lead:\n' +
        '1. First delete the green replacement lead (LRL)\n' +
        '2. Then unmark this lead for replacement\n' +
        '3. Finally delete it as a normal lead'
      );
      return;
    }
    
    const deletionStatus = await checkDeletionStatus(entry.leadId);
    
    // Show warning message if there are replacement implications
    if (deletionStatus.warningMessage) {
      const confirmed = window.confirm(
        `Warning: ${deletionStatus.warningMessage}\n\n` +
        'Do you want to proceed with the deletion? This action cannot be undone.'
      );
      if (!confirmed) {
        return;
      }
    }
    
    if (!deletionStatus.canDelete) {
      alert(deletionStatus.warningMessage || 'This lead cannot be deleted.');
      return;
    }
  } catch (error) {
    console.error('Error checking deletion status:', error);
    const confirmed = window.confirm(
      'Unable to verify deletion status. Do you want to proceed anyway? This action cannot be undone.'
    );
    if (!confirmed) {
      return;
    }
  }
}

    if (entry) {
       if (entry.leadId) {
  try {
    // Keep: Detection logic for LRL and MFR
    const recForOriginal = replacementState.byLeadId?.[entry.leadId];
    const isOpenMFR = !!recForOriginal && !recForOriginal.replacedByLeadId;

    const isReplacementLead = Object.values(replacementState.byLeadId || {}).some(
      (rec) => rec?.replacedByLeadId === entry.leadId
    );

    // Ã°Å¸â€Â¥ REMOVED: Only the duplicate hit count creation block
    // Previously this created NL -1 or LRL 0 here, but deleteLeadWithReplacementHandling 
    // already handles all hit counting internally
    
    // Keep: The actual deletion (which handles hit counts internally)
    await removeLead(entry.leadId);
    
    // Keep: Force immediate UI refresh for LRL deletions
    if (isReplacementLead) {
      console.log('LRL deleted - forcing replacement state refresh');
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait for DB propagation
    }

    console.log('Lead deleted successfully with replacement handling');
  } catch (error) {
    console.error('Failed to delete lead from database:', error);
    alert('Failed to delete lead. Please try again.');
  }
  return; // Early return for leads
}
      
      
      // Only update local state for non-lead entries (skip, ooo, next) 
      // Handle OOO and Skip deletion via database
      if (entry.type === 'ooo' || entry.type === 'skip') {
        try {
          setIsDbLoading(true);
          setDbLoadingMessage(`Deleting ${entry.type === 'ooo' ? 'OOO' : 'Skip'} entry...`);
          
          await removeNonLeadEntry(entry.id);
          
          setIsDbLoading(false);
          setDbLoadingMessage('');
        } catch (error) {
          console.error('Failed to delete non-lead entry:', error);
          alert('Failed to delete entry. Please try again.');
          setIsDbLoading(false);
          setDbLoadingMessage('');
        }
        return;
      }

      // Handle NEXT entries in local state only (legacy behavior)
      if (entry.type === 'next') {
        const updatedEntries = currentMonthData.entries.filter(e => e.id !== entryId);
        
        const updatedData = {
          ...currentMonthData,
          entries: updatedEntries,
          leads: currentMonthData.leads
        };
        
        setMonthlyData(prev => ({
          ...prev,
          [monthKey]: updatedData
        }));
      }
    }   // closes outer: if (entry)
    } finally {
      if (entry?.type === 'lead') {
        setIsDbLoading(false);
        setDbLoadingMessage('');
      }
    }
  };

const handleEditEntry = (entry: LeadEntry) => {
  // Check if this is a non-lead entry (OOO or Skip)
  if (entry.type === 'ooo' || entry.type === 'skip') {
    // Find the actual non-lead entry from the database
    const nonLeadEntry = nonLeadEntries.find(nle => nle.id === entry.id);
    if (nonLeadEntry) {
      setEditingNonLeadEntry(nonLeadEntry);
      setShowNonLeadEntryModal(true);
    }
    return;
  }
  
  // Original behavior for lead entries
  setEditingEntry(entry);
  setSelectedCell({ 
    day: entry.day, 
    repId: entry.repId,
    month: entry.month,
    year: entry.year
  });
  setShowLeadModal(true);
};

const handleDeleteNonLeadEntry = async (entryId: string) => {
  try {
    setIsDbLoading(true);
    setDbLoadingMessage('Deleting entry...');
    
    await removeNonLeadEntry(entryId);
    
    setShowNonLeadEntryModal(false);
    setEditingNonLeadEntry(null);
  } catch (error) {
    console.error('Failed to delete non-lead entry:', error);
    alert('Failed to delete entry. Please try again.');
  } finally {
    setIsDbLoading(false);
    setDbLoadingMessage('');
  }
};

const handleUpdateNonLeadEntry = async (updatedData: any) => {
  if (!editingNonLeadEntry) return;
  
  try {
    setIsDbLoading(true);
    setDbLoadingMessage(`Updating ${editingNonLeadEntry.entryType === 'OOO' ? 'OOO' : 'Skip'} entry...`);
    
    await updateEntry(editingNonLeadEntry.id, updatedData);
    
    setShowNonLeadEntryModal(false);
    setEditingNonLeadEntry(null);
  } catch (error) {
    console.error('Error updating non-lead entry:', error);
    alert('Failed to update entry. Please try again.');
  } finally {
    setIsDbLoading(false);
    setDbLoadingMessage('');
  }
};

  const handleEditLead = (lead: Lead) => {
  setEditingLead(lead);
  setShowEditLeadModal(true);
};

const handleUpdateLead = async (updatedData: any) => {
  if (!editingLead) return;
  
  try {
    await updateLead(editingLead.id, updatedData);
    setShowEditLeadModal(false);
    setEditingLead(null);
  } catch (error) {
    console.error('Error updating lead:', error);
    throw error;
  }
};
  // UnReplace & Add New: Delete LRL and create new NL
  const handleUnreplaceAndCreateNew = async (lrlLeadId: string, newLeadData: any) => {
    try {
      const lrlLead = currentMonthData.leads.find(l => l.id === lrlLeadId);
      if (!lrlLead) {
        throw new Error('LRL lead not found');
      }

      // Delete the LRL lead (this will also reopen the MFR mark)
      // deleteLeadWithReplacementHandling will:
      // 1. Call undoReplacement (reopens mark, no hit)
      // 2. Write LRL = -1 (compensating hit)
      await removeLead(lrlLeadId);

      // Create the new NL lead
      // createLead will write NL = +1
      const newLead = await addLead({
       accountNumber: newLeadData.accountNumber,
        url: newLeadData.url || '',
        propertyTypes: newLeadData.propertyTypes || [],
       unitCount: newLeadData.unitCount || 0,
        assignedTo: newLeadData.assignedTo,
        date: new Date(newLeadData.year, newLeadData.month - 1, newLeadData.day),
        comments: [],
        month: newLeadData.month,
        year: newLeadData.year,
      });

      // Net effect: -1 (delete LRL) + 1 (new NL) = 0, but MFR is reopened
    } catch (error) {
      console.error('Failed to unreplace and create new:', error);
      throw error;
    }
  };

const handleDeleteLead = async (leadId: string) => {
  try {
    await removeLead(leadId);
    setShowEditLeadModal(false);
    setEditingLead(null);
  } catch (error) {
    console.error('Error deleting lead:', error);
    throw error;
  }
};

  const handleMarkForReplacement = async (leadId: string) => {
    const lead = currentMonthData.leads.find(l => l.id === leadId);
    if (!lead) return;
    try {
      await dbMarkLeadForReplacement(lead);
      // Hit count is now created inside dbMarkLeadForReplacement (via replacementService)
    } catch (e) {
      console.error('Failed to mark for replacement or write hit:', e);
    }
  };

     // ADD THIS FUNCTION (if it's missing or in the wrong place):
  const handleOpenAlgorithm = () => {
    setShowAlgorithmGuide(true);
  };

 


  // UPDATED: Enhanced handleRemoveReplacementMark with immediate UI refresh
  // Put near your other handlers in App.tsx
const handleRemoveReplacementMark = async (leadId: string) => {
    await dbRemoveLeadMark(leadId);
};
  

  const getCurrentDay = (): number => {
    const est = getCurrentEST();
    return est.getMonth() === currentDate.getMonth() && 
           est.getFullYear() === currentDate.getFullYear() ? 
           est.getDate() : -1;
  };

  const handleRepUpdate = (updatedReps: SalesRep[]) => {
    updateSalesReps(updatedReps);
  };

  return (
    <AuthWrapper>
    <div className="min-h-screen bg-gray-50">
      {isDbLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-200 border-t-orange-500"></div>
            <p className="mt-4 text-orange-700 font-medium">{dbLoadingMessage}</p>
          </div>
        </div>
      )}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">SDR Lead Rotation</h1>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
                  title="Previous month"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-semibold text-gray-700 min-w-[200px] text-center">
                  {monthName}
                </h2>
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
                  title="Next month"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowReservationModal(true)}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-150"
              >
                <Plus className="w-4 h-4" />
                <span>Add Lead</span>
              </button>
              <button
                onClick={() => setShowRepManager(true)}
                className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-150"
              >
                <UserPlus className="w-4 h-4" />
                <span>Manage Reps</span>
              </button>
              <button
                onClick={() => setShowParameters(true)}
                className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors duration-150"
              >
                <Settings className="w-4 h-4" />
                <span>Parameters</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <CalendarGrid
                salesReps={salesReps}
                leadEntries={currentMonthData.entries}
                daysInMonth={daysInMonth}
                rotationState={rotationState}
                currentDay={getCurrentDay()}
                onCellClick={handleCellClick}
                onDeleteEntry={handleDeleteEntry}
                onEditEntry={handleEditEntry}
                leads={dbLeads}
                replacementState={replacementState}
                onMarkForReplacement={handleMarkForReplacement}
                onRemoveReplacementMark={handleRemoveReplacementMark}
                onEditLead={handleEditLead}  
                viewingMonth={currentDate.getMonth()}
                viewingYear={currentDate.getFullYear()}          
                reservations={reservations}
                reservedRepId={reservedRepId}
                onDeleteReservation={handleDeleteReservation}
                />
                <AuditTrail 
              salesReps={salesReps}
              currentMonth={currentDate.getMonth() + 1}
              currentYear={currentDate.getFullYear()}
            />
          </div>
          
          <div className="space-y-6">
            <RotationPanelMK2 
            viewingMonth={currentDate.getMonth()}
  viewingYear={currentDate.getFullYear()}
  onOpenAlgorithm={handleOpenAlgorithm}
            salesReps={salesReps} 
            />
          </div>
        </div>
      </div>
       {replacementError && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            Replacement Error: {replacementError}
          </div>
        )}
      {showLeadModal && (
        <LeadModal
          onClose={() => {
            setShowLeadModal(false);
            setSelectedCell(null);
            setEditingEntry(null);
            if (reservedRepId) {
              handleReleaseReservation(reservedRepId);
            }
          }}
          onSave={handleAddLead}
          salesReps={salesReps}
          selectedCell={selectedCell}
          editingEntry={editingEntry}
          rotationState={rotationState}
          getEligibleReps={getEligibleReps}
          getNextInRotation={getNextInRotation}
          leads={currentMonthData.leads}
          replacementState={replacementState}
          monthlyData={monthlyData}
          onDelete={handleDeleteEntry}
          reservedRepId={reservedRepId}
          onReleaseReservation={handleReleaseReservation}
        />
        
      )}
      {showReservationModal && user && (
        <LeadReservationModal
          onClose={() => setShowReservationModal(false)}
          onReserve={handleReserveRep}
          salesReps={salesReps}
          username={user.username || user.email || 'Unknown User'}
        />
      )}
      {showEditLeadModal && editingLead && (
  <EditLeadModal
    onClose={() => {
      setShowEditLeadModal(false);
      setEditingLead(null);
    }}
    onUpdate={handleUpdateLead}
    onDelete={handleDeleteLead}
    salesReps={salesReps}
    editingLead={editingLead}
    rotationState={rotationState}
    getEligibleReps={getEligibleReps}
    replacementState={replacementState}
    monthlyData={monthlyData}
    onMarkForReplacement={handleMarkForReplacement}
    onUnmarkForReplacement={handleRemoveReplacementMark}
    onUnreplaceAndCreateNew={handleUnreplaceAndCreateNew}
  />
)}

      {showRepManager && (
        <SalesRepManager
          salesReps={salesReps}
          onUpdateReps={handleRepUpdate}
          onClose={() => setShowRepManager(false)}
        />
      )}

      {showParameters && (
        <ParametersPanel
          salesReps={salesReps}
          onUpdateReps={handleRepUpdate}
          onClose={() => setShowParameters(false)}
        />
      )}

      {showAlgorithmGuide && (
      <RotationAlgorithmGuide 
        isOpen={showAlgorithmGuide}
        onClose={() => setShowAlgorithmGuide(false)}
        salesReps={salesReps}
        leads={currentMonthData.leads}
        leadEntries={currentMonthData.entries}
        replacementState={replacementState}
        baseOrderSub1k={salesReps
          .filter(rep => rep.status === 'active')
          .sort((a, b) => a.sub1kOrder - b.sub1kOrder)
          .map(rep => rep.id)
        }
        baseOrder1kPlus={salesReps
          .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
          .sort((a, b) => (a.over1kOrder || 999) - (b.over1kOrder || 999))
          .map(rep => rep.id)
        }
        lrlCountsAsZero={false}
      />
    )}

    {showNonLeadEntryModal && editingNonLeadEntry && (
      <NonLeadEntryModal
        entry={editingNonLeadEntry}
        salesReps={salesReps}
        onClose={() => {
          setShowNonLeadEntryModal(false);
          setEditingNonLeadEntry(null);
        }}
        onUpdate={handleUpdateNonLeadEntry}
        onDelete={handleDeleteNonLeadEntry}
      />
    )}

      
    </div>
    </AuthWrapper>
  );
  }