import { supabase } from './supabase';

export const pcOperariasService = {
  async getByCenter(centerId, activeOnly = true) {
    let query = supabase.from('pc_operarias').select('*').eq('production_center_id', centerId).order('full_name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getAll(activeOnly = true) {
    let query = supabase.from('pc_operarias').select('*, production_centers(name)').order('full_name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async create(operaria) {
    const { data, error } = await supabase.from('pc_operarias').insert(operaria).select();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase.from('pc_operarias').update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
  },

  async deactivate(id) {
    return this.update(id, { is_active: false });
  },

  async reactivate(id) {
    return this.update(id, { is_active: true });
  },

  async remove(id) {
    const { error } = await supabase
      .from('pc_operarias')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};
