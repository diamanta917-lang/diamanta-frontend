import { supabase } from './supabase';

export const movementsService = {
  async getByGarmentId(garmentId) {
    const { data, error } = await supabase
      .from('movements')
      .select(`
        *,
        return_reasons ( id, name )
      `)
      .eq('garment_id', garmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getFullHistory(garmentId) {
    const { data, error } = await supabase
      .rpc('get_garment_full_history', { p_garment_id: garmentId });
    if (error) throw error;
    return data;
  }
};