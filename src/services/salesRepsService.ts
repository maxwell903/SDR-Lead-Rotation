import { supabase } from '../lib/supabase'
import type { SalesRep } from '../types'

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
}

const rowToRep = (r: DBSalesRepRow): SalesRep => ({
  id: r.id,
  name: r.name ?? '',
  parameters: normalizeParameters(r.parameters),
  rotationOrder: r.rotation_order ?? 0,
  sub1kOrder: r.sub1k_order ?? 0,
  over1kOrder: r.over1k_order ?? undefined,
  status: (r.status as SalesRep['status']) ?? 'active',
})

const repToRow = (rep: SalesRep): Partial<DBSalesRepRow> => ({
  id: rep.id,
  name: rep.name,
  parameters: rep.parameters,
  rotation_order: rep.rotationOrder ?? null,
  sub1k_order: rep.sub1kOrder ?? null,
  over1k_order: rep.over1kOrder ?? null,
  status: rep.status ?? 'active',
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
  } as SalesRep)

  const { data, error } = await supabase
    .from('sales_reps')
    .insert(toInsert)
    .select()
    .single()
  if (error) throw error
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
  const { error } = await supabase.from('sales_reps').delete().in('id', ids)
  if (error) throw error
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

