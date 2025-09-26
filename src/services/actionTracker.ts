import { supabase } from '../lib/supabase'

export type ActionType = 
  | 'CREATE'
  | 'UPDATE' 
  | 'DELETE'
  | 'READ'

export type TableName = 
  | 'leads'
  | 'lead_entries' 
  | 'replacement_marks'
  | 'sales_reps'

/**
 * Generic action tracker - logs all user actions to the actions table
 */
export async function logAction({
  actionType,
  tableName,
  recordId,
  oldData = null,
  newData = null
}: {
  actionType: ActionType
  tableName: TableName
  recordId: string
  oldData?: any
  newData?: any
}) {
  try {
    const { data: user } = await supabase.auth.getUser()
    
    const { error } = await supabase
      .from('actions')
      .insert({
        user_id: user?.user?.id,
        action_type: actionType,
        table_name: tableName,
        record_id: recordId,
        old_data: oldData,
        new_data: newData
      })
    
    if (error) {
      console.error('Failed to log action:', error)
      // Don't throw - we don't want action logging to break the main operation
    }
  } catch (error) {
    console.error('Action logging error:', error)
  }
}