// src/components/NonLeadEntry.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { X, Trash2, ChevronDown } from 'lucide-react';
import { NonLeadEntry } from '../services/nonLeadEntriesService';
import { SalesRep } from '../types';
import { DatePicker } from './DatePicker';
import { TimeInput } from './TimeInput';

// Internal DeleteConfirmationModal component
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

// Main NonLeadEntryModal component
interface NonLeadEntryModalProps {
  entry: NonLeadEntry;
  salesReps: SalesRep[];
  onClose: () => void;
  onUpdate: (updatedData: any) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
}

const NonLeadEntryModal: React.FC<NonLeadEntryModalProps> = ({
  entry,
  salesReps,
  onClose,
  onUpdate,
  onDelete,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCommentsDropdown, setShowCommentsDropdown] = useState(false);
  const [newComment, setNewComment] = useState('');
  
  const [formData, setFormData] = useState({
    time: entry.time || '',
    date: new Date(entry.year, entry.month - 1, entry.day),
    rotationTarget: entry.rotationTarget || 'both',
    comments: [] as string[],
  });

// Get the assigned rep's information (note: entry.repId is the assigned rep in NonLeadEntry)
const assignedRep = useMemo(() => {
  return salesReps.find(rep => rep.id === entry.repId);
}, [salesReps, entry.repId]);

// Check if assigned rep can handle 1K+
const canAssignedRepHandle1kPlus = useMemo(() => {
  return assignedRep?.parameters?.canHandle1kPlus === true;
}, [assignedRep]);

// Auto-correct rotation target if rep doesn't have 1K+ capability
useEffect(() => {
  if (!canAssignedRepHandle1kPlus) {
    if (formData.rotationTarget === 'over1k' || formData.rotationTarget === 'both') {
      setFormData(prev => ({ ...prev, rotationTarget: 'sub1k' }));
    }
  }
}, [canAssignedRepHandle1kPlus, formData.rotationTarget]);

// Helper to get sales rep name
const getSalesRepName = (repId: string) => {
  const rep = salesReps.find(r => r.id === repId);
  return rep ? rep.name : 'Unknown Rep';
};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if any data actually changed
    const hasDataChanged = (): boolean => {
      // Compare time
      const oldTime = entry.time || '';
      const newTime = formData.time.trim();
      if (oldTime !== newTime) return true;

      // Compare date
      const oldDate = new Date(entry.year, entry.month - 1, entry.day);
      const newDate = formData.date;
      if (
        oldDate.getFullYear() !== newDate.getFullYear() ||
        oldDate.getMonth() !== newDate.getMonth() ||
        oldDate.getDate() !== newDate.getDate()
      ) {
        return true;
      }

      // Compare rotation target
      if (formData.rotationTarget !== entry.rotationTarget) return true;

      // Compare comments - only if there are any
      if (formData.comments.length > 0) return true;

      return false;
    };

    setIsSubmitting(true);
    try {
      // Only update if data changed
      if (hasDataChanged()) {
        const updateData = {
          time: formData.time.trim() || null,
          day: formData.date.getDate(),
          month: formData.date.getMonth() + 1,
          year: formData.date.getFullYear(),
          rotationTarget: formData.rotationTarget,
          comments: formData.comments,
        };
        
        await onUpdate(updateData);
        
      }
      
      onClose();
    } catch (error) {
      console.error('Error updating non-lead entry:', error);
      alert('Failed to update entry. Please try again.');
      setIsSubmitting(false); // Re-enable if error
    }
  };

  const handleDelete = async () => {
    try {
      setIsSubmitting(true);
      await onDelete(entry.id);
      
      // ✅ Wait for subscription to update before closing (250ms delay)
      await new Promise(resolve => setTimeout(resolve, 250));
      
      onClose();
    } catch (error) {
      console.error('Error deleting non-lead entry:', error);
      alert('Failed to delete entry. Please try again.');
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

  const getModalTitle = () => {
    return entry.entryType === 'OOO' 
      ? `Edit Out of Office for ${getSalesRepName(entry.repId)}`
      : `Edit Skip for ${getSalesRepName(entry.repId)}`;
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
                  title={`Delete ${entry.entryType}`}
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
          <form
            onSubmit={handleSubmit}
            className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[calc(95vh-180px)] overflow-y-auto"
          >
            {/* 1) Entry Type (disabled) */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">Entry Type</label>
              <select
                value={entry.entryType}
                disabled
                className="w-full p-3 border-2 border-gray-300 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed"
              >
                <option value="OOO">Out of Office (OOO)</option>
                <option value="SKP">Skip</option>
              </select>
            </div>

            {/* 2) Sales Rep (disabled) */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">Sales Rep</label>
              <select
                value={entry.repId}
                disabled
                className="w-full p-3 border-2 border-gray-300 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed"
              >
                {salesReps.map(rep => (
                  <option key={rep.id} value={rep.id}>{rep.name}</option>
                ))}
              </select>
            </div>

           
            {/* 3) Time field for BOTH OOO and Skip */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">
                Time {entry.entryType === 'OOO' ? '(Optional)' : ''}
              </label>
              <TimeInput
                value={formData.time}
                onChange={(time) => setFormData(prev => ({ ...prev, time }))}
              />
              {entry.entryType === 'OOO' && (
                <p className="text-xs text-gray-500 mt-1">Leave blank for all-day OOO</p>
              )}
            </div>

            {/* 4) Date using DatePicker component */}
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-3">Date</label>
              <DatePicker
                value={formData.date}
                onChange={(date) => setFormData(prev => ({ ...prev, date }))}
              />
            </div>

            {/* 5) Rotation Target */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-3">
                Rotation Target
              </label>
              <select
                value={formData.rotationTarget}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  rotationTarget: e.target.value as 'sub1k' | 'over1k' | 'both' 
                }))}
                className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="sub1k">Sub $1K Only</option>
                
                {/* Only show 1K+ and Both options if the assigned rep has 1K+ capability */}
                {canAssignedRepHandle1kPlus && (
                  <>
                    <option value="over1k">$1K+ Only</option>
                    <option value="both">Both Lanes</option>
                  </>
                )}
              </select>
              
              <p className="text-xs text-gray-500 mt-1">
                {entry.entryType === 'OOO' 
                  ? 'Select which rotation(s) the rep should be removed from'
                  : 'Select which rotation(s) should receive the skip'}
                {!canAssignedRepHandle1kPlus && (
                  <span className="text-orange-600 font-semibold ml-1">
                    (Rep does not have 1K+ permissions - only Sub $1K available)
                  </span>
                )}
              </p>
            </div>

            {/* 6) Comments */}
            <div className="md:col-span-2">
              <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                <button
                  type="button"
                  onClick={() => setShowCommentsDropdown(!showCommentsDropdown)}
                  className="w-full flex items-center justify-between text-sm font-bold text-blue-700 mb-3"
                >
                  <span>Comments ({formData.comments.length})</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showCommentsDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showCommentsDropdown && (
                  <div className="space-y-2 max-h-32 overflow-y-auto mb-3">
                    {formData.comments.map((comment, index) => (
                      <div key={index} className="text-sm bg-white p-3 rounded-xl border border-blue-200">
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
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

            {/* 7) Actions */}
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-medium"
                disabled={isSubmitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-transparent"></div>
                    <span>Updating...</span>
                  </div>
                ) : (
                  'Update'
                )}
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
        title={`Are you sure you want to delete this ${entry.entryType === 'OOO' ? 'OOO' : 'Skip'} entry?`}
      />
    </>
  );
};

export default NonLeadEntryModal;