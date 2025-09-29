import { useState, useEffect, useCallback, useRef } from 'react'
import { getNetHitCounts, getHitCounts, subscribeHitCounts, type HitCountRecord, type Lane } from '../services/hitCountsService'

interface UseHitCountsReturn {
  getNetHitsForRep: (repId: string, lane: Lane, month?: number, year?: number) => Promise<number>
  getHitRecordsForRep: (repId: string, lane: Lane, month?: number, year?: number) => Promise<HitCountRecord[]>
  getNetHitsForLane: (lane: Lane, month?: number, year?: number) => Promise<Map<string, number>>
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useHitCounts(): UseHitCountsReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ✅ FIX: Use useRef for cache instead of state to avoid re-renders
  const cacheRef = useRef<Map<string, any>>(new Map())

  const refresh = useCallback(() => {
    cacheRef.current.clear() // Clear cache to force refresh
  }, [])

  // Set up real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeHitCounts(() => {
      refresh() // Clear cache when data changes
    })
    return unsubscribe
  }, [refresh])

  const getNetHitsForRep = useCallback(async (
    repId: string, 
    lane: Lane, 
    month?: number, 
    year?: number
  ): Promise<number> => {
    try {
      setError(null)
      const cacheKey = `net-${repId}-${lane}-${month}-${year}`
      
      // ✅ FIX: Use ref instead of state
      if (cacheRef.current.has(cacheKey)) {
        return cacheRef.current.get(cacheKey)
      }

      setLoading(true)
      const netHitCounts = await getNetHitCounts({
        lane,
        month,
        year
      })
      
      const result = netHitCounts.get(repId) || 0
      
      // ✅ FIX: Set cache without triggering re-renders
      cacheRef.current.set(cacheKey, result)
      
      return result
    } catch (err: any) {
      setError(err?.message ?? 'Failed to get net hits')
      return 0
    } finally {
      setLoading(false)
    }
  }, []) // ✅ FIX: Remove cache dependency

  const getHitRecordsForRep = useCallback(async (
    repId: string, 
    lane: Lane, 
    month?: number, 
    year?: number
  ): Promise<HitCountRecord[]> => {
    try {
      setError(null)
      const cacheKey = `records-${repId}-${lane}-${month}-${year}`
      
      // ✅ FIX: Use ref instead of state
      if (cacheRef.current.has(cacheKey)) {
        return cacheRef.current.get(cacheKey)
      }

      setLoading(true)
      const records = await getHitCounts({
        repId,
        lane,
        month,
        year
      })
      
      // ✅ FIX: Set cache without triggering re-renders
      cacheRef.current.set(cacheKey, records)
      
      return records
    } catch (err: any) {
      setError(err?.message ?? 'Failed to get hit records')
      return []
    } finally {
      setLoading(false)
    }
  }, []) // ✅ FIX: Remove cache dependency

  const getNetHitsForLane = useCallback(async (
    lane: Lane, 
    month?: number, 
    year?: number
  ): Promise<Map<string, number>> => {
    try {
      setError(null)
      const cacheKey = `lane-${lane}-${month}-${year}`
      
      // ✅ FIX: Use ref instead of state
      if (cacheRef.current.has(cacheKey)) {
        return cacheRef.current.get(cacheKey)
      }

      setLoading(true)
      const netHitCounts = await getNetHitCounts({
        lane,
        month,
        year
      })
      
      // ✅ FIX: Set cache without triggering re-renders
      cacheRef.current.set(cacheKey, netHitCounts)
      
      return netHitCounts
    } catch (err: any) {
      setError(err?.message ?? 'Failed to get lane hit counts')
      return new Map()
    } finally {
      setLoading(false)
    }
  }, []) // ✅ FIX: Remove cache dependency

  return {
    getNetHitsForRep,
    getHitRecordsForRep,
    getNetHitsForLane,
    loading,
    error,
    refresh
  }
}