import { supabase } from '../lib/supabase';

export interface LeadReservation {
  id: string;
  repId: string;
  reservedBy: string;
  reservedByUsername: string;
  propertyTypes: string[];
  unitCount: number;
  lane: 'sub1k' | '1kplus';
  status: 'active' | 'released';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CreateReservationParams {
  repId: string;
  reservedByUsername: string;
  propertyTypes: string[];
  unitCount: number;
  lane: 'sub1k' | '1kplus';
}

/**
 * Create a new lead reservation
 */
export async function createReservation(params: CreateReservationParams): Promise<LeadReservation | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // First, check if there's already an active reservation for this rep
    const { data: existingReservation } = await supabase
      .from('lead_reservations')
      .select('*')
      .eq('rep_id', params.repId)
      .eq('status', 'active')
      .single();

    if (existingReservation) {
      throw new Error(`This rep is already reserved by ${existingReservation.reserved_by_username}`);
    }

    const { data, error } = await supabase
      .from('lead_reservations')
      .insert({
        rep_id: params.repId,
        reserved_by: user.id,
        reserved_by_username: params.reservedByUsername,
        property_types: params.propertyTypes,
        unit_count: params.unitCount,
        lane: params.lane,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      repId: data.rep_id,
      reservedBy: data.reserved_by,
      reservedByUsername: data.reserved_by_username,
      propertyTypes: data.property_types,
      unitCount: data.unit_count,
      lane: data.lane,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      expiresAt: data.expires_at
    };
  } catch (error) {
    console.error('Error creating reservation:', error);
    throw error;
  }
}

/**
 * Release a reservation (mark as released)
 */
export async function releaseReservation(reservationId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('lead_reservations')
      .update({
        status: 'released',
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId);

    if (error) throw error;
  } catch (error) {
    console.error('Error releasing reservation:', error);
    throw error;
  }
}

/**
 * Release a reservation by rep ID (for the current user)
 */
export async function releaseReservationByRepId(repId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('lead_reservations')
      .update({
        status: 'released',
        updated_at: new Date().toISOString()
      })
      .eq('rep_id', repId)
      .eq('reserved_by', user.id)
      .eq('status', 'active');

    if (error) throw error;
  } catch (error) {
    console.error('Error releasing reservation by rep ID:', error);
    throw error;
  }
}

/**
 * Delete a reservation by rep ID (for the current user)
 */
export async function deleteReservationByRepId(repId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    console.log('ðŸ—‘ï¸ Deleting reservation for rep:', repId);

    const { error } = await supabase
      .from('lead_reservations')
      .delete()
      .eq('rep_id', repId)
      .eq('reserved_by', user.id)
      .eq('status', 'active');

    if (error) throw error;
    console.log('âœ… Deleted reservation for rep:', repId);
  } catch (error) {
    console.error('âŒ Error deleting reservation:', error);
    throw error;
  }
}

export async function forceDeleteReservation(repId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('lead_reservations')
      .delete()
      .eq('rep_id', repId)
      .eq('status', 'active');

    if (error) throw error;
  } catch (error) {
    console.error('Error force deleting reservation:', error);
    throw error;
  }
}

/**
 * Get all active reservations
 */

/**
 * Delete reservation when a lead is assigned to the reserved rep
 * This is called automatically when a lead is saved to the reserved rep
 */
export async function deleteReservationOnLeadAssignment(repId: string, lane: 'sub1k' | '1kplus'): Promise<void> {
  try {
    console.log('🎯 Auto-deleting reservation after lead assignment:', { repId, lane });

    const { error } = await supabase
      .from('lead_reservations')
      .delete()
      .eq('rep_id', repId)
      .eq('lane', lane)
      .eq('status', 'active');

    if (error) throw error;
    console.log('✅ Auto-deleted reservation for rep:', repId);
  } catch (error) {
    console.error('❌ Error auto-deleting reservation:', error);
    // Don't throw - this is a cleanup operation
  }
}

export async function getActiveReservations(): Promise<Map<string, LeadReservation>> {
  try {
    const { data, error } = await supabase
      .from('lead_reservations')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString()); // Only get non-expired

    if (error) throw error;

    const reservationsMap = new Map<string, LeadReservation>();
    
    (data || []).forEach((reservation: any) => {
      reservationsMap.set(reservation.rep_id, {
        id: reservation.id,
        repId: reservation.rep_id,
        reservedBy: reservation.reserved_by,
        reservedByUsername: reservation.reserved_by_username,
        propertyTypes: reservation.property_types,
        unitCount: reservation.unit_count,
        lane: reservation.lane,
        status: reservation.status,
        createdAt: reservation.created_at,
        updatedAt: reservation.updated_at,
        expiresAt: reservation.expires_at
      });
    });

    return reservationsMap;
  } catch (error) {
    console.error('Error fetching active reservations:', error);
    return new Map();
  }
}

/**
 * Subscribe to real-time changes in reservations
 */
export function subscribeToReservations(
  callback: (reservations: Map<string, LeadReservation>) => void
): () => void {
  console.log('ðŸ“¡ Setting up reservation subscription...');
  
  getActiveReservations().then(reservations => {
    console.log('ðŸ“Š Initial reservations loaded:', reservations.size, 'active reservations');
    callback(reservations);
  });

  const subscription = supabase
    .channel('lead_reservations_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lead_reservations'
      },
      (payload: any) => {  // âœ… ADD TYPE HERE
        console.log('ðŸ”” Reservation change detected:', {
          event: payload.eventType,
          repId: (payload.new?.rep_id || payload.old?.rep_id) as string,  // âœ… ADD TYPE ASSERTION
          status: payload.new?.status || payload.old?.status,
          timestamp: new Date().toISOString()
        });
        
        getActiveReservations().then(reservations => {
          console.log('ðŸ“Š Reservations updated:', reservations.size, 'active reservations');
          callback(reservations);
        }).catch(error => {
          console.error('âŒ Error fetching reservations after change:', error);
        });
      }
    )
    .subscribe((status, err) => {
      if (err) {
        console.error('âŒ Subscription error:', err);
      } else {
        console.log('ðŸ“¡ Subscription status:', status);
      }
    });

  return () => {
    console.log('ðŸ“¡ Unsubscribing from reservations');
    subscription.unsubscribe();
  };
}


/**
 * Check if a rep is currently reserved
 */
export async function isRepReserved(repId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('lead_reservations')
      .select('id')
      .eq('rep_id', repId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking if rep is reserved:', error);
    return false;
  }
}

/**
 * Get the reservation for a specific rep (if exists and active)
 */
export async function getReservationForRep(repId: string): Promise<LeadReservation | null> {
  try {
    const { data, error } = await supabase
      .from('lead_reservations')
      .select('*')
      .eq('rep_id', repId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) return null;

    return {
      id: data.id,
      repId: data.rep_id,
      reservedBy: data.reserved_by,
      reservedByUsername: data.reserved_by_username,
      propertyTypes: data.property_types,
      unitCount: data.unit_count,
      lane: data.lane,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      expiresAt: data.expires_at
    };
  } catch (error) {
    console.error('Error getting reservation for rep:', error);
    return null;
  }
}