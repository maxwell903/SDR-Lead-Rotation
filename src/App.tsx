import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Settings, UserPlus } from 'lucide-react';
import CalendarGrid from './components/CalendarGrid';
import RotationPanel from './components/RotationPanel';
import SalesRepManager from './components/SalesRepManager';
import LeadModal from './components/LeadModal';
import ParametersPanel from './components/ParametersPanel';
import { SalesRep, Lead, RotationState, LeadEntry, MonthData } from './types';

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

// Calculate who's next based on hit counts (skips + qualifying leads)
const calculateNextInRotation = (
  baseOrder: string[], 
  entries: LeadEntry[], 
  leads: Lead[], 
  is1kPlus: boolean = false
): string => {
  if (!baseOrder.length) return '';
  
  // Count hits (skips + qualifying leads) for each rep
  const hits = new Map<string, number>();
  
  // Initialize all reps with 0 hits
  baseOrder.forEach(repId => hits.set(repId, 0));
  
  // Count skips and qualifying leads using a deduplication approach
  // Multiple events on the same day for the same rep only count as 1 hit
  const hitsByRepByDay = new Map<string, Set<string>>();
  
  entries.forEach(entry => {
    const dayKey = `${entry.day}`;
    
    if (entry.type === 'skip') {
      // Skip always counts as a hit
      if (!hitsByRepByDay.has(entry.repId)) {
        hitsByRepByDay.set(entry.repId, new Set());
      }
      hitsByRepByDay.get(entry.repId)!.add(dayKey);
    } else if (entry.type === 'lead') {
      // Lead counts as hit if it qualifies for this lane
      const lead = leads.find(l => l.id === entry.leadId);
      if (lead) {
        const leadIs1kPlus = lead.unitCount >= 1000;
        if (leadIs1kPlus === is1kPlus) {
          if (!hitsByRepByDay.has(entry.repId)) {
            hitsByRepByDay.set(entry.repId, new Set());
          }
          hitsByRepByDay.get(entry.repId)!.add(dayKey);
        }
      }
    }
  });

  // Convert to final hit counts
  hitsByRepByDay.forEach((daySet, repId) => {
    hits.set(repId, daySet.size);
  });

  // Find minimum hits
  const minHits = Math.min(...Array.from(hits.values()));
  
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salesReps, setSalesReps] = useState<SalesRep[]>(initialReps);
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
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showRepManager, setShowRepManager] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: number; repId: string } | null>(null);
  const [editingEntry, setEditingEntry] = useState<LeadEntry | null>(null);

  const daysInMonth = getDaysInMonth(currentDate);
  const monthName = formatMonth(currentDate);
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const currentMonthData = monthlyData[monthKey] || { 
    month: currentDate.getMonth(), 
    year: currentDate.getFullYear(), 
    leads: [], 
    entries: [] 
  };

  // Initialize and update rotation state based on sales reps and current data
  useEffect(() => {
    const sub1kReps = salesReps
      .filter(rep => rep.status === 'active')
      .sort((a, b) => a.sub1kOrder - b.sub1kOrder);
    
    const over1kReps = salesReps
      .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
      .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));

    // Base order should ALWAYS be the original manage reps order
    const baseOrderSub1k = sub1kReps.map(rep => rep.id);
    const baseOrderOver1k = over1kReps.map(rep => rep.id);

    // Calculate who's next based on current hit counts
    const nextSub1k = calculateNextInRotation(baseOrderSub1k, currentMonthData.entries, currentMonthData.leads, false);
    const next1kPlus = calculateNextInRotation(baseOrderOver1k, currentMonthData.entries, currentMonthData.leads, true);

    // Calculate current skip counts for legacy compatibility
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
      nextSub1k: nextSub1k,
      next1kPlus: next1kPlus,
      skips: skipCounts
    }));
  }, [salesReps, currentMonthData]);

  const getEligibleReps = (leadData: any): SalesRep[] => {
    const isOver1k = leadData.unitCount >= 1000;
    
    return salesReps.filter(rep => {
      if (rep.status !== 'active') return false;
      if (isOver1k && !rep.parameters.canHandle1kPlus) return false;
      if (rep.parameters.maxUnits && leadData.unitCount > rep.parameters.maxUnits) return false;
      
      const hasMatchingPropertyType = leadData.propertyTypes.some((type: string) => 
        rep.parameters.propertyTypes.includes(type as any)
      );
      
      return hasMatchingPropertyType;
    });
  };

  const getNextInRotation = (leadData: any): string | null => {
    const eligibleReps = getEligibleReps(leadData);
    const isOver1k = leadData.unitCount >= 1000;
    
    // Get the base order for this lane
    const baseOrder = isOver1k ? rotationState.normalRotationOver1k : rotationState.normalRotationSub1k;
    
    // Calculate next based on current data
    const nextRepId = calculateNextInRotation(baseOrder, currentMonthData.entries, currentMonthData.leads, isOver1k);
    
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

  const handleAddLead = (leadData: any) => {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const monthKey = `${year}-${month}`;

    if (leadData.type && leadData.type !== 'lead') {
      // Handle non-lead entries (skip, ooo, next)
      const newEntry: LeadEntry = {
        id: Date.now().toString(),
        day: selectedCell?.day || new Date().getDate(),
        repId: leadData.assignedTo || selectedCell?.repId || salesReps[0].id,
        type: leadData.type,
        value: leadData.type.toUpperCase(),
        url: undefined,
        comments: [],
        month,
        year
      };
      
      const updatedData = {
        ...currentMonthData,
        entries: [...currentMonthData.entries, newEntry]
      };
      
      setMonthlyData(prev => ({
        ...prev,
        [monthKey]: updatedData
      }));

      if (leadData.type === 'skip') {
        updateRotationAfterAssignment(newEntry.repId, false, true);
      }
      
      setShowLeadModal(false);
      setSelectedCell(null);
      return;
    }

    // Handle lead assignment
    const assignedRepId = leadData.assignedTo || getNextInRotation(leadData);
    if (!assignedRepId) {
      alert('No eligible sales rep found for this lead');
      return;
    }

    const newLead: Lead = {
      id: Date.now().toString(),
      accountNumber: leadData.accountNumber,
      url: leadData.url,
      propertyTypes: leadData.propertyTypes,
      unitCount: leadData.unitCount,
      assignedTo: assignedRepId,
      date: new Date(),
      comments: leadData.comments || [],
      month,
      year
    };

    const newEntry: LeadEntry = {
      id: Date.now().toString(),
      day: selectedCell?.day || new Date().getDate(),
      repId: assignedRepId,
      type: 'lead',
      value: newLead.accountNumber,
      url: newLead.url,
      comments: newLead.comments,
      leadId: newLead.id,
      month,
      year
    };

    const updatedData = {
      ...currentMonthData,
      leads: [...currentMonthData.leads, newLead],
      entries: [...currentMonthData.entries, newEntry]
    };

    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: updatedData
    }));

    setShowLeadModal(false);
    setSelectedCell(null);
    
    // Update rotation state
    updateRotationAfterAssignment(assignedRepId, newLead.unitCount >= 1000);
  };

  const handleCellClick = (day: number, repId: string) => {
    setSelectedCell({ day, repId });
    setShowLeadModal(true);
  };

  const handleDeleteEntry = (entryId: string) => {
    const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    const entry = currentMonthData.entries.find(e => e.id === entryId);
    
    if (entry) {
      const updatedEntries = currentMonthData.entries.filter(e => e.id !== entryId);
      let updatedLeads = currentMonthData.leads;
      
      if (entry.leadId) {
        updatedLeads = currentMonthData.leads.filter(l => l.id !== entry.leadId);
      }
      
      const updatedData = {
        ...currentMonthData,
        entries: updatedEntries,
        leads: updatedLeads
      };
      
      setMonthlyData(prev => ({
        ...prev,
        [monthKey]: updatedData
      }));

      // Recalculate skip counts from scratch based on remaining entries
      const newSkipCounts: { [repId: string]: number } = {};
      
      // Count all skip entries for each rep from the updated entries
      updatedEntries.forEach(e => {
        if (e.type === 'skip') {
          newSkipCounts[e.repId] = (newSkipCounts[e.repId] || 0) + 1;
        }
      });

      // Update rotation state with recalculated skip counts
      setRotationState(prev => ({
        ...prev,
        skips: newSkipCounts
      }));
    }
  };

  const handleEditEntry = (entry: LeadEntry) => {
    setEditingEntry(entry);
    setSelectedCell({ day: entry.day, repId: entry.repId });
    setShowLeadModal(true);
  };

  const handleUpdateEntry = (entryId: string, updatedData: any) => {
    const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    
    setMonthlyData(prev => {
      const currentData = prev[monthKey] || currentMonthData;
      
      // Update the entry
      const updatedEntries = currentData.entries.map(entry => {
        if (entry.id === entryId) {
          return {
            ...entry,
            value: updatedData.accountNumber || entry.value,
            url: updatedData.url || entry.url,
            comments: updatedData.comments || entry.comments,
          };
        }
        return entry;
      });

      // Update the associated lead if it exists
      const updatedLeads = currentData.leads.map(lead => {
        const entry = currentData.entries.find(e => e.id === entryId);
        if (entry && lead.id === entry.leadId) {
          return {
            ...lead,
            accountNumber: updatedData.accountNumber || lead.accountNumber,
            url: updatedData.url || lead.url,
            propertyTypes: updatedData.propertyTypes || lead.propertyTypes,
            unitCount: updatedData.unitCount || lead.unitCount,
            comments: updatedData.comments || lead.comments,
          };
        }
        return lead;
      });

      return {
        ...prev,
        [monthKey]: {
          ...currentData,
          entries: updatedEntries,
          leads: updatedLeads
        }
      };
    });
  };

  const getCurrentDay = (): number => {
    const est = getCurrentEST();
    return est.getMonth() === currentDate.getMonth() && 
           est.getFullYear() === currentDate.getFullYear() ? 
           est.getDate() : -1;
  };

  const handleRepUpdate = (updatedReps: SalesRep[]) => {
    setSalesReps(updatedReps);
    
    // The useEffect will automatically recalculate rotation orders when reps are updated
  };

  return (
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
            />
          </div>
          
          <div className="space-y-6">
            <RotationPanel
              salesReps={salesReps}
              rotationState={rotationState}
              onUpdateRotation={setRotationState}
              leadEntries={currentMonthData.entries}
              leads={currentMonthData.leads}
            />
          </div>
        </div>
      </div>

      {showLeadModal && (
        <LeadModal
          onClose={() => {
            setShowLeadModal(false);
            setSelectedCell(null);
            setEditingEntry(null);
          }}
          onSave={editingEntry ? 
            (data) => {
              handleUpdateEntry(editingEntry.id, data);
              setShowLeadModal(false);
              setSelectedCell(null);
              setEditingEntry(null);
            } : 
            handleAddLead
          }
          salesReps={salesReps}
          selectedCell={selectedCell}
          editingEntry={editingEntry}
          rotationState={rotationState}
          getEligibleReps={getEligibleReps}
          getNextInRotation={getNextInRotation}
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
  );
}