import { supabase } from './supabase';

export const statusesService = {
  async getAll(activeOnly = true) {
    let query = supabase
      .from('garment_statuses')
      .select('*')
      .order('name');

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async create(status) {
    const { data, error } = await supabase
      .from('garment_statuses')
      .insert(status)
      .select();

    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('garment_statuses')
      .update(updates)
      .eq('id', id)
      .select();

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
      .from('garment_statuses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};
