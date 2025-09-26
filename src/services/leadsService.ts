import { supabase } from '../lib/supabase'
import { logAction } from './actionsService'
import type { Lead } from '../types'

export async function createLead(lead: Omit<Lead, 'createdAt' | 'updatedAt'>): Promise<Lead> {
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, created_by: user?.id })
    .select()
    .single()
    
  if (error) throw error
  
  await logAction('create', 'leads', data.id, null, data)
  return data
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const { data: oldData } = await supabase.from('leads').select().eq('id', id).single()
  
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
    
  if (error) throw error
  
  await logAction('update', 'leads', id, oldData, data)
  return data
}

export async function deleteLead(id: string): Promise<void> {
  const { data: oldData } = await supabase.from('leads').select().eq('id', id).single()
  
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
  
  await logAction('delete', 'leads', id, oldData, null)
}

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}