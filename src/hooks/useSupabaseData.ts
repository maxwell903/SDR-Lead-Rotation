import { useEffect, useRef, useState } from 'react'
import type { SalesRep } from '../types'
import {
  listSalesReps,
  upsertSalesReps,
  deleteSalesReps,
  createSalesRep,
  updateSalesRep as updateOne,
  subscribeSalesReps,
} from '../services/salesRepsService'

type State = {
  salesReps: SalesRep[]
  loading: boolean
  error: string | null
}

/**
 * React hook that exposes CRUD + realtime for sales reps.
 */
export function useSalesReps() {
  const [state, setState] = useState<State>({ salesReps: [], loading: true, error: null })
  const busy = useRef(false)

  const refresh = async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }))
      const reps = await listSalesReps()
      setState({ salesReps: reps, loading: false, error: null })
    } catch (e: any) {
      setState({ salesReps: [], loading: false, error: e?.message ?? 'Failed to load sales reps' })
    }
  }

  useEffect(() => {
    refresh()
    const off = subscribeSalesReps(() => {
      if (!busy.current) refresh()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Persist the entire list (insert/update/delete + order).
   * Works with <SalesRepManager onUpdateReps={updateSalesReps} />
   */
  const updateSalesReps = async (next: SalesRep[]) => {
    if (busy.current) return
    busy.current = true
    try {
      // Optimistic UI
      setState(s => ({ ...s, salesReps: next }))

      // Compute deletes against current DB state
      const current = await listSalesReps()
      const currentIds = new Set<string>(current.map(r => String(r.id)))
      const nextIds = new Set<string>(next.map(r => String(r.id)))
      const toDelete: string[] = [...currentIds].filter(id => !nextIds.has(id))

      if (toDelete.length) {
        await deleteSalesReps(toDelete)
      }

      // Upsert everything (new + updated)
      await upsertSalesReps(next)

      // Final refresh to align with DB
      await refresh()
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to update sales reps' }))
      await refresh() // rollback optimistic after error
    } finally {
      busy.current = false
    }
  }

  /** Create a single rep */
  const addSalesRep = async (rep: Pick<SalesRep, 'name' | 'parameters'> & Partial<SalesRep>) => {
    const created = await createSalesRep(rep)
    setState(s => ({ ...s, salesReps: [...s.salesReps, created] }))
    return created
  }

  /** Patch a single rep by id */
  const updateSalesRep = async (id: string, patch: Partial<SalesRep>) => {
    const updated = await updateOne(id, patch)
    setState(s => ({
      ...s,
      salesReps: s.salesReps.map(r => (r.id === id ? updated : r)),
    }))
    return updated
  }

  /** Delete a single rep by id */
  const removeSalesRep = async (id: string) => {
    await deleteSalesReps([id])
    setState(s => ({ ...s, salesReps: s.salesReps.filter(r => r.id !== id) }))
  }

  return {
    salesReps: state.salesReps,
    loading: state.loading,
    error: state.error,
    refresh,
    updateSalesReps, // bulk save (reorder/edit)
    addSalesRep,     // create one
    updateSalesRep,  // patch one
    removeSalesRep,  // delete one
  }
}
