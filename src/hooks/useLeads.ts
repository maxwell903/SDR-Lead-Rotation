import { useEffect, useRef, useState } from 'react'
import type { Lead } from '../types'
import {
  listLeads,
  createLead,
  updateLead as updateOne,
  upsertLeads,
  deleteLeads,
  deleteLead,
  deleteLeadWithReplacementHandling,
  deleteLeadsWithReplacementHandling,
  checkLeadDeletionStatus,
  subscribeLeads,
  createLeadWithReplacement,
} from '../services/leadsService'
import { supabase } from '../lib/supabase'

type State = {
  leads: Lead[]
  loading: boolean
  error: string | null
}

/**
 * React hook that exposes CRUD + realtime for leads.
 * Enhanced with replacement cascade deletion handling and modal support
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
        // Use enhanced deletion for replacement cascade handling
        await deleteLeadsWithReplacementHandling(toDelete)
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

  /** Create a lead with replacement functionality */
  const addLeadWithReplacement = async (
    lead: Omit<Lead, 'id'> & Partial<Pick<Lead, 'id'>>,
    originalLeadIdToReplace: string
  ) => {
    try {
      // Validate that the original lead is marked for replacement
      const { data: markData, error: markError } = await supabase
        .from('replacement_marks')
        .select('*')
        .eq('lead_id', originalLeadIdToReplace)
        .single()
      
      if (markError || !markData) {
        throw new Error('Original lead is not marked for replacement')
      }
      
      if (markData.replaced_by_lead_id) {
        throw new Error('Original lead already has a replacement')
      }
      
      // Ensure assigned sales rep matches the original lead's rep
      if (lead.assignedTo !== markData.rep_id) {
        throw new Error('Assigned sales rep must match the original lead\'s rep')
      }
      
      const created = await createLeadWithReplacement(lead, originalLeadIdToReplace)
      setState(s => ({ ...s, leads: [created, ...s.leads] }))
      return created
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Failed to create replacement lead' }))
      throw e
    }
  }
  

  /** Update a single lead by id - Enhanced for modal support */
  const updateLead = async (id: string, patch: Partial<Lead>) => {
    try {
      // Optimistic update for immediate UI feedback
      setState(s => ({
        ...s,
        leads: s.leads.map(l => (l.id === id ? { ...l, ...patch } : l))
      }))

      const updated = await updateOne(id, patch)
      
      // Update with server response
      setState(s => ({
        ...s,
        leads: s.leads.map(l => (l.id === id ? updated : l))
      }))
      
      return updated
    } catch (e: any) {
      // Rollback optimistic update on error
      await refresh()
      setState(s => ({ ...s, error: e?.message ?? 'Failed to update lead' }))
      throw e
    }
  }

  /** Enhanced delete with replacement cascade handling */
  const removeLead = async (id: string) => {
    try {
      // Check deletion status first
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
      
      // Refresh to ensure consistency
      await refresh()
    } catch (e: any) {
      // Rollback optimistic update on error
      await refresh()
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete lead with replacement handling' }))
      throw e
    }
  }

  /** Enhanced bulk delete with replacement cascade handling */
  const removeLeads = async (ids: string[]) => {
    try {
      // Check each lead's deletion status
      const deletionChecks = await Promise.all(
        ids.map(async (id) => {
          const status = await checkLeadDeletionStatus(id)
          return { id, ...status }
        })
      )

      const cannotDelete = deletionChecks.filter(check => !check.canDelete)
      if (cannotDelete.length > 0) {
        const errorMsg = `Cannot delete leads: ${cannotDelete.map(c => c.id).join(', ')}`
        throw new Error(errorMsg)
      }

      // Optimistic update
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => !ids.includes(l.id))
      }))

      await deleteLeadsWithReplacementHandling(ids)
      
      // Refresh to ensure consistency
      await refresh()
    } catch (e: any) {
      // Rollback optimistic update on error
      await refresh()
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete leads with replacement handling' }))
      throw e
    }
  }

  /** Legacy delete functions (for backwards compatibility) */
  const removeLeadSimple = async (id: string) => {
    try {
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => l.id !== id)
      }))
      
      await deleteLead(id)
    } catch (e: any) {
      await refresh() // rollback
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete lead' }))
      throw e
    }
  }

  const removeLeadsSimple = async (ids: string[]) => {
    try {
      setState(s => ({
        ...s,
        leads: s.leads.filter(l => !ids.includes(l.id))
      }))
      
      await deleteLeads(ids)
    } catch (e: any) {
      await refresh() // rollback
      setState(s => ({ ...s, error: e?.message ?? 'Failed to delete leads' }))
      throw e
    }
  }

  /** Check if a lead can be safely deleted and get warning information */
  const checkDeletionStatus = async (leadId: string) => {
    try {
      return await checkLeadDeletionStatus(leadId)
    } catch (e: any) {
      console.error('Error checking deletion status:', e)
      return {
        canDelete: false,
        isReplacement: false,
        hasReplacement: false,
        warningMessage: 'Error checking deletion status'
      }
    }
  }

  /**
   * Find a lead by ID across all loaded leads
   * Useful for modal operations
   */
  const findLead = (id: string): Lead | undefined => {
    return state.leads.find(lead => lead.id === id)
  }

  /**
   * Get leads by assigned rep ID
   * Useful for filtering and display
   */
  const getLeadsByRep = (repId: string): Lead[] => {
    return state.leads.filter(lead => lead.assignedTo === repId)
  }

  /**
   * Get leads by date range
   * Useful for calendar operations
   */
  const getLeadsByDateRange = (startDate: Date, endDate: Date): Lead[] => {
    return state.leads.filter(lead => {
      if (!lead.date) return false
      const leadDate = new Date(lead.date)
      return leadDate >= startDate && leadDate <= endDate
    })
  }

  /**
   * Check if a lead exists by account number
   * Useful for duplicate prevention
   */
  const existsByAccountNumber = (accountNumber: string, excludeId?: string): boolean => {
    return state.leads.some(lead => 
      lead.accountNumber === accountNumber && 
      (excludeId ? lead.id !== excludeId : true)
    )
  }

  /**
   * Get leads by property type
   * Useful for filtering operations
   */
  const getLeadsByPropertyType = (propertyType: string): Lead[] => {
    return state.leads.filter(lead => 
      lead.propertyTypes?.includes(propertyType as any)
    )
  }

  /**
   * Get leads by unit count range
   * Useful for rotation logic
   */
  const getLeadsByUnitRange = (minUnits?: number, maxUnits?: number): Lead[] => {
    return state.leads.filter(lead => {
      if (minUnits !== undefined && lead.unitCount < minUnits) return false
      if (maxUnits !== undefined && lead.unitCount > maxUnits) return false
      return true
    })
  }

  return {
    // State
    ...state,
    
    // Core CRUD operations
    refresh,
    updateLeads,           // Bulk update (like sales reps)
    addLead,              // Single create
    updateLead,           // Single update (enhanced for modals)
    removeLead,           // Enhanced delete with replacement cascade
    removeLeads,          // Enhanced bulk delete with replacement cascade
    checkDeletionStatus,  // Check deletion status and warnings
    
    // Utility functions for modal and UI operations
    findLead,             // Find lead by ID
    getLeadsByRep,        // Get leads by rep ID
    getLeadsByDateRange,  // Get leads by date range
    existsByAccountNumber, // Check for duplicates
    getLeadsByPropertyType, // Get leads by property type
    getLeadsByUnitRange,  // Get leads by unit count range
    
    // Legacy functions (for backwards compatibility)
    removeLeadSimple,     // Simple delete without replacement handling
    removeLeadsSimple,    // Simple bulk delete without replacement handling
  }
}