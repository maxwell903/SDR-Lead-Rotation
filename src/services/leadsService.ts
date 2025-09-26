import { supabase } from '../lib/supabase'
import { logAction } from './actionTracker'
import type { Lead } from '../types'

// DB row shape (snake_case from your schema)
type DBLeadRow = {
  id: string
  account_number: string | null
  url: string | null
  property_types: string[] | null
  unit_count: number | null
  assigned_to: string | null
  date: string | null
  comments: string[] | null
  month: number | null
  year: number | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

// Convert DB row to frontend Lead type
const rowToLead = (r: DBLeadRow): Lead => ({
  id: r.id,
  accountNumber: r.account_number ?? '',
  url: r.url ?? '',
  propertyTypes: (r.property_types ?? []) as Lead['propertyTypes'],
  unitCount: r.unit_count ?? 0,
  assignedTo: r.assigned_to ?? '',
  date: r.date ? new Date(r.date) : new Date(),
  comments: r.comments ?? [],
  month: r.month ?? new Date().getMonth() + 1,
  year: r.year ?? new Date().getFullYear(),
})

// Convert frontend Lead to DB row
const leadToRow = (lead: Lead): Partial<DBLeadRow> => ({
  id: lead.id,
  account_number: lead.accountNumber,
  url: lead.url,
  property_types: lead.propertyTypes,
  unit_count: lead.unitCount,
  assigned_to: lead.assignedTo,
  date: lead.date?.toISOString(),
  comments: lead.comments,
  month: lead.month,
  year: lead.year,
})

/** READ all leads */
export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return (data as DBLeadRow[] | null)?.map(rowToLead) ?? []
}

/** CREATE one lead */
export async function createLead(
  input: Omit<Lead, 'id'> & { id?: string }
): Promise<Lead> {
  const id = input.id ?? `lead_${Date.now()}_${Math.random().toString(36).substring(2)}`
  const leadData = { ...input, id } as Lead
  const toInsert = leadToRow(leadData)

  const { data, error } = await supabase
    .from('leads')
    .insert(toInsert)
    .select()
    .single()
  
  if (error) throw error
  
  const created = rowToLead(data as DBLeadRow)
  
  // Log the action
  await logAction({
    actionType: 'CREATE',
    tableName: 'leads',
    recordId: created.id,
    newData: created
  })
  
  return created
}

/** UPDATE one lead by id */
export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
  // Get old data for logging
  const { data: oldData } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  
  const rowPatch = leadToRow({ ...patch, id } as Lead)
  
  const { data, error } = await supabase
    .from('leads')
    .update(rowPatch)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  
  const updated = rowToLead(data as DBLeadRow)
  
  // Log the action
  await logAction({
    actionType: 'UPDATE',
    tableName: 'leads',
    recordId: id,
    oldData: oldData ? rowToLead(oldData as DBLeadRow) : null,
    newData: updated
  })
  
  return updated
}

/** UPSERT many leads (insert/update by id) */
export async function upsertLeads(leads: Lead[]): Promise<Lead[]> {
  if (!leads.length) return []
  
  const payload = leads.map(leadToRow)
  const { data, error } = await supabase
    .from('leads')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
  
  if (error) throw error
  
  const upserted = (data as DBLeadRow[] | null)?.map(rowToLead) ?? []
  
  // Log actions for each lead
  for (const lead of upserted) {
    await logAction({
      actionType: 'UPDATE', // Upsert is treated as update
      tableName: 'leads',
      recordId: lead.id,
      newData: lead
    })
  }
  
  return upserted
}

/** DELETE many leads by ids */
export async function deleteLeads(ids: string[]): Promise<void> {
  if (!ids.length) return
  
  // Get old data for logging
  const { data: oldData } = await supabase
    .from('leads')
    .select('*')
    .in('id', ids)
  
  const { error } = await supabase
    .from('leads')
    .delete()
    .in('id', ids)
  
  if (error) throw error
  
  // Log deletion actions
  if (oldData) {
    for (const row of oldData) {
      await logAction({
        actionType: 'DELETE',
        tableName: 'leads',
        recordId: row.id,
        oldData: rowToLead(row as DBLeadRow)
      })
    }
  }
}

/** DELETE one lead by id */
export async function deleteLead(id: string): Promise<void> {
  await deleteLeads([id])
}

/** Realtime subscription */
export function subscribeLeads(onChange: () => void): () => void {
  const channel = supabase
    .channel('leads_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, onChange)
    .subscribe()

  // Cleanup must be synchronous for React
  return () => {
    void supabase.removeChannel(channel) // fire and forget
  }
}