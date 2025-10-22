// src/services/enhancedAuditLogger.ts
import { supabase } from '../lib/supabase';

export type AuditActionType = 
  // Lead Entry Actions
  | 'CUSHION_LEAD'
  | 'ADD_NL'
  | 'DELETE_NL'
  | 'UPDATE_LEAD'
  | 'NL_TO_MFR'
  | 'MFR_TO_NL'
  | 'MFR_TO_LRL'
  | 'DELETE_LRL'
  | 'LTR_TO_MFR'
  | 'DELETE_MFR'
  // Non-Lead Entry Actions
  | 'OOO'
  | 'SKIP'
  | 'DELETE_OOO'
  | 'DELETE_SKIP'
  // Sales Rep Actions
  | 'CREATE_REP'
  | 'DELETE_REP'
  | 'REORDER_REP'
  | 'UPDATE_REP';

interface AuditLogParams {
  actionSubtype: AuditActionType;
  tableName: string;
  recordId: string;
  cushionImpact?: string; 
  
  // Optional fields for different action types
  affectedRepId?: string;           // Sales rep affected by this action
  accountNumber?: string;            // Account number for leads
  hitValueChange?: number;           // Change in hit value
  hitValueTotal?: number;            // Total hit value after change
  positionFrom?: number;             // Starting position (reorders)
  positionTo?: number;               // Ending position (reorders/creates)
  replacedRepId?: string;            // Rep whose position was taken (reorders)
  timeInput?: string;                // Time input for OOO/Skip
  lane?: 'sub1k' | '1kplus' | 'both'; // Lane for hit calculations

   actionDay?: number;      // Day of the entry (1-31)
  actionMonth?: number;    // Month of the entry (1-12)
  actionYear?: number;     // Year of the entry
  
  // Legacy support
  oldData?: any;
  newData?: any;
}

/**
 * Enhanced audit logger that populates ALL audit trail fields
 * Use this instead of the old logAction function
 */
export async function logAuditAction(params: AuditLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from('actions').insert({
      user_id: user?.id,
      action_type: getBaseActionType(params.actionSubtype),
      table_name: params.tableName,
      record_id: params.recordId,
      
      // Audit-specific fields
      action_subtype: params.actionSubtype,
      affected_rep_id: params.affectedRepId || null,
      account_number: params.accountNumber || null,
      hit_value_change: params.hitValueChange ?? null,
      cushion_impact: params.cushionImpact || null,
      hit_value_total: params.hitValueTotal ?? null,
      position_from: params.positionFrom ?? null,
      position_to: params.positionTo ?? null,
      replaced_rep_id: params.replacedRepId || null,
      time_input: params.timeInput || null,
      lane: params.lane || null,
      
      // ✅ NEW: Populate date columns
      action_day: params.actionDay ?? null,
      action_month: params.actionMonth ?? null,
      action_year: params.actionYear ?? null,
      
      // Legacy fields (optional)
      old_data: params.oldData || null,
      new_data: params.newData || null,
    });
    
    if (error) {
      console.error('Failed to log audit action:', error);
    }
  } catch (error) {
    console.error('Audit logging error:', error);
  }
}

/**
 * Helper to derive base action type from subtype
 */
function getBaseActionType(subtype: AuditActionType): string {
  if (subtype.includes('DELETE')) return 'DELETE';
  if (subtype.includes('CREATE') || subtype.includes('ADD')) return 'CREATE';
  if (subtype.includes('REORDER') || subtype.includes('UPDATE') || subtype.includes('TO')) return 'UPDATE';
  return 'CREATE'; // Default fallback
}


async function getRepHitTotalFromCounts(
  repId: string,
  lane: 'sub1k' | '1kplus',
  month: number,
  year: number
): Promise<number> {
  const { data, error } = await supabase
    .from('rep_hit_counts')
    .select('hit_value')
    .eq('rep_id', repId)
    .eq('lane', lane)
    .eq('month', month)
    .eq('year', year);
    
  if (error || !data) return 0;
  
  return data.reduce((sum, hit) => sum + hit.hit_value, 0);
}

/**
 * Helper to get rep's current hit value total for a lane
 */
/**
 * Get rep's hit total at a specific point in time by reading the audit trail
 * This ensures we get the value BEFORE this action, not after
 */
export async function getRepHitTotal(
  repId: string, 
  lane: 'sub1k' | '1kplus',
  month: number,
  year: number,
  beforeTimestamp?: string  // Optional: get total before this time
): Promise<number> {
  // Query the actions table to get the last known total
  let query = supabase
    .from('actions')
    .select('hit_value_total, hit_value_change, created_at')
    .eq('affected_rep_id', repId)
    .eq('lane', lane)
    .not('hit_value_total', 'is', null)  // Only get actions that have totals
    .order('created_at', { ascending: false })
    .limit(1);
  
  // If we want the total BEFORE a specific time, filter by that
  if (beforeTimestamp) {
    query = query.lt('created_at', beforeTimestamp);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error getting hit total from audit trail:', error);
    // Fallback to summing hit counts
    return getRepHitTotalFromCounts(repId, lane, month, year);
  }
  
  if (!data || data.length === 0) {
    // No previous actions, so total is 0
    return 0;
  }
  
  // The last action's total + change = the current total
  const lastAction = data[0];
  const total = (lastAction.hit_value_total ?? 0) + (lastAction.hit_value_change ?? 0);
  
  return total;
}


// ========== USAGE EXAMPLES ==========

/** Example 1: Log adding a Normal Lead (NL) */
export async function logAddNormalLead(
  leadId: string,
  repId: string,
  accountNumber: string,
  hitValue: number,
  totalHits: number,
  lane: 'sub1k' | '1kplus'
) {
  await logAuditAction({
    actionSubtype: 'ADD_NL',
    tableName: 'leads',
    recordId: leadId,
    affectedRepId: repId,
    accountNumber: accountNumber,
    hitValueChange: hitValue,
    hitValueTotal: totalHits,
    lane: lane,
  });
}

/** Example 2: Log deleting a Normal Lead */
export async function logDeleteNormalLead(
  leadId: string,
  repId: string,
  accountNumber: string,
  hitValue: number,  // Negative value
  totalHits: number,
  lane: 'sub1k' | '1kplus'
) {
  await logAuditAction({
    actionSubtype: 'DELETE_NL',
    tableName: 'leads',
    recordId: leadId,
    affectedRepId: repId,
    accountNumber: accountNumber,
    hitValueChange: hitValue,  // Should be negative
    hitValueTotal: totalHits,
    lane: lane,
  });
}

/** Example 3: Log marking for replacement (NL -> MFR) */
export async function logMarkForReplacement(
  leadId: string,
  repId: string,
  accountNumber: string,
  lane: 'sub1k' | '1kplus'
) {
  await logAuditAction({
    actionSubtype: 'NL_TO_MFR',
    tableName: 'replacement_marks',
    recordId: leadId,
    affectedRepId: repId,
    accountNumber: accountNumber,
    hitValueChange: 0,  // No hit change for marking
    lane: lane,
  });
}

/** Example 4: Log adding replacement (MFR -> LRL ⇄ LTR) */
export async function logAddReplacement(
  newLeadId: string,
  repId: string,
  accountNumber: string,
  lane: 'sub1k' | '1kplus'
) {
  await logAuditAction({
    actionSubtype: 'MFR_TO_LRL',
    tableName: 'leads',
    recordId: newLeadId,
    affectedRepId: repId,
    accountNumber: accountNumber,
    hitValueChange: 0,  // LRL is 0 hit
    lane: lane,
  });
}

/** Example 5: Log OOO */
export async function logOOO(
  entryId: string,
  repId: string,
  time: string,
  lane: 'sub1k' | '1kplus' | 'both'
) {
  await logAuditAction({
    actionSubtype: 'OOO',
    tableName: 'non_lead_entries',
    recordId: entryId,
    affectedRepId: repId,
    timeInput: time,
    hitValueChange: 0,
    lane: lane,
  });
}

/** Example 6: Log Skip */
export async function logSkip(
  entryId: string,
  repId: string,
  time: string,
  totalHitsAfter: number,
  lane: 'sub1k' | '1kplus' | 'both'
) {
  await logAuditAction({
    actionSubtype: 'SKIP',
    tableName: 'non_lead_entries',
    recordId: entryId,
    affectedRepId: repId,
    timeInput: time,
    hitValueChange: 1,  // Skip adds 1 hit
    hitValueTotal: totalHitsAfter,
    lane: lane,
  });
}

/** Example 7: Log sales rep creation */
export async function logCreateSalesRep(
  repId: string,
  position: number
) {
  await logAuditAction({
    actionSubtype: 'CREATE_REP',
    tableName: 'sales_reps',
    recordId: repId,
    affectedRepId: repId,
    positionTo: position,
  });
}

/** Example 8: Log sales rep reorder */
export async function logReorderSalesRep(
  repId: string,
  fromPosition: number,
  toPosition: number,
  replacedRepId: string  // The rep whose spot was taken
) {
  await logAuditAction({
    actionSubtype: 'REORDER_REP',
    tableName: 'sales_reps',
    recordId: repId,
    affectedRepId: repId,
    positionFrom: fromPosition,
    positionTo: toPosition,
    replacedRepId: replacedRepId,
  });
}

/** Example 9: Log sales rep deletion */
export async function logDeleteSalesRep(
  repId: string,
  position: number
) {
  await logAuditAction({
    actionSubtype: 'DELETE_REP',
    tableName: 'sales_reps',
    recordId: repId,
    affectedRepId: repId,
    positionFrom: position,
  });
}