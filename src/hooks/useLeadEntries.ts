import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LeadEntry } from '../types';

export function useLeadEntries(month: number, year: number) {
  const [leadEntries, setLeadEntries] = useState<LeadEntry[]>([]);

  async function fetchEntries() {
    const { data, error } = await supabase
      .from('lead_entries')
      .select('*')
      .eq('month', month)
      .eq('year', year);
    if (!error && data) setLeadEntries(data as LeadEntry[]);
  }

  useEffect(() => {
    fetchEntries();

    const channel = supabase
      .channel('lead_entries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_entries' },
        () => fetchEntries()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [month, year]);

  return leadEntries;
}
