import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { PropertyType } from '../services/propertyTypesService';

interface PropertyTypeModalProps {
  onClose: () => void;
  onSave: (abbreviation: string, description: string) => Promise<void>;
  editingPropertyType?: PropertyType | null;
}

const PropertyTypeModal: React.FC<PropertyTypeModalProps> = ({
  onClose,
  onSave,
  editingPropertyType,
}) => {
  const [abbreviation, setAbbreviation] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingPropertyType) {
      setAbbreviation(editingPropertyType.abbreviation);
      setDescription(editingPropertyType.description);
    }
  }, [editingPropertyType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!abbreviation.trim()) {
      setError('Abbreviation is required');
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    // Abbreviation should be uppercase and no spaces
    const cleanAbbreviation = abbreviation.trim().toUpperCase().replace(/\s+/g, '');
    
    if (cleanAbbreviation !== abbreviation.trim()) {
      setError('Abbreviation must be uppercase with no spaces');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(cleanAbbreviation, description.trim());
      onClose();
    } catch (err) {
      console.error('Error saving property type:', err);
      setError(err instanceof Error ? err.message : 'Failed to save property type');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 rounded-t-2xl flex justify-between items-center">
          <h2 className="text-2xl font-bold">
            {editingPropertyType ? 'Edit Property Type' : 'Add New Property Type'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-700 rounded-full p-2 transition-colors"
            disabled={isSubmitting}
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Abbreviation Input */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Abbreviation *
            </label>
            <input
              type="text"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
              placeholder="e.g., MFH, SFH, COM"
              className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50 uppercase"
              required
              disabled={isSubmitting || !!editingPropertyType}
              maxLength={20}
            />
            <p className="text-xs text-gray-500 mt-1">
              Short code for the property type (uppercase, no spaces)
            </p>
          </div>

          {/* Description Input */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Multi-Family Housing"
              className="w-full p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-blue-50"
              required
              disabled={isSubmitting}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">
              Full name or description of the property type
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Saving...</span>
                </div>
              ) : editingPropertyType ? (
                'Update Property Type'
              ) : (
                'Add Property Type'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                isSubmitting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
              }`}
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Info Section */}
        <div className="px-6 pb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2 text-sm">Note:</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Property types will appear in dropdowns and the parameters table</li>
              <li>• Abbreviations must be unique and cannot be changed once created</li>
              <li>• Existing leads/reps will not be automatically updated</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyTypeModal;