import { supabase } from '../lib/supabase'
import { logAction } from './actionTracker'
import { ReplacementService } from './replacementService'
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
  const id = input.id ?? `lead_${Date.now()}`
  const newLead: Lead = { ...input, id }
  
  const { data, error } = await supabase
    .from('leads')
    .insert(leadToRow(newLead))
    .select()
    .single()
  
  if (error) throw error
  
  const created = rowToLead(data as DBLeadRow)
  
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
  
    // Never allow id to be updated in the payload
  const payload = { ...leadToRow(patch as Lead) } as any;
  delete payload.id;
  const { data, error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  
  const updated = rowToLead(data as DBLeadRow)
  
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

/** ENHANCED DELETE with replacement cascade handling */
export async function deleteLeadWithReplacementHandling(leadId: string): Promise<void> {
  console.log(`Starting enhanced deletion for lead: ${leadId}`)
  
  try {
    // Step 1: Check if this lead is a replacement for another lead
    const { data: isReplacementData, error: isReplacementError } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('replaced_by_lead_id', leadId)
      .maybeSingle()
    
    if (isReplacementError) throw isReplacementError
    
    if (isReplacementData) {
      console.log(`Lead ${leadId} is a replacement lead, reopening original mark: ${isReplacementData.lead_id}`)
      // This lead replaced another - reopen the original mark
      await ReplacementService.undoReplacement(isReplacementData.id)
    }
    
    // Step 2: Check if this lead has a replacement
    const { data: hasReplacementData, error: hasReplacementError } = await supabase
      .from('replacement_marks')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle()
    
    if (hasReplacementError) throw hasReplacementError
    
    if (hasReplacementData && hasReplacementData.replaced_by_lead_id) {
      console.log(`Lead ${leadId} has replacement ${hasReplacementData.replaced_by_lead_id}, deleting replacement first`)
      // This lead has a replacement - delete replacement first (recursive call)
      await deleteLeadWithReplacementHandling(hasReplacementData.replaced_by_lead_id)
    }
    
    // Step 3: Remove any replacement marks for this lead
    if (hasReplacementData) {
      console.log(`Removing replacement mark for lead: ${leadId}`)
      await ReplacementService.deleteReplacementMark(hasReplacementData.id)
    }
    
    // Step 4: Get old data for logging before deletion
    const { data: oldData } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()
    
    // Step 5: Finally delete the lead itself
    console.log(`Deleting lead from database: ${leadId}`)
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
    
    if (deleteError) throw deleteError
    
    // Step 6: Log the deletion
    if (oldData) {
      await logAction({
        actionType: 'DELETE',
        tableName: 'leads',
        recordId: leadId,
        oldData: rowToLead(oldData as DBLeadRow)
      })
    }
    
    console.log(`Successfully deleted lead with replacement handling: ${leadId}`)
    
  } catch (error) {
    console.error(`Error in enhanced lead deletion for ${leadId}:`, error)
    throw error
  }
}

/** Helper function to check if a lead can be safely deleted */
export async function checkLeadDeletionStatus(leadId: string): Promise<{
  canDelete: boolean
  isReplacement: boolean
  hasReplacement: boolean
  replacementLeadId?: string
  originalLeadId?: string
  warningMessage?: string
}> {
  try {
    // Check if this lead is a replacement
    const { data: isReplacementData } = await supabase
      .from('replacement_marks')
      .select('lead_id')
      .eq('replaced_by_lead_id', leadId)
      .maybeSingle()
    
    // Check if this lead has a replacement
    const { data: hasReplacementData } = await supabase
      .from('replacement_marks')
      .select('replaced_by_lead_id')
      .eq('lead_id', leadId)
      .maybeSingle()
    
    const isReplacement = Boolean(isReplacementData)
    const hasReplacement = Boolean(hasReplacementData?.replaced_by_lead_id)
    
    let warningMessage: string | undefined
    
    if (isReplacement && hasReplacement) {
      warningMessage = 'This lead is both a replacement and has its own replacement. Deletion will cascade through the chain.'
    } else if (isReplacement) {
      warningMessage = 'This lead is replacing another lead. Deletion will reopen the original replacement request.'
    } else if (hasReplacement) {
      warningMessage = 'This lead has a replacement. Deletion will also remove the replacement lead.'
    }
    
    return {
      canDelete: true, // Enhanced deletion can always handle it
      isReplacement,
      hasReplacement,
      replacementLeadId: hasReplacementData?.replaced_by_lead_id,
      originalLeadId: isReplacementData?.lead_id,
      warningMessage
    }
  } catch (error) {
    console.error('Error checking lead deletion status:', error)
    return {
      canDelete: false,
      isReplacement: false,
      hasReplacement: false,
      warningMessage: 'Error checking deletion status'
    }
  }
}

/** DELETE many leads by ids with replacement handling */
export async function deleteLeadsWithReplacementHandling(ids: string[]): Promise<void> {
  if (!ids.length) return
  
  console.log(`Starting batch deletion with replacement handling for ${ids.length} leads`)
  
  // Process each lead individually to handle replacement logic
  for (const id of ids) {
    await deleteLeadWithReplacementHandling(id)
  }
  
  console.log(`Completed batch deletion with replacement handling`)
}

/** Simple DELETE functions (legacy - for backwards compatibility) */
export async function deleteLeads(ids: string[]): Promise<void> {
  console.warn('Using legacy deleteLeads function - consider using deleteLeadsWithReplacementHandling for better replacement support')
  
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

/** Simple DELETE one lead by id (legacy - for backwards compatibility) */
export async function deleteLead(id: string): Promise<void> {
  console.warn('Using legacy deleteLead function - consider using deleteLeadWithReplacementHandling for better replacement support')
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