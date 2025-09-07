import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronUp, HelpCircle, Minimize2, Maximize2, Calendar, Clock, BarChart3 } from 'lucide-react';
import type { SalesRep, RotationState, Lead, LeadEntry } from '../types';

type TimeFilter = 'day' | 'week' | 'month' | 'ytd' | 'alltime';

interface RotationItem {
  repId: string;
  name: string;
  originalPosition: number; // 1-based position in base order
  hits: number; // number of skips + leads
  nextPosition: number; // next position in reordered sequence
  isNext: boolean; // true if this is the very next person up
}

interface EnhancedRotationPanelProps {
  salesReps: SalesRep[];
  rotationState: RotationState;
  onUpdateRotation: (state: RotationState) => void;
  leadEntries: LeadEntry[];
  leads: Lead[];
  getNextInRotationWithParameters: (leadData: any, rotationType: 'sub1k' | 'over1k') => { repId: string; reps: SalesRep[] } | null;
  currentDate: Date;
}

const EnhancedRotationPanel: React.FC<EnhancedRotationPanelProps> = ({ 
  salesReps, 
  rotationState, 
  onUpdateRotation, 
  leadEntries, 
  leads,
  getNextInRotationWithParameters,
  currentDate
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('day');
  const [expandedSub1k, setExpandedSub1k] = useState(false);
  const [expandedOver1k, setExpandedOver1k] = useState(false);
  const [visiblePositions, setVisiblePositions] = useState(20);

  // Get current date for filtering
  const getCurrentEST = (): Date => {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  };

  const currentDateTime = getCurrentEST();

  // Get time filter description for tooltips
  const getTimeFilterDescription = (filter: TimeFilter): string => {
    const now = currentDateTime;
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
        // FIXED: Now includes 7 days instead of 6
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 6); // 6 days before + today = 7 days total
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

  // FIXED: Filter entries based on time period (now includes proper 7-day week)
  const getFilteredEntries = (entries: LeadEntry[]): LeadEntry[] => {
    const now = currentDateTime;
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
          // FIXED: Current day and 6 days before (7 days total) - now properly includes the 1st of the week
          const entryDate = new Date(entry.year, entry.month, entry.day);
          const weekStartDate = new Date(now);
          weekStartDate.setDate(now.getDate() - 6); // 6 days before
          const weekEndDate = new Date(now);
          weekEndDate.setHours(23, 59, 59, 999); // Include the full day
          return entryDate >= weekStartDate && entryDate <= weekEndDate;
          
        case 'month':
          // Entire calendar month regardless of current day
          return entry.month === currentMonth && entry.year === currentYear;
          
        case 'ytd':
          // From January 1st of current year to current date
          const entryDateYtd = new Date(entry.year, entry.month, entry.day);
          const yearStartDate = new Date(currentYear, 0, 1);
          return entryDateYtd >= yearStartDate && entryDateYtd <= now;
          
        case 'alltime':
          return true;
          
        default:
          return false;
      }
    });
  };

  // Calculate rotation items with filtered data
  const calculateRotationItems = (rotationType: 'sub1k' | 'over1k'): RotationItem[] => {
    const baseOrder = rotationType === 'sub1k' ? rotationState.sub1kRotation : rotationState.over1kRotation;
    const nextRepId = rotationType === 'sub1k' ? rotationState.nextSub1k : rotationState.next1kPlus;
    
    const filteredEntries = getFilteredEntries(leadEntries);
    const filteredLeads = leads.filter(lead => {
      const leadDate = new Date(lead.year, lead.month, lead.date.getDate());
      // Apply same filtering logic as entries
      switch (timeFilter) {
        case 'day':
          return lead.date.getDate() === currentDateTime.getDate() && 
                 lead.month === currentDateTime.getMonth() && 
                 lead.year === currentDateTime.getFullYear();
        case 'week':
          const weekStart = new Date(currentDateTime);
          weekStart.setDate(currentDateTime.getDate() - 6);
          return leadDate >= weekStart && leadDate <= currentDateTime;
        case 'month':
          return lead.month === currentDateTime.getMonth() && lead.year === currentDateTime.getFullYear();
        case 'ytd':
          const yearStart = new Date(currentDateTime.getFullYear(), 0, 1);
          return leadDate >= yearStart && leadDate <= currentDateTime;
        case 'alltime':
          return true;
        default:
          return false;
      }
    });
    
    const hits: { [repId: string]: number } = {};
    
    // Initialize all reps with 0 hits
    baseOrder.forEach(repId => {
      hits[repId] = 0;
    });
    
    // Count skip entries that target this rotation
    filteredEntries.forEach(entry => {
      if (entry.type === 'skip' && baseOrder.includes(entry.repId)) {
        const shouldCount = 
          !entry.rotationTarget || 
          entry.rotationTarget === 'both' || 
          entry.rotationTarget === rotationType;
        
        if (shouldCount) {
          hits[entry.repId] = (hits[entry.repId] || 0) + 1;
        }
      }
    });
    
    // Count lead entries that target this rotation
    filteredLeads.forEach(lead => {
      if (baseOrder.includes(lead.assignedTo)) {
        const isOver1k = lead.unitCount >= 1000;
        const shouldCount = 
          (rotationType === 'over1k' && isOver1k) || 
          (rotationType === 'sub1k' && !isOver1k);
        
        if (shouldCount) {
          hits[lead.assignedTo] = (hits[lead.assignedTo] || 0) + 1;
        }
      }
    });
    
    return baseOrder.map((repId, index) => {
      const rep = salesReps.find(r => r.id === repId);
      return {
        repId,
        name: rep?.name || 'Unknown',
        originalPosition: index + 1,
        hits: hits[repId] || 0,
        nextPosition: index + 1, // This would be calculated based on hits in a full implementation
        isNext: repId === nextRepId
      };
    });
  };

  const sub1kItems = useMemo(() => calculateRotationItems('sub1k'), [
    rotationState, salesReps, leadEntries, leads, timeFilter, currentDateTime
  ]);
  
  const over1kItems = useMemo(() => calculateRotationItems('over1k'), [
    rotationState, salesReps, leadEntries, leads, timeFilter, currentDateTime
  ]);

  // Enhanced next in rotation display
  const getEnhancedNextDisplay = () => {
    // Sample lead data for parameter-based calculations
    const sampleLeadData = {
      propertyTypes: ['MFH', 'SFH'],
      unitCount: 50,
      comments: []
    };

    const sampleLeadData1k = {
      propertyTypes: ['MFH', 'SFH'],
      unitCount: 1500,
      comments: []
    };

    const sub1kNoParams = salesReps.find(rep => rep.id === rotationState.nextSub1k)?.name || 'None';
    const over1kNoParams = salesReps.find(rep => rep.id === rotationState.next1kPlus)?.name || 'None';
    
    const sub1kWithParams = getNextInRotationWithParameters(sampleLeadData, 'sub1k');
    const over1kWithParams = getNextInRotationWithParameters(sampleLeadData1k, 'over1k');

    return (
      <div className="bg-gray-50 border rounded-lg p-3 space-y-3">
        <h4 className="font-medium text-gray-700 text-sm">Enhanced Next in Rotation</h4>
        
        {/* Sub 1K Section */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-600">SUB 1K ROTATION</div>
          <div className="text-sm">
            <div className="text-gray-700">No Parameters: <span className="font-medium">{sub1kNoParams}</span></div>
            {sub1kWithParams && (
              <div className="text-gray-700">
                With Parameters: <span className="font-medium">{salesReps.find(rep => rep.id === sub1kWithParams.repId)?.name || 'Unknown'}</span>
                <div className="text-xs text-gray-500 mt-1">
                  Eligible: {sub1kWithParams.reps.map(rep => rep.name).join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 1K+ Section */}
        <div className="space-y-2 border-t border-gray-200 pt-2">
          <div className="text-xs font-medium text-gray-600">1K+ ROTATION</div>
          <div className="text-sm">
            <div className="text-gray-700">No Parameters: <span className="font-medium">{over1kNoParams}</span></div>
            {over1kWithParams && (
              <div className="text-gray-700">
                With Parameters: <span className="font-medium">{salesReps.find(rep => rep.id === over1kWithParams.repId)?.name || 'Unknown'}</span>
                <div className="text-xs text-gray-500 mt-1">
                  Eligible: {over1kWithParams.reps.map(rep => rep.name).join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render individual rotation item
  const renderRotationItem = (item: RotationItem) => (
    <div key={item.repId} className={`flex justify-between items-center p-2 ${item.isNext ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}>
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-500 w-6">
          #{item.originalPosition}
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
                <div>• {expanded ? 'Showing full rotation sequence' : 'Showing condensed view with next 5 positions'}</div>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={onToggleExpanded}
          className="flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded"
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
          items.slice(0, 5).map(renderRotationItem)
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
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Enhanced Next in Rotation Display */}
      {getEnhancedNextDisplay()}

      {/* Sub 1K Rotation */}
      {renderRotationLane(
        'Sub 1K Rotation',
        sub1kItems,
        sub1kItems.slice(0, visiblePositions),
        expandedSub1k,
        () => setExpandedSub1k(!expandedSub1k)
      )}

      {/* 1K+ Rotation */}
      {renderRotationLane(
        '1K+ Rotation',
        over1kItems,
        over1kItems.slice(0, visiblePositions),
        expandedOver1k,
        () => setExpandedOver1k(!expandedOver1k)
      )}
    </div>
  );
};

export default EnhancedRotationPanel;