// src/services/auditTrailService.ts
import { supabase } from '../lib/supabase';

// ==================== TYPES ====================

export type AuditActionType = 
  // Lead Entry Actions
  | 'ADD_NL'           // Normal Lead added
  | 'DELETE_NL'        // Normal Lead deleted
  | 'NL_TO_MFR'        // Normal Lead marked for replacement
  | 'MFR_TO_NL'        // Unmarked for replacement
  | 'UPDATE_LEAD'      // Changes made to any leads in edit modal
  | 'MFR_TO_LRL'       // Replacement lead added (LRL ⇄ LTR swap)
  | 'DELETE_LRL'       // Delete replacement lead
  | 'LTR_TO_MFR'       // LTR converted back to MFR
  | 'DELETE_MFR'       // Delete MFR
  // Non-Lead Entry Actions
  | 'OOO'              // Out of office
  | 'SKIP'             // Skip day
  | 'DELETE_OOO'       // Delete OOO
  | 'DELETE_SKIP'      // Delete Skip
  // Sales Rep Actions
  | 'CREATE_REP'       // Create sales rep
  | 'DELETE_REP'       // Delete sales rep
  | 'REORDER_REP'      // Reorder sales rep position
  | 'UPDATE_REP';      // Update rep details

export interface AuditTrailRow {
  id: string;
  username: string;                    // Column 1: Who did it
  actionType: string;                  // Column 2: What they did
  accountNumberOrTime: string | null;  // Column 3: Account# or Time
  salesRepNames: string;               // Column 4: Affected rep(s)
  lane: string;                        // Column 5: Lane (sub 1k or 1k+)
  hitValueDisplay: string;             // Column 6: Hit value or position change
  hitValueTotalDisplay: string;        // Column 7: Total or replaced rep
  dateAssigned: string;                // ✅ NEW Column 8: Date Assigned (mm/dd/yy)
  timestamp: Date;                     // Column 8: When it happened
  rawAction: AuditActionRecord;        // Store raw data for debugging
}

export interface AuditActionRecord {
  id: string;
  user_id: string;
  action_type: string;
  table_name: string;
  record_id: string;
  action_subtype: AuditActionType | null;
  affected_rep_id: string | null;
  account_number: string | null;
  hit_value_change: number | null;
  hit_value_total: number | null;
  position_from: number | null;
  position_to: number | null;
  replaced_rep_id: string | null;
  time_input: string | null;
  lane: string | null;
  action_day: number | null;      
  action_month: number | null;    
  action_year: number | null;
  created_at: string;
  // User data from join
  user_email: string | null;
  user_metadata: any;
}

export interface GroupedAuditActions {
  date: string;           // YYYY-MM-DD format
  displayDate: string;    // "Today", "Yesterday", or formatted date
  actions: AuditTrailRow[];
}

// ==================== DATABASE QUERIES ====================

/**
 * Fetch audit actions with user information
 * Returns actions ordered by most recent first
 */
// Replace the fetchAuditActions function in auditTrailService.ts

export async function fetchAuditActions(options: {
  limit?: number;
  beforeDate?: Date;
  afterDate?: Date;
  specificDate?: Date;
}): Promise<AuditActionRecord[]> {
  const { limit = 50, beforeDate, afterDate, specificDate } = options;

  let query = supabase
    .from('actions')
    .select(`
      id,
      user_id,
      action_type,
      table_name,
      record_id,
      action_subtype,
      affected_rep_id,
      account_number,
      hit_value_change,
      hit_value_total,
      position_from,
      position_to,
      replaced_rep_id,
      time_input,
      lane,
      action_day,
      action_month,
      action_year,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Apply date filters
  if (specificDate) {
    const startOfDay = new Date(specificDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(specificDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    query = query
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
  } else {
    if (beforeDate) {
      query = query.lt('created_at', beforeDate.toISOString());
    }
    if (afterDate) {
      query = query.gt('created_at', afterDate.toISOString());
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching audit actions:', error);
    throw error;
  }

  // ✅ NEW: Fetch user data from profiles table instead of auth.admin
  const userIds = [...new Set((data || []).map(action => action.user_id))];
  const userDataMap = new Map<string, { email: string; username?: string }>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, username')
      .in('id', userIds);

    if (!profilesError && profiles) {
      profiles.forEach(profile => {
        userDataMap.set(profile.id, {
          email: profile.email || 'Unknown',
          username: profile.username
        });
      });
    }
  }

  // Combine action data with user data from profiles
  return (data || []).map(action => ({
    ...action,
    user_email: userDataMap.get(action.user_id)?.email || null,
    user_metadata: {
      username: userDataMap.get(action.user_id)?.username || null
    }
  })) as AuditActionRecord[];
}
/**
 * Fetch actions for today only
 */
export async function fetchTodaysActions(): Promise<AuditActionRecord[]> {
  const today = new Date();
  return fetchAuditActions({ specificDate: today, limit: 100 });
}

/**
 * Fetch actions for the next day that has activity (going backwards in time)
 */
export async function fetchNextDayActions(beforeDate: Date): Promise<{
  actions: AuditActionRecord[];
  date: Date | null;
}> {
  // Get the date before the given date
  const startOfPreviousDay = new Date(beforeDate);
  startOfPreviousDay.setDate(startOfPreviousDay.getDate() - 1);
  startOfPreviousDay.setHours(0, 0, 0, 0);

  // Query for actions before the given date, limited to find the next day
  const { data, error } = await supabase
    .from('actions')
    .select('created_at')
    .lt('created_at', beforeDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { actions: [], date: null };
  }

  // Get the date of the found action
  const nextActionDate = new Date(data[0].created_at);
  
  // Fetch all actions for that specific day
  const actions = await fetchAuditActions({ 
    specificDate: nextActionDate, 
    limit: 100 
  });

  return { actions, date: nextActionDate };
}

/**
 * Get sales rep name by ID
 */
async function getRepName(repId: string | null): Promise<string> {
  if (!repId) return '';
  
  const { data, error } = await supabase
    .from('sales_reps')
    .select('name')
    .eq('id', repId)
    .single();

  if (error || !data) return `Rep ${repId}`;
  return data.name || `Rep ${repId}`;
}

/**
 * Get multiple sales rep names by IDs
 */
async function getRepNames(repIds: (string | null)[]): Promise<Map<string, string>> {
  const validIds = repIds.filter((id): id is string => id !== null && id !== '');
  if (validIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('sales_reps')
    .select('id, name')
    .in('id', validIds);

  const nameMap = new Map<string, string>();
  if (!error && data) {
    data.forEach(rep => {
      nameMap.set(rep.id, rep.name || `Rep ${rep.id}`);
    });
  }

  return nameMap;
}

// ==================== TRANSFORMATION FUNCTIONS ====================

/**
 * Transform database action record into display-ready audit trail row
 */
export async function transformAuditAction(
  action: AuditActionRecord,
  repNamesCache: Map<string, string> = new Map()
): Promise<AuditTrailRow> {
  const metadata = action.user_metadata;

  // Column 1: Username
  const username = metadata?.username || 
                   action.user_email?.split('@')[0] || 
                   'Unknown User';

  // Column 2: Action Type
  let actionType = '';
  if (action.action_type === 'UPDATE' && action.action_subtype === 'SKIP') {
    actionType = 'Skip Update';
  } else if (action.action_type === 'UPDATE' && action.action_subtype === 'OOO') {
    actionType = 'OOO Update';
  } else {
    actionType = formatActionType(action.action_subtype || action.action_type);
  }

  // Column 3: Account Number or Time
  let accountNumberOrTime: string | null = null;
  if (action.account_number) {
    accountNumberOrTime = action.account_number;
  } else if (action.time_input) {
    accountNumberOrTime = action.time_input;
  }

  // Column 4: Sales Rep Names
  let salesRepNames = '';
  if (action.affected_rep_id) {
    const repName = repNamesCache.get(action.affected_rep_id) || 
                    await getRepName(action.affected_rep_id);
    repNamesCache.set(action.affected_rep_id, repName);
    salesRepNames = repName;
  }

  // Column 5: Lane
  let lane = '';
  if (action.lane) {
    if (action.lane === 'sub1k') {
      lane = 'Sub 1k';
    } else if (action.lane === '1kplus') {
      lane = '1k+';
    } else if (action.lane === 'both') {
      lane = 'Both';
    } else {
      lane = action.lane;
    }
  }

  // Column 6: Hit Value Display
  let hitValueDisplay = '';
  if (action.action_subtype?.includes('REP')) {
    if (action.action_subtype === 'REORDER_REP' && 
        action.position_from !== null && 
        action.position_to !== null) {
      hitValueDisplay = `${action.position_from} → ${action.position_to}`;
    } else if (action.action_subtype === 'CREATE_REP' && action.position_to !== null) {
      hitValueDisplay = `Position ${action.position_to}`;
    } else if (action.action_subtype === 'DELETE_REP' && action.position_from !== null) {
      hitValueDisplay = `Position ${action.position_from}`;
    }
  } else {
    if (action.hit_value_change !== null && action.hit_value_change !== 0) {
      const sign = action.hit_value_change > 0 ? '+' : '';
      hitValueDisplay = `${sign}${action.hit_value_change}`;
    }
  }

  // Column 7: Hit Value Total Display
  let hitValueTotalDisplay = '';
  if (action.action_subtype?.includes('REP')) {
    if (action.action_subtype === 'REORDER_REP' && action.replaced_rep_id) {
      const replacedRepName = repNamesCache.get(action.replaced_rep_id) || 
                             await getRepName(action.replaced_rep_id);
      repNamesCache.set(action.replaced_rep_id, replacedRepName);
      hitValueTotalDisplay = `Took ${replacedRepName}'s spot`;
    }
  } else {
    if (action.hit_value_change !== null && action.hit_value_total !== null) {
      const startingValue = action.hit_value_total;
      const change = action.hit_value_change;
      const endingValue = startingValue + change;
      const operator = change >= 0 ? '+' : '-';
      const absChange = Math.abs(change);
      
      hitValueTotalDisplay = `${startingValue} ${operator} ${absChange} = ${endingValue}`;
    }
  }

  // ✅ NEW Column 8: Date Assigned (mm/dd/yy format)
  let dateAssigned = '';
  if (action.action_day && action.action_month && action.action_year) {
    // Format as mm/dd/yy
    const month = action.action_month.toString().padStart(2, '0');
    const day = action.action_day.toString().padStart(2, '0');
    const year = action.action_year.toString().slice(-2); // Last 2 digits of year
    dateAssigned = `${month}/${day}/${year}`;
  }

  // Column 9: Timestamp (was Column 8)
  const timestamp = new Date(action.created_at);

  return {
    id: action.id,
    username,
    actionType,
    accountNumberOrTime,
    salesRepNames,
    lane,
    hitValueDisplay,
    hitValueTotalDisplay,
    dateAssigned,   // ✅ NEW
    timestamp,
    rawAction: action
  };
}

/**
 * Format action type to human-readable string
 */
function formatActionType(actionType: string | null): string {
  if (!actionType) return 'Unknown';

  const formatMap: Record<string, string> = {
    // Lead actions
    'ADD_NL': 'ADD NL',
    'DELETE_NL': 'Delete NL',
    'UPDATE_LEAD': 'Update Lead',  // ✅ ADD THIS
    'NL_TO_MFR': 'NL → MFR',
    'MFR_TO_NL': 'MFR → NL',
    'MFR_TO_LRL': 'MFR → LRL ⇄ LTR',
    'DELETE_LRL': 'Delete LRL',
    'LTR_TO_MFR': 'LTR → MFR',
    'DELETE_MFR': 'Delete MFR',
    // Non-lead actions
    'OOO': 'OOO',
    'SKIP': 'Skip',
    'DELETE_OOO': 'Delete OOO',
    'DELETE_SKIP': 'Delete Skip',
    // Sales rep actions
    'CREATE_REP': 'Create',
    'DELETE_REP': 'Delete',
    'REORDER_REP': 'Reorder',
    'UPDATE_REP': 'Update',
    // Fallback for generic actions
    'CREATE': 'Create',
    'UPDATE': 'Update',
    'DELETE': 'Delete'
  };

  return formatMap[actionType] || actionType;
}

/**
 * Group actions by date
 */
export async function groupActionsByDate(
  actions: AuditActionRecord[]
): Promise<GroupedAuditActions[]> {
  if (actions.length === 0) return [];

  // Collect all unique rep IDs for batch fetching
  const repIds = new Set<string>();
  actions.forEach(action => {
    if (action.affected_rep_id) repIds.add(action.affected_rep_id);
    if (action.replaced_rep_id) repIds.add(action.replaced_rep_id);
  });

  // Fetch all rep names at once
  const repNamesCache = await getRepNames(Array.from(repIds));

  // Group by date
  const grouped = new Map<string, AuditTrailRow[]>();

  for (const action of actions) {
    const date = new Date(action.created_at);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }

    const transformedRow = await transformAuditAction(action, repNamesCache);
    grouped.get(dateKey)!.push(transformedRow);
  }

  // Convert to array and add display dates
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  return Array.from(grouped.entries())
    .map(([dateKey, actions]) => ({
      date: dateKey,
      displayDate: dateKey === today ? 'Today' : 
                   dateKey === yesterday ? 'Yesterday' :
                   new Date(dateKey).toLocaleDateString('en-US', { 
                     weekday: 'short', 
                     month: 'short', 
                     day: 'numeric',
                     year: 'numeric'
                   }),
      actions: actions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    }))
    .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
}

// ==================== REAL-TIME SUBSCRIPTION ====================

/**
 * Subscribe to new audit trail actions
 */
export function subscribeToAuditTrail(
  onNewAction: (action: AuditActionRecord) => void
): () => void {
  const channel = supabase
    .channel('audit_trail_realtime')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'actions'
    }, async (payload) => {
      console.log('🔔 New audit action:', payload);
      
      // Fetch user data for the new action
      const userId = (payload.new as any).user_id;
      let userEmail: string | null = null;
      let userMetadata: any = {};

      if (userId) {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) {
          userEmail = userData.user.email || null;
          userMetadata = {
            username: userData.user.user_metadata?.username || 
                     userData.user.user_metadata?.display_name || null
          };
        }
      }

      const enrichedAction: AuditActionRecord = {
        ...(payload.new as any),
        user_email: userEmail,
        user_metadata: userMetadata
      };

      onNewAction(enrichedAction);
    })
    .subscribe();

  return () => {
    console.log('🧹 Cleaning up audit trail subscription');
    supabase.removeChannel(channel);
  };
}

// ==================== EXPORT ALL ====================

export const auditTrailService = {
  fetchAuditActions,
  fetchTodaysActions,
  fetchNextDayActions,
  groupActionsByDate,
  transformAuditAction,
  subscribeToAuditTrail
};