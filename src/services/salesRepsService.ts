import { supabase } from '../lib/supabase'
import type { SalesRep } from '../types'
import { logAuditAction } from './auditLogger'

// Allowed property types in your app's strict union
const ALLOWED_PROPERTY_TYPES = ['MFH', 'MF', 'SFH', 'Commercial'] as const
type PropertyType = typeof ALLOWED_PROPERTY_TYPES[number]

// Helper to coerce DB JSON into your strict Parameters shape
function normalizeParameters(input: any): SalesRep['parameters'] {
  const raw = input ?? {}
  const propertyTypesRaw = Array.isArray(raw.propertyTypes) ? raw.propertyTypes : []
  const propertyTypes = propertyTypesRaw.filter((p: any): p is PropertyType =>
    ALLOWED_PROPERTY_TYPES.includes(p)
  )
  const maxUnits =
    typeof raw.maxUnits === 'number' || raw.maxUnits === null ? raw.maxUnits : null
  const canHandle1kPlus = !!raw.canHandle1kPlus
  return { propertyTypes, maxUnits, canHandle1kPlus }
}

// DB row shape based on your SQL (snake_case)
type DBSalesRepRow = {
  id: string
  name: string | null
  parameters: any | null
  rotation_order: number | null
  sub1k_order: number | null
  over1k_order: number | null
  status: string | null
  updated_by: string | null
  updated_at: string | null
  cushion_sub1k: number | null
  cushion_1kplus: number | null
  cushion_sub1k_occurrences: number | null
  cushion_1kplus_occurrences: number | null
   cushion_sub1k_original: number | null
  cushion_1kplus_original: number | null
}

const rowToRep = (r: DBSalesRepRow): SalesRep => ({
  id: r.id,
  name: r.name ?? '',
  parameters: normalizeParameters(r.parameters),
  rotationOrder: r.rotation_order ?? 0,
  sub1kOrder: r.sub1k_order ?? 0,
  over1kOrder: r.over1k_order ?? undefined,
  status: (r.status as SalesRep['status']) ?? 'active',
  cushionSub1k: r.cushion_sub1k ?? 0,
  cushion1kPlus: r.cushion_1kplus ?? 0,
  cushionSub1kOccurrences: r.cushion_sub1k_occurrences ?? 0,
  cushion1kPlusOccurrences: r.cushion_1kplus_occurrences ?? 0,
   cushionSub1kOriginal: r.cushion_sub1k_original ?? 0,
  cushion1kPlusOriginal: r.cushion_1kplus_original ?? 0,
})

const repToRow = (rep: SalesRep): Partial<DBSalesRepRow> => ({
  id: rep.id,
  name: rep.name,
  parameters: rep.parameters,
  rotation_order: rep.rotationOrder ?? null,
  sub1k_order: rep.sub1kOrder ?? null,
  over1k_order: rep.over1kOrder ?? null,
  status: rep.status ?? 'active',
  cushion_sub1k: rep.cushionSub1k ?? 0,
  cushion_1kplus: rep.cushion1kPlus ?? 0,
  cushion_sub1k_occurrences: rep.cushionSub1kOccurrences ?? 0,
  cushion_1kplus_occurrences: rep.cushion1kPlusOccurrences ?? 0,
})

/** READ all reps */
export async function listSalesReps(): Promise<SalesRep[]> {
  const { data, error } = await supabase
    .from('sales_reps')
    .select('*')
    .order('sub1k_order', { ascending: true })
  if (error) throw error
  return (data as DBSalesRepRow[] | null)?.map(rowToRep) ?? []
}

/** CREATE one rep; auto-assigns next orders */
export async function createSalesRep(
  input: Pick<SalesRep, 'name' | 'parameters'> & Partial<SalesRep>
): Promise<SalesRep> {
  const existing = await listSalesReps()
  const nextSub1k = Math.max(0, ...existing.map(r => r.sub1kOrder ?? 0)) + 1
  const nextOver1k = input.parameters?.canHandle1kPlus
    ? Math.max(0, ...existing.filter(r => r.parameters.canHandle1kPlus).map(r => r.over1kOrder ?? 0)) + 1
    : null

  const id = input.id ?? `${Date.now()}`
  const toInsert: Partial<DBSalesRepRow> = repToRow({
    id,
    name: input.name ?? '',
    parameters: normalizeParameters(input.parameters),
    rotationOrder: input.rotationOrder ?? nextSub1k,
    sub1kOrder: input.sub1kOrder ?? nextSub1k,
    over1kOrder: input.parameters?.canHandle1kPlus ? (input.over1kOrder ?? nextOver1k ?? null) ?? undefined : undefined,
    status: input.status ?? 'active',
    cushionSub1k: input.cushionSub1k ?? 0,
    cushion1kPlus: input.cushion1kPlus ?? 0,
    cushionSub1kOccurrences: input.cushionSub1kOccurrences ?? 0,
    cushion1kPlusOccurrences: input.cushion1kPlusOccurrences ?? 0,
  } as SalesRep)

  const { data, error } = await supabase
    .from('sales_reps')
    .insert(toInsert)
    .select()
    .single()
  if (error) throw error

  await logAuditAction({
    actionSubtype: 'CREATE_REP',
    tableName: 'sales_reps',
    recordId: data.id,
    affectedRepId: data.id,
    positionTo: data.sub1k_order,
  });

  return rowToRep(data as DBSalesRepRow)
}

/** UPSERT many reps (insert/update by id) */
export async function upsertSalesReps(reps: SalesRep[]): Promise<SalesRep[]> {
  if (!reps.length) return []
  const payload = reps.map(repToRow)
  const { data, error } = await supabase.from('sales_reps').upsert(payload, { onConflict: 'id' }).select('*')
  if (error) throw error
  return (data as DBSalesRepRow[] | null)?.map(rowToRep) ?? []
}

/** PATCH one rep by id */
export async function updateSalesRep(id: string, patch: Partial<SalesRep>): Promise<SalesRep> {
  const rowPatch = repToRow({ ...(patch as SalesRep), id } as SalesRep)
  const { data, error } = await supabase.from('sales_reps').update(rowPatch).eq('id', id).select().single()
  if (error) throw error
  return rowToRep(data as DBSalesRepRow)
}

/** DELETE many reps by ids */

export async function deleteSalesReps(ids: string[]): Promise<void> {
  if (!ids.length) return
  
  // First, get the reps to log their positions
  const { data: repsToDelete } = await supabase
    .from('sales_reps')
    .select('*')
    .in('id', ids);
  
  // Delete them
  const { error } = await supabase.from('sales_reps').delete().in('id', ids)
  if (error) throw error
  
  // Log each deletion
  if (repsToDelete) {
    for (const rep of repsToDelete) {
      await logAuditAction({
        actionSubtype: 'DELETE_REP',
        tableName: 'sales_reps',
        recordId: rep.id,
        affectedRepId: rep.id,
        positionFrom: rep.sub1k_order,
      });
    }
  }
}

export async function logSalesRepReorder(
  repId: string,
  fromPosition: number,
  toPosition: number,
  replacedRepId: string | null
): Promise<void> {
  await logAuditAction({
    actionSubtype: 'REORDER_REP',
    tableName: 'sales_reps',
    recordId: repId,
    affectedRepId: repId,
    positionFrom: fromPosition,
    positionTo: toPosition,
    replacedRepId: replacedRepId || undefined,
  });
}



/** Realtime subscription */
export function subscribeSalesReps(onChange: () => void): () => void {
  const channel = supabase
    .channel('sales_reps_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_reps' }, onChange)
    .subscribe()

  // Cleanup must be synchronous for React
  return () => {
    void supabase.removeChannel(channel) // fire and forget; do not return the Promise
  }
}

