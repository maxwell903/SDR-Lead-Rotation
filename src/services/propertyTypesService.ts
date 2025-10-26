import { supabase } from '../lib/supabase';

export interface PropertyType {
  id: string;
  abbreviation: string;
  description: string;
  isActive: boolean;
  displayOrder: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Database row type (snake_case from DB)
type DBPropertyTypeRow = {
  id: string;
  abbreviation: string;
  description: string;
  is_active: boolean;
  display_order: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

// Convert DB row to PropertyType
const rowToPropertyType = (row: DBPropertyTypeRow): PropertyType => ({
  id: row.id,
  abbreviation: row.abbreviation,
  description: row.description,
  isActive: row.is_active,
  displayOrder: row.display_order,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Convert PropertyType to DB row
const propertyTypeToRow = (pt: Partial<PropertyType>): Partial<DBPropertyTypeRow> => ({
  abbreviation: pt.abbreviation,
  description: pt.description,
  is_active: pt.isActive,
  display_order: pt.displayOrder,
});

/**
 * Fetch all property types
 */
export async function listPropertyTypes(): Promise<PropertyType[]> {
  const { data, error } = await supabase
    .from('property_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching property types:', error);
    throw error;
  }

  return (data as DBPropertyTypeRow[] | null)?.map(rowToPropertyType) ?? [];
}

/**
 * Fetch all property types including inactive ones
 */
export async function listAllPropertyTypes(): Promise<PropertyType[]> {
  const { data, error } = await supabase
    .from('property_types')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching all property types:', error);
    throw error;
  }

  return (data as DBPropertyTypeRow[] | null)?.map(rowToPropertyType) ?? [];
}

/**
 * Create a new property type
 */
export async function createPropertyType(
  abbreviation: string,
  description: string
): Promise<PropertyType> {
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();

  // Get the max display order
  const { data: maxOrderData } = await supabase
    .from('property_types')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrderData?.display_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('property_types')
    .insert({
      abbreviation,
      description,
      display_order: nextOrder,
      created_by: user?.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating property type:', error);
    throw error;
  }

  const newPropertyType = rowToPropertyType(data as DBPropertyTypeRow);
  return newPropertyType;
}

/**
 * Update a property type
 */
export async function updatePropertyType(
  id: string,
  updates: Partial<PropertyType>
): Promise<PropertyType> {
  const { data, error } = await supabase
    .from('property_types')
    .update(propertyTypeToRow(updates))
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating property type:', error);
    throw error;
  }

  const updatedPropertyType = rowToPropertyType(data as DBPropertyTypeRow);
  return updatedPropertyType;
}

/**
 * Delete (soft delete by setting is_active to false) a property type
 */
export async function deletePropertyType(id: string): Promise<void> {
  const { error } = await supabase
    .from('property_types')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting property type:', error);
    throw error;
  }
}

/**
 * Reorder property types
 */
export async function reorderPropertyTypes(
  orderedIds: string[]
): Promise<void> {
  // Update each property type with its new display order
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('property_types')
      .update({ display_order: index + 1 })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter(r => r.error);

  if (errors.length > 0) {
    console.error('Error reordering property types:', errors);
    throw errors[0].error;
  }
}