import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Settings, UserPlus } from 'lucide-react';
import CalendarGrid from './components/CalendarGrid';
import RotationPanel from './components/RotationPanel';
import SalesRepManager from './components/SalesRepManager';
import LeadModal from './components/LeadModal';
import ParametersPanel from './components/ParametersPanel';
import { SalesRep, Lead, RotationState, LeadEntry, MonthData } from './types';
import { useReplacementState } from './hooks/useReplacementState';
import {
  ReplacementState,
  createEmptyReplacementState,
  markLeadForReplacement,
  applyReplacement,
  undoReplacementByDeletingReplacementLead,
  removeLeadMark,
  RotationLane,
} from './features/leadReplacement';

import ConnectionTest from './components/ConnectionTest';
import { useSalesReps } from './hooks/useSupabaseData';
import AuthWrapper from './components/AuthWrapper';
import { useLeads } from './hooks/useLeads';
import EditLeadModal from './components/EditLeadModal';


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
    status: 'active'
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
    status: 'active'
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
    status: 'active'
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
    status: 'active'
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
    status: 'active'
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
    status: 'active'
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
    status: 'active'
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
    status: 'active'
  }
];

export default function App() {
  // 1) All hooks at the top – never behind conditionals or early returns
  const { salesReps, loading: repsLoading, error: repsError, updateSalesReps } = useSalesReps();
  const { leads: dbLeads, loading: leadsLoading, addLead, updateLead, removeLead, checkDeletionStatus } = useLeads();
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
    replacementState,
    loading: replacementLoading,
    error: replacementError,
    markLeadForReplacement: dbMarkLeadForReplacement,
    applyReplacement: dbApplyReplacement,
    removeLeadMark: dbRemoveLeadMark,
    undoReplacement: dbUndoReplacement,
  } = useReplacementState();

  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showRepManager, setShowRepManager] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: number; repId: string } | null>(null);
  const [editingEntry, setEditingEntry] = useState<LeadEntry | null>(null);
  const [activeSaveOperations, setActiveSaveOperations] = useState<Set<string>>(new Set());
  

  // 2) Derived values (fine to compute every render)
  const daysInMonth = getDaysInMonth(currentDate);
  const monthName = formatMonth(currentDate);
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  
  // UPDATED: Enhanced currentMonthData with forceRefresh dependency
  const currentMonthData = useMemo(() => {
    const existing = monthlyData[monthKey];
    
    // Get leads from DB for current month
    const currentMonthLeads = dbLeads.filter(lead => 
      lead.month === currentDate.getMonth() + 1 && 
      lead.year === currentDate.getFullYear()
    );
    
    // Always reconstruct entries from DB leads
    const entriesFromDbLeads: LeadEntry[] = currentMonthLeads.map(lead => ({
  id: `entry_${lead.id}`,
  day: new Date(lead.date).getDate(),
  repId: lead.assignedTo,
  type: 'lead' as const,
  value: lead.accountNumber,
  url: lead.url,
  comments: lead.comments,
  leadId: lead.id,
  month: currentDate.getMonth(),
  year: currentDate.getFullYear(),
  unitCount: lead.unitCount,
  rotationTarget: lead.unitCount >= 1000 ? 'over1k' : 'sub1k',
  propertyTypes: lead.propertyTypes || [],
}));
    
    // Get non-lead entries from local state (skip, ooo, next)
    const nonLeadEntries = existing?.entries.filter(entry => entry.type !== 'lead') || [];
    
    return {
      month: currentDate.getMonth(),
      year: currentDate.getFullYear(),
      leads: currentMonthLeads,
      entries: [...entriesFromDbLeads, ...nonLeadEntries] // Combine DB leads + local non-lead entries
    };
  }, [monthlyData, monthKey, currentDate, dbLeads,]); // Added forceRefresh dependency

  

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
  }, [salesReps, monthKey, monthlyData, replacementState, ]); // Added forceRefresh dependency

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

    // Property types are OPTIONAL — only enforce if some are selected.
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
  
  updateMonthlyDataSafely(setMonthlyData, monthKey, currentMonthData, (entries) => {
    const existingEntry = entries.find(e => e.id === entryId);
    
    if (!existingEntry) {
      console.warn('Entry not found for update:', entryId);
      return entries;
    }

    // Handle non-lead entries locally
    if (updatedData.type !== 'lead') {
      const updatedEntry = {
        type: updatedData.type,
        value: updatedData.type.toUpperCase(),
        repId: updatedData.assignedTo || existingEntry.repId,
        rotationTarget: updatedData.rotationTarget || existingEntry.rotationTarget
      };
      
      return safeUpdateEntryInState(entries, entryId, updatedEntry);
    }

    // Handle lead updates - save to database
    if (existingEntry.leadId) {
      // Update the lead in the database
      updateLead(existingEntry.leadId, {
        accountNumber: updatedData.accountNumber,
        url: updatedData.url,
        propertyTypes: updatedData.propertyTypes,
        unitCount: updatedData.unitCount,
        assignedTo: updatedData.assignedTo,
        comments: updatedData.comments || []
      }).catch(error => {
        console.error('Failed to update lead:', error);
        alert('Failed to update lead. Please try again.');
      });

      // Update local entry safely
      const updatedEntry = {
        repId: updatedData.assignedTo,
        value: updatedData.accountNumber,
        url: updatedData.url,
        comments: updatedData.comments || [],
        unitCount: updatedData.unitCount,
        rotationTarget: (updatedData.unitCount >= 1000 ? 'over1k' : 'sub1k') as 'sub1k' | 'over1k'
      };
      
      return safeUpdateEntryInState(entries, entryId, updatedEntry);
    }

    return entries;
  });

  setShowLeadModal(false);
  setSelectedCell(null);
  setEditingEntry(null);
};


  const handleAddLead = async (leadData: any) => {
  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();
  const monthKey = `${year}-${month}`;

  // Handle updates to existing entries
  if (leadData.isEditing && leadData.editingEntryId) {
    await handleUpdateEntry(leadData.editingEntryId, leadData);
    return;
  }

  // Handle non-lead entries (skip, ooo, next) - keep in local state only
  if (leadData.type && leadData.type !== 'lead') {
    const newEntry: LeadEntry = {
      id: generateUniqueId('nonlead'),
      day: selectedCell?.day || new Date().getDate(),
      repId: leadData.assignedTo || selectedCell?.repId || salesReps[0].id,
      type: leadData.type,
      value: leadData.type.toUpperCase(),
      url: undefined,
      comments: [],
      month,
      year,
      unitCount: undefined,
      rotationTarget: leadData.rotationTarget || 'both',
      propertyTypes: leadData.propertyTypes || [],
    };
    
    // Use safe state update to prevent duplicates
    updateMonthlyDataSafely(setMonthlyData, monthKey, currentMonthData, (entries) => {
      const duplicate = checkForDuplicateEntry(entries, newEntry);
      if (duplicate) {
        alert(`A ${leadData.type.toUpperCase()} entry already exists for ${salesReps.find(r => r.id === newEntry.repId)?.name || 'this rep'} on day ${newEntry.day}`);
        throw new Error('Duplicate entry prevented');
      }
      return safeAddEntryToState(entries, newEntry);
    });

    if (leadData.type === 'skip') {
      updateRotationAfterAssignment(newEntry.repId, false, true);
    }
    
    setShowLeadModal(false);
    setSelectedCell(null);
    return;
  }

  // Handle lead assignment with enhanced duplicate prevention
  let assignedRepId = leadData.assignedTo;

  if (!assignedRepId) {
    assignedRepId = getNextInRotation(leadData);
  }

  if (!assignedRepId) {
    alert('No eligible sales rep found for this lead');
    return;
  }

  // Create unique operation ID to prevent race conditions
  const operationId = `${leadData.accountNumber}-${assignedRepId}-${Date.now()}`;
  
  // Check if this operation is already in progress
  if (activeSaveOperations.has(operationId)) {
    console.log('Save operation already in progress for this lead:', operationId);
    return;
  }

  // ENHANCED: Check for duplicates in both DB leads and local entries
  const accountNumber = leadData.accountNumber.trim();
  
  // Check current month DB leads
  const existingDbLead = currentMonthData.leads?.find(
    lead => lead.accountNumber.trim().toLowerCase() === accountNumber.toLowerCase()
  );
  
  if (existingDbLead) {
    alert(`A lead with account number "${accountNumber}" already exists this month in database`);
    return;
  }
  
  // Check current month local entries  
  const existingLocalEntry = currentMonthData.entries?.find(
    entry => entry.type === 'lead' && 
             entry.value?.trim().toLowerCase() === accountNumber.toLowerCase()
  );
  
  if (existingLocalEntry) {
    alert(`A lead with account number "${accountNumber}" already exists this month in local state`);
    return;
  }

  try {
    // Mark operation as active
    setActiveSaveOperations(prev => new Set(prev).add(operationId));
    console.log('Starting save operation:', operationId);

    // Save lead to database
    const newLead = await addLead({
      accountNumber: leadData.accountNumber,
      url: leadData.url,
      propertyTypes: leadData.propertyTypes,
      unitCount: leadData.unitCount,
      assignedTo: assignedRepId,
      date: new Date(),
      comments: leadData.comments || [],
      month: month + 1, // DB stores 1-12
      year
    });

    console.log('Lead saved successfully:', newLead.id);

    // Create local entry for the calendar with guaranteed unique ID
   

    // Handle replacement logic
    if (leadData.replaceToggle && leadData.originalLeadIdToReplace) {
      try {
        await dbApplyReplacement(leadData.originalLeadIdToReplace, newLead);
        console.log('Replacement applied successfully');
        // Page should automatically refresh via real time subscription
      } catch (error) {
        console.error('Error applying replacement:', error);
        alert('Failed to apply replacement');
        return;
      }
    }

    // ENHANCED: Safely update local state with duplicate prevention
    

    setShowLeadModal(false);
    setSelectedCell(null);
    
    // Update rotation state
    updateRotationAfterAssignment(assignedRepId, newLead.unitCount >= 1000);
    
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
  }
};

  const handleCellClick = (day: number, repId: string) => {
    setSelectedCell({ day, repId });
    setShowLeadModal(true);
  };

  const handleDeleteEntry = async (entryId: string) => {
    const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    const entry = currentMonthData.entries.find(e => e.id === entryId);
    
    // Enhanced guard: Check if lead can be deleted and show warnings
    if (entry?.type === 'lead' && entry.leadId) {
      try {
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
      // Remove from local entries
      const updatedEntries = currentMonthData.entries.filter(e => e.id !== entryId);
      
            // If it's a lead, delete from database (using enhanced deletion)
      if (entry.leadId) {
        try {
          await removeLead(entry.leadId);
          // Force refresh replacement state after successful deletion
          // This ensures the rotation panel updates correctly
          // The replacement state will be updated via real-time subscription
          console.log('Lead deleted successfully with replacement handling');
        } catch (error) {
          console.error('Failed to delete lead from database:', error);
          alert('Failed to delete lead. Please try again.');
          // Rollback the optimistic UI update on error
          await refresh();
          return;
        }
      }
      
      const updatedData = {
        ...currentMonthData,
        entries: updatedEntries,
        // leads come from DB via hook, so don't manage them locally
        leads: currentMonthData.leads
      };
      
      setMonthlyData(prev => ({
        ...prev,
        [monthKey]: updatedData
      }));

      // Recalculate skip counts (for non-lead entries)
      if (entry.type === 'skip') {
        const newSkipCounts: { [repId: string]: number } = {};
        updatedEntries.forEach(e => {
          if (e.type === 'skip') {
            newSkipCounts[e.repId] = (newSkipCounts[e.repId] || 0) + 1;
          }
        });

        setRotationState(prev => ({
          ...prev,
          skips: newSkipCounts
        }));
      } 
    }   // closes outer: if (entry)
  };

  const handleEditEntry = (entry: LeadEntry) => {
    setEditingEntry(entry);
    setSelectedCell({ day: entry.day, repId: entry.repId });
    setShowLeadModal(true);
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

  // UPDATED: Enhanced handleMarkForReplacement with immediate UI refresh
  const handleMarkForReplacement = async (leadId: string) => {
    // Search across months for the lead data
    let targetLead: Lead | undefined;
    
    // Check current month first
    targetLead = currentMonthData.leads.find(l => l.id === leadId);
    
    // If not found, search other months
    if (!targetLead) {
      for (const monthKey of Object.keys(monthlyData)) {
        const monthData = monthlyData[monthKey];
        const found = monthData.leads.find(l => l.id === leadId);
        if (found) {
          targetLead = found;
          break;
        }
      }
    }
    
    if (!targetLead) {
      console.error('Lead not found for marking:', leadId);
      alert('Lead not found');
      return;
    }
    
    try {
      await dbMarkLeadForReplacement(targetLead);
      // Page will auto-refresh via real-time subscription
    } catch (error) {
      console.error('Error marking lead for replacement:', error);
      alert('Failed to mark lead for replacement');
    }
  };

  // UPDATED: Enhanced handleRemoveReplacementMark with immediate UI refresh
  const handleRemoveReplacementMark = async (leadId: string) => {
    try {
      await dbRemoveLeadMark(leadId);
      // Page will auto-refresh via real-time subscription
    } catch (error) {
      console.error('Error removing replacement mark:', error);
      alert('Failed to remove replacement mark');
    }
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
                onClick={() => setShowLeadModal(true)}
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
              leads={currentMonthData.leads}
              replacementState={replacementState}
              onMarkForReplacement={handleMarkForReplacement}
              onRemoveReplacementMark={handleRemoveReplacementMark}
              onEditLead={handleEditLead}
            />
          </div>
          
          <div className="space-y-6">
            <RotationPanel
              salesReps={salesReps}
              rotationState={rotationState}
              onUpdateRotation={setRotationState}
              leadEntries={currentMonthData.entries}
              leads={currentMonthData.leads}
              replacementState={replacementState}
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
      
    </div>
    </AuthWrapper>
  );
  }

function refresh() {
  throw new Error('Function not implemented.');
}
