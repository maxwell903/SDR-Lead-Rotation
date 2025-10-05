// src/components/AuditTrail.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Clock, AlertCircle } from 'lucide-react';
import { 
  auditTrailService, 
  GroupedAuditActions, 
  AuditActionRecord,
  AuditTrailRow 
} from '../services/auditTrailService';

interface AuditTrailProps {
  salesReps?: any[];
  currentMonth?: number;
  currentYear?: number;
}

const AuditTrail: React.FC<AuditTrailProps> = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [groupedActions, setGroupedActions] = useState<GroupedAuditActions[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [oldestLoadedDate, setOldestLoadedDate] = useState<Date | null>(null);

  // Load today's actions
  const loadTodaysActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const todaysActions = await auditTrailService.fetchTodaysActions();
      const grouped = await auditTrailService.groupActionsByDate(todaysActions);
      
      setGroupedActions(grouped);
      
      // Set oldest loaded date for pagination
      if (grouped.length > 0) {
        const oldestDate = new Date(grouped[grouped.length - 1].date);
        setOldestLoadedDate(oldestDate);
      }
      
      setHasMore(todaysActions.length > 0);
    } catch (err) {
      console.error('Error loading today\'s actions:', err);
      setError('Failed to load audit trail. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load next day's actions (pagination)
  const loadNextDay = useCallback(async () => {
    if (!oldestLoadedDate || !hasMore) return;

    setLoading(true);
    setError(null);
    try {
      const { actions, date } = await auditTrailService.fetchNextDayActions(oldestLoadedDate);
      
      if (actions.length === 0 || !date) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      // Transform and group the new actions
      const newGrouped = await auditTrailService.groupActionsByDate(actions);
      
      // Append to existing groups
      setGroupedActions(prev => [...prev, ...newGrouped]);
      setOldestLoadedDate(date);
      
    } catch (err) {
      console.error('Error loading next day actions:', err);
      setError('Failed to load more actions.');
    } finally {
      setLoading(false);
    }
  }, [oldestLoadedDate, hasMore]);

  // ✅ FIX 1: Load data on mount (regardless of dropdown state)
  useEffect(() => {
    loadTodaysActions();
  }, [loadTodaysActions]);

  // ✅ FIX 2: Real-time subscription always active (even when closed)
  useEffect(() => {
    const unsubscribe = auditTrailService.subscribeToAuditTrail(async (newAction: AuditActionRecord) => {
      console.log('📬 Received new action in real-time:', newAction);
      
      // Check if action is from today
      const actionDate = new Date(newAction.created_at).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      
      if (actionDate === today) {
        // Re-fetch today's actions to update the list
        const todaysActions = await auditTrailService.fetchTodaysActions();
        const grouped = await auditTrailService.groupActionsByDate(todaysActions);
        
        // Update only today's group, keep other days
        setGroupedActions(prev => {
          const otherDays = prev.filter(g => g.date !== today);
          const todayGroup = grouped.find(g => g.date === today);
          return todayGroup ? [todayGroup, ...otherDays] : prev;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []); // Always active

  // Toggle dropdown
  const toggleOpen = () => {
    setIsOpen(prev => !prev);
  };

  // Format timestamp
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Render a single action row
const renderActionRow = (action: AuditTrailRow) => {
  return (
    <tr key={action.id} className="border-b hover:bg-gray-50 transition-colors">
      {/* Column 1: Username */}
      <td className="px-3 py-2 text-sm text-gray-700 font-medium">
        {action.username}
      </td>
      
      {/* Column 2: Action Type */}
      <td className="px-3 py-2 text-sm">
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getActionTypeColor(action.actionType)}`}>
          {action.actionType}
        </span>
      </td>
      
      {/* Column 3: Account Number or Time */}
      <td className="px-3 py-2 text-sm text-gray-600">
        {action.accountNumberOrTime || '-'}
      </td>
      
      {/* Column 4: Sales Rep Names */}
      <td className="px-3 py-2 text-sm text-gray-700 font-medium">
        {action.salesRepNames || '-'}
      </td>
      
      {/* Column 5: Lane */}
      <td className="px-3 py-2 text-sm text-center">
        {action.lane ? (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getLaneColor(action.lane)}`}>
            {action.lane}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      
      {/* Column 6: Hit Value Display */}
      <td className="px-3 py-2 text-sm text-center">
        <span className={`font-mono ${getHitValueColor(action.hitValueDisplay)}`}>
          {action.hitValueDisplay || '-'}
        </span>
      </td>
      
      {/* Column 7: Hit Value Total Display */}
      <td className="px-3 py-2 text-sm text-gray-600">
        {action.hitValueTotalDisplay || '-'}
      </td>
      
      {/* ✅ NEW Column 8: Date Assigned */}
      <td className="px-3 py-2 text-sm text-gray-600 font-medium">
        {action.dateAssigned || '-'}
      </td>
      
      {/* Column 9: Timestamp (was Column 8) */}
      <td className="px-3 py-2 text-sm text-gray-500">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(action.timestamp)}
        </div>
      </td>
    </tr>
  );
};

// Helper function for lane color styling
const getLaneColor = (lane: string): string => {
  if (lane === 'Sub 1k') return 'bg-blue-100 text-blue-700';
  if (lane === '1k+') return 'bg-purple-100 text-purple-700';
  if (lane === 'Both') return 'bg-indigo-100 text-indigo-700';
  return 'bg-gray-100 text-gray-700';
};

  // Get color class for action type badge
  const getActionTypeColor = (actionType: string): string => {
    if (actionType.includes('Delete NL')) return 'bg-red-100 text-red-700';
    if (actionType.includes('Delete LRL')) return 'bg-gray-100 text-red-700';
    if (actionType.includes('Create') || actionType.includes('ADD')) return 'bg-green-100 text-green-700';
    if (actionType.includes('Reorder')) return 'bg-blue-100 text-blue-700';
    if (actionType.includes('OOO')) return 'bg-red-100 text-red-700';
    if (actionType.includes('Skip')) return 'bg-yellow-100 text-yellow-700';
    if (actionType.includes('MFR') && actionType.includes('LRL')) return 'bg-gray-100 text-green-700';
    if (actionType.includes('MFR → NL') ) return 'bg-green-100 text-green-700';
    if (actionType.includes('MFR') ) return 'bg-orange-100 text-orange-700';
    
    return 'bg-gray-100 text-gray-700';
  };

  // Get color for hit value display
  const getHitValueColor = (value: string): string => {
    if (value.startsWith('+')) return 'text-green-600';
    if (value.startsWith('-')) return 'text-red-600';
    return 'text-gray-700';
  };

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm border">
      {/* Dropdown Header */}
      <button
        onClick={toggleOpen}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded">
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">Audit Trail</h3>
          {groupedActions.length > 0 && (
            <span className="text-xs text-gray-500">
              ({groupedActions.reduce((sum, g) => sum + g.actions.length, 0)} actions)
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className="border-t">
          {/* Loading State */}
          {loading && groupedActions.length === 0 && (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-500">Loading audit trail...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Actions Content */}
          {!loading && !error && groupedActions.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No actions recorded yet today.</p>
            </div>
          )}

          {/* Grouped Actions by Date */}
          {groupedActions.map((group) => (
            <div key={group.date} className="mb-4">
              {/* Date Header */}
              <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b">
                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {group.displayDate}
                  <span className="ml-2 text-gray-400">({group.actions.length})</span>
                </h4>
              </div>

              {/* Actions Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">User</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Action</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Acct#/Time</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Sales Rep</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Lane</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Hit Value</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Total/Impact</th>
                        {/* ✅ NEW COLUMN */}
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date Assigned</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Created</th>
                    </tr>
                    </thead>

                  <tbody>
                    {group.actions.map(action => renderActionRow(action))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Load More Button */}
          {groupedActions.length > 0 && hasMore && (
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={loadNextDay}
                disabled={loading}
                className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    Loading...
                  </span>
                ) : (
                  'Show Next Day\'s Actions'
                )}
              </button>
            </div>
          )}

          {/* No More Actions Message */}
          {groupedActions.length > 0 && !hasMore && (
            <div className="p-4 border-t bg-gray-50 text-center">
              <p className="text-xs text-gray-500">No more actions to load</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditTrail;