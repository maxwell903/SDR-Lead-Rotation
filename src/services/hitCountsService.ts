import { supabase } from '../lib/supabase'
import { logAction } from './actionTracker'

export type HitType = 'NL' | 'MFR' | 'MFR_UNMARK' | 'LRL' | 'LTR' | 'SKIP';
const HIT_TYPES: HitType[] = ['NL','MFR','MFR_UNMARK','LRL','LTR','SKIP'];
export type Lane = 'sub1k' | '1kplus'

export interface HitCountRecord {
  id: string
  rep_id: string
  lead_entry_id?: string
  hit_type: HitType
  hit_value: number
  lane: Lane
  calculated_at: string
  month: number
  year: number
}

// DB row shape
type DBHitCountRow = {
  id: string
  rep_id: string | null
  lead_entry_id: string | null
  hit_type: string | null
  hit_value: number | null
  lane: string | null
  calculated_at: string | null
  month: number | null
  year: number | null
}

const rowToHitCount = (r: DBHitCountRow): HitCountRecord => ({
  id: r.id,
  rep_id: r.rep_id ?? '',
  lead_entry_id: r.lead_entry_id ?? undefined,
  hit_type: (r.hit_type as HitType) ?? 'NL',
  hit_value: r.hit_value ?? 0,
  lane: (r.lane as Lane) ?? 'sub1k',
  calculated_at: r.calculated_at ?? new Date().toISOString(),
  month: r.month ?? new Date().getMonth() + 1,
  year: r.year ?? new Date().getFullYear(),
})

/** CREATE hit count record */
export async function createHitCount(input: {
  repId: string
  leadEntryId?: string
  hitType: HitType
  hitValue: number
  lane: Lane
  month: number
  year: number
}): Promise<HitCountRecord> {
  const { data, error } = await supabase
    .from('rep_hit_counts')
    .insert({
      rep_id: input.repId,
      lead_entry_id: input.leadEntryId || null,
      hit_type: input.hitType,
      hit_value: input.hitValue,
      lane: input.lane,
      month: input.month,
      year: input.year,
    })
    .select()
    .single()
  
  if (error) throw error
  
  const created = rowToHitCount(data as DBHitCountRow)
  
  await logAction({
    actionType: 'CREATE',
    tableName: 'rep_hit_counts' as any,
    recordId: created.id,
    newData: created
  })
  
  return created
}

/** GET hit counts for specific rep/month/year/lane */
export async function getHitCounts(filters: {
  repId?: string
  month?: number
  year?: number
  lane?: Lane
}): Promise<HitCountRecord[]> {
  let query = supabase.from('rep_hit_counts').select('*')
  
  if (filters.repId) query = query.eq('rep_id', filters.repId)
  if (filters.month) query = query.eq('month', filters.month)
  if (filters.year) query = query.eq('year', filters.year)
  if (filters.lane) query = query.eq('lane', filters.lane)
  
  const { data, error } = await query.order('calculated_at', { ascending: true })
  
  if (error) throw error
  return (data as DBHitCountRow[] | null)?.map(rowToHitCount) ?? []
}

/** GET net hit counts by rep for a specific lane/time period */
export async function getNetHitCounts(filters: {
  lane: Lane
  month?: number
  year?: number
}): Promise<Map<string, number>> {
  const hitCounts = await getHitCounts(filters)
  const netCounts = new Map<string, number>()
  
  hitCounts.forEach(hit => {
    const current = netCounts.get(hit.rep_id) || 0
    netCounts.set(hit.rep_id, current + hit.hit_value)
  })
  
  return netCounts
}

/** Realtime subscription */
export function subscribeHitCounts(onChange: () => void): () => void {
  const channel = supabase
    .channel('hit_counts_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rep_hit_counts' }, onChange)
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}