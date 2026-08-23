import { supabase } from './supabase';

export const operariasService = {
  async getAll(activeOnly = true) {
    let query = supabase
      .from('operarias')
      .select(`
        *,
        areas ( id, name ),
        profiles!supervisor_id ( id, full_name, email )
      `)
      .order('full_name');

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getBySupervisor(supervisorId, activeOnly = true) {
    let query = supabase
      .from('operarias')
      .select(`
        *,
        areas ( id, name )
      `)
      .eq('supervisor_id', supervisorId)
      .order('full_name');

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async create(operaria) {
    const { data, error } = await supabase
      .from('operarias')
      .insert(operaria)
      .select();

    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('operarias')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    return data;
  },

  async deactivate(id) {
    return this.update(id, { is_active: false });
  },

  async remove(id) {
    const { error } = await supabase
      .from('operarias')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};