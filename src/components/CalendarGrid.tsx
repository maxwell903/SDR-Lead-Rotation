import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Edit, ZoomIn, ZoomOut } from 'lucide-react';
import { SalesRep, LeadEntry, RotationState } from '../types';

interface CalendarGridProps {
  salesReps: SalesRep[];
  leadEntries: LeadEntry[];
  daysInMonth: number;
  rotationState: RotationState;
  currentDay: number;
  onCellClick: (day: number, repId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onEditEntry: (entry: LeadEntry) => void;
}

interface DateFormatToggles {
  showDayOfMonth: boolean;
  showDayOfWeek: boolean;
  showYear: boolean;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({ 
  salesReps, 
  leadEntries, 
  daysInMonth, 
  rotationState,
  currentDay,
  onCellClick,
  onDeleteEntry,
  onEditEntry 
}) => {
  // State for zoom and date formatting
  const [zoomLevel, setZoomLevel] = useState(100); // 100 = show all columns, 1 = show 1 column
  const [scrollPosition, setScrollPosition] = useState(0);
  const [dateToggles, setDateToggles] = useState<DateFormatToggles>({
    showDayOfMonth: true,
    showDayOfWeek: false,
    showYear: false
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Sort reps by their order for display
  const sub1kReps = salesReps
    .filter(rep => rep.status === 'active')
    .sort((a, b) => a.sub1kOrder - b.sub1kOrder);
  
  const over1kReps = salesReps
    .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
    .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));

  // Combine all reps in order (sub1k first, then over1k)
  const allReps = [...sub1kReps, ...over1kReps];
  const totalColumns = allReps.length;

  // Calculate how many columns to show based on zoom level
  const columnsToShow = Math.max(1, Math.ceil((zoomLevel / 100) * totalColumns));
  const visibleReps = allReps.slice(scrollPosition, scrollPosition + columnsToShow);

  // Handle scroll for horizontal navigation when zoomed
  const handleHorizontalScroll = (direction: 'left' | 'right') => {
    const step = Math.max(1, Math.floor(columnsToShow / 2));
    
    if (direction === 'left') {
      setScrollPosition(Math.max(0, scrollPosition - step));
    } else {
      setScrollPosition(Math.min(totalColumns - columnsToShow, scrollPosition + step));
    }
  };

  // Format date based on toggles
  const formatDateHeader = (day: number) => {
    const currentDate = new Date();
    const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    
    let formattedDate = '';
    
    if (dateToggles.showDayOfWeek) {
      const dayOfWeek = monthDate.toLocaleDateString('en-US', { weekday: 'short' });
      formattedDate += dayOfWeek + ' ';
    }
    
    if (dateToggles.showDayOfMonth) {
      const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
      const dayWithSuffix = getDayWithSuffix(day);
      formattedDate += `${monthName}, ${dayWithSuffix}`;
    } else {
      formattedDate += day.toString();
    }
    
    if (dateToggles.showYear) {
      const year = monthDate.getFullYear();
      formattedDate += `, ${year}`;
    }
    
    return formattedDate.trim();
  };

  // Helper function to add ordinal suffix to day
  const getDayWithSuffix = (day: number): string => {
    if (day >= 11 && day <= 13) return `${day}th`;
    
    switch (day % 10) {
      case 1: return `${day}st`;
      case 2: return `${day}nd`;
      case 3: return `${day}rd`;
      default: return `${day}th`;
    }
  };

  const getEntriesForCell = (day: number, repId: string) => {
    return leadEntries.filter(entry => entry.day === day && entry.repId === repId);
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

  const renderEntryContent = (entry: LeadEntry) => {
    switch (entry.type) {
      case 'lead':
        return (
          <div className="text-blue-700 font-medium">
            {entry.url ? (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {entry.value}
              </a>
            ) : (
              entry.value
            )}
            {entry.comments.length > 0 && (
              <div className="text-xs text-gray-600 mt-1 truncate">
                {entry.comments[0]}
              </div>
            )}
          </div>
        );
      case 'skip':
        return <div className="text-yellow-700 font-medium">SKIP</div>;
      case 'ooo':
        return <div className="text-red-700 font-medium">OOO</div>;
      case 'next':
        return <div className="text-green-700 font-medium">NEXT</div>;
      default:
        return <div className="text-gray-700">{entry.value}</div>;
    }
  };

  const renderEntryActions = (entry: LeadEntry) => (
    <div className="flex space-x-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => handleEntryAction(e, 'edit', entry)}
        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
        title="Edit entry"
      >
        <Edit size={12} />
      </button>
      <button
        onClick={(e) => handleEntryAction(e, 'delete', entry)}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
        title="Delete entry"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  // Calculate column width based on zoom level
  const getColumnWidth = () => {
    const baseWidth = 140;
    const zoomFactor = Math.max(0.7, Math.min(2, zoomLevel / 50));
    return Math.floor(baseWidth * zoomFactor);
  };

  // Determine if rep is in sub1k or over1k category for header styling
  const getRepCategory = (repId: string) => {
    const sub1kIndex = sub1kReps.findIndex(rep => rep.id === repId);
    if (sub1kIndex !== -1) return 'sub1k';
    return 'over1k';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Controls Header */}
      <div className="bg-gray-50 p-4 border-b">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Zoom Controls */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <ZoomOut size={16} className="text-gray-500" />
              <label className="text-sm font-medium text-gray-700">Zoom:</label>
              <input
                type="range"
                min="1"
                max="100"
                value={zoomLevel}
                onChange={(e) => {
                  setZoomLevel(Number(e.target.value));
                  setScrollPosition(0); // Reset scroll when zoom changes
                }}
                className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <ZoomIn size={16} className="text-gray-500" />
              <span className="text-sm text-gray-600 min-w-[60px]">
                {columnsToShow} of {totalColumns}
              </span>
            </div>

            {/* Horizontal Scroll Controls - Show only when not at max zoom */}
            {columnsToShow < totalColumns && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleHorizontalScroll('left')}
                  disabled={scrollPosition === 0}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-sm text-gray-600">
                  {scrollPosition + 1}-{Math.min(scrollPosition + columnsToShow, totalColumns)} of {totalColumns}
                </span>
                <button
                  onClick={() => handleHorizontalScroll('right')}
                  disabled={scrollPosition + columnsToShow >= totalColumns}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          {/* Date Format Toggles */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Date Format:</span>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={dateToggles.showDayOfWeek}
                onChange={(e) => setDateToggles(prev => ({ ...prev, showDayOfWeek: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Day of Week</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={dateToggles.showDayOfMonth}
                onChange={(e) => setDateToggles(prev => ({ ...prev, showDayOfMonth: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Day of Month</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={dateToggles.showYear}
                onChange={(e) => setDateToggles(prev => ({ ...prev, showYear: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Year</span>
            </label>
          </div>
        </div>
      </div>

      {/* Calendar Table */}
      <div 
        ref={scrollContainerRef}
        className="overflow-auto max-h-[70vh]"
        style={{ maxWidth: '100%' }}
      >
        <table 
          ref={tableRef}
          className="w-full border-collapse"
          style={{ minWidth: 'fit-content' }}
        >
          <thead className="sticky top-0 bg-white z-20">
            <tr className="border-b-2 border-gray-200">
              <th className="p-3 border-r-2 border-gray-200 text-center font-bold text-gray-800 bg-gray-100 sticky left-0 z-30 min-w-[120px]">
                Day
              </th>
              {visibleReps.map(rep => {
                const category = getRepCategory(rep.id);
                const headerBgColor = category === 'sub1k' ? 'bg-blue-25' : 'bg-green-25';
                
                return (
                  <th 
                    key={rep.id} 
                    className={`p-3 border-b text-center font-medium text-gray-700 ${headerBgColor}`}
                    style={{ minWidth: `${getColumnWidth()}px`, width: `${getColumnWidth()}px` }}
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-semibold text-sm">{rep.name}</span>
                      <span className="text-xs text-gray-500 mt-1">
                        {rep.parameters.propertyTypes.join(', ')}
                        {rep.parameters.maxUnits && ` (max ${rep.parameters.maxUnits})`}
                        {category === 'over1k' && ' (1K+)'}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
              <tr key={day} className={`border-b hover:bg-gray-25 transition-colors ${currentDay === day ? 'bg-yellow-25' : ''}`}>
                <td className={`p-3 font-medium text-gray-600 bg-gray-50 sticky left-0 z-10 ${
                  currentDay === day ? 'bg-yellow-100 font-bold border-l-4 border-yellow-400' : ''
                }`}>
                  <div className="flex items-center justify-center text-center">
                    <span className={`${currentDay === day ? 'text-yellow-800' : ''} text-sm leading-tight`}>
                      {formatDateHeader(day)}
                    </span>
                  </div>
                </td>
                
                {/* Visible Rep Cells */}
                {visibleReps.map(rep => {
                  const entries = getEntriesForCell(day, rep.id);
                  return (
                    <td 
                      key={`${day}-${rep.id}`} 
                      className={`p-2 border-r cursor-pointer transition-all duration-200 group ${getCellStyle(entries, day)}`}
                      onClick={() => onCellClick(day, rep.id)}
                      style={{ width: `${getColumnWidth()}px`, maxWidth: `${getColumnWidth()}px` }}
                    >
                      <div className="min-h-[60px] flex flex-col justify-start space-y-1 overflow-hidden">
                        {entries.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                            Click to add
                          </div>
                        ) : (
                          entries.map(entry => (
                            <div key={entry.id} className="relative bg-white bg-opacity-50 rounded p-1 text-xs">
                              {renderEntryContent(entry)}
                              {renderEntryActions(entry)}
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

      {/* Footer with summary info */}
      <div className="bg-gray-50 p-2 border-t text-xs text-gray-600">
        <div className="flex justify-between items-center">
          <span>
            Total Reps: {totalColumns} | 
            Sub-1K: {sub1kReps.length} | 
            1K+: {over1kReps.length}
          </span>
          <div className="flex items-center space-x-4">
            {columnsToShow < totalColumns && (
              <span>
                Viewing: {scrollPosition + 1}-{Math.min(scrollPosition + columnsToShow, totalColumns)} of {totalColumns} reps
              </span>
            )}
            <span>
              Zoom: {Math.round((columnsToShow / totalColumns) * 100)}% 
              ({columnsToShow === 1 ? '1 column' : 
                columnsToShow === totalColumns ? 'all columns' : 
                `${columnsToShow} columns`})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarGrid;