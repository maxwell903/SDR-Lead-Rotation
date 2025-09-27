import React, { useState, useEffect, useMemo } from 'react';
import { X, Trash2, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ReplacementState,
  buildReplacementOptions,
} from '../features/leadReplacement';
import { SalesRep, Lead, RotationState, MonthData } from '../types';

interface EditLeadModalProps {
  onClose: () => void;
  onUpdate: (data: any) => void;
  onDelete: (leadId: string) => void;
  editingLead: Lead;
  salesReps: SalesRep[];
  rotationState: RotationState;
  replacementState: ReplacementState;
  monthlyData: Record<string, MonthData>;
  onMarkForReplacement?: (leadId: string) => void;
  onUnmarkForReplacement?: (leadId: string) => void;
  onUnreplaceAndCreateNew?: (leadId: string, newLeadData: any) => void;
  getEligibleReps?: (leadData: any) => SalesRep[];
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
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

const EditLeadModal: React.FC<EditLeadModalProps> = ({
  onClose,
  onUpdate,
  onDelete,
  editingLead,
  salesReps,
  rotationState,
  replacementState,
  monthlyData,
  onMarkForReplacement,
  onUnmarkForReplacement,
  onUnreplaceAndCreateNew,
  getEligibleReps
}) => {
  const [formData, setFormData] = useState({
    accountNumber: '',
    url: '',
    propertyTypes: [] as ('MFH' | 'MF' | 'SFH' | 'Commercial')[],
    unitCount: 0,
    comments: [] as string[],
    assignedTo: '',
    date: new Date()
  });

  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPropertyTypes, setShowPropertyTypes] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCommentsDropdown, setShowCommentsDropdown] = useState(false);
  const [showReplacementSummary, setShowReplacementSummary] = useState(false);
  
  // Replacement handling states
  const [markForReplacement, setMarkForReplacement] = useState(false);
  const [unmarkFromReplacement, setUnmarkFromReplacement] = useState(false);

  const propertyTypeOptions: ('MFH' | 'MF' | 'SFH' | 'Commercial')[] = ['MFH', 'MF', 'SFH', 'Commercial'];

  // Determine lead type
  const isMarkedForReplacement = useMemo(() => {
    return replacementState.byLeadId[editingLead.id] && !replacementState.byLeadId[editingLead.id].replacedByLeadId;
  }, [replacementState, editingLead.id]);

  const isReplacementLead = useMemo(() => {
    // Check if this lead is replacing another lead
    return Object.values(replacementState.byLeadId).some(
      record => record.replacedByLeadId === editingLead.id
    );
  }, [replacementState, editingLead.id]);

  const originalLeadRecord = useMemo(() => {
    if (!isReplacementLead) return null;
    return Object.values(replacementState.byLeadId).find(
      record => record.replacedByLeadId === editingLead.id
    );
  }, [replacementState, editingLead.id, isReplacementLead]);

  // Get eligible sales reps based on property types
  const eligibleReps = useMemo(() => {
    if (!getEligibleReps) return salesReps;
    return getEligibleReps({
      propertyTypes: formData.propertyTypes,
      unitCount: formData.unitCount
    });
  }, [getEligibleReps, formData.propertyTypes, formData.unitCount, salesReps]);

  // Modal title logic
  const getModalTitle = () => {
    if (isReplacementLead) {
      return "Edit Replacement Lead";
    } else if (isMarkedForReplacement) {
      return "Edit Lead Marked For Replacement";
    } else {
      return `Edit Lead ${editingLead.accountNumber} for ${getSalesRepName(editingLead.assignedTo)}`;
    }
  };

  // Helper to get sales rep name
  const getSalesRepName = (repId: string) => {
    const rep = salesReps.find(r => r.id === repId);
    return rep ? rep.name : 'Unknown Rep';
  };

  // Date formatting helpers
  const formatDateDisplay = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    return isToday ? 'Today' : date.toLocaleDateString('en-US', { 
      month: 'short', 
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  // Initialize form with lead data
  useEffect(() => {
    setFormData({
      accountNumber: editingLead.accountNumber || '',
      url: editingLead.url || '',
      propertyTypes: editingLead.propertyTypes || [],
      unitCount: editingLead.unitCount || 0,
      comments: editingLead.comments || [],
      assignedTo: editingLead.assignedTo || '',
      date: editingLead.date || new Date()
    });
  }, [editingLead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.accountNumber.trim()) {
      alert('Account number is required');
      return;
    }
    if (!formData.assignedTo) {
      alert('Sales rep assignment is required');
      return;
    }
    if (formData.unitCount <= 0) {
      alert('Unit count must be greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      // Apply replacement mark/unmark first if toggled
      if (markForReplacement && onMarkForReplacement) {
        await onMarkForReplacement(editingLead.id);
      } else if (unmarkFromReplacement && onUnmarkForReplacement) {
        await onUnmarkForReplacement(editingLead.id);
      }

      // Then update the lead itself
      const updateData = {
        accountNumber: formData.accountNumber.trim(),
        url: formData.url?.trim() || null,
        propertyTypes: formData.propertyTypes,
        unitCount: formData.unitCount,
        assignedTo: formData.assignedTo,
        date: formData.date,
        comments: formData.comments,
        month: formData.date.getMonth() + 1,
        year: formData.date.getFullYear(),
      };
      await onUpdate(updateData);
      onClose();
    } catch (error) {
      console.error('Error updating lead:', error);
      alert('Failed to update lead. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Explicit action: only when user clicks "UnReplace & Add"
  const handleUnreplaceAndAdd = async () => {
    if (!onUnreplaceAndCreateNew) return;
    setIsSubmitting(true);
    try {
      await onUnreplaceAndCreateNew(editingLead.id, {
        ...formData,
        day: formData.date.getDate(),
        month: formData.date.getMonth() + 1,
        year: formData.date.getFullYear(),
      });
      onClose();
    } catch (error) {
      console.error('Error performing UnReplace & Add:', error);
      alert('Failed to unreplace and add a new lead.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleDelete = async () => {
    try {
      setIsSubmitting(true);
      await onDelete(editingLead.id);
      onClose();
    } catch (error) {
      console.error('Error deleting lead:', error);
      alert('Failed to delete lead. Please try again.');
    } finally {
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
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

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden shadow-2xl border-2 border-blue-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-5 border-b-2 border-blue-200">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-bold text-blue-700">
                  {getModalTitle()}
                </h3>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300"
                  title="Delete Lead"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={onClose} 
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 hover:border-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[calc(95vh-160px)] overflow-y-auto">
            {/* 1. Entry Type - Always LEAD and disabled */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">1. Entry Type</label>
              <select
                value="lead"
                disabled
                className="w-full p-2.5 border-2 border-gray-300 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed text-sm"
              >
                <option value="lead">LEAD</option>
              </select>
            </div>

            {/* 2. Replacement Summary for Replacement Leads */}
            {isReplacementLead && originalLeadRecord && (
              <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50">
                <button
                  type="button"
                  onClick={() => setShowReplacementSummary(!showReplacementSummary)}
                  className="flex items-center space-x-2 text-emerald-700 hover:text-emerald-800 font-medium text-sm"
                >
                  <span>2. Lead it replaces:</span>
                  <a
                    href={originalLeadRecord.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {originalLeadRecord.accountNumber}
                  </a>
                  <span>({getSalesRepName(originalLeadRecord.repId)})</span>
                  {showReplacementSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {showReplacementSummary && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-200 text-xs space-y-2">
                    <p><strong>Date Created:</strong> {formatDate(new Date(originalLeadRecord.markedAt))}</p>
                    <p><strong>Account Number:</strong> {originalLeadRecord.accountNumber}</p>
                    <p><strong>Sales Rep:</strong> {getSalesRepName(originalLeadRecord.repId)}</p>
                    <p><strong>Status:</strong> {originalLeadRecord.replacedByLeadId ? 'Replaced' : 'Needs Replacement'}</p>
                  </div>
                )}
              </div>
            )}

            {/* 2. Replacement Toggles for different scenarios */}
            {!isReplacementLead && (
              <div className="space-y-3">
                {isMarkedForReplacement ? (
                  // Toggle to unmark from replacement
                  <div className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50">
                    <label className="flex items-center space-x-3 text-sm font-bold text-gray-700">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-orange-600 bg-gray-100 border-2 border-orange-300 rounded focus:ring-orange-500 focus:ring-2"
                        checked={unmarkFromReplacement}
                        onChange={(e) => setUnmarkFromReplacement(e.target.checked)}
                      />
                      <span>2. Unmark from replacement queue</span>
                    </label>
                  </div>
                ) : (
                  // Toggle to mark for replacement
                  <div className="border-2 border-amber-200 rounded-xl p-4 bg-amber-50">
                    <label className="flex items-center space-x-3 text-sm font-bold text-gray-700">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-amber-600 bg-gray-100 border-2 border-amber-300 rounded focus:ring-amber-500 focus:ring-2"
                        checked={markForReplacement}
                        onChange={(e) => setMarkForReplacement(e.target.checked)}
                      />
                      <span>2. Mark lead as in need of replacement</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* 3. Unit Count */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">3. Unit Count *</label>
              <input
                type="number"
                value={formData.unitCount}
                onChange={(e) => setFormData(prev => ({ ...prev, unitCount: parseInt(e.target.value) || 0 }))}
                className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 text-sm"
                min="1"
                required
              />
            </div>

            {/* 4. Property Types */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">4. Property Types</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPropertyTypes(!showPropertyTypes)}
                  className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center text-sm"
                >
                  <span className="text-gray-700 font-medium">
                    {formData.propertyTypes.length > 0 
                      ? formData.propertyTypes.join(', ') 
                      : 'Select property types...'}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showPropertyTypes ? 'rotate-180' : ''}`} />
                </button>
                
                {showPropertyTypes && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10">
                    {propertyTypeOptions.map(type => (
                      <label key={type} className="flex items-center space-x-3 p-2.5 hover:bg-blue-100 transition-colors cursor-pointer text-sm">
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

            {/* 5. Assign Sales Rep */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">5. Assign Sales Rep *</label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 text-sm"
                required
              >
                <option value="">Select sales rep...</option>
                {eligibleReps.map(rep => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name} {rep.status === 'ooo' ? '(Out of Office)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. URL */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">6. URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                placeholder="Put LSManager Prospect account URL here"
                className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 text-sm"
              />
            </div>

            {/* 7. Account Number */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">7. Account Number *</label>
              <textarea
                value={formData.accountNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 resize-none text-sm"
                rows={2}
                required
              />
            </div>

            {/* 8. Date Picker */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">8. Date</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center text-left text-sm"
                >
                  <span className="text-gray-700 font-medium">
                    Date: {formatDateDisplay(formData.date)}
                  </span>
                  <Calendar className="w-4 h-4 text-gray-500" />
                </button>
                
                {showDatePicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10 p-3">
                    <input
                      type="text"
                      value={formatDateForInput(formData.date)}
                      onChange={(e) => handleDateChange(e.target.value)}
                      placeholder="MM/DD/YYYY"
                      className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      Enter date in MM/DD/YYYY format
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 9. Comments */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">9. Comments</label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCommentsDropdown(!showCommentsDropdown)}
                  className="w-full p-2.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center text-left text-sm"
                >
                  <span className="text-gray-700 font-medium">
                    Comments ({formData.comments.length})
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showCommentsDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showCommentsDropdown && (
                  <div className="border-2 border-blue-200 rounded-xl p-3 bg-white">
                    {formData.comments.length > 0 ? (
                      <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                        {formData.comments.map((comment, index) => (
                          <div key={index} className="text-xs text-gray-600 bg-gray-50 p-2 rounded border">
                            {comment}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 mb-3 p-2 bg-gray-50 rounded">
                        No comments yet
                      </div>
                    )}
                    
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 p-2 border border-gray-300 rounded-lg text-xs"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 10. Action Buttons */}
            <div className="flex space-x-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-medium text-sm"
                disabled={isSubmitting}
              >
                Cancel
              </button>
                  {isReplacementLead && onUnreplaceAndCreateNew && (
                    <button
                      type="button"
        onClick={handleUnreplaceAndAdd}
        className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium disabled:opacity-50 text-sm"
        disabled={isSubmitting}
      >
        UnReplace & Add
      </button>
    )}
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 text-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating...' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Are you sure you want to delete this lead?"
      />
    </>
  );
};

export default EditLeadModal;