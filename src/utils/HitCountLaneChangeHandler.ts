/**
 * HitCountLaneChangeHandler.ts
 * 
 * Handles hit count updates when leads are modified, specifically managing
 * lane changes (sub1k ↔ 1kplus) by reversing old hits and adding new ones.
 * 
 * This ensures rotation order accuracy by maintaining correct hit_value totals
 * in the rep_hit_counts table.
 */

import { supabase } from '../lib/supabase'; // Adjust import path as needed

// Types
export type Lane = 'sub1k' | '1kplus';
export type HitType = 'NL' | 'MFR' | 'LRL' | 'OOO';

export interface HitEntry {
  id?: string;
  rep_id: string;
  lead_entry_id?: string;
  hit_type: HitType;
  hit_value: number;
  lane: Lane;
  calculated_at?: string;
  month?: number;
  year?: number;
}

export interface LeadUpdateContext {
  leadId: string;
  repId: string;
  oldUnitCount: number;
  newUnitCount: number;
  hitType: HitType;
  existingHitEntryId?: string; // If we track individual hit entries
}

/**
 * Determines lane based on unit count
 */
export function determineLane(unitCount: number): Lane {
  return unitCount >= 1000 ? '1kplus' : 'sub1k';
}

/**
 * Creates a hit entry object with current timestamp and date info
 */
function createHitEntry(
  repId: string,
  hitType: HitType,
  hitValue: number,
  lane: Lane,
  leadEntryId?: string
): HitEntry {
  const now = new Date();
  
  return {
    rep_id: repId,
    lead_entry_id: leadEntryId,
    hit_type: hitType,
    hit_value: hitValue,
    lane: lane,
    calculated_at: now.toISOString(),
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

/**
 * Main handler for lead updates with lane change detection
 * 
 * @param context - Information about the lead being updated
 * @returns Success status and any error messages
 */
export async function handleLeadUpdate(
  context: LeadUpdateContext
): Promise<{ success: boolean; error?: string }> {
  try {
    const oldLane = determineLane(context.oldUnitCount);
    const newLane = determineLane(context.newUnitCount);

    // If lane hasn't changed, no hit adjustment needed
    if (oldLane === newLane) {
      console.log('No lane change detected, hit counts remain accurate');
      return { success: true };
    }

    // Lane has changed - need to reverse old hit and add new hit
    console.log(`Lane change detected: ${oldLane} → ${newLane}`);

    const hitEntries: HitEntry[] = [];

    // Step 1: Reverse the old hit (negative value)
    const reversalHit = createHitEntry(
      context.repId,
      context.hitType,
      -1, // Negative to reverse
      oldLane,
      context.leadId
    );
    hitEntries.push(reversalHit);

    // Step 2: Add the new hit (positive value)
    const newHit = createHitEntry(
      context.repId,
      context.hitType,
      1, // Positive for new hit
      newLane,
      context.leadId
    );
    hitEntries.push(newHit);

    // Insert both entries into database
    const { error } = await supabase
      .from('rep_hit_counts')
      .insert(hitEntries);

    if (error) {
      console.error('Error updating hit counts:', error);
      return { success: false, error: error.message };
    }

    console.log(`Successfully adjusted hits for rep ${context.repId}:`, {
      reversal: `${reversalHit.hit_value} in ${oldLane}`,
      new: `${newHit.hit_value} in ${newLane}`
    });

    return { success: true };

  } catch (error) {
    console.error('Unexpected error in handleLeadUpdate:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Handles deletion of a lead - reverses the hit
 * 
 * @param repId - Sales rep ID
 * @param unitCount - Unit count of deleted lead
 * @param hitType - Type of hit to reverse
 * @param leadId - Lead entry ID
 */
export async function handleLeadDeletion(
  repId: string,
  unitCount: number,
  hitType: HitType,
  leadId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const lane = determineLane(unitCount);
    
    // Create reversal hit (negative value)
    const reversalHit = createHitEntry(
      repId,
      hitType,
      -1,
      lane,
      leadId
    );

    const { error } = await supabase
      .from('rep_hit_counts')
      .insert(reversalHit);

    if (error) {
      console.error('Error reversing hit on deletion:', error);
      return { success: false, error: error.message };
    }

    console.log(`Successfully reversed hit for deleted lead ${leadId}`);
    return { success: true };

  } catch (error) {
    console.error('Unexpected error in handleLeadDeletion:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Handles creation of a new lead - adds the hit
 * 
 * @param repId - Sales rep ID
 * @param unitCount - Unit count of new lead
 * @param hitType - Type of hit to add
 * @param leadId - Lead entry ID
 */
export async function handleLeadCreation(
  repId: string,
  unitCount: number,
  hitType: HitType,
  leadId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const lane = determineLane(unitCount);
    
    // Create new hit (positive value)
    const newHit = createHitEntry(
      repId,
      hitType,
      1,
      lane,
      leadId
    );

    const { error } = await supabase
      .from('rep_hit_counts')
      .insert(newHit);

    if (error) {
      console.error('Error adding hit on creation:', error);
      return { success: false, error: error.message };
    }

    console.log(`Successfully added hit for new lead ${leadId} in ${lane}`);
    return { success: true };

  } catch (error) {
    console.error('Unexpected error in handleLeadCreation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Utility to get current hit totals for a rep (for verification/debugging)
 */
export async function getRepHitTotals(repId: string): Promise<{
  sub1k: number;
  onekplus: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('rep_hit_counts')
      .select('hit_value, lane')
      .eq('rep_id', repId);

    if (error) {
      return { sub1k: 0, onekplus: 0, error: error.message };
    }

    const totals = data.reduce((acc, entry) => {
      if (entry.lane === 'sub1k') {
        acc.sub1k += entry.hit_value;
      } else if (entry.lane === '1kplus') {
        acc.onekplus += entry.hit_value;
      }
      return acc;
    }, { sub1k: 0, onekplus: 0 });

    return totals;

  } catch (error) {
    console.error('Error getting rep hit totals:', error);
    return { 
      sub1k: 0, 
      onekplus: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Example usage in your update lead function:
 * 
 * async function updateLead(leadId: string, newData: any) {
 *   // Get existing lead data
 *   const existingLead = await getLeadById(leadId);
 *   
 *   // Handle hit count updates if unit count changed
 *   if (existingLead.unitCount !== newData.unitCount) {
 *     const result = await handleLeadUpdate({
 *       leadId: leadId,
 *       repId: existingLead.repId,
 *       oldUnitCount: existingLead.unitCount,
 *       newUnitCount: newData.unitCount,
 *       hitType: 'NL'
 *     });
 *     
 *     if (!result.success) {
 *       throw new Error(`Failed to update hit counts: ${result.error}`);
 *     }
 *   }
 *   
 *   // Continue with normal lead update...
 *   await supabase.from('leads').update(newData).eq('id', leadId);
 * }
 */