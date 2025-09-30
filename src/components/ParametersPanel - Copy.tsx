import React, { useState, useEffect } from 'react';
import { SalesRep } from '../types';

interface ParametersPanelProps {
  salesReps: SalesRep[];
  onUpdateReps: (reps: SalesRep[]) => void;
  onClose: () => void;
}

const ParametersPanel: React.FC<ParametersPanelProps> = ({ 
  salesReps, 
  onUpdateReps, 
  onClose 
}) => {
  const [reps, setReps] = useState(salesReps);

  // Update over1kOrder when canHandle1kPlus changes
  useEffect(() => {
    const updatedReps = reps.map(rep => {
      if (!rep.parameters.canHandle1kPlus) {
        return { ...rep, over1kOrder: undefined };
      } else if (rep.parameters.canHandle1kPlus && rep.over1kOrder === undefined) {
        // Assign next available over1kOrder
        const existingOrders = reps
          .filter(r => r.parameters.canHandle1kPlus && r.over1kOrder !== undefined)
          .map(r => r.over1kOrder!)
          .sort((a, b) => a - b);
        
        let nextOrder = 1;
        for (const order of existingOrders) {
          if (order === nextOrder) {
            nextOrder++;
          } else {
            break;
          }
        }
        
        return { ...rep, over1kOrder: nextOrder };
      }
      return rep;
    });
    
    setReps(updatedReps);
  }, [reps.map(r => r.parameters.canHandle1kPlus).join('')]);

  const handleParameterChange = (repId: string, parameter: string, value: any) => {
    setReps(prev => prev.map(rep => 
      rep.id === repId 
        ? { ...rep, parameters: { ...rep.parameters, [parameter]: value } }
        : rep
    ));
  };

  const handlePropertyTypeChange = (repId: string, propertyType: string) => {
    setReps(prev => prev.map(rep => {
      if (rep.id === repId) {
        const currentTypes = rep.parameters.propertyTypes;
        const newTypes = currentTypes.includes(propertyType as any)
          ? currentTypes.filter(t => t !== propertyType)
          : [...currentTypes, propertyType as any];
        return { ...rep, parameters: { ...rep.parameters, propertyTypes: newTypes } };
      }
      return rep;
    }));
  };

  const handleSave = () => {
    // Reorder over1k orders to be sequential
    const over1kReps = reps
      .filter(rep => rep.parameters.canHandle1kPlus)
      .sort((a, b) => (a.over1kOrder || 0) - (b.over1kOrder || 0));
    
    const finalReps = reps.map(rep => {
      if (rep.parameters.canHandle1kPlus) {
        const index = over1kReps.findIndex(r => r.id === rep.id);
        return { ...rep, over1kOrder: index + 1 };
      }
      return rep;
    });
    
    onUpdateReps(finalReps);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Sales Rep Parameters</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium">Rep Name</th>
                <th className="text-center p-3 font-medium">MFH</th>
                <th className="text-center p-3 font-medium">MF</th>
                <th className="text-center p-3 font-medium">SFH</th>
                <th className="text-center p-3 font-medium">Commercial</th>
                <th className="text-center p-3 font-medium">Max Units</th>
                <th className="text-center p-3 font-medium">1K+ Capable</th>
                <th className="text-center p-3 font-medium">Sub 1K Order</th>
                <th className="text-center p-3 font-medium">1K+ Order</th>
              </tr>
            </thead>
            <tbody>
              {reps
                .filter(rep => rep.status === 'active')
                .sort((a, b) => a.sub1kOrder - b.sub1kOrder)
                .map(rep => (
                <tr key={rep.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{rep.name}</td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={rep.parameters.propertyTypes.includes('MFH')}
                      onChange={() => handlePropertyTypeChange(rep.id, 'MFH')}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={rep.parameters.propertyTypes.includes('MF')}
                      onChange={() => handlePropertyTypeChange(rep.id, 'MF')}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={rep.parameters.propertyTypes.includes('SFH')}
                      onChange={() => handlePropertyTypeChange(rep.id, 'SFH')}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={rep.parameters.propertyTypes.includes('Commercial')}
                      onChange={() => handlePropertyTypeChange(rep.id, 'Commercial')}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={rep.parameters.maxUnits || ''}
                      onChange={(e) => handleParameterChange(rep.id, 'maxUnits', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-24 p-2 border rounded text-center"
                      placeholder="No limit"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={rep.parameters.canHandle1kPlus}
                      onChange={(e) => handleParameterChange(rep.id, 'canHandle1kPlus', e.target.checked)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {rep.sub1kOrder}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {rep.parameters.canHandle1kPlus ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        {rep.over1kOrder}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Parameter Guide:</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li><strong>Property Types:</strong> Select which property types this rep can handle</li>
            <li><strong>Max Units:</strong> Maximum number of units for properties this rep can handle (leave empty for no limit)</li>
            <li><strong>1K+ Capable:</strong> Whether this rep can handle properties with 1000+ units</li>
            <li><strong>Sub 1K Order:</strong> Position in the sub-1K rotation (managed in Rep Manager)</li>
            <li><strong>1K+ Order:</strong> Position in the 1K+ rotation (auto-assigned when 1K+ capable is enabled)</li>
          </ul>
        </div>

        <div className="flex space-x-3 pt-6">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
          >
            Save Parameters
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
  );
};

export default ParametersPanel;