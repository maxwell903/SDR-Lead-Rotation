import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, ExternalLink } from 'lucide-react';
import {
  ReplacementState,
  buildReplacementOptions,
} from '../features/leadReplacement.tsx';
import { SalesRep, LeadEntry, RotationState, MonthData } from '../types';

interface LeadModalProps {
  onClose: () => void;
  onSave: (data: any) => void;
  salesReps: SalesRep[];
  selectedCell: { day: number; repId: string } | null;
  editingEntry: LeadEntry | null;
  rotationState: RotationState;
  getEligibleReps: (leadData: any) => SalesRep[];
  getNextInRotation: (leadData: any) => string | null;
  // Add leads array to access lead data when editing
  leads?: any[];
  // NEW: replacement support
  replacementState: ReplacementState;
  monthlyData: Record<string, MonthData>;
}


const LeadModal: React.FC<LeadModalProps> = ({
  onClose,
  onSave,
  salesReps,
  selectedCell,
  editingEntry,
  rotationState,
  getEligibleReps,
  getNextInRotation,
  leads = [],
  // NEW
  replacementState,
  monthlyData,
}) => {
  const [formData, setFormData] = useState({
    accountNumber: '',
    url: '',
    propertyTypes: [] as string[],
    unitCount: 0,
    comments: [] as string[],
    assignedTo: ''
  });

  const [newComment, setNewComment] = useState('');
  const [entryType, setEntryType] = useState<'lead' | 'skip' | 'ooo' | 'next'>('lead');
  const [rotationTarget, setRotationTarget] = useState<'sub1k' | 'over1k' | 'both'>('sub1k');
  const [eligibleReps, setEligibleReps] = useState<SalesRep[]>([]);
  const [nextRep, setNextRep] = useState<string>('');
  const [unitCountFocused, setUnitCountFocused] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const propertyTypeOptions = ['MFH', 'MF', 'SFH', 'Commercial'];
  const isEditing = !!editingEntry;

  // Check if the selected rep can handle 1K+ (for showing rotation toggle)
  const selectedRep = selectedCell ? salesReps.find(rep => rep.id === selectedCell.repId) : null;
  const canHandle1kPlus = selectedRep?.parameters.canHandle1kPlus || false;

   // NEW: replacement UI state
  const [replaceToggle, setReplaceToggle] = useState<boolean>(false);
  const [originalLeadIdToReplace, setOriginalLeadIdToReplace] = useState<string>('');

  // NEW: all-time open marks -> dropdown options
  const replacementOptions = useMemo(() => {
    return buildReplacementOptions(monthlyData, replacementState, salesReps, { includeClosed: false });
  }, [monthlyData, replacementState, salesReps]);

  const selectedReplacement = useMemo(
    () => replacementOptions.find(o => o.leadId === originalLeadIdToReplace),
    [replacementOptions, originalLeadIdToReplace]
  );

  // NOTE: We’re not changing your Assign dropdown wiring here.
  // The assignment will be **enforced in App.tsx** when saving a replacement.
  // (So you can keep your current “assignedTo” UI unchanged for now.)


  // Initialize form data when editing - run only once when modal opens
  useEffect(() => {
    if (editingEntry) {
      // Set the entry type
      setEntryType(editingEntry.type);
      
      if (editingEntry.type === 'lead') {
        // Find the associated lead data
        const associatedLead = leads.find(lead => lead.id === editingEntry.leadId);
        
        if (associatedLead) {
          setFormData({
            accountNumber: associatedLead.accountNumber || editingEntry.value,
            url: associatedLead.url || editingEntry.url || '',
            propertyTypes: associatedLead.propertyTypes || [],
            unitCount: associatedLead.unitCount || editingEntry.unitCount || 0,
            comments: associatedLead.comments || editingEntry.comments || [],
            assignedTo: associatedLead.assignedTo || editingEntry.repId
          });
        } else {
          // Fallback if lead data not found
          setFormData({
            accountNumber: editingEntry.value || '',
            url: editingEntry.url || '',
            propertyTypes: [], // Will need to be set manually
            unitCount: editingEntry.unitCount || 0,
            comments: editingEntry.comments || [],
            assignedTo: editingEntry.repId
          });
        }
      } else {
        // For non-lead entries (skip, ooo, next)
        setFormData(prev => ({
          ...prev,
          assignedTo: editingEntry.repId
        }));
      }
      
      // Set rotation target from existing entry
      if (editingEntry.rotationTarget) {
        setRotationTarget(editingEntry.rotationTarget);
      } else {
        // Determine based on unit count or rep capabilities
        if (editingEntry.unitCount && editingEntry.unitCount >= 1000) {
          setRotationTarget('over1k');
        } else if (selectedRep?.parameters.canHandle1kPlus && editingEntry.type !== 'lead') {
          setRotationTarget('sub1k'); // Default for non-lead entries
        }
      }
    } else {
      // Initialize for new entry
      setFormData({
        accountNumber: '',
        url: '',
        propertyTypes: [],
        unitCount: 0,
        comments: [],
        assignedTo: selectedCell?.repId || ''
      });
      
      if (selectedRep?.parameters.canHandle1kPlus) {
        setRotationTarget('sub1k'); // Default to sub1k
      }
    }
  }, [editingEntry?.id]); // Only depend on editingEntry ID to avoid constant resets

  // Update eligible reps and next rep when form data changes (but avoid interfering with typing)
  useEffect(() => {
    if (entryType === 'lead' && formData.propertyTypes.length > 0) {
      const eligible = getEligibleReps(formData);
      setEligibleReps(eligible);
      
      // Calculate next for display
      const next = getNextInRotation(formData);
      setNextRep(next || '');
      
      // Only auto-assign next rep for NEW entries if no rep is currently assigned
      if (!isEditing && !formData.assignedTo && next) {
        setFormData(prev => ({ ...prev, assignedTo: next }));
      }
    } else {
      setEligibleReps([]);
      setNextRep('');
    }
  }, [formData.propertyTypes.length, formData.unitCount, entryType, isEditing]); // Reduced dependencies

  // Set default next rep for sub 1k rotation when creating new entries (run once)
  useEffect(() => {
    if (!isEditing && entryType === 'lead' && !formData.assignedTo) {
      const defaultNext = rotationState.nextSub1k;
      const defaultRep = salesReps.find(rep => rep.id === defaultNext);
      if (defaultRep) {
        setNextRep(defaultNext);
      }
    }
  }, [entryType, isEditing]); // Minimal dependencies to avoid interference

  // Auto-set rotation target based on unit count for leads (only when unit count changes significantly)
  useEffect(() => {
    if (entryType === 'lead' && formData.unitCount > 0) {
      const newTarget = formData.unitCount >= 1000 ? 'over1k' : 'sub1k';
      if (rotationTarget !== newTarget) {
        setRotationTarget(newTarget);
      }
    }
  }, [formData.unitCount >= 1000, entryType]); // Only trigger when crossing the 1K threshold

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

  const handleRemoveComment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      comments: prev.comments.filter((_, i) => i !== index)
    }));
  };

  const handleUnitCountChange = (value: string) => {
    const numValue = value === '' ? 0 : parseInt(value) || 0;
    setFormData(prev => ({
      ...prev,
      unitCount: numValue
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

  const validateForm = () => {
    if (entryType === 'lead') {
      if (!formData.accountNumber.trim()) {
        alert('Please enter an account number');
        return false;
      }
      if (!formData.url.trim()) {
        alert('Please enter a URL');
        return false;
      }
      if (formData.propertyTypes.length === 0) {
        alert('Please select at least one property type');
        return false;
      }
      if (formData.unitCount <= 0) {
        alert('Please enter a valid unit count');
        return false;
      }
      if (!formData.assignedTo) {
        alert('Please select a sales representative');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Prevent multiple submissions
  if (isSubmitting) {
    console.log('Already submitting, ignoring additional click');
    return;
  }
  
  if (!validateForm()) {
    return;
  }
  
  // NEW: require a selection if replacing
  if (replaceToggle && !originalLeadIdToReplace) {
    alert('Please select which lead you are replacing.');
    return;
  }

  try {
    setIsSubmitting(true);
    
    const saveData = {
      ...formData,
      type: entryType,
      assignedTo: entryType !== 'lead' 
        ? (selectedCell?.repId || formData.assignedTo) 
        : formData.assignedTo,
      rotationTarget: entryType === 'lead' 
        ? (formData.unitCount >= 1000 ? 'over1k' : 'sub1k')
        : (canHandle1kPlus ? rotationTarget : 'sub1k'),
      unitCount: entryType === 'lead' ? formData.unitCount : undefined,
      // Add editing flag and entry ID for updates
      isEditing: isEditing,
      editingEntryId: editingEntry?.id,
      // NEW: flags for App.tsx to close/open marks
      replaceToggle,
      originalLeadIdToReplace,
    };
    
    await onSave(saveData);
  } catch (error) {
    console.error('Error in form submission:', error);
    // Don't close modal on error, let user try again
  } finally {
    setIsSubmitting(false);
  }
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
            {isEditing ? 'Edit Entry' : 'Add New Entry'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Entry Type</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as any)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isEditing} // Don't allow changing type when editing
            >
              <option value="lead">Lead</option>
              <option value="skip">Skip</option>
              <option value="ooo">Out of Office</option>
              <option value="next">Next Indicator</option>
            </select>
          </div>

          {/* NEW: Replacement section (inserted before button row) */}
          <div className="pt-3 mt-2 border-t">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={replaceToggle}
                onChange={(e) => {
                  setReplaceToggle(e.target.checked);
                  if (!e.target.checked) setOriginalLeadIdToReplace('');
                }}
              />
              Replace Lead
            </label>
            {replaceToggle && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-gray-600">
                  Choose a lead in need of replacement (All Time)
                </label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={originalLeadIdToReplace}
                  onChange={(e) => setOriginalLeadIdToReplace(e.target.value)}
                >
                  <option value="">— Select a lead to replace —</option>
                  {replacementOptions.map(opt => (
                    <option key={opt.leadId} value={opt.leadId}>
                      {opt.repName} — {opt.accountNumber}
                    </option>
                  ))}
                </select>
                {selectedReplacement?.url && originalLeadIdToReplace && (
                  <div className="text-xs">
                    <a
                      href={selectedReplacement.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
                      title="Open the original account link"
                    >
                      <span>Open account</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-gray-500 ml-2">
                      (assignment will be locked to <b>{selectedReplacement.repName}</b>)
                    </span>
                  </div>
                )}
              </div>
            )}
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
              {/* Next Rep Display - Only show when creating new leads or when eligible reps exist */}
              {(!isEditing || eligibleReps.length > 0) && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-sm font-medium text-blue-700 mb-1">
                    {isEditing ? 'Current Assignment:' : 'Next in Rotation:'}
                  </div>
                  <div className="text-blue-900 font-semibold">
                    {isEditing ? (
                      `${getRepName(formData.assignedTo)} (Currently Assigned)`
                    ) : formData.propertyTypes.length === 0 ? (
                      `${getRepName(rotationState.nextSub1k)} (Sub 1K Default)`
                    ) : nextRep ? (
                      `${getRepName(nextRep)} ${formData.unitCount >= 1000 ? '(1K+)' : '(Sub 1K)'}`
                    ) : (
                      'No eligible rep found'
                    )}
                  </div>
                  {!isEditing && eligibleReps.length > 1 && (
                    <div className="text-xs text-blue-600 mt-1">
                      Other eligible: {eligibleReps.filter(r => r.id !== nextRep).map(r => r.name).join(', ')}
                    </div>
                  )}
                  {isEditing && nextRep && nextRep !== formData.assignedTo && (
                    <div className="text-xs text-orange-600 mt-1">
                      Next in rotation would be: {getRepName(nextRep)}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Account Number *</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">URL *</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  placeholder="https://..."
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
                        className="rounded text-blue-600 focus:ring-blue-500"
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
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  min="1"
                />
                {formData.unitCount >= 1000 && (
                  <div className="text-xs text-orange-600 mt-1">
                    This is a 1K+ unit lead - will automatically target 1K+ rotation
                  </div>
                )}
              </div>

              {/* Always show assign to dropdown for leads */}
              <div>
                <label className="block text-sm font-medium mb-2">Assign To *</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select a rep...</option>
                  {(eligibleReps.length > 0 ? eligibleReps : salesReps.filter(rep => rep.status === 'active')).map(rep => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name} {rep.id === nextRep ? '(Next)' : ''} {isEditing && rep.id === formData.assignedTo ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
                {isEditing && eligibleReps.length > 0 && !eligibleReps.some(rep => rep.id === formData.assignedTo) && (
                  <div className="text-xs text-orange-600 mt-1">
                    Warning: Currently assigned rep ({getRepName(formData.assignedTo)}) may not be eligible for these lead parameters.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Comments</label>
                <div className="space-y-2">
                  {formData.comments.map((comment, index) => (
                    <div key={index} className="bg-gray-50 p-2 rounded text-sm flex justify-between items-center">
                      <span>{comment}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveComment(index)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
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
                      className="flex-1 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
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
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
    disabled={isSubmitting}
    className={`flex-1 py-2 rounded-lg focus:ring-2 focus:ring-offset-2 transition-all duration-200 ${
      isSubmitting 
        ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
        : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
    }`}
  >
    {isSubmitting ? (
      <div className="flex items-center justify-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 border-t-transparent"></div>
        <span>Saving...</span>
      </div>
    ) : (
      isEditing ? 'Update Entry' : 'Save Entry'
    )}
  </button>
  <button
    type="button"
    onClick={onClose}
    disabled={isSubmitting} // Also disable cancel during save
    className={`flex-1 py-2 rounded-lg transition-colors duration-200 ${
      isSubmitting 
        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
        : 'bg-gray-300 text-gray-700 hover:bg-gray-400 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
    }`}
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