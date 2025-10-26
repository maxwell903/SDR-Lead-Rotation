import React, { useState } from 'react';
import { Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import { usePropertyTypes } from '../hooks/usePropertyTypes';
import PropertyTypeModal from './Propertytypemodal';
import { PropertyType } from '../services/propertyTypesService';

interface PropertyTypesManagerProps {
  onClose?: () => void;
}

const PropertyTypesManager: React.FC<PropertyTypesManagerProps> = ({ onClose }) => {
  const {
    propertyTypes,
    loading,
    error,
    addPropertyType,
    updatePropertyType,
    removePropertyType,
  } = usePropertyTypes();

  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<PropertyType | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddNew = () => {
    setEditingType(null);
    setShowModal(true);
  };

  const handleEdit = (propertyType: PropertyType) => {
    setEditingType(propertyType);
    setShowModal(true);
  };

  const handleSave = async (abbreviation: string, description: string) => {
    if (editingType) {
      await updatePropertyType(editingType.id, { description });
    } else {
      await addPropertyType(abbreviation, description);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this property type? This action cannot be undone.')) {
      setDeletingId(id);
      try {
        await removePropertyType(id);
      } catch (err) {
        console.error('Error deleting property type:', err);
        alert('Failed to delete property type. It may be in use.');
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Property Types Management</h3>
          <p className="text-sm text-gray-500 mt-1">
            Add, edit, or remove property types used throughout the system
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add Property Type</span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Property Types List */}
      <div className="space-y-2">
        {propertyTypes.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500 font-medium">No property types found</p>
            <p className="text-gray-400 text-sm mt-1">Click "Add Property Type" to create one</p>
          </div>
        ) : (
          propertyTypes.map((propertyType, index) => (
            <div
              key={propertyType.id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-4 flex-1">
                {/* Drag Handle (for future reordering functionality) */}
                <div className="text-gray-400 cursor-move">
                  <GripVertical size={20} />
                </div>

                {/* Order Badge */}
                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full text-sm font-bold">
                  {index + 1}
                </div>

                {/* Property Type Info */}
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-gray-900 text-lg">
                      {propertyType.abbreviation}
                    </span>
                    <span className="text-gray-500">—</span>
                    <span className="text-gray-700">{propertyType.description}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleEdit(propertyType)}
                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Edit property type"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => handleDelete(propertyType.id)}
                  disabled={deletingId === propertyType.id}
                  className={`p-2 rounded-lg transition-colors ${
                    deletingId === propertyType.id
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-red-600 hover:bg-red-100'
                  }`}
                  title="Delete property type"
                >
                  {deletingId === propertyType.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></div>
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2 text-sm">Important Notes:</h4>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• Property types are used in lead assignments and sales rep parameters</li>
          <li>• Deleting a property type will hide it from new entries</li>
          <li>• Existing leads and rep parameters with deleted types will remain unchanged</li>
          <li>• Abbreviations cannot be changed once created</li>
          <li>• Changes take effect immediately across the application</li>
        </ul>
      </div>

      {/* Close Button (if needed) */}
      {onClose && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PropertyTypeModal
          onClose={() => {
            setShowModal(false);
            setEditingType(null);
          }}
          onSave={handleSave}
          editingPropertyType={editingType}
        />
      )}
    </div>
  );
};

export default PropertyTypesManager;