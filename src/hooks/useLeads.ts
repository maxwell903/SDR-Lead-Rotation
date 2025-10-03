import { useEffect, useRef, useState } from 'react'
import type { Lead } from '../types'
import {
  listLeads,
  createLead,
  updateLead as updateOne,
  upsertLeads,
  deleteLeadWithReplacementHandling,
  deleteLeadsWithReplacementHandling,
  checkLeadDeletionStatus,
  subscribeLeads,
  createLeadWithReplacement,
} from '../services/leadsService'

type State = {
  leads: Lead[]
  loading: boolean
  error: string | null
}

/**
 * React hook that exposes CRUD + realtime for leads.
 * ✅ NOW WITH PROPER AUTO-REFRESH!
 */
export function useLeads() {
  const [state, setState] = useState<State>({ leads: [], loading: true, error: null })
  const busy = useRef(false)
  const refreshTimer = useRef<number | null>(null)

  // Dedupe helper to prevent duplicate IDs
  const dedupeById = <T extends { id: string }>(arr: T[]): T[] => {
    const seen = new Set<string>()
    const out: T[] = []
    for (const item of arr) {
      const id = item?.id
      if (!id || !seen.has(id)) {
        if (id) seen.add(id)
        out.push(item)
      }
    }
    return out
  }
  
  const refresh = async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }))
      const leads = await listLeads()
      setState({ leads: dedupeById(leads), loading: false, error: null })
    } catch (e: any) {
      setState({ leads: [], loading: false, error: e?.message ?? 'Failed to load leads' })
    }
  }

  // ✅ SINGLE SUBSCRIPTION - This is all you need!
  useEffect(() => {
    console.log('[useLeads] Setting up subscription')
    
    // Initial load
    refresh()
    
    // Subscribe to changes
    const unsubscribe = subscribeLeads(() => {
      if (busy.current) {
        console.log('[useLeads] Busy, skipping refresh')
        return
      }
      
      // Debounce for 60ms to handle burst updates
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current)
      }
      
      refreshTimer.current = window.setTimeout(() => {
        console.log('[useLeads] Refreshing from subscription')
        refresh()
        refreshTimer.current = null
      }, 60)
    })
    
    // Cleanup
    return () => {
      console.log('[useLeads] Cleaning up subscription')
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current)
      }
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - only set up once

  /**
   * Bulk update leads (insert/update/delete)
   */
  const updateLeads = async (next: Lead[]) => {
    if (busy.current) return
    busy.current = true
    try {
      setState(s => ({ ...s, leads: dedupeById(next) }))

      const current = await listLeads()
      const currentIds = new Set<string>(current.map(l => l.id))
      const nextIds = new Set<string>(next.map(l => l.id))
      const toDelete = [...currentIds].filter(id => !nextIds.has(id))

      if (toDelete.length) {
        await deleteLeadsWithReplacementHandling(toDelete)
      }

      if (next.length) {
        await upsertLeads(next)
      }

      await refresh()
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to update leads' }))
      await refresh()
    } finally {
      busy.current = false
    }
  }

  /**
   * Create a single lead
   */
  const addLead = async (lead: Omit<Lead, 'id'> & Partial<Pick<Lead, 'id'>>) => {
    try {
      const created = await createLead(lead)
      setState(s => ({ ...s, leads: dedupeById([created, ...s.leads]) }))
      return created
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to create lead' }))
      throw e
    }
  }

  /**
   * Create a replacement lead
   */
  const addLeadWithReplacement = async (
    lead: Omit<Lead, 'id'> & Partial<Pick<Lead, 'id'>>,
    originalLeadIdToReplace: string
  ) => {
    try {
      const created = await createLeadWithReplacement(lead, originalLeadIdToReplace)
      setState(s => ({ ...s, leads: dedupeById([created, ...s.leads]) }))
      return created
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to create replacement lead' }))
      throw e
    }
  }

  /**
   * Update a single lead
   */
  const updateLead = async (id: string, patch: Partial<Lead>) => {
    try {
      // Optimistic update
      setState(s => ({
        ...s,
        leads: dedupeById(
          s.leads.map(l => (l.id === id ? ({ ...l, ...patch } as Lead) : l))
        )
      }))

      const updated = await updateOne(id, patch)
      
      setState(s => ({
        ...s,
        leads: dedupeById(
          s.leads.map(l => (l.id === id ? updated : l))
        )
      }))
      
      return updated
    } catch (e: any) {
      await refresh()
      setState(s => ({ ...s, error: e?.message ?? 'Failed to update lead' }))
      throw e
    }
  }

  /**
   * Delete a single lead with replacement handling
   */
  const removeLead = async (id: string) => {
    try {
      const deletionStatus = await checkLeadDeletionStatus(id)
      
      if (!deletionStatus.canDelete) {
        throw new Error(deletionStatus.warningMessage || 'Lead cannot be deleted')
      }

      // Optimistic update
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => l.id !== id)
      }))

      await deleteLeadWithReplacementHandling(id)
      await refresh()
    } catch (e: any) {
      await refresh()
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete lead' }))
      throw e
    }
  }

  /**
   * Delete multiple leads with replacement handling
   */
  const removeLeads = async (ids: string[]) => {
    try {
      const deletionChecks = await Promise.all(
        ids.map(async (id) => {
          const status = await checkLeadDeletionStatus(id)
          return { id, ...status }
        })
      )

      const cannotDelete = deletionChecks.filter(check => !check.canDelete)
      if (cannotDelete.length > 0) {
        throw new Error(`Cannot delete leads: ${cannotDelete.map(c => c.id).join(', ')}`)
      }

      // Optimistic update
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => !ids.includes(l.id))
      }))

      await deleteLeadsWithReplacementHandling(ids)
      await refresh()
    } catch (e: any) {
      await refresh()
      setState(s => ({ ...s, error: e?.message ?? 'Failed to bulk delete leads' }))
      throw e
    }
  }

  /**
   * Check if a lead can be deleted and get status information
   */
  const checkDeletionStatus = async (id: string) => {
    try {
      return await checkLeadDeletionStatus(id);
    } catch (e: any) {
      throw e;
    }
  }

  return {
    leads: state.leads,
    loading: state.loading,
    error: state.error,
    refresh,
    updateLeads,
    addLead,
    addLeadWithReplacement,
    updateLead,
    removeLead,
    removeLeads,
    checkDeletionStatus,  // ← ADD THIS LINE
  }
}