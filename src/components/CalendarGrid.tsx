import React from 'react';
import { Trash2, Edit } from 'lucide-react';
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
  // Sort reps by their order for display
  const sub1kReps = salesReps
    .filter(rep => rep.status === 'active')
    .sort((a, b) => a.sub1kOrder - b.sub1kOrder);
  
  const over1kReps = salesReps
    .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
    .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));

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

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Lead Rotation Calendar</h3>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
              <span>Lead</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
              <span>Skip</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
              <span>OOO</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
              <span>Next</span>
            </div>
            {currentDay !== -1 && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-yellow-50 border-l-2 border-yellow-400"></div>
                <span>Today</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full calendar-grid">
          <thead>
            <tr>
              <th className="p-3 text-left border-b font-medium text-gray-600 bg-gray-50 sticky left-0 z-10">
                Day
              </th>
              {sub1kReps.length > 0 && (
                <th colSpan={sub1kReps.length} className="p-3 text-center border-b font-medium text-blue-600 bg-blue-50">
                  Sub 1K Unit Rotation
                </th>
              )}
              {over1kReps.length > 0 && (
                <th colSpan={over1kReps.length} className="p-3 text-center border-b font-medium text-green-600 bg-green-50">
                  1K+ Unit Rotation
                </th>
              )}
            </tr>
            <tr>
              <th className="p-3 border-b bg-gray-50 sticky left-0 z-10"></th>
              {sub1kReps.map(rep => (
                <th key={`sub1k-${rep.id}`} className="p-3 border-b text-center font-medium text-gray-700 bg-blue-25 min-w-[140px]">
                  <div className="flex flex-col items-center">
                    <span className="font-semibold">{rep.name}</span>
                    <span className="text-xs text-gray-500 mt-1">
                      {rep.parameters.propertyTypes.join(', ')}
                      {rep.parameters.maxUnits && ` (max ${rep.parameters.maxUnits})`}
                    </span>
                  </div>
                </th>
              ))}
              {over1kReps.map(rep => (
                <th key={`over1k-${rep.id}`} className="p-3 border-b text-center font-medium text-gray-700 bg-green-25 min-w-[140px]">
                  <div className="flex flex-col items-center">
                    <span className="font-semibold">{rep.name}</span>
                    <span className="text-xs text-gray-500 mt-1">
                      {rep.parameters.propertyTypes.join(', ')} (1K+)
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
              <tr key={day} className={`border-b hover:bg-gray-25 transition-colors ${currentDay === day ? 'bg-yellow-25' : ''}`}>
                <td className={`p-3 font-medium text-gray-600 bg-gray-50 sticky left-0 z-10 ${
                  currentDay === day ? 'bg-yellow-100 font-bold border-l-4 border-yellow-400' : ''
                }`}>
                  <div className="flex items-center justify-center">
                    <span className={`${currentDay === day ? 'text-yellow-800' : ''}`}>
                      {day}
                    </span>
                  </div>
                </td>
                
                {/* Sub 1K Rotation Cells */}
                {sub1kReps.map(rep => {
                  const entries = getEntriesForCell(day, rep.id);
                  return (
                    <td 
                      key={`${day}-${rep.id}`} 
                      className={`p-2 border-r cursor-pointer transition-all duration-200 ${getCellStyle(entries, day)}`}
                      onClick={() => onCellClick(day, rep.id)}
                    >
                      <div className="min-h-[60px] flex flex-col justify-start space-y-1">
                        {entries.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-gray-300 text-xs">
                            Click to add
                          </div>
                        ) : (
                          entries.map(entry => (
                            <div 
                              key={entry.id} 
                              className={`group relative p-2 rounded-md border transition-all duration-200 hover:shadow-md ${getEntryTypeStyle(entry.type)}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  {entry.type === 'lead' ? (
                                    <div className="space-y-1">
                                      <a 
                                        href={entry.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 underline font-medium text-sm block truncate"
                                        onClick={(e) => e.stopPropagation()}
                                        title={entry.value}
                                      >
                                        {entry.value}
                                      </a>
                                      {entry.comments && entry.comments.length > 0 && (
                                        <div className="text-xs text-gray-600">
                                          {entry.comments.length} comment{entry.comments.length > 1 ? 's' : ''}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-medium text-sm">
                                      {entry.value}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="hidden group-hover:flex items-center space-x-1 ml-2">
                                  <button
                                    onClick={(e) => handleEntryAction(e, 'edit', entry)}
                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded"
                                    title="Edit entry"
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
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}

                {/* 1K+ Rotation Cells */}
                {over1kReps.map(rep => {
                  const entries = getEntriesForCell(day, rep.id);
                  return (
                    <td 
                      key={`${day}-${rep.id}`} 
                      className={`p-2 border-r cursor-pointer transition-all duration-200 ${getCellStyle(entries, day)}`}
                      onClick={() => onCellClick(day, rep.id)}
                    >
                      <div className="min-h-[60px] flex flex-col justify-start space-y-1">
                        {entries.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-gray-300 text-xs">
                            Click to add
                          </div>
                        ) : (
                          entries.map(entry => (
                            <div 
                              key={entry.id} 
                              className={`group relative p-2 rounded-md border transition-all duration-200 hover:shadow-md ${getEntryTypeStyle(entry.type)}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  {entry.type === 'lead' ? (
                                    <div className="space-y-1">
                                      <a 
                                        href={entry.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 underline font-medium text-sm block truncate"
                                        onClick={(e) => e.stopPropagation()}
                                        title={entry.value}
                                      >
                                        {entry.value}
                                      </a>
                                      {entry.comments && entry.comments.length > 0 && (
                                        <div className="text-xs text-gray-600">
                                          {entry.comments.length} comment{entry.comments.length > 1 ? 's' : ''}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-medium text-sm">
                                      {entry.value}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="hidden group-hover:flex items-center space-x-1 ml-2">
                                  <button
                                    onClick={(e) => handleEntryAction(e, 'edit', entry)}
                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded"
                                    title="Edit entry"
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
              <strong> OOO:</strong> {leadEntries.filter(e => e.type === 'ooo').length}
            </div>
            <div className="text-xs text-gray-500">
              Click any cell to add an entry • Hover over entries to edit or delete
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarGrid;