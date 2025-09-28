import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Trash2, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ReplacementState,
  buildReplacementOptions,
} from '../features/leadReplacement';
import { SalesRep, LeadEntry, RotationState, MonthData } from '../types';

interface LeadModalProps {
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete?: (entryId: string) => void;
  salesReps: SalesRep[];
  selectedCell: { day: number; repId: string } | null;
  editingEntry: LeadEntry | null;
  rotationState: RotationState;
  getEligibleReps: (leadData: any) => SalesRep[];
  getNextInRotation: (leadData: any) => string | null;
  leads?: any[];
  replacementState: ReplacementState;
  monthlyData: Record<string, MonthData>;
  selectedDate?: Date;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  entryId: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  entryId
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Are you sure you want to delete?</h3>
        <div className="flex space-x-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-all font-medium"
          >
            Yes
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-all font-medium"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

const LeadModal: React.FC<LeadModalProps> = ({
  onClose,
  onSave,
  onDelete,
  salesReps,
  selectedCell,
  editingEntry,
  rotationState,
  getEligibleReps,
  getNextInRotation,
  leads = [],
  replacementState,
  monthlyData,
  selectedDate
}) => {
  const [formData, setFormData] = useState({
    accountNumber: '',
    url: '',
    propertyTypes: [] as string[],
    unitCount: null as number | null,
    comments: [] as string[],
    assignedTo: '',
    date: selectedDate || new Date()
  });

  const [newComment, setNewComment] = useState('');
  const [entryType, setEntryType] = useState<'lead' | 'skip' | 'ooo' | 'next'>('lead');
  const [eligibleReps, setEligibleReps] = useState<SalesRep[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPropertyTypes, setShowPropertyTypes] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCommentsDropdown, setShowCommentsDropdown] = useState(false);
  const [replaceToggle, setReplaceToggle] = useState(false);
  const [originalLeadIdToReplace, setOriginalLeadIdToReplace] = useState('');

  const propertyTypeOptions: ('MFH' | 'MF' | 'SFH' | 'Commercial')[] = ['MFH', 'MF', 'SFH', 'Commercial'];
  
  const isEditing = Boolean(editingEntry);

  // Get replacement options for the dropdown
  const replacementOptions = useMemo(() => {
    return buildReplacementOptions(monthlyData, replacementState, salesReps);
  }, [replacementState, salesReps]);

  // Date formatting helpers
  const formatDateDisplay = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    return isToday ? 'Today' : date.toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatDateForInput = (date: Date) => {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  // Get sales rep name helper
  const getSalesRepName = (repId: string) => {
    const rep = salesReps.find(r => r.id === repId);
    return rep ? rep.name : 'Unknown Rep';
  };

  // Enhanced getEligibleReps with proper parameter filtering
  const getFilteredEligibleReps = useMemo(() => {
    const leadData = {
      propertyTypes: formData.propertyTypes,
      unitCount: formData.unitCount,
      assignedTo: formData.assignedTo
    };
    
    const isOver1k = (leadData.unitCount ?? 0) >= 1000;

    
    // Filter sales reps based on parameters
    const filtered = salesReps.filter(rep => {
      // Exclude out of office reps
      if (rep.status === 'ooo') return false;
      
      // For 1K+ leads, rep must be 1K+ capable
      if (isOver1k && !rep.parameters.canHandle1kPlus) return false;
      
      // Check max units constraint
       if (
        leadData.unitCount != null &&
        rep.parameters.maxUnits &&
        leadData.unitCount > rep.parameters.maxUnits
      ) return false;

      // Check property types - rep must handle ALL selected property types
      if (leadData.propertyTypes.length > 0) {
        const hasAllPropertyTypes = leadData.propertyTypes.every((type: string) => 
          rep.parameters.propertyTypes.includes(type as any)
        );
        if (!hasAllPropertyTypes) return false;
      }
      
      return true;
    });

    // Sort by rotation order
    const rotationOrder = isOver1k ? rotationState.normalRotationOver1k : rotationState.normalRotationSub1k;
    
    return filtered.sort((a, b) => {
      const aIndex = rotationOrder.indexOf(a.id);
      const bIndex = rotationOrder.indexOf(b.id);
      
      // If both are in rotation order, sort by rotation position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in rotation, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // If neither is in rotation, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [formData.propertyTypes, formData.unitCount, salesReps, rotationState]);

  // Initialize form data
  useEffect(() => {
    if (editingEntry) {
      setFormData({
        accountNumber: editingEntry.value || '',
        url: editingEntry.url || '',
        propertyTypes: [], // Will need to get from lead data
         unitCount: editingEntry.unitCount ?? null,
        comments: editingEntry.comments || [],
        assignedTo: editingEntry.repId || '',
        date: selectedDate || new Date()
      });
      setEntryType(editingEntry.type);
    } else {
      const defaultDate = selectedCell ? 
        new Date(new Date().getFullYear(), new Date().getMonth(), selectedCell.day) : 
        (selectedDate || new Date());
      
      setFormData(prev => ({
        ...prev,
        date: defaultDate,
        assignedTo: selectedCell?.repId || ''
      }));
    }
  }, [editingEntry, selectedCell, selectedDate]);

  // Update eligible reps and auto-assign when form data changes
  useEffect(() => {
    setEligibleReps(getFilteredEligibleReps);

    // Auto-assign based on parameters if not from calendar cell and not editing
    if (!selectedCell && !isEditing && entryType === 'lead') {
      const leadData = {
        propertyTypes: formData.propertyTypes,
        unitCount: formData.unitCount ?? 0,
        assignedTo: formData.assignedTo
      };
      
      const nextRepId = getNextInRotation(leadData);
      if (nextRepId && getFilteredEligibleReps.find(rep => rep.id === nextRepId)) {
        setFormData(prev => ({ ...prev, assignedTo: nextRepId }));
      } else if (getFilteredEligibleReps.length > 0) {
        // Fallback to first eligible rep
        setFormData(prev => ({ ...prev, assignedTo: getFilteredEligibleReps[0].id }));
      }
    }
  }, [formData.propertyTypes, formData.unitCount, entryType, getFilteredEligibleReps, selectedCell, isEditing, getNextInRotation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (entryType === 'lead') {
      if (!formData.accountNumber.trim()) {
        alert('Account number is required for leads');
        return;
      }
      if (!formData.assignedTo) {
        alert('Sales rep assignment is required for leads');
        return;
      }
      // Allow blank; only block negative values just in case
      if (formData.unitCount != null && formData.unitCount < 0) {
        alert('Unit count cannot be negative');
        return;
      }
    } else {
      if (!formData.assignedTo) {
        alert('Sales rep assignment is required');
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      const saveData = {
        type: entryType,
        value: entryType === 'lead' ? formData.accountNumber : entryType,
        accountNumber: formData.accountNumber,
        url: formData.url,
        propertyTypes: formData.propertyTypes,
        unitCount: entryType === 'lead' ? (formData.unitCount ?? null) : undefined,
        comments: formData.comments,
        day: formData.date.getDate(),
        month: formData.date.getMonth(),
        year: formData.date.getFullYear(),
        repId: formData.assignedTo,
        assignedTo: formData.assignedTo,
        rotationTarget: entryType === 'lead'
          ? ((formData.unitCount ?? 0) >= 1000 ? 'over1k' : 'sub1k')
          : 'sub1k',
        replaceLeadId: replaceToggle ? originalLeadIdToReplace : undefined,
        id: editingEntry?.id
      };

      await onSave(saveData);
      onClose();
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Failed to save entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (editingEntry && onDelete) {
      try {
        setIsSubmitting(true);
        await onDelete(editingEntry.id);
        onClose();
      } catch (error) {
        console.error('Error deleting entry:', error);
        alert('Failed to delete entry. Please try again.');
      } finally {
        setIsSubmitting(false);
        setShowDeleteConfirm(false);
      }
    }
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      const timestamp = new Date().toLocaleString();
      const commentWithMeta = `${newComment.trim()} - ${timestamp} by Current User`;
      setFormData(prev => ({
        ...prev,
        comments: [...prev.comments, commentWithMeta]
      }));
      setNewComment('');
    }
  };

  const handlePropertyTypeToggle = (type: 'MFH' | 'MF' | 'SFH' | 'Commercial') => {
    setFormData(prev => ({
      ...prev,
      propertyTypes: prev.propertyTypes.includes(type)
        ? prev.propertyTypes.filter(t => t !== type)
        : [...prev.propertyTypes, type]
    }));
  };

  const handleDateChange = (dateString: string) => {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        const newDate = new Date(year, month, day);
        if (newDate.getFullYear() === year && newDate.getMonth() === month && newDate.getDate() === day) {
          setFormData(prev => ({ ...prev, date: newDate }));
        }
      }
    }
  };

  // Get position number for rep in rotation
  const getRepPositionInRotation = (repId: string) => {
    const isOver1k = (formData.unitCount ?? 0) >= 1000;
    const rotationOrder = isOver1k ? rotationState.normalRotationOver1k : rotationState.normalRotationSub1k;
    const position = rotationOrder.indexOf(repId);
    return position !== -1 ? position + 1 : null;
  };

  // --- Height sync: make replacement box match account number block when collapsed ---
  const accBoxRef = useRef<HTMLDivElement | null>(null);
  const [collapsedMinH, setCollapsedMinH] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = accBoxRef.current;
    if (!el) return;
    const compute = () => setCollapsedMinH(el.getBoundingClientRect().height);
    compute();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(compute) : null;
    ro?.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  // Recompute when the collapsed/expanded state changes
  useEffect(() => {
    if (!replaceToggle && accBoxRef.current) {
      setCollapsedMinH(accBoxRef.current.getBoundingClientRect().height);
    }
  }, [replaceToggle]);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden shadow-2xl border-2 border-blue-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 border-b-2 border-blue-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <h3 className="text-2xl font-bold text-blue-700">
                  Add New Entry
                </h3>
                {isEditing && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300"
                    title="Delete Entry"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
              <button 
                onClick={onClose} 
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 hover:border-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[calc(95vh-180px)] overflow-y-auto"
          >
            {/* 1. Entry Type */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">Entry Type</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as any)}
                className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
                disabled={isEditing}
              >
                <option value="lead">Lead</option>
                <option value="skip">Skip</option>
                <option value="ooo">Out of Office</option>
                <option value="next">Next Indicator</option>
              </select>
            </div>

            {/* 2. Replacement Toggle (aligned with Entry Type) */}
            <div className="md:col-span-1">
              {/* Desktop-only spacer to match the Entry Type label height */}
              <div className="hidden md:block">
                <label className="block text-sm font-bold text-gray-700 mb-3 invisible">Entry Type</label>
              </div>

              {entryType === 'lead' && (
                <div
                  className="border border-amber-200 rounded-xl p-3 sm:p-4 bg-amber-50 transition-[min-height]"
                  style={!replaceToggle && collapsedMinH ? { minHeight: collapsedMinH * 0.5 } : undefined}
                >
                  <label className="flex items-center space-x-3 text-sm font-bold text-gray-700">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-amber-600 bg-gray-100 border border-amber-300 rounded focus:ring-amber-500 focus:ring-2"
                      checked={replaceToggle}
                      onChange={(e) => {
                        setReplaceToggle(e.target.checked);
                        if (!e.target.checked) setOriginalLeadIdToReplace('');
                      }}
                    />
                    <span className="leading-tight">Replace Lead</span>
                  </label>

                  {replaceToggle && (
                    <div className="mt-4 space-y-3">
                      <label className="block text-xs font-medium text-gray-600">
                        Choose a lead in need of replacement
                      </label>
                      <select
                        className="w-full rounded-xl border-2 border-amber-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 bg-white"
                        value={originalLeadIdToReplace}
                        onChange={(e) => setOriginalLeadIdToReplace(e.target.value)}
                      >
                        <option value="">— Select a lead to replace —</option>
                        {replacementOptions.map(opt => (
                          <option key={opt.leadId} value={opt.leadId}>
                            {opt.accountNumber} - {opt.repName} ({new Date(opt.markedAt).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Account Number */}
            {entryType === 'lead' && (
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-gray-700 mb-3">Account Number *</label>
                <textarea
                  value={formData.accountNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                  className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 resize-none"
                  rows={1}
                  required
                />
              </div>
            )}

            {/* 4. Property Types */}
            {entryType === 'lead' && (
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-gray-700 mb-3">Property Types</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPropertyTypes(!showPropertyTypes)}
                    className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center"
                  >
                    <span className="text-gray-700 font-medium">
                      {formData.propertyTypes.length > 0
                        ? formData.propertyTypes.join(', ')
                        : 'Select property types...'}
                    </span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${showPropertyTypes ? 'rotate-180' : ''}`} />
                  </button>

                  {showPropertyTypes && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10">
                      {propertyTypeOptions.map(type => (
                        <label
                          key={type}
                          className="flex items-center space-x-3 p-3 hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.propertyTypes.includes(type)}
                            onChange={() => handlePropertyTypeToggle(type)}
                            className="w-4 h-4 text-blue-600 border-2 border-blue-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-gray-700 font-medium">{type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. URL */}
            {entryType === 'lead' && (
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-gray-700 mb-3">URL*</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="Put LSManager Prospect account URL here"
                  className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
                  required
                />
              </div>
            )}

            {/* 6. Unit Count (optional) */}
            {entryType === 'lead' && (
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-gray-700 mb-3">Unit Count</label>
                <input
                  type="number"
                  value={formData.unitCount ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      unitCount: raw === '' ? null : Number(raw)
                    }));
                  }}
                  className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
                  min="0"
                />
              </div>
            )}

            {/* 7. Assign Sales Rep */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">Assign Sales Rep *</label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
                required
              >
                <option value="">Select sales rep...</option>
                {eligibleReps.map(rep => {
                  const position = getRepPositionInRotation(rep.id);
                  return (
                    <option key={rep.id} value={rep.id}>
                      {position ? `${position}. ` : ''}{rep.name} {rep.status === 'ooo' ? '(Out of Office)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 8. Date Picker */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">Date*</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center text-left"
                >
                  <span className="text-gray-700 font-medium">
                    Date: {formatDateDisplay(formData.date)}
                  </span>
                  <Calendar className="w-5 h-5 text-gray-500" />
                </button>

                {showDatePicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10 p-4">
                    <input
                      type="text"
                      value={formatDateForInput(formData.date)}
                      onChange={(e) => handleDateChange(e.target.value)}
                      placeholder="MM/DD/YYYY"
                      className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      Enter date in MM/DD/YYYY format
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Comments (FULL WIDTH) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-3">Comments</label>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowCommentsDropdown(!showCommentsDropdown)}
                  className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center text-left"
                >
                  <span className="text-gray-700 font-medium">
                    Comments ({formData.comments.length})
                  </span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${showCommentsDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showCommentsDropdown && (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {formData.comments.map((comment, index) => (
                      <div key={index} className="text-sm bg-blue-50 p-3 rounded-xl border border-blue-200">
                        {comment}
                      </div>
                    ))}
                    {formData.comments.length === 0 && (
                      <div className="text-sm text-gray-500 p-3">No comments yet</div>
                    )}
                  </div>
                )}

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1 p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Add a comment..."
                  />
                  <button
                    type="button"
                    onClick={handleAddComment}
                    className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </form>


          {/* 10. Footer */}
          <div className="bg-blue-50 px-6 py-4 border-t-2 border-blue-200 flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl transition-all duration-200 font-bold border-2 ${
                isSubmitting 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400 border-gray-400 hover:border-gray-500'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl transition-all duration-200 font-bold border-2 ${
                isSubmitting 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed border-gray-400' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 hover:border-blue-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-transparent"></div>
                  <span>Saving...</span>
                </div>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        entryId={editingEntry?.id || ''}
      />
    </>
  );
};

export default LeadModal;