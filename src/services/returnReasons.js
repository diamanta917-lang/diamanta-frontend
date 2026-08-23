import { supabase } from './supabase';

export const returnReasonsService = {
  async getAll(activeOnly = true) {
    let query = supabase
      .from('return_reasons')
      .select('*')
      .order('name');

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async create(name) {
    const { data, error } = await supabase
      .from('return_reasons')
      .insert({ name })
      .select();

    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('return_reasons')
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

  async delete(id) {
    const { error } = await supabase
      .from('return_reasons')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
