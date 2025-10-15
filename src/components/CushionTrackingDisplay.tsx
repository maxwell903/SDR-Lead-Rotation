// src/components/CushionTrackingDisplay.tsx
import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { getActiveCushionTracking, subscribeCushionChanges } from '../services/cushionService';
import type { Lane } from '../services/cushionService';

interface CushionTrackingDisplayProps {
  lane: Lane;
}

interface TrackingItem {
  repId: string;
  repName: string;
  lane: Lane;
  cushion: number;
  occurrences: number;
}

const CushionTrackingDisplay: React.FC<CushionTrackingDisplayProps> = ({ lane }) => {
  const [trackingData, setTrackingData] = useState<TrackingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTracking = async () => {
    try {
      const data = await getActiveCushionTracking();
      // Filter for this lane only
      const laneData = data.filter(item => item.lane === lane);
      setTrackingData(laneData);
    } catch (err) {
      console.error('Error loading cushion tracking:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTracking();

    // Subscribe to changes
    const unsubscribe = subscribeCushionChanges(() => {
      loadTracking();
    });

    return unsubscribe;
  }, [lane]);

  // Don't show anything if no active cushions
  if (isLoading || trackingData.length === 0) {
    return null;
  }

  const laneName = lane === 'sub1k' ? 'Sub 1K' : '1K+';

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-800">
            Active Cushions - {laneName}
          </h4>
        </div>
        <button
          onClick={loadTracking}
          className="p-1 hover:bg-blue-100 rounded transition-colors"
          title="Refresh tracking"
        >
          <RefreshCw className="w-3 h-3 text-gray-600" />
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {trackingData.map(item => (
          <div
            key={`${item.repId}-${item.lane}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-sm"
          >
            <span className="font-medium text-gray-800">{item.repName}</span>
            <span className="text-blue-600 font-semibold">x{item.cushion}</span>
            <span className="text-gray-400">·</span>
            <div className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-gray-500" />
              <span className="text-gray-600 font-medium">{item.occurrences}x</span>
            </div>
          </div>
        ))}
      </div>
      
      <p className="text-xs text-gray-600 mt-2">
        Each rep will cycle through their cushion pattern the number of times shown
      </p>
    </div>
  );
};

export default CushionTrackingDisplay;