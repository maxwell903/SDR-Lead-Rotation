import { useState, useEffect } from 'react';
import {
  listPropertyTypes,
  listAllPropertyTypes,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  reorderPropertyTypes,
  PropertyType,
} from '../services/propertyTypesService';

export const usePropertyTypes = (includeInactive = false) => {
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPropertyTypes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = includeInactive
        ? await listAllPropertyTypes()
        : await listPropertyTypes();
      setPropertyTypes(data);
    } catch (err) {
      console.error('Error fetching property types:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch property types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPropertyTypes();
  }, [includeInactive]);

  const addPropertyType = async (abbreviation: string, description: string) => {
    try {
      const newPropertyType = await createPropertyType(abbreviation, description);
      setPropertyTypes(prev => [...prev, newPropertyType].sort((a, b) => a.displayOrder - b.displayOrder));
      return newPropertyType;
    } catch (err) {
      console.error('Error creating property type:', err);
      throw err;
    }
  };

  const updatePropertyTypeData = async (id: string, updates: Partial<PropertyType>) => {
    try {
      const updated = await updatePropertyType(id, updates);
      setPropertyTypes(prev =>
        prev.map(pt => (pt.id === id ? updated : pt))
      );
      return updated;
    } catch (err) {
      console.error('Error updating property type:', err);
      throw err;
    }
  };

  const removePropertyType = async (id: string) => {
    try {
      await deletePropertyType(id);
      setPropertyTypes(prev => prev.filter(pt => pt.id !== id));
    } catch (err) {
      console.error('Error deleting property type:', err);
      throw err;
    }
  };

  const reorder = async (orderedIds: string[]) => {
    try {
      await reorderPropertyTypes(orderedIds);
      // Re-fetch to get the updated order
      await fetchPropertyTypes();
    } catch (err) {
      console.error('Error reordering property types:', err);
      throw err;
    }
  };

  return {
    propertyTypes,
    loading,
    error,
    addPropertyType,
    updatePropertyType: updatePropertyTypeData,
    removePropertyType,
    reorderPropertyTypes: reorder,
    refreshPropertyTypes: fetchPropertyTypes,
  };
};