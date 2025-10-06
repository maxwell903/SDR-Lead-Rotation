import React, { useState, useEffect, useMemo } from 'react';
import { X, Trash2, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ReplacementState,
  buildReplacementOptions,
} from '../features/leadReplacement';
import { SalesRep, Lead, RotationState, MonthData } from '../types';
import { supabase } from '../lib/supabase';
import { DatePicker } from './DatePicker';

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
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (isDeleting) return; // Prevent multiple clicks
    
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
        <div className="flex space-x-3">
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className={`flex-1 py-2 px-4 rounded-lg transition-all font-medium ${
              isDeleting
                ? 'bg-red-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
            } text-white`}
          >
            {isDeleting ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Deleting...</span>
              </div>
            ) : (
              'Yes'
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className={`flex-1 py-2 px-4 rounded-lg transition-all font-medium ${
              isDeleting
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
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
  type EditLeadForm = {
    accountNumber: string;
    url: string | null;
    propertyTypes: ('MFH' | 'MF' | 'SFH' | 'Commercial')[];
    unitCount: number | null;
    comments: string[];
    assignedTo: string;
    date: Date;
  };

  const [formData, setFormData] = useState<EditLeadForm>({
    accountNumber: '',
    url: null,
    propertyTypes: [] as ('MFH' | 'MF' | 'SFH' | 'Commercial')[],
    unitCount: null,
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

  const isRLBR = useMemo(() => {
    return replacementState.byLeadId[editingLead.id] && !!replacementState.byLeadId[editingLead.id].replacedByLeadId;
}, [replacementState, editingLead.id]);

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
  // Best-effort position lookup to mirror LeadModal's numbering.
  // Scans common rotation arrays if present; returns 1-based index or null.
  const getRepPositionInRotation = (repId: string): number | null => {
    const rs: any = rotationState as any;
    const candidateLists: any[] = [];
   // Try several likely shapes/names without breaking types
    if (Array.isArray(rs.fullUpcomingRotation)) candidateLists.push(rs.fullUpcomingRotation);
    if (Array.isArray(rs.upcomingFullRotation)) candidateLists.push(rs.upcomingFullRotation);
    if (Array.isArray(rs.trueRotation)) candidateLists.push(rs.trueRotation);
    if (Array.isArray(rs.order)) candidateLists.push(rs.order);
    if (rs?.sub1k?.fullUpcoming && Array.isArray(rs.sub1k.fullUpcoming)) candidateLists.push(rs.sub1k.fullUpcoming);
    if (rs?.k1plus?.fullUpcoming && Array.isArray(rs.k1plus.fullUpcoming)) candidateLists.push(rs.k1plus.fullUpcoming);

    for (const list of candidateLists) {
      const idx = list.findIndex((item: any) => {
        if (typeof item === 'string') return item === repId;
        if (item && typeof item === 'object') {
          return item.id === repId || item.repId === repId || item.rep_id === repId;
        }
        return false;
      });
      if (idx !== -1) return idx + 1;
    }
    return null;
  };

  

  
  // Initialize form with lead data
    useEffect(() => {
    setFormData({
      accountNumber: editingLead.accountNumber ?? '',
      url: editingLead.url ?? null,
      propertyTypes: editingLead.propertyTypes ?? [],
      unitCount: editingLead.unitCount ?? null,
      comments: editingLead.comments ?? [],
      assignedTo: editingLead.assignedTo ?? '',
      date: editingLead.date ? new Date(editingLead.date) : new Date(),
    });
  }, [editingLead]);

  // Replace the handleSubmit function in EditLeadModal.tsx with this fixed version:

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const oldAssignedTo = editingLead.assignedTo;

  if (!formData.accountNumber.trim()) {
    alert('Account number is required');
    return;
  }
  if (!formData.assignedTo) {
    alert('Sales rep assignment is required');
    return;
  }
  if (formData.unitCount !== null && formData.unitCount < 0) {
    alert('Unit count cannot be negative');
    return;
  }

  // Validation: If this is a replacement lead (LRL), ensure it matches unit tier
  if (isReplacementLead && originalLeadRecord && formData.unitCount !== null) {
    const currentMonthKey = `${editingLead.year}-${editingLead.month}`;
    const currentMonthLeads = monthlyData[currentMonthKey]?.leads || [];
    const originalLead = currentMonthLeads.find(l => l.id === originalLeadRecord.leadId);
    if (originalLead && originalLead.unitCount >= 1000 && formData.unitCount < 1000) {
      alert('Cannot change a 1K+ replacement lead to under 1000 units');
      return;
    }
  }

  // Validation: Block unit count changes that cross the 1000 threshold
  if (formData.unitCount !== null && formData.unitCount !== editingLead.unitCount) {
    const oldUnitCount = editingLead.unitCount ?? 0;
    const newUnitCount = formData.unitCount;
    const oldLane = oldUnitCount >= 1000 ? '1kplus' : 'sub1k';
    const newLane = newUnitCount >= 1000 ? '1kplus' : 'sub1k';
    
    if (oldLane !== newLane) {
      const direction = newUnitCount >= 1000 ? 'to 1000+' : 'below 1000';
      alert(
        `Cannot edit unit count across the 1000 threshold.\n\n` +
        `This lead is currently in the ${oldLane} lane (${oldUnitCount} units).\n` +
        `Changing it ${direction} would move it to the ${newLane} lane.\n\n` +
        `Please delete this lead and create a new one with the correct unit count.`
      );
      return;
    }
    
    if (newLane === 'sub1k' && newUnitCount >= 1000) {
      alert(
        `Unit count cannot be 1000 or higher for sub-1k leads.\n\n` +
        `Maximum unit count for editing: 999\n` +
        `Please delete and recreate with the correct unit count.`
      );
      return;
    }
    
    if (newLane === '1kplus' && newUnitCount < 1000) {
      alert(
        `Unit count cannot be below 1000 for 1k+ leads.\n\n` +
        `Minimum unit count for editing: 1000\n` +
        `Please delete and recreate with the correct unit count.`
      );
      return;
    }
  }

  // Validation: Block sales rep changes when editing
  if (formData.assignedTo !== editingLead.assignedTo) {
    const oldRepName = salesReps.find(r => r.id === editingLead.assignedTo)?.name || 'Unknown';
    const newRepName = salesReps.find(r => r.id === formData.assignedTo)?.name || 'Unknown';
    
    alert(
      `Cannot change the assigned sales rep when editing a lead.\n\n` +
      `Current rep: ${oldRepName}\n` +
      `Attempted change to: ${newRepName}\n\n` +
      `To assign this lead to a different rep, please delete it and create a new lead with the correct assignment.`
    );
    return;
  }

  // ✅ NEW: Helper function to check if actual lead data changed
  const hasLeadDataChanged = (): boolean => {
    // Compare account number
    if (formData.accountNumber.trim() !== (editingLead.accountNumber ?? '')) {
      return true;
    }
    
    // Compare URL (handle null/empty cases)
    const oldUrl = editingLead.url?.trim() || null;
    const newUrl = formData.url?.trim() || null;
    if (oldUrl !== newUrl) {
      return true;
    }
    
    // Compare property types (convert to sorted strings for comparison)
    const oldTypes = [...(editingLead.propertyTypes ?? [])].sort().join(',');
    const newTypes = [...formData.propertyTypes].sort().join(',');
    if (oldTypes !== newTypes) {
      return true;
    }
    
    // Compare unit count
    if (formData.unitCount !== editingLead.unitCount) {
      return true;
    }
    
    // Compare date (convert to same format for comparison)
    const oldDate = new Date(editingLead.date);
    const newDate = formData.date;
    if (
      oldDate.getFullYear() !== newDate.getFullYear() ||
      oldDate.getMonth() !== newDate.getMonth() ||
      oldDate.getDate() !== newDate.getDate()
    ) {
      return true;
    }
    
    // Compare comments (convert to strings for comparison)
    const oldComments = JSON.stringify(editingLead.comments ?? []);
    const newComments = JSON.stringify(formData.comments);
    if (oldComments !== newComments) {
      return true;
    }
    
    return false;
  };

  setIsSubmitting(true);
  try {
    // Apply replacement mark/unmark first if toggled
    if (markForReplacement && onMarkForReplacement) {
      await onMarkForReplacement(editingLead.id);
    } else if (unmarkFromReplacement && onUnmarkForReplacement) {
      await onUnmarkForReplacement(editingLead.id);
    }

    // ✅ FIXED: Only update the lead if actual data changed
    if (hasLeadDataChanged()) {
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

      // If assigned_to changed, update the replacement_marks table
      if (formData.assignedTo !== oldAssignedTo) {
        const { error: markUpdateError } = await supabase
          .from('replacement_marks')
          .update({ 
            rep_id: formData.assignedTo,
            updated_at: new Date().toISOString()
          })
          .eq('lead_id', editingLead.id);
        
        if (markUpdateError) {
          console.error('Failed to update replacement mark rep_id:', markUpdateError);
        } else {
          console.log(`Updated replacement mark rep_id from ${oldAssignedTo} to ${formData.assignedTo}`);
        }
      }
    }

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
                {!isMarkedForReplacement && !isRLBR && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300"
                  title="Delete Lead"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                )}
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
  {/* 1) Entry Type (disabled as LEAD) */}
  <div className="md:col-span-1">
    <label className="block text-sm font-bold text-gray-700 mb-3">Entry Type</label>
    <select
      value="lead"
      disabled
      className="w-full p-3 border-2 border-gray-300 rounded-xl bg-gray-100 text-gray-500 cursor-not-allowed"
    >
      <option value="lead">Lead</option>
    </select>
  </div>

  {/* 2) Replacement area (aligned with Entry Type) */}
  <div className="md:col-span-1">
    {/* Desktop-only spacer to match the Entry Type label height */}
    <div className="hidden md:block">
      <label className="block text-sm font-bold text-gray-700 mb-3 invisible">Entry Type</label>
    </div>

    {isReplacementLead && originalLeadRecord ? (
      <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50">
        <button
          type="button"
          onClick={() => setShowReplacementSummary(!showReplacementSummary)}
          className="flex items-center space-x-2 text-emerald-700 hover:text-emerald-800 font-medium"
        >
          <span>Lead it replaces:</span>
          <a
            href={(originalLeadRecord.url ?? '#')}
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
<p><strong>Date Created:</strong> {new Date(originalLeadRecord.markedAt).toLocaleDateString('en-US', { 
  month: 'short', 
  day: 'numeric', 
  year: 'numeric' 
})}</p>
            <p><strong>Account Number:</strong> {originalLeadRecord.accountNumber}</p>
            <p><strong>Sales Rep:</strong> {getSalesRepName(originalLeadRecord.repId)}</p>
            <p><strong>Status:</strong> {originalLeadRecord.replacedByLeadId ? 'Replaced' : 'Needs Replacement'}</p>
          </div>
        )}
      </div>
    ) : (
      <div className="space-y-3">
        {isMarkedForReplacement ? (
          <div className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50">
            <label className="flex items-center space-x-3 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                className="w-4 h-4 text-orange-600 bg-gray-100 border-2 border-orange-300 rounded focus:ring-orange-500 focus:ring-2"
                checked={unmarkFromReplacement}
                onChange={(e) => setUnmarkFromReplacement(e.target.checked)}
              />
              <span>Unmark from replacement queue</span>
            </label>
          </div>
        ) : (
          <div className="border-2 border-amber-200 rounded-xl p-4 bg-amber-50">
            <label className="flex items-center space-x-3 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                className="w-4 h-4 text-amber-600 bg-gray-100 border-2 border-amber-300 rounded focus:ring-amber-500 focus:ring-2"
                checked={markForReplacement}
                onChange={(e) => setMarkForReplacement(e.target.checked)}
              />
              <span>Mark in need of replacement</span>
            </label>
          </div>
        )}
      </div>
    )}
  </div>

  {/* 3) Account Number */}
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

  {/* 4) Property Types */}
  <div className="md:col-span-1">
    <label className="block text-sm font-bold text-gray-700 mb-3">Property Types</label>
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPropertyTypes(!showPropertyTypes)}
        className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 flex justify-between items-center"
      >
        <span className="text-gray-700 font-medium">
          {formData.propertyTypes.length > 0 ? formData.propertyTypes.join(', ') : 'Select property types...'}
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

  {/* 5) URL (required to match your LeadModal UX) */}
  <div className="md:col-span-1">
    <label className="block text-sm font-bold text-gray-700 mb-3">URL*</label>
    <input
      type="url"
      value={formData.url ?? ''}
      onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value || null }))}
      placeholder="Put LSManager Prospect account URL here"
      className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
      required
    />
  </div>

  {/* 6) Unit Count (nullable) */}
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
      placeholder="Leave blank if unknown"
      className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
      min="0"
    />
  </div>

  {/* 7) Assign Sales Rep */}
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
        const position = getRepPositionInRotation?.(rep.id);
        return (
          <option key={rep.id} value={rep.id}>
            {position ? `${position}. ` : ''}{rep.name} {rep.status === 'ooo' ? '(Out of Office)' : ''}
          </option>
        );
      })}
    </select>
  </div>

  <div className="md:col-span-1">
  <label className="block text-sm font-bold text-gray-700 mb-3">Date*</label>
  <DatePicker
    value={formData.date}
    onChange={(newDate) => setFormData(prev => ({ ...prev, date: newDate }))}
    minDate={new Date(2000, 0, 1)}
    maxDate={new Date(2099, 11, 31)}
  />
</div>

  {/* 9) Comments (FULL WIDTH) */}
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
          onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
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

  {/* 10) Actions (FULL WIDTH) */}
  <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-200">
    <button
      type="button"
      onClick={onClose}
      className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-medium"
      disabled={isSubmitting}
    >
      Cancel
    </button>

    {isReplacementLead && onUnreplaceAndCreateNew && (
      <button
        type="button"
        onClick={handleUnreplaceAndAdd}
        className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium disabled:opacity-50"
        disabled={isSubmitting}
      >
        UnReplace & Add
      </button>
    )}

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
        title="Are you sure you want to delete this lead?"
      />
    </>
  );
};

export default EditLeadModal;