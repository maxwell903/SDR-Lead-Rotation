
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
 * Get original cushion setting for a rep in a specific lane
 */
export async function getOriginalCushionValue(
  repId: string,
  lane: Lane
): Promise<number> {
  const { data, error } = await supabase
    .from('sales_reps')
    .select('cushion_sub1k_original, cushion_1kplus_original')
    .eq('id', repId)
    .single();

  if (error) throw error;

  const originalCushion = lane === 'sub1k' 
    ? (data.cushion_sub1k_original ?? 0) 
    : (data.cushion_1kplus_original ?? 0);

  return originalCushion;
}

/**
 * Set cushion value AND occurrences for a rep in a specific lane
 */
/**
 * Set cushion value AND occurrences for a rep in a specific lane
 * Can optionally set the original cushion value
 */
export async function setCushionValue(
  repId: string,
  lane: Lane,
  value: number,
  occurrences?: number,
  originalValue?: number  // ⭐ NEW parameter
): Promise<void> {
  const cushionColumn = lane === 'sub1k' ? 'cushion_sub1k' : 'cushion_1kplus';
  const occurrencesColumn = lane === 'sub1k' ? 'cushion_sub1k_occurrences' : 'cushion_1kplus_occurrences';
  const originalColumn = lane === 'sub1k' ? 'cushion_sub1k_original' : 'cushion_1kplus_original';
  
  const updateData: any = {
    [cushionColumn]: Math.max(0, value),
    updated_at: new Date().toISOString()
  };

  // Only update occurrences if provided
  if (occurrences !== undefined) {
    updateData[occurrencesColumn] = Math.max(0, occurrences);
  }

  // ⭐ NEW: Update original value if provided
  if (originalValue !== undefined) {
    updateData[originalColumn] = Math.max(0, originalValue);
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
/**
 * Check cushion and decrement if needed
 * Returns whether a hit should be recorded
 * Handles occurrence cycling
 * 
 * BEHAVIOR:
 * - x2+ → x(n-1): No hit, no rotation movement (cushion absorbs)
 * - x1 → x0: YES hit, YES rotation movement, then check for occurrence reset
 * - x0: YES hit, YES rotation movement (normal behavior)
 */
export async function checkAndDecrementCushion(
  repId: string,
  lane: Lane
): Promise<{ shouldRecordHit: boolean; newCushionValue: number }> {
  // Get current state from database
  const { data: repData, error } = await supabase
    .from('sales_reps')
    .select('cushion_sub1k, cushion_1kplus, cushion_sub1k_occurrences, cushion_1kplus_occurrences, cushion_sub1k_original, cushion_1kplus_original')
    .eq('id', repId)
    .single();

  if (error) throw error;

  const currentCushion = lane === 'sub1k' 
    ? (repData.cushion_sub1k ?? 0) 
    : (repData.cushion_1kplus ?? 0);
  
  const currentOccurrences = lane === 'sub1k' 
    ? (repData.cushion_sub1k_occurrences ?? 0) 
    : (repData.cushion_1kplus_occurrences ?? 0);

  const originalCushion = lane === 'sub1k'
    ? (repData.cushion_sub1k_original ?? 0)
    : (repData.cushion_1kplus_original ?? 0);

  console.log(`🛡️ Cushion check for ${repId} (${lane}): x${currentCushion}, occurrences: ${currentOccurrences}, original: x${originalCushion}`);

  // No cushion and no occurrences - always record hit (normal behavior)
  if (currentCushion === 0 && currentOccurrences === 0) {
    console.log(`🛡️ No cushion active - hit recorded (normal behavior)`);
    return { shouldRecordHit: true, newCushionValue: 0 };
  }

  // Cushion is x2 or higher - absorb the lead, decrement cushion
  if (currentCushion >= 2) {
    const newCushion = currentCushion - 1;
    await setCushionValue(repId, lane, newCushion, currentOccurrences); // Keep same occurrences
    console.log(`🛡️ Cushion decremented: x${currentCushion} → x${newCushion} (no hit, same occurrence)`);
    return { shouldRecordHit: false, newCushionValue: newCushion };
  }

  // Cushion is x1 - this will record a hit and FINISH this occurrence
  if (currentCushion === 1) {
    console.log(`🛡️ Cushion at x1 → x0 (hit recorded, occurrence consumed)`);
    
    // Decrement occurrences (this cushioned position is done)
    const newOccurrences = Math.max(0, currentOccurrences - 1);
    
    if (newOccurrences > 0) {
      // More occurrences remain - reset to ORIGINAL cushion for next occurrence
      await setCushionValue(repId, lane, originalCushion, newOccurrences);
      console.log(`🔄 Occurrence finished. ${currentOccurrences} → ${newOccurrences}. Reset cushion to x${originalCushion} for next occurrence.`);
      return { shouldRecordHit: true, newCushionValue: originalCushion };
    } else {
      // No more occurrences - cushion exhausted permanently
      await setCushionValue(repId, lane, 0, 0);
      console.log(`🛡️ All occurrences exhausted - cushion permanently removed`);
      return { shouldRecordHit: true, newCushionValue: 0 };
    }
  }

  // Edge case: currentCushion is 0 but occurrences > 0
  // This means we're starting a new occurrence after the previous one finished
  if (currentCushion === 0 && currentOccurrences > 0) {
    // Reset to original cushion to start the next occurrence
    await setCushionValue(repId, lane, originalCushion, currentOccurrences);
    console.log(`🔄 Starting new occurrence: x0 → x${originalCushion} (occurrences: ${currentOccurrences})`);
    
    // Now decrement this new cushion
    if (originalCushion >= 2) {
      const newCushion = originalCushion - 1;
      await setCushionValue(repId, lane, newCushion, currentOccurrences);
      console.log(`🛡️ Cushion decremented: x${originalCushion} → x${newCushion} (no hit)`);
      return { shouldRecordHit: false, newCushionValue: newCushion };
    } else if (originalCushion === 1) {
      // Immediate x1 → x0
      const newOccurrences = currentOccurrences - 1;
      await setCushionValue(repId, lane, newOccurrences > 0 ? originalCushion : 0, newOccurrences);
      console.log(`🛡️ Cushion at x1 → hit recorded, occurrence consumed`);
      return { shouldRecordHit: true, newCushionValue: newOccurrences > 0 ? originalCushion : 0 };
    }
  }

  // Fallback (should not reach here)
  console.log(`⚠️ Unexpected state: cushion=${currentCushion}, occurrences=${currentOccurrences}`);
  return { shouldRecordHit: true, newCushionValue: 0 };
}

/**
 * Get all active cushion tracking data for display
 */
/**
 * Get all active cushion tracking data for display
 * Only shows reps with ACTIVE cushions (occurrences > 0 OR cushion > 0)
 */
/**
 * Get all active cushion tracking data for display
 * Only shows reps with active cushions (occurrences > 0)
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
    .select('id, name, cushion_sub1k, cushion_1kplus, cushion_sub1k_occurrences, cushion_1kplus_occurrences, cushion_sub1k_original, cushion_1kplus_original')
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
    // Check sub1k - only show if occurrences > 0
    const sub1kOccurrences = rep.cushion_sub1k_occurrences ?? 0;
    const sub1kOriginal = rep.cushion_sub1k_original ?? 0;
    const sub1kCurrent = rep.cushion_sub1k ?? 0;
    
    if (sub1kOccurrences > 0 && sub1kOriginal > 0) {
      tracking.push({
        repId: rep.id,
        repName: rep.name || rep.id,
        lane: 'sub1k',
        cushion: sub1kCurrent, // Show current cushion value for active position
        occurrences: sub1kOccurrences
      });
    }

    // Check 1kplus - only show if occurrences > 0
    const plus1kOccurrences = rep.cushion_1kplus_occurrences ?? 0;
    const plus1kOriginal = rep.cushion_1kplus_original ?? 0;
    const plus1kCurrent = rep.cushion_1kplus ?? 0;
    
    if (plus1kOccurrences > 0 && plus1kOriginal > 0) {
      tracking.push({
        repId: rep.id,
        repName: rep.name || rep.id,
        lane: '1kplus',
        cushion: plus1kCurrent, // Show current cushion value for active position
        occurrences: plus1kOccurrences
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