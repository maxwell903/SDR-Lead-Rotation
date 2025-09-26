import React, { useState } from 'react';
import { GripVertical, Edit2, Save, X } from 'lucide-react';
import { SalesRep } from '../types';

interface SalesRepManagerProps {
  salesReps: SalesRep[];
  onUpdateReps: (reps: SalesRep[]) => void;
  onClose: () => void;
}

const SalesRepManager: React.FC<SalesRepManagerProps> = ({ 
  salesReps, 
  onUpdateReps, 
  onClose 
}) => {
  const [reps, setReps] = useState(salesReps);
  const [newRepName, setNewRepName] = useState('');
  const [rotationType, setRotationType] = useState<'sub1k' | '1kplus'>('sub1k');
  const [editingRep, setEditingRep] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const getFilteredReps = () => {
    if (rotationType === 'sub1k') {
      return reps.filter(rep => rep.status === 'active').sort((a, b) => a.sub1kOrder - b.sub1kOrder);
    } else {
      return reps
        .filter(rep => rep.status === 'active' && rep.parameters.canHandle1kPlus)
        .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));
    }
  };

  const handleAddRep = () => {
    if (newRepName.trim()) {
      const maxSub1kOrder = Math.max(...reps.map(r => r.sub1kOrder), 0);
      const maxOver1kOrder = Math.max(...reps.filter(r => r.over1kOrder).map(r => r.over1kOrder!), 0);
      
      const newRep: SalesRep = {
        id: Date.now().toString(),
        name: newRepName.trim(),
        parameters: {
          propertyTypes: ['MFH'],
          maxUnits: null,
          canHandle1kPlus: false
        },
        rotationOrder: reps.length + 1,
        sub1kOrder: maxSub1kOrder + 1,
        over1kOrder: undefined,
        status: 'active'
      };
      setReps(prev => [...prev, newRep]);
      setNewRepName('');
    }
  };

  const handleDeleteRep = (repId: string) => {
    const updatedReps = reps.filter(rep => rep.id !== repId);
    // Reorder remaining reps
    const filteredReps = getFilteredReps().filter(rep => rep.id !== repId);
    
    if (rotationType === 'sub1k') {
      filteredReps.forEach((rep, index) => {
        const repIndex = updatedReps.findIndex(r => r.id === rep.id);
        if (repIndex !== -1) {
          updatedReps[repIndex].sub1kOrder = index + 1;
        }
      });
    } else {
      filteredReps.forEach((rep, index) => {
        const repIndex = updatedReps.findIndex(r => r.id === rep.id);
        if (repIndex !== -1) {
          updatedReps[repIndex].over1kOrder = index + 1;
        }
      });
    }
    
    setReps(updatedReps);
  };

  const handleEditStart = (rep: SalesRep) => {
    setEditingRep(rep.id);
    setEditName(rep.name);
  };

  const handleEditSave = (repId: string) => {
    setReps(prev => prev.map(rep => 
      rep.id === repId ? { ...rep, name: editName.trim() } : rep
    ));
    setEditingRep(null);
    setEditName('');
  };

  const handleEditCancel = () => {
    setEditingRep(null);
    setEditName('');
  };

  const handleDragStart = (e: React.DragEvent, repId: string) => {
    setDraggedItem(repId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetRepId: string) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetRepId) {
      setDraggedItem(null);
      return;
    }

    const filteredReps = getFilteredReps();
    const draggedIndex = filteredReps.findIndex(rep => rep.id === draggedItem);
    const targetIndex = filteredReps.findIndex(rep => rep.id === targetRepId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Create new order
    const newOrder = [...filteredReps];
    const [draggedRep] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedRep);

    // Update the order in the reps array
    const updatedReps = [...reps];
    newOrder.forEach((rep, index) => {
      const repIndex = updatedReps.findIndex(r => r.id === rep.id);
      if (repIndex !== -1) {
        if (rotationType === 'sub1k') {
          updatedReps[repIndex].sub1kOrder = index + 1;
        } else {
          updatedReps[repIndex].over1kOrder = index + 1;
        }
      }
    });

    setReps(updatedReps);
    setDraggedItem(null);
  };

  const handleSave = () => {
    onUpdateReps(reps);
    onClose();
  };

  const filteredReps = getFilteredReps();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Manage Sales Representatives</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Add new rep */}
          <div className="flex space-x-2">
            <input
              type="text"
              value={newRepName}
              onChange={(e) => setNewRepName(e.target.value)}
              placeholder="Enter rep name..."
              className="flex-1 p-2 border rounded-lg"
            />
            <button
              onClick={handleAddRep}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Add Rep
            </button>
          </div>

          {/* Rotation type toggle */}
          <div className="flex space-x-4">
            <button
              onClick={() => setRotationType('sub1k')}
              className={`px-4 py-2 rounded-lg ${
                rotationType === 'sub1k' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Sub 1K Rotation Order
            </button>
            <button
              onClick={() => setRotationType('1kplus')}
              className={`px-4 py-2 rounded-lg ${
                rotationType === '1kplus' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              1K+ Rotation Order
            </button>
          </div>

          {/* Reorderable list */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700">
              {rotationType === 'sub1k' ? 'Sub 1K' : '1K+'} Rotation Order (Drag to reorder)
            </h4>
            <div className="space-y-2">
              {filteredReps.map((rep, index) => (
                <div
                  key={rep.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, rep.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, rep.id)}
                  className={`flex items-center justify-between bg-gray-50 p-3 rounded-lg cursor-move hover:bg-gray-100 ${
                    draggedItem === rep.id ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-600">#{index + 1}</span>
                    
                    {editingRep === rep.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2 py-1 border rounded text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditSave(rep.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{rep.name}</span>
                        <button
                          onClick={() => handleEditStart(rep)}
                          className="text-gray-400 hover:text-blue-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className="text-sm text-gray-600">
                      Status: {rep.status} 
                      {rotationType === '1kplus' && !rep.parameters.canHandle1kPlus && (
                        <span className="text-red-500 ml-2">(Not 1K+ capable)</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteRep(rep.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {rotationType === '1kplus' && (
            <div className="bg-yellow-50 p-3 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Only reps with "1K+ capable" parameter enabled appear in the 1K+ rotation. 
                Update parameters in the Parameters panel to include more reps.
              </p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
            >
              Save Changes
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesRepManager;