import { supabase } from './supabase';

export const areasService = {
  async getAll(activeOnly = true) {
    let query = supabase
      .from('areas')
      .select('*')
      .order('name');

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async create(name, description) {
    const { data, error } = await supabase
      .from('areas')
      .insert({ name, description })
      .select();

    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('areas')
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
      .from('areas')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};
