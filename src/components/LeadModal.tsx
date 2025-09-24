import React, { useState, useEffect } from 'react';
import { SalesRep, LeadEntry, RotationState } from '../types';

interface LeadModalProps {
  onClose: () => void;
  onSave: (data: any) => void;
  salesReps: SalesRep[];
  selectedCell: { day: number; repId: string } | null;
  editingEntry: LeadEntry | null;
  rotationState: RotationState;
  getEligibleReps: (leadData: any) => SalesRep[];
  getNextInRotation: (leadData: any) => string | null;
}

const LeadModal: React.FC<LeadModalProps> = ({ 
  onClose, 
  onSave, 
  salesReps, 
  selectedCell, 
  editingEntry,
  rotationState,
  getEligibleReps,
  getNextInRotation
}) => {
  const [formData, setFormData] = useState({
    accountNumber: editingEntry?.value || '',
    url: editingEntry?.url || '',
    propertyTypes: [] as string[],
    unitCount: editingEntry?.unitCount || 0,
    comments: editingEntry?.comments || [],
    assignedTo: ''
  });

  const [newComment, setNewComment] = useState('');
  const [entryType, setEntryType] = useState<'lead' | 'skip' | 'ooo' | 'next'>(
    editingEntry?.type || 'lead'
  );
  const [rotationTarget, setRotationTarget] = useState<'sub1k' | 'over1k' | 'both'>('sub1k');
  const [eligibleReps, setEligibleReps] = useState<SalesRep[]>([]);
  const [nextRep, setNextRep] = useState<string>('');
  const [unitCountFocused, setUnitCountFocused] = useState(false);

  const propertyTypeOptions = ['MFH', 'MF', 'SFH', 'Commercial'];

  // Check if the selected rep can handle 1K+ (for showing rotation toggle)
  const selectedRep = selectedCell ? salesReps.find(rep => rep.id === selectedCell.repId) : null;
  const canHandle1kPlus = selectedRep?.parameters.canHandle1kPlus || false;

  // UPDATED: Initialize form data for editing
  useEffect(() => {
    if (editingEntry && editingEntry.type === 'lead') {
      // Find the associated lead data to populate property types
      // For now, we'll use default values since we don't have direct access to lead data
      // This could be improved by passing lead data to the modal
      setFormData(prev => ({
        ...prev,
        accountNumber: editingEntry.value || '',
        url: editingEntry.url || '',
        unitCount: editingEntry.unitCount || 0,
        comments: editingEntry.comments || [],
        assignedTo: editingEntry.repId,
        // Note: propertyTypes would need to be reconstructed from the associated lead
      }));
    }
    
    // Initialize rotationTarget from existing entry or based on rep capabilities
    if (editingEntry?.rotationTarget) {
      setRotationTarget(editingEntry.rotationTarget);
    } else if (canHandle1kPlus) {
      // If editing and rep can handle both, determine based on unit count
      if (editingEntry?.unitCount && editingEntry.unitCount >= 1000) {
        setRotationTarget('over1k');
      } else {
        setRotationTarget('sub1k');
      }
    }
  }, [editingEntry, canHandle1kPlus]);

  // Update eligible reps and next rep when form data changes
  useEffect(() => {
    if (entryType === 'lead' && formData.propertyTypes.length > 0) {
      const eligible = getEligibleReps(formData);
      setEligibleReps(eligible);
      
      const next = getNextInRotation(formData);
      setNextRep(next || '');
      
      if (!formData.assignedTo && next) {
        setFormData(prev => ({ ...prev, assignedTo: next }));
      }
    } else {
      setEligibleReps([]);
      setNextRep('');
    }
  }, [formData.propertyTypes, formData.unitCount, entryType, getEligibleReps, getNextInRotation]);

  // Set default next rep for sub 1k rotation
  useEffect(() => {
    if (entryType === 'lead' && formData.propertyTypes.length === 0) {
      const defaultNext = rotationState.nextSub1k;
      const defaultRep = salesReps.find(rep => rep.id === defaultNext);
      if (defaultRep) {
        setNextRep(defaultNext);
      }
    }
  }, [entryType, rotationState.nextSub1k, salesReps, formData.propertyTypes.length]);

  // Auto-set rotation target based on unit count for leads
  useEffect(() => {
    if (entryType === 'lead' && formData.unitCount > 0) {
      if (formData.unitCount >= 1000) {
        setRotationTarget('over1k');
      } else {
        setRotationTarget('sub1k');
      }
    }
  }, [formData.unitCount, entryType]);

  const handlePropertyTypeChange = (type: string) => {
    setFormData(prev => ({
      ...prev,
      propertyTypes: prev.propertyTypes.includes(type)
        ? prev.propertyTypes.filter(t => t !== type)
        : [...prev.propertyTypes, type]
    }));
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      setFormData(prev => ({
        ...prev,
        comments: [...prev.comments, newComment.trim()]
      }));
      setNewComment('');
    }
  };

  const handleUnitCountChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      unitCount: value === '' ? 0 : parseInt(value) || 0
    }));
  };

  const handleUnitCountFocus = () => {
    setUnitCountFocused(true);
    if (formData.unitCount === 0) {
      setFormData(prev => ({ ...prev, unitCount: 0 }));
    }
  };

  const getRepName = (repId: string) => {
    return salesReps.find(rep => rep.id === repId)?.name || 'Unknown';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (entryType === 'lead') {
      if (!formData.accountNumber || !formData.url || formData.propertyTypes.length === 0) {
        alert('Please fill in all required fields');
        return;
      }
      if (!formData.assignedTo) {
        alert('Please select a sales representative');
        return;
      }
    }
    
    // UPDATED: Always include rotationTarget and unitCount in the saved data
    onSave({ 
      ...formData, 
      type: entryType,
      assignedTo: entryType !== 'lead' ? (selectedCell?.repId || formData.assignedTo) : formData.assignedTo,
      rotationTarget: entryType === 'lead' 
        ? (formData.unitCount >= 1000 ? 'over1k' : 'sub1k')  // Determine based on unit count for leads
        : (canHandle1kPlus ? rotationTarget : 'sub1k'), // Use selected target for non-leads
      unitCount: entryType === 'lead' ? formData.unitCount : undefined
    });
  };

  const getRotationTargetLabel = (target: string) => {
    switch (target) {
      case 'sub1k': return 'Sub 1K Rotation Only';
      case 'over1k': return '1K+ Rotation Only';
      case 'both': return 'Both Rotations';
      default: return target;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {editingEntry ? 'Edit Entry' : 'Add New Entry'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Entry Type</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as any)}
              className="w-full p-2 border rounded-lg"
            >
              <option value="lead">Lead</option>
              <option value="skip">Skip</option>
              <option value="ooo">Out of Office</option>
              <option value="next">Next Indicator</option>
            </select>
          </div>

          {/* Rotation Target Toggle - Only show for 1K+ capable reps and for skip/ooo/next entries */}
          {canHandle1kPlus && entryType !== 'lead' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-sm font-medium mb-2 text-blue-800">
                Which Rotation Should This Count For?
              </label>
              <div className="space-y-2">
                {['sub1k', 'over1k', 'both'].map(target => (
                  <label key={target} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="rotationTarget"
                      value={target}
                      checked={rotationTarget === target}
                      onChange={(e) => setRotationTarget(e.target.value as any)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-blue-800">{getRotationTargetLabel(target)}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs text-blue-600 mt-2">
                Since {selectedRep?.name} can handle 1K+ leads, choose which rotation this entry should affect.
              </div>
            </div>
          )}

          {entryType === 'lead' && (
            <>
              {/* Next Rep Display */}
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-sm font-medium text-blue-700 mb-1">
                  Next in Rotation:
                </div>
                <div className="text-blue-900 font-semibold">
                  {formData.propertyTypes.length === 0 
                    ? `${getRepName(rotationState.nextSub1k)} (Sub 1K Default)`
                    : nextRep 
                      ? `${getRepName(nextRep)} ${formData.unitCount >= 1000 ? '(1K+)' : '(Sub 1K)'}`
                      : 'No eligible rep found'
                  }
                </div>
                {eligibleReps.length > 1 && (
                  <div className="text-xs text-blue-600 mt-1">
                    Other eligible: {eligibleReps.filter(r => r.id !== nextRep).map(r => r.name).join(', ')}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Account Number *</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">URL *</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Property Types *</label>
                <div className="grid grid-cols-2 gap-2">
                  {propertyTypeOptions.map(type => (
                    <label key={type} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.propertyTypes.includes(type)}
                        onChange={() => handlePropertyTypeChange(type)}
                        className="rounded"
                      />
                      <span className="text-sm">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Unit Count *</label>
                <input
                  type="number"
                  value={unitCountFocused && formData.unitCount === 0 ? '' : formData.unitCount}
                  onChange={(e) => handleUnitCountChange(e.target.value)}
                  onFocus={handleUnitCountFocus}
                  onBlur={() => setUnitCountFocused(false)}
                  className="w-full p-2 border rounded-lg"
                  required
                  min="0"
                />
                {formData.unitCount >= 1000 && (
                  <div className="text-xs text-orange-600 mt-1">
                    This is a 1K+ unit lead - will automatically target 1K+ rotation
                  </div>
                )}
              </div>

              {eligibleReps.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Assign To *</label>
                  <select
                    value={formData.assignedTo}
                    onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                    required
                  >
                    <option value="">Select a rep...</option>
                    {eligibleReps.map(rep => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name} {rep.id === nextRep ? '(Next)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Comments</label>
                <div className="space-y-2">
                  {formData.comments.map((comment, index) => (
                    <div key={index} className="bg-gray-50 p-2 rounded text-sm flex justify-between items-center">
                      <span>{comment}</span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          comments: prev.comments.filter((_, i) => i !== index)
                        }))}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 p-2 border rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddComment}
                      className="bg-gray-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-600"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {entryType !== 'lead' && (
            <div>
              <label className="block text-sm font-medium mb-2">Sales Rep</label>
              <select
                value={formData.assignedTo || selectedCell?.repId || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                className="w-full p-2 border rounded-lg"
              >
                {salesReps.filter(rep => rep.status === 'active').map(rep => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
            >
              {editingEntry ? 'Update' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadModal;