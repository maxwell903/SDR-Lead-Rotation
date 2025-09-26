import { useEffect, useRef, useState } from 'react'
import type { Lead } from '../types'
import {
  listLeads,
  createLead,
  updateLead as updateOne,
  upsertLeads,
  deleteLeads,
  deleteLead,
  subscribeLeads,
} from '../services/leadsService'

type State = {
  leads: Lead[]
  loading: boolean
  error: string | null
}

/**
 * React hook that exposes CRUD + realtime for leads.
 * Follows the same pattern as useSalesReps
 */
export function useLeads() {
  const [state, setState] = useState<State>({ leads: [], loading: true, error: null })
  const busy = useRef(false)

  const refresh = async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }))
      const leads = await listLeads()
      setState({ leads, loading: false, error: null })
    } catch (e: any) {
      setState({ leads: [], loading: false, error: e?.message ?? 'Failed to load leads' })
    }
  }

  useEffect(() => {
    refresh()
    const off = subscribeLeads(() => {
      if (!busy.current) refresh()
    })
    return off
  }, [])

  /**
   * Persist the entire list (insert/update/delete).
   * Works with bulk operations from UI
   */
  const updateLeads = async (next: Lead[]) => {
    if (busy.current) return
    busy.current = true
    try {
      // Optimistic UI
      setState(s => ({ ...s, leads: next }))

      // Compute deletes against current DB state
      const current = await listLeads()
      const currentIds = new Set<string>(current.map(l => l.id))
      const nextIds = new Set<string>(next.map(l => l.id))
      const toDelete: string[] = [...currentIds].filter(id => !nextIds.has(id))

      if (toDelete.length) {
        await deleteLeads(toDelete)
      }

      // Upsert everything (new + updated)
      if (next.length) {
        await upsertLeads(next)
      }

      // Final refresh to align with DB
      await refresh()
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to update leads' }))
      await refresh() // rollback optimistic after error
    } finally {
      busy.current = false
    }
  }

  /** Create a single lead */
  const addLead = async (lead: Omit<Lead, 'id'> & Partial<Pick<Lead, 'id'>>) => {
    try {
      const created = await createLead(lead)
      setState(s => ({ ...s, leads: [created, ...s.leads] }))
      return created
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to create lead' }))
      throw e
    }
  }

  /** Update a single lead by id */
  const updateLead = async (id: string, patch: Partial<Lead>) => {
    try {
      const updated = await updateOne(id, patch)
      setState(s => ({
        ...s,
        leads: s.leads.map(l => (l.id === id ? updated : l))
      }))
      return updated
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to update lead' }))
      throw e
    }
  }

  /** Delete a single lead by id */
  const removeLead = async (id: string) => {
    try {
      await deleteLead(id)
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => l.id !== id)
      }))
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete lead' }))
      throw e
    }
  }

  /** Delete multiple leads by ids */
  const removeLeads = async (ids: string[]) => {
    try {
      await deleteLeads(ids)
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => !ids.includes(l.id))
      }))
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete leads' }))
      throw e
    }
  }

  return {
    // State
    ...state,
    
    // Actions
    refresh,
    updateLeads,     // Bulk update (like sales reps)
    addLead,         // Single create
    updateLead,      // Single update
    removeLead,      // Single delete
    removeLeads,     // Bulk delete
  }
}