// src/services/cushionService.ts
import { supabase } from '../lib/supabase';
import { logAction } from './actionTracker';

export type Lane = 'sub1k' | '1kplus';

/**
 * Get current cushion value for a rep in a specific lane
 */
export async function getCushionValue(
  repId: string,
  lane: Lane
): Promise<number> {
  const { data, error } = await supabase
    .from('sales_reps')
    .select('cushion_sub1k, cushion_1kplus')
    .eq('id', repId)
    .single();

  if (error) throw error;

  const cushion = lane === 'sub1k' 
    ? (data.cushion_sub1k ?? 0) 
    : (data.cushion_1kplus ?? 0);

  return cushion;
}

/**
 * Get current occurrence count for a rep in a specific lane
 */
export async function getCushionOccurrences(
  repId: string,
  lane: Lane
): Promise<number> {
  const { data, error } = await supabase
    .from('sales_reps')
    .select('cushion_sub1k_occurrences, cushion_1kplus_occurrences')
    .eq('id', repId)
    .single();

  if (error) throw error;

  const occurrences = lane === 'sub1k' 
    ? (data.cushion_sub1k_occurrences ?? 0) 
    : (data.cushion_1kplus_occurrences ?? 0);

  return occurrences;
}

/**
 * Set cushion value AND occurrences for a rep in a specific lane
 */
export async function setCushionValue(
  repId: string,
  lane: Lane,
  value: number,
  occurrences?: number
): Promise<void> {
  const cushionColumn = lane === 'sub1k' ? 'cushion_sub1k' : 'cushion_1kplus';
  const occurrencesColumn = lane === 'sub1k' ? 'cushion_sub1k_occurrences' : 'cushion_1kplus_occurrences';
  
  const updateData: any = {
    [cushionColumn]: Math.max(0, value),
    updated_at: new Date().toISOString()
  };

  // Only update occurrences if provided
  if (occurrences !== undefined) {
    updateData[occurrencesColumn] = Math.max(0, occurrences);
  }

  const { error } = await supabase
    .from('sales_reps')
    .update(updateData)
    .eq('id', repId);

  if (error) throw error;

  // Log the action
  await logAction({
    actionType: 'UPDATE',
    tableName: 'sales_reps',
    recordId: repId,
    newData: updateData
  });
}

/**
 * Check cushion and decrement if needed
 * Returns whether a hit should be recorded
 * Handles occurrence cycling
 * 
 * BEHAVIOR:
 * - x2 → x1: No hit, no rotation movement (cushion absorbs)
 * - x1 → x0: YES hit, YES rotation movement, then check for occurrence reset
 * - x0: YES hit, YES rotation movement (normal behavior)
 */
export async function checkAndDecrementCushion(
  repId: string,
  lane: Lane
): Promise<{ shouldRecordHit: boolean; newCushionValue: number }> {
  const currentCushion = await getCushionValue(repId, lane);

  console.log(`🛡️ Cushion check for ${repId} (${lane}): ${currentCushion}`);

  // No cushion (x0) - always record hit and move in rotation (normal behavior)
  if (currentCushion === 0) {
    return { shouldRecordHit: true, newCushionValue: 0 };
  }

  // Cushion is x1 - this will record a hit and move in rotation
  if (currentCushion === 1) {
    // Decrement to 0 first
    await setCushionValue(repId, lane, 0);
    console.log(`🛡️ Cushion decremented: x1 → x0 (hit recorded, rotation moves)`);
    
    // Check if we have occurrences remaining to reset the cushion
    const occurrences = await getCushionOccurrences(repId, lane);
    
    if (occurrences > 0) {
      // Reset cushion to 2 and decrement occurrences
      console.log(`🔄 Resetting cushion for ${repId} (${lane}): occurrences ${occurrences} → ${occurrences - 1}`);
      await setCushionValue(repId, lane, 2, occurrences - 1);
      
      // Hit IS recorded (at x1), and rep moves back in rotation normally
      return { shouldRecordHit: true, newCushionValue: 2 };
    }
    
    // No occurrences left, stay at x0
    return { shouldRecordHit: true, newCushionValue: 0 };
  }

  // Cushion is x2 or higher - absorb the lead, no hit, no rotation movement
  const newCushion = currentCushion - 1;
  await setCushionValue(repId, lane, newCushion);
  console.log(`🛡️ Cushion decremented: x${currentCushion} → x${newCushion} (no hit, no rotation movement)`);

  return { shouldRecordHit: false, newCushionValue: newCushion };
}

/**
 * Get all active cushion tracking data for display
 */
export async function getActiveCushionTracking(): Promise<Array<{
  repId: string;
  repName: string;
  lane: Lane;
  cushion: number;
  occurrences: number;
}>> {
  const { data, error } = await supabase
    .from('sales_reps')
    .select('id, name, cushion_sub1k, cushion_1kplus, cushion_sub1k_occurrences, cushion_1kplus_occurrences')
    .eq('status', 'active');

  if (error) throw error;

  const tracking: Array<{
    repId: string;
    repName: string;
    lane: Lane;
    cushion: number;
    occurrences: number;
  }> = [];

  for (const rep of data || []) {
    // Check sub1k
    if ((rep.cushion_sub1k ?? 0) > 0 && (rep.cushion_sub1k_occurrences ?? 0) > 0) {
      tracking.push({
        repId: rep.id,
        repName: rep.name || rep.id,
        lane: 'sub1k',
        cushion: rep.cushion_sub1k ?? 0,
        occurrences: rep.cushion_sub1k_occurrences ?? 0
      });
    }

    // Check 1kplus
    if ((rep.cushion_1kplus ?? 0) > 0 && (rep.cushion_1kplus_occurrences ?? 0) > 0) {
      tracking.push({
        repId: rep.id,
        repName: rep.name || rep.id,
        lane: '1kplus',
        cushion: rep.cushion_1kplus ?? 0,
        occurrences: rep.cushion_1kplus_occurrences ?? 0
      });
    }
  }

  return tracking;
}

/**
 * Subscribe to cushion changes (for real-time updates)
 */
export function subscribeCushionChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel('cushion_changes')
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'sales_reps',
      filter: 'cushion_sub1k=neq.null,cushion_1kplus=neq.null'
    }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}