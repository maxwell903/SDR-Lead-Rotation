// src/services/actionsService.ts
import { supabase } from '../lib/supabase'

export async function logAction(
  actionType: 'create' | 'update' | 'delete',
  tableName: string,
  recordId: string,
  oldData?: any,
  newData?: any
) {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    
    // Insert action log
    const { error } = await supabase.from('actions').insert({
      user_id: user?.id,
      action_type: actionType,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData || null,
      new_data: newData || null
    })
    
    if (error) {
      console.error('Error logging action:', error)
      // Don't throw - we don't want action logging to break the main operation
    }
  } catch (err) {
    console.error('Error logging action:', err)
    // Don't throw - we don't want action logging to break the main operation
  }
}