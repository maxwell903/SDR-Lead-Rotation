import React, { useState, useMemo, } from 'react';
import { Trash2, Edit, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';
import { SalesRep, LeadEntry, RotationState, Lead, } from '../types';
import {
  ReplacementState,
  getCalendarEntryVisual,
  getReplacementPartnerLeadId,
  MarkForReplacementButton,
  ReplacementPill,
} from '../features/leadReplacement.tsx';

interface CalendarGridProps {
  salesReps: SalesRep[];
  leadEntries: LeadEntry[];
  daysInMonth: number;
  rotationState: RotationState;
  currentDay: number;
  onCellClick: (day: number, repId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onEditEntry: (entry: LeadEntry) => void;
  onEditLead: (lead: Lead) => void;
  leads: Lead[];
  //lead-replacement props
  replacementState: ReplacementState;
  onMarkForReplacement: (leadId: string) => void;
  onRemoveReplacementMark: (leadId: string) => void;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({
  salesReps, 
  leadEntries, 
  daysInMonth, 
  rotationState,
  currentDay,
  onCellClick,
  onDeleteEntry,
  onEditEntry,
  onEditLead,
  leads,
  // NEW
  replacementState,
  onMarkForReplacement,
  onRemoveReplacementMark,
}) => {
  // State management
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rowHeight, setRowHeight] = useState(60);
  const [columnWidth, setColumnWidth] = useState(140);
  const [showDayOfMonth, setShowDayOfMonth] = useState(true);
  const [showDayOfWeek, setShowDayOfWeek] = useState(false);
  
  // New restriction toggle states
  const [showRestrictions, setShowRestrictions] = useState(true);
  const [showCanDo, setShowCanDo] = useState(true);
  const [showCantDo, setShowCantDo] = useState(false);
  
  // All property types available in the system
  const allPropertyTypes: ('MFH' | 'MF' | 'SFH' | 'Commercial')[] = ['MFH', 'MF', 'SFH', 'Commercial'];
  
  // Zoom controls
  const zoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 150));
  const zoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 50));
  const resetZoom = () => setZoomLevel(100);

  // Sort reps by their order for display
  const sub1kReps = salesReps
    .filter(rep => rep.status === 'active')
    .sort((a, b) => a.sub1kOrder - b.sub1kOrder);
  
  const over1kReps = salesReps
    .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
    .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));

  // Get current date to calculate day of week
  const getCurrentDate = () => new Date();
  const currentDate = getCurrentDate();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Format day header based on toggle settings
  const formatDayHeader = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let formatted = '';
    
    if (showDayOfWeek) {
      formatted += dayNames[date.getDay()];
    }
    
    if (showDayOfMonth) {
      if (showDayOfWeek) formatted += ' ';
      formatted += `${monthNames[currentMonth]} ${day}${getOrdinalSuffix(day)}`;
    }
    
    return formatted || day.toString();
  };

  // Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
  const getOrdinalSuffix = (day: number) => {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Function to find lead data for an entry
  const getLeadForEntry = (entry: LeadEntry): Lead | null => {
    if (entry.type === 'lead' && entry.leadId) {
      return leads.find(lead => lead.id === entry.leadId) || null;
    }
    return null;
  };

  // NEW: helper to fetch account number by lead id (for indicators)
  const getAccountByLeadId = (leadId?: string): string | null => {
    if (!leadId) return null;
    const l = leads.find(x => x.id === leadId);
    return l ? l.accountNumber : null;
  };


  // Function to get URL for an entry
  const getEntryUrl = (entry: LeadEntry): string | null => {
    // First try the entry's URL
    if (entry.url) {
      return entry.url;
    }
    
    // Then try to find the associated lead's URL
    const associatedLead = getLeadForEntry(entry);
    if (associatedLead && associatedLead.url) {
      return associatedLead.url;
    }
    
    return null;
  };

  // Function to handle hyperlink clicks
  const handleHyperlinkClick = (e: React.MouseEvent, entry: LeadEntry) => {
    e.stopPropagation(); // Prevent triggering cell click
    
    const url = getEntryUrl(entry);
    if (url) {
      // Ensure URL has protocol
      const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
        ? url 
        : `https://${url}`;
      
      try {
        window.open(fullUrl, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Error opening URL:', error);
        alert('Could not open URL. Please check the link format.');
      }
    } else {
      alert('No URL available for this entry.');
    }
  };

  // Function to render rep restriction info
  const renderRepRestrictions = (rep: SalesRep) => {
    if (!showRestrictions || (!showCanDo && !showCantDo)) {
      return null;
    }

    const canDoTypes = rep.parameters.propertyTypes.map(type => type as string);
    const cantDoTypes = allPropertyTypes.filter(type => !canDoTypes.includes(type));

    return (
      <span className="text-xs mt-1 block">
        {showCanDo && (
          <div className="text-gray-500">
            {canDoTypes.join(', ')}
            {rep.parameters.maxUnits && ` (max ${rep.parameters.maxUnits})`}
          </div>
        )}
        {showCantDo && cantDoTypes.length > 0 && (
          <div className="text-red-500">
            {cantDoTypes.join(', ')}
            {rep.parameters.maxUnits && ` (nothing over ${rep.parameters.maxUnits})`}
            {!rep.parameters.maxUnits && ` (no unit limit)`}
          </div>
        )}
      </span>
    );
  };

  // Calculate dynamic styling - zoom affects everything proportionally
  const containerStyles = useMemo(() => {
    const zoomFactor = zoomLevel / 100;
    const scaledColumnWidth = columnWidth * zoomFactor;
    const scaledRowHeight = rowHeight * zoomFactor;
    const scaledHeaderWidth = 150 * zoomFactor;
    const scaledHeaderHeight = 50 * zoomFactor;
    const fontSize = Math.max(0.75, 0.875 * zoomFactor);
    const headerFontSize = Math.max(0.75, 0.875 * zoomFactor);
    const padding = Math.max(4, 8 * zoomFactor);
    const headerPadding = Math.max(8, 12 * zoomFactor);
    
    return {
      // Data cells - controlled by sliders and zoom
      '--data-cell-width': `${scaledColumnWidth}px`,
      '--data-cell-height': `${scaledRowHeight}px`,
      '--data-cell-font-size': `${fontSize}rem`,
      '--data-cell-padding': `${padding}px`,
      // Headers - scale with zoom to maintain alignment
      '--header-height': `${scaledHeaderHeight}px`,
      '--header-width': `${scaledHeaderWidth}px`,
      '--header-font-size': `${headerFontSize}rem`,
      '--header-padding': `${headerPadding}px`,
    } as React.CSSProperties;
  }, [zoomLevel, rowHeight, columnWidth]);

  // UPDATED: Modified to consider rotation context
  const getEntriesForCell = (day: number, repId: string, rotationContext: 'sub1k' | '1kplus') => {
    return leadEntries.filter(entry => {
      if (entry.day !== day || entry.repId !== repId) {
        return false;
      }
      
      // For non-lead entries (skip, ooo, next), use rotationTarget if available
      if (entry.type !== 'lead') {
        if (entry.rotationTarget) {
          if (entry.rotationTarget === 'both') return true;
          if (entry.rotationTarget === 'sub1k' && rotationContext === 'sub1k') return true;
          if (entry.rotationTarget === 'over1k' && rotationContext === '1kplus') return true;
          return false;
        }
        // Fallback for entries without rotationTarget - show in both (backwards compatibility)
        return true;
      }
      
      // For lead entries, determine rotation based on unit count
      // Note: entry.unitCount might be undefined for older entries, so we need to check the lead data
      if (entry.unitCount !== undefined) {
        const isOver1k = entry.unitCount >= 1000;
        return rotationContext === '1kplus' ? isOver1k : !isOver1k;
      }
      
      // Fallback for entries without unit count - show in both (backwards compatibility)
      return true;
    });
  };

  const getCellStyle = (entries: LeadEntry[], day: number) => {
    let baseStyle = 'bg-white hover:bg-gray-50';
    
    // Highlight current day
    if (currentDay === day) {
      baseStyle = 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-yellow-400';
    }
    
    if (entries.length === 0) return baseStyle;
    
    const hasLead = entries.some(e => e.type === 'lead');
    const hasSkip = entries.some(e => e.type === 'skip');
    const hasOOO = entries.some(e => e.type === 'ooo');
    const hasNext = entries.some(e => e.type === 'next');
    
    if (hasOOO) return 'bg-red-100 border-red-200 hover:bg-red-150';
    if (hasSkip) return 'bg-yellow-100 border-yellow-200 hover:bg-yellow-150';
    if (hasNext) return 'bg-green-100 border-green-200 hover:bg-green-150';
    if (hasLead) return 'bg-blue-100 border-blue-200 hover:bg-blue-150';
    
    return baseStyle;
  };

  const handleEntryAction = (e: React.MouseEvent, action: 'edit' | 'delete', entry: LeadEntry) => {
    e.stopPropagation();
    if (action === 'edit') {
      onEditEntry(entry);
    } else {
      if (window.confirm('Are you sure you want to delete this entry?')) {
        onDeleteEntry(entry.id);
      }
    }
  };

  const getEntryTypeStyle = (entryType: string) => {
    switch (entryType) {
      case 'skip':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'ooo':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'next':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'lead':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  // NEW: replace default style when an entry participates in replacement flow
  const getEntryVisualClasses = (entry: LeadEntry) => {
    const vis = getCalendarEntryVisual(entry, replacementState);
    if (vis.isOriginalMarkedOpen) {
      // Original lead marked for replacement (open) — orange box
      return 'text-orange-700 bg-orange-50 border-orange-200';
    }
    if (vis.isReplacementLead) {
      // Replacement lead — add a soft success ring while keeping base styling
      return `${getEntryTypeStyle(entry.type)} ring-1 ring-emerald-300`;
    }
    return getEntryTypeStyle(entry.type);
  };


  // Function to render entry content with hyperlink support
  const renderEntryContent = (entry: LeadEntry) => {
    if (entry.type === 'lead') {
      const entryUrl = getEntryUrl(entry);
      
      return (
        <div className="text-xs">
          <div className="font-medium truncate flex items-center">
            {entryUrl ? (
              <button
                onClick={(e) => handleHyperlinkClick(e, entry)}
                 className="text-blue-600 hover:text-blue-800 underline transition-colors flex items-center space-x-1 truncate"
                title={`Click to open: ${entryUrl}`}
              >
                <span className="truncate">{entry.value}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </button>
            ) : (
              <span className="truncate">{entry.value}</span>
            )}
          </div>
          {entry.unitCount && (
            <div className="text-gray-500">
              {entry.unitCount} unit{entry.unitCount !== 1 ? 's' : ''}
            </div>
          )}

         {/* NEW: subtle indicators for replacement relationships */}
          {(() => {
            const vis = getCalendarEntryVisual(entry, replacementState);
            const partner = getReplacementPartnerLeadId(entry, replacementState);
            const partnerAcct = getAccountByLeadId(partner.partnerLeadId || undefined);
            if (vis.isOriginalMarkedOpen) {
              return (
                <div className="mt-0.5">
                  <ReplacementPill relation="needs" text="Needs Replacement" />
                </div>
              );
            }
            if (vis.isReplacementLead) {
              return (
                <div className="mt-0.5 flex items-center space-x-2">
                  <ReplacementPill relation="replaces" text="Replacement" />
                  {partnerAcct && (
                    <span className="text-[10px] text-emerald-700">for {partnerAcct}</span>
                  )}
                </div>
              );
            }
            if (vis.isOriginalMarkedClosed && partnerAcct) {
              // show tiny note on the original that it was replaced
              return (
                <div className="mt-0.5">
                  <span className="text-[10px] text-emerald-700">Replaced by {partnerAcct}</span>
                </div>
              );
            }
            return null;
          })()} 

        </div>
      );
    } else {
      return (
        <span className="font-medium text-sm">
          {entry.value}
        </span>
      );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border" style={containerStyles}>
      {/* Header with controls */}
      <div className="p-4 border-b">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Lead Rotation Calendar</h3>
          
          {/* Zoom Controls */}
          <div className="flex items-center space-x-3">
            <button
              onClick={zoomOut}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              disabled={zoomLevel <= 50}
            >
              <ZoomOut className="w-4 h-4" />
              <span>Zoom Out</span>
            </button>
            
            <span className="text-sm font-medium bg-gray-50 px-3 py-1 rounded-md">
              {zoomLevel}%
            </span>
            
            <button
              onClick={zoomIn}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              disabled={zoomLevel >= 150}
            >
              <ZoomIn className="w-4 h-4" />
              <span>Zoom In</span>
            </button>
            
            <button
              onClick={resetZoom}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Size and Format Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Row Height Slider */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Cell Height: {rowHeight}px
            </label>
            <input
              type="range"
              min="40"
              max="120"
              value={rowHeight}
              onChange={(e) => setRowHeight(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((rowHeight - 40) / (120 - 40)) * 100}%, #e5e7eb ${((rowHeight - 40) / (120 - 40)) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Column Width Slider */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Cell Width: {columnWidth}px
            </label>
            <input
              type="range"
              min="100"
              max="250"
              value={columnWidth}
              onChange={(e) => setColumnWidth(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((columnWidth - 100) / (250 - 100)) * 100}%, #e5e7eb ${((columnWidth - 100) / (250 - 100)) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Date Format Toggles */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Date Format</label>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showDayOfMonth}
                  onChange={(e) => setShowDayOfMonth(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Show Day of Month</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showDayOfWeek}
                  onChange={(e) => setShowDayOfWeek(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Show Day of Week</span>
              </label>
            </div>
          </div>

          {/* Restriction Display Toggles */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Rep Restrictions</label>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showRestrictions}
                  onChange={(e) => setShowRestrictions(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Show Restrictions</span>
              </label>
              {showRestrictions && (
                <>
                  <label className="flex items-center space-x-2 ml-4">
                    <input
                      type="checkbox"
                      checked={showCanDo}
                      onChange={(e) => setShowCanDo(e.target.checked)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-600">Restrictions</span>
                  </label>
                  <label className="flex items-center space-x-2 ml-4">
                    <input
                      type="checkbox"
                      checked={showCantDo}
                      onChange={(e) => setShowCantDo(e.target.checked)}
                      className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-600">Permissions</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Legend</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
                <span>Lead</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
                <span>Skip</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                <span>OOO</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                <span>Next</span>
              </div>
              <div className="flex items-center space-x-1">
                <ExternalLink className="w-3 h-3 text-blue-600" />
                <span>Clickable Link</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Calendar Grid with Sticky Headers */}
      <div 
        className="overflow-auto calendar-container"
        style={{ 
          height: 'calc(100vh - 400px)', 
          minHeight: '500px',
        }}
      >
        <table className="w-full border-collapse" style={{ borderSpacing: 0 }}>
          {/* Sticky Header - Category Row */}
          <thead>
            <tr className="sticky top-0 z-30">
              <th 
                className="text-left border-b-2 border-gray-300 font-medium text-gray-600 bg-gray-100 sticky left-0 z-40 border-r-2"
                style={{ 
                  width: 'var(--header-width)',
                  height: 'var(--header-height)',
                  fontSize: 'var(--header-font-size)',
                  padding: 'var(--header-padding)',
                  minWidth: 'var(--header-width)',
                }}
              >
                <div className="flex items-center justify-center h-full w-full">
                  Day
                </div>
              </th>
              {sub1kReps.length > 0 && (
                <th 
                  colSpan={sub1kReps.length} 
                  className="text-center border-b-2 border-gray-300 font-medium text-blue-600 bg-blue-100"
                  style={{ 
                    height: 'var(--header-height)',
                    fontSize: 'var(--header-font-size)',
                    padding: 'var(--header-padding)',
                  }}
                >
                  <div className="flex items-center justify-center h-full">
                    Sub 1K Unit Rotation ({sub1kReps.length} reps)
                  </div>
                </th>
              )}
              {over1kReps.length > 0 && (
                <th 
                  colSpan={over1kReps.length} 
                  className="text-center border-b-2 border-gray-300 font-medium text-green-600 bg-green-100"
                  style={{ 
                    height: 'var(--header-height)',
                    fontSize: 'var(--header-font-size)',
                    padding: 'var(--header-padding)',
                  }}
                >
                  <div className="flex items-center justify-center h-full">
                    1K+ Unit Rotation ({over1kReps.length} reps)
                  </div>
                </th>
              )}
            </tr>
            
            {/* Sticky Header - Rep Names Row */}
            <tr className="sticky z-30" style={{ top: 'var(--header-height)' }}>
              <th 
                className="border-b-2 border-gray-300 bg-gray-100 sticky left-0 z-40 border-r-2"
                style={{ 
                  width: 'var(--header-width)',
                  height: 'var(--header-height)',
                  fontSize: 'var(--header-font-size)',
                  padding: 'var(--header-padding)',
                  minWidth: 'var(--header-width)',
                }}
              >
                <div className="flex items-center justify-center h-full w-full">
                  {/* Empty header cell */}
                </div>
              </th>
              {sub1kReps.map(rep => (
                <th 
                  key={`sub1k-${rep.id}`} 
                  className="border-b-2 border-r border-gray-300 text-center font-medium text-gray-700 bg-blue-50"
                  style={{ 
                    width: 'var(--data-cell-width)',
                    height: 'var(--header-height)',
                    fontSize: 'var(--header-font-size)',
                    padding: 'var(--header-padding)',
                    minWidth: 'var(--data-cell-width)',
                  }}
                >
                  <div className="flex flex-col items-center justify-center h-full">
                    <span className="font-semibold text-xs">{rep.name}</span>
                    {renderRepRestrictions(rep)}
                  </div>
                </th>
              ))}
              {over1kReps.map(rep => (
                <th 
                  key={`over1k-${rep.id}`} 
                  className="border-b-2 border-r border-gray-300 text-center font-medium text-gray-700 bg-green-50"
                  style={{ 
                    width: 'var(--data-cell-width)',
                    height: 'var(--header-height)',
                    fontSize: 'var(--header-font-size)',
                    padding: 'var(--header-padding)',
                    minWidth: 'var(--data-cell-width)',
                  }}
                >
                  <div className="flex flex-col items-center justify-center h-full">
                    <span className="font-semibold text-xs">{rep.name}</span>
                    {renderRepRestrictions(rep)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          {/* Calendar Body - These cells use the slider-controlled dimensions */}
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
              <tr key={day} className={`border-b hover:bg-gray-25 transition-colors ${currentDay === day ? 'bg-yellow-25' : ''}`}>
                {/* Sticky Day Column - Fixed size */}
                <td 
                  className={`font-medium text-gray-600 bg-gray-100 sticky left-0 z-20 border-r-2 border-gray-300 ${
                    currentDay === day ? 'bg-yellow-200 font-bold border-l-4 border-yellow-500' : ''
                  }`}
                  style={{ 
                    width: 'var(--header-width)',
                    height: 'var(--data-cell-height)',
                    fontSize: 'var(--header-font-size)',
                    padding: 'var(--header-padding)',
                    minWidth: 'var(--header-width)',
                  }}
                >
                  <div className="flex items-center justify-center h-full w-full">
                    <span className={`text-sm ${currentDay === day ? 'text-yellow-800' : ''}`}>
                      {formatDayHeader(day)}
                    </span>
                  </div>
                </td>

                {/* Sub 1K Rotation Cells - UPDATED: Pass rotation context */}
                {sub1kReps.map(rep => {
                  const entries = getEntriesForCell(day, rep.id, 'sub1k');
                  return (
                    <td 
                      key={`${day}-${rep.id}`} 
                      className={`border-r border-gray-200 cursor-pointer transition-all duration-200 ${getCellStyle(entries, day)}`}
                      onClick={() => onCellClick(day, rep.id)}
                      style={{ 
                        width: 'var(--data-cell-width)',
                        height: 'var(--data-cell-height)',
                        fontSize: 'var(--data-cell-font-size)',
                        padding: 'var(--data-cell-padding)',
                        minWidth: 'var(--data-cell-width)',
                      }}
                    >
                      <div className="flex flex-col justify-start space-y-1 h-full">
                        {entries.length === 0 ? (
                          <div className="text-gray-400 text-center flex items-center justify-center h-full">
                            <span className="text-xs">Click to add</span>
                          </div>
                        ) : (
                          entries.map(entry => (
                            <div
                              key={entry.id}
                              className={`entry-item group flex items-center justify-between px-2 py-1 rounded border text-xs cursor-default transition-all duration-200 ${getEntryVisualClasses(entry)}`}
                            >

                              <div className="flex-1 min-w-0">
                                {renderEntryContent(entry)}
                              </div>
                              {/* NEW: hover actions include "Replace" for leads not already in replacement flow */}
                              <div className="hidden group-hover:flex items-center space-x-1 ml-2">
                                {entry.type === 'lead' && entry.leadId && (() => {
                                  const vis = getCalendarEntryVisual(entry, replacementState);
                                  if (!vis.isReplacementLead && !vis.isOriginalMarkedOpen) {
                                    return (
                                      <MarkForReplacementButton
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onMarkForReplacement(entry.leadId!);
                                        }}
                                      />
                                    );
                                  }
                                  return null;
                                })()}
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (entry.type === 'lead') {
                                      const lead = getLeadForEntry(entry);
                                          if (lead) {
                                            if (onEditLead) {
                                              onEditLead(lead);
                                            } else {
                                            // fallback to original entry editor if parent didn't pass onEditLead yet
                                              handleEntryAction(e, 'edit', entry);
                                            }
                                          }
                                    } else {
                                      handleEntryAction(e, 'edit', entry);
                                    }
                                  }}
                                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded"
                                  title={entry.type === 'lead' ? 'Edit lead' : 'Edit entry'}
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => handleEntryAction(e, 'delete', entry)}
                                  className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded"
                                  title="Delete entry"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}

                {/* 1K+ Rotation Cells - UPDATED: Pass rotation context */}
                {over1kReps.map(rep => {
                  const entries = getEntriesForCell(day, rep.id, '1kplus');
                  return (
                    <td 
                      key={`${day}-${rep.id}`} 
                      className={`border-r border-gray-200 cursor-pointer transition-all duration-200 ${getCellStyle(entries, day)}`}
                      onClick={() => onCellClick(day, rep.id)}
                      style={{ 
                        width: 'var(--data-cell-width)',
                        height: 'var(--data-cell-height)',
                        fontSize: 'var(--data-cell-font-size)',
                        padding: 'var(--data-cell-padding)',
                        minWidth: 'var(--data-cell-width)',
                      }}
                    >
                      <div className="flex flex-col justify-start space-y-1 h-full">
                        {entries.length === 0 ? (
                          <div className="text-gray-400 text-center flex items-center justify-center h-full">
                            <span className="text-xs">Click to add</span>
                          </div>
                        ) : (
                          entries.map(entry => (
                            <div
                              key={entry.id}
                              className={`entry-item group flex items-center justify-between px-2 py-1 rounded border text-xs cursor-default transition-all duration-200 ${getEntryVisualClasses(entry)}`}
                            >
                              <div className="flex-1 min-w-0">
                                {renderEntryContent(entry)}
                              </div>

                              
                             {/* NEW: hover actions include "Replace" for leads not already in replacement flow */}
                              {/* Hover actions include "Replace" and "Unmark" */}
<div className="hidden group-hover:flex items-center space-x-1 ml-2">
  {entry.type === 'lead' && entry.leadId && (() => {
    const vis = getCalendarEntryVisual(entry, replacementState);
    if (vis.isOriginalMarkedOpen) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveReplacementMark(entry.leadId!);
          }}
          className="p-1 text-gray-600 hover:text-gray-800 text-xs"
          title="Remove replacement mark"
        >
          Unmark
        </button>
      );
    } else if (!vis.isReplacementLead && !vis.isOriginalMarkedOpen) {
      return (
        <MarkForReplacementButton
          onClick={(e) => {
            e.stopPropagation();
            onMarkForReplacement(entry.leadId!);
          }}
        />
      );
    }
    return null;
  })()}
  {/* ... existing edit and delete buttons */}
                               <button
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    if (entry.type === 'lead') {
                                      const lead = getLeadForEntry(entry);
                                      if (lead) onEditLead(lead);
                                    } else {
                                      handleEntryAction(e, 'edit', entry);
                                    }
                                  }}
                                 className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded"
                                  title={entry.type === 'lead' ? 'Edit lead' : 'Edit entry'}
                               >
                                  <Edit className="w-3 h-3" />
                               </button>
                               <button
                                  onClick={(e) => handleEntryAction(e, 'delete', entry)}
                                  className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded"
                                  title="Delete entry"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer with helpful information */}
      <div className="p-4 border-t bg-gray-50">
        <div className="text-sm text-gray-600">
          <div className="flex flex-wrap items-center justify-between">
            <div>
              <strong>Total Entries:</strong> {leadEntries.length} | 
              <strong> Leads:</strong> {leadEntries.filter(e => e.type === 'lead').length} | 
              <strong> Skips:</strong> {leadEntries.filter(e => e.type === 'skip').length} | 
              <strong> OOO:</strong> {leadEntries.filter(e => e.type === 'ooo').length} |
              <strong> Zoom:</strong> {zoomLevel}% |
              <strong> Cell Height:</strong> {rowHeight}px |
              <strong> Cell Width:</strong> {columnWidth}px
            </div>
            <div className="text-xs text-gray-500">
              Click any cell to add an entry • Hover over entries to edit or delete • Click account numbers to open URLs • Use controls to adjust view
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarGrid;