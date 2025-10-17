import React, { useState, useEffect } from 'react';
import { X, HelpCircle, AlertTriangle } from 'lucide-react';
import { setCushionValue, getCushionValue, getCushionOccurrences } from '../services/cushionService';

interface CushionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  repId: string;
  repName: string;
  lane: 'sub1k' | '1kplus';
  currentCushion: number;
  onSuccess: () => void;
}

const CushionEditModal: React.FC<CushionEditModalProps> = ({
  isOpen,
  onClose,
  repId,
  repName,
  lane,
  currentCushion,
  onSuccess,
}) => {
  const [cushionValue, setCushionValueLocal] = useState<number>(0);
  const [totalAppearances, setTotalAppearances] = useState<number>(1);
  const [currentOccurrences, setCurrentOccurrences] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load current values when modal opens
  useEffect(() => {
    const loadCurrentValues = async () => {
      if (repId && isOpen) {
        setIsLoading(true);
        try {
          // Get current cushion and occurrences
          const occurrences = await getCushionOccurrences(repId, lane);
          
          setCushionValueLocal(currentCushion || 0);
          setCurrentOccurrences(occurrences || 0);
          // If there's a current cushion, use current occurrences, otherwise default to 1
          setTotalAppearances(occurrences || (currentCushion > 0 ? 1 : 0));
          setError(null);
        } catch (err) {
          console.error('Failed to load cushion values:', err);
          setError('Failed to load current settings');
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    loadCurrentValues();
  }, [repId, lane, currentCushion, isOpen]);

  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      setCushionValueLocal(0);
      setTotalAppearances(1);
      setCurrentOccurrences(0);
      setError(null);
      setIsLoading(false);
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleSave = async () => {
  if (!repId) return;

  // Validation
  if (cushionValue < 0 || cushionValue > 10) {
    setError('Cushion value must be between 0 and 10');
    return;
  }

  if (cushionValue > 0 && (totalAppearances < 0 || totalAppearances > 50)) {
    setError('Total appearances must be between 1 and 50');
    return;
  }

  setIsSaving(true);
  setError(null);

  try {
    // When cushion is 0, we don't need occurrences
    const occurrencesToSave = cushionValue === 0 ? 0 : totalAppearances;
    
    // ⭐ UPDATE THIS: Pass originalValue parameter
    await setCushionValue(
      repId,
      lane,
      cushionValue,
      occurrencesToSave,
      cushionValue  // ⭐ NEW: Save as original cushion value
    );

    console.log(`✅ Saved cushion for ${repName}: x${cushionValue} appearing ${occurrencesToSave} times`);
    
    onSuccess();
    onClose();
  } catch (err) {
    console.error('Failed to save cushion:', err);
    setError('Failed to save cushion settings. Please try again.');
  } finally {
    setIsSaving(false);
  }
};

  const handleCushionChange = (value: number) => {
    setCushionValueLocal(value);
    // If setting to 0, reset appearances
    if (value === 0) {
      setTotalAppearances(0);
    } else if (totalAppearances === 0) {
      // If currently 0 and setting a cushion, default to 1 appearance
      setTotalAppearances(1);
    }
  };

  if (!isOpen) return null;

  const laneName = lane === 'sub1k' ? 'Sub $1k' : '$1k+';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Cushion Settings
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {repName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isSaving}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Current Status */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Lane:</span>
                  <span className="text-sm text-gray-900">{laneName}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-medium text-gray-700">Current Status:</span>
                  <span className="text-sm text-gray-900">
                    {currentCushion === 0 
                      ? 'No cushion' 
                      : `x${currentCushion} (${currentOccurrences || 0} appearances)`}
                  </span>
                </div>
              </div>

              {/* Cushion Value Input */}
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Cushion Value
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={cushionValue}
                    onChange={(e) => handleCushionChange(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                  {cushionValue > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600">
                      x{cushionValue}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Set to 0 to remove cushioning. Maximum value is 10.
                </p>
              </div>

              {/* Total Appearances Input */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Total Appearances in Rotation
                  </label>
                  <div className="group relative">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="hidden group-hover:block absolute left-6 top-0 w-72 px-3 py-2 bg-black text-white text-xs rounded whitespace-normal z-20">
                      <p className="font-semibold mb-1">How many times will x{cushionValue || 2} appear?</p>
                      <p>This sets the total number of times this rep will appear with the x{cushionValue || 2} cushion in the expanded rotation view.</p>
                      <p className="mt-1">For example: If you set this to 4, the rep will appear exactly 4 times with "x{cushionValue || 2}" next to their name.</p>
                    </div>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={totalAppearances}
                  onChange={(e) => setTotalAppearances(Math.max(0, parseInt(e.target.value) || 0))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    cushionValue === 0 
                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed' 
                      : 'border-gray-300'
                  }`}
                  
                />
                <p className="text-xs text-gray-500">
                  {cushionValue === 0 
                    ? 'Set a cushion value to enable appearances' 
                    : `${repName} will appear with x${cushionValue} exactly ${totalAppearances} time${totalAppearances !== 1 ? 's' : ''} in the rotation`}
                </p>
              </div>

              {/* How It Works */}
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2 text-xs text-gray-700">
                    <p className="font-semibold text-gray-900">How Cushioning Works:</p>
                    <ul className="space-y-1 ml-2">
                      <li>• <strong>x{cushionValue || 2} → x{Math.max(1, (cushionValue || 2) - 1)}:</strong> Lead is absorbed, no hit recorded, rep stays in position</li>
                      <li>• <strong>x1 → x0:</strong> Hit IS recorded, rep moves back in rotation</li>
                      {totalAppearances > 1 && cushionValue > 0 && (
                        <li>• <strong>After x1 hits x0:</strong> Cushion resets to x{cushionValue} ({totalAppearances - 1} more time{(totalAppearances - 1) !== 1 ? 's' : ''})</li>
                      )}
                      <li>• <strong>x0 (no cushion):</strong> Normal behavior - all leads record hits</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Example */}
              {cushionValue > 0 && totalAppearances > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Example with your settings:</p>
                  <p className="text-xs text-gray-600">
                    {repName} will appear {totalAppearances} time{totalAppearances !== 1 ? 's' : ''} with "x{cushionValue}" in the expanded rotation. 
                    Each x{cushionValue} position can absorb {cushionValue - 1} lead{cushionValue - 1 !== 1 ? 's' : ''} before recording a hit.
                    In total, {repName} can absorb up to {totalAppearances * (cushionValue - 1)} lead{totalAppearances * (cushionValue - 1) !== 1 ? 's' : ''} 
                    across all {totalAppearances} appearance{totalAppearances !== 1 ? 's' : ''}.
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || (cushionValue > 0 && totalAppearances < 0)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </span>
                  ) : (
                    'Save Settings'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CushionEditModal;