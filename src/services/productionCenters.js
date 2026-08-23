import { supabase } from './supabase';

export const productionCentersService = {
  async getAll(activeOnly = true) {
    let query = supabase.from('production_centers').select('*').order('name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async create(name, description = '') {
    const { data, error } = await supabase.from('production_centers').insert({ name, description }).select();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase.from('production_centers').update(updates).eq('id', id).select();
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
      .from('production_centers')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};
