import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, ChevronDown, Lock, AlertCircle } from 'lucide-react';
import { SalesRep } from '../types';
import { usePropertyTypes } from '../hooks/usePropertyTypes';
import { createReservation } from '../services/leadReservationService';
import { getNetHitCounts } from '../services/hitCountsService';
import { supabase } from '../lib/supabase';

interface LeadReservationModalProps {
  onClose: () => void;
  onReserve: (repId: string, lane: 'sub1k' | '1kplus', reservation?: any) => void;
  salesReps: SalesRep[];
  username: string;
}

interface ReplacementLead {
  id: string;
  repId: string;
  repName: string;
  leadId: string;
  markedAt: Date;
  lane: string;
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
  cushionDisplay?: string;
}

const LeadReservationModal: React.FC<LeadReservationModalProps> = ({
  onClose,
  onReserve,
  salesReps,
  username
}) => {
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [unitCount, setUnitCount] = useState<number | null>(null);
  const [showPropertyTypes, setShowPropertyTypes] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch property types
  const { propertyTypes: availablePropertyTypes } = usePropertyTypes();

  // State for rotation data
  const [hitsSub1k, setHitsSub1k] = useState<Map<string, number>>(new Map());
  const [hits1kPlus, setHits1kPlus] = useState<Map<string, number>>(new Map());
  const [replacementMarks, setReplacementMarks] = useState<ReplacementLead[]>([]);
  const [loading, setLoading] = useState(true);

  // Determine which lane to use
  const lane: 'sub1k' | '1kplus' = (unitCount ?? 0) >= 1000 ? '1kplus' : 'sub1k';

  // Load hit counts and replacement marks
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load hit counts
        const sub1kHits = await getNetHitCounts({ lane: 'sub1k' });
        const over1kHits = await getNetHitCounts({ lane: '1kplus' });
        setHitsSub1k(sub1kHits);
        setHits1kPlus(over1kHits);

        // Load replacement marks
        const { data: replacementData, error: replError } = await supabase
          .from('replacement_marks')
          .select('id, lead_id, rep_id, lane, marked_at')
          .is('replaced_by_lead_id', null)
          .order('marked_at', { ascending: true });

        if (replError) throw replError;

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
      } catch (err) {
        console.error('Error loading rotation data:', err);
        setError('Failed to load rotation data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [salesReps]);

  // Get active reps for a lane
  const getActiveRepsForLane = useCallback((targetLane: 'sub1k' | '1kplus'): string[] => {
    return salesReps
      .filter(rep => {
        if (rep.status !== 'active') return false;
        if (targetLane === '1kplus') {
          return rep.parameters.canHandle1kPlus && rep.over1kOrder !== undefined;
        }
        return rep.sub1kOrder !== undefined;
      })
      .sort((a, b) => {
        const orderA = targetLane === '1kplus' ? (a.over1kOrder ?? Infinity) : a.sub1kOrder;
        const orderB = targetLane === '1kplus' ? (b.over1kOrder ?? Infinity) : b.sub1kOrder;
        return orderA - orderB;
      })
      .map(r => r.id);
  }, [salesReps]);

  // Get cushion display for collapsed view
  const getCushionDisplay = useCallback((repId: string, targetLane: 'sub1k' | '1kplus'): string => {
    const rep = salesReps.find(r => r.id === repId);
    if (!rep) return '';
    
    const cushion = targetLane === 'sub1k' ? (rep.cushionSub1k ?? 0) : (rep.cushion1kPlus ?? 0);
    
    if (cushion === 0) return '';
    return ` x${cushion}`;
  }, [salesReps]);

  // Generate rotation sequence
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
      const sortedReps = [...repHits].sort((a, b) => {
        if (a.hits !== b.hits) return a.hits - b.hits;
        return baseOrder.indexOf(a.repId) - baseOrder.indexOf(b.repId);
      });

      const nextRep = sortedReps[0];
      sequence.push({ position: position++, repId: nextRep.repId });
      nextRep.hits += 1;

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
  const getReplacementOrder = useCallback((targetLane: 'sub1k' | '1kplus'): ReplacementLead[] => {
    return replacementMarks
      .filter(mark => mark.lane === targetLane)
      .sort((a, b) => a.markedAt.getTime() - b.markedAt.getTime());
  }, [replacementMarks]);

  // Generate collapsed view
  const generateCollapsedView = useCallback((
    baseOrder: string[],
    hitCounts: Map<string, number>,
    targetLane: 'sub1k' | '1kplus'
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
          isNext: seqItem.position === 1,
          cushionDisplay: getCushionDisplay(seqItem.repId, targetLane)
        });
      }
    }
    
    // Overlay replacement order
    const replacements = getReplacementOrder(targetLane);
    if (replacements.length > 0) {
      const repWithReplacements = new Set(replacements.map(r => r.repId));
      return items.map((item, index) => ({
        ...item,
        hasOpenReplacements: repWithReplacements.has(item.repId),
        displayPosition: repWithReplacements.has(item.repId) 
          ? replacements.findIndex(r => r.repId === item.repId) + 1
          : item.nextPosition,
        isNext: index === 0
      }));
    }
    
    return items;
  }, [salesReps, generateRotationSequence, getCushionDisplay, getReplacementOrder]);

  // Get base order for current lane
  const baseOrder = useMemo(() => getActiveRepsForLane(lane), [lane, getActiveRepsForLane]);

  // Get hit counts for current lane
  const hitCounts = lane === 'sub1k' ? hitsSub1k : hits1kPlus;

  // Generate rotation views
  const replacementOrder = useMemo(() => getReplacementOrder(lane), [lane, getReplacementOrder]);
  const currentOrder = useMemo(() => 
    generateCollapsedView(baseOrder, hitCounts, lane),
    [baseOrder, hitCounts, lane, generateCollapsedView]
  );

  // Filter eligible reps based on parameters
  const eligibleReps = useMemo(() => {
  // Show all reps if NO filters are applied
  if (propertyTypes.length === 0 && unitCount === null) {
    return currentOrder;
  }

  return currentOrder.filter(item => {
    const rep = salesReps.find(r => r.id === item.repId);
    if (!rep) return false;

    // Check unit count (if provided)
    if (unitCount !== null) {
      if (rep.parameters.maxUnits !== null && unitCount > rep.parameters.maxUnits) {
        return false;
      }
      if (unitCount >= 1000 && !rep.parameters.canHandle1kPlus) {
        return false;
      }
    }

    // Check property types (if provided)
    if (propertyTypes.length > 0) {
      if (rep.parameters.propertyTypes.length === 0) {
        return true; // No restrictions = can handle all types
      }
      const hasMatchingType = propertyTypes.some(pt => 
        rep.parameters.propertyTypes.includes(pt)
      );
      if (!hasMatchingType) return false;
    }

    return true;
  });
}, [currentOrder, propertyTypes, unitCount, lane, salesReps]);

  // Handle property type toggle
  const handlePropertyTypeToggle = (type: string) => {
    setPropertyTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // Handle reserve
  const handleReserve = async () => {
    if (!selectedRepId) {
      setError('Please select a sales rep');
      return;
    }

    if (propertyTypes.length === 0) {
      setError('Please select at least one property type');
      return;
    }

    if (unitCount === null) {
      setError('Please enter a unit count');
      return;
    }

    try {
      setIsReserving(true);
      setError(null);

      const reservation = await createReservation({
        repId: selectedRepId,
        reservedByUsername: username,
        propertyTypes,
        unitCount,
        lane
      });

      // Pass the reservation data back so it can be immediately added to state
      onReserve(selectedRepId, lane, reservation);
      onClose();
    } catch (err) {
      console.error('Error reserving rep:', err);
      setError(err instanceof Error ? err.message : 'Failed to reserve rep');
    } finally {
      setIsReserving(false);
    }
  };

  // Render rotation item
  const renderRotationItem = (item: RotationItem, isReplacement: boolean = false) => {
    const isSelected = selectedRepId === item.repId;
    const isEligible = eligibleReps.some(r => r.repId === item.repId);

    return (
      <button
        key={item.repId}
        type="button"
        onClick={() => isEligible && setSelectedRepId(item.repId)}
        disabled={!isEligible}
        className={`
          w-full text-left p-3 rounded-lg transition-all border-2
          ${isSelected ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-200'}
          ${isEligible ? 'hover:bg-blue-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
          ${isReplacement ? 'bg-amber-50' : ''}
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-gray-700">
              {item.displayPosition ?? item.nextPosition}.
            </span>
            <span className="font-medium text-gray-900">
              {item.name}{item.cushionDisplay}
            </span>
            {item.isNext && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                NEXT
              </span>
            )}
            {!isEligible && propertyTypes.length > 0 && unitCount !== null && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                Ineligible
              </span>
            )}
          </div>
          {isSelected && (
            <span className="text-blue-600 font-bold">✓</span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Reserve Sales Rep</h2>
              <p className="text-blue-100 text-sm mt-1">
                Select property types and unit count to see eligible reps
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-blue-800 rounded-full p-2 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(95vh-200px)] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Property Types */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Property Types *
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPropertyTypes(!showPropertyTypes)}
                  className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center"
                >
                  <span className="text-gray-700 font-medium">
                    {propertyTypes.length > 0
                      ? propertyTypes.join(', ')
                      : 'Select property types...'}
                  </span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${showPropertyTypes ? 'rotate-180' : ''}`} />
                </button>

                {showPropertyTypes && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                    {availablePropertyTypes.map(type => (
                      <label
                        key={type.id}
                        className="flex items-center space-x-3 p-3 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={propertyTypes.includes(type.abbreviation)}
                          onChange={() => handlePropertyTypeToggle(type.abbreviation)}
                          className="w-4 h-4 text-blue-600 border-2 border-blue-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-gray-700 font-medium">{type.abbreviation}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Unit Count */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Unit Count *
              </label>
              <input
                type="number"
                value={unitCount ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setUnitCount(raw === '' ? null : Number(raw));
                }}
                placeholder="Enter unit count"
                className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">
                {lane === '1kplus' ? '1K+ Rotation (≥1000 units)' : 'Sub-1K Rotation (<1000 units)'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading rotation data...</p>
            </div>
          ) : (
            <>
              {/* Replacement Order */}
              {replacementOrder.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg mr-2">
                      Replacement Order
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {replacementOrder.map((repl, index) => {
                      const item = currentOrder.find(i => i.repId === repl.repId);
                      if (!item) return null;
                      return renderRotationItem({
                        ...item,
                        displayPosition: index + 1,
                        isNext: index === 0
                      }, true);
                    })}
                  </div>
                </div>
              )}

              {/* Current Order */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3">
                  Current Order {replacementOrder.length > 0 && '(After Replacements)'}
                </h3>
                <div className="space-y-2">
                  {currentOrder.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No active reps in rotation</p>
                  ) : eligibleReps.length === 0 && (propertyTypes.length > 0 || unitCount !== null) ? (
                    <div className="text-center py-8 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                      <AlertCircle className="text-yellow-600 mx-auto mb-2" size={32} />
                      <p className="text-gray-700 font-medium">No eligible reps match the selected criteria</p>
                      <p className="text-gray-600 text-sm mt-1">Try adjusting property types or unit count</p>
                    </div>
                  ) : (
                    currentOrder.map(item => renderRotationItem(item))
                  )}
                </div>
              </div>

              {/* Help Text */}
              {propertyTypes.length === 0 && unitCount === null && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800 text-sm">
                    <strong>Tip:</strong> Select property types and enter unit count to filter eligible reps based on their parameters.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 border-t-2 border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-colors font-medium"
            disabled={isReserving}
          >
            Cancel
          </button>
          <button
            onClick={handleReserve}
            disabled={!selectedRepId || isReserving || propertyTypes.length === 0 || unitCount === null}
            className={`
              px-6 py-3 rounded-xl transition-colors font-medium flex items-center space-x-2
              ${selectedRepId && !isReserving && propertyTypes.length > 0 && unitCount !== null
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            {isReserving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Reserving...</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>Reserve</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadReservationModal;