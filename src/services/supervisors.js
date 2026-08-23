import { supabase } from './supabase';

export const supervisorsService = {
  async getByArea(areaId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, area_id')
      .eq('role', 'supervisor')
      .eq('is_active', true)
      .eq('area_id', areaId)
      .order('full_name');

    if (error) throw error;
    return data;
  },

  async getAllSupervisors() {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, full_name, email, area_id,
        areas ( id, name )
      `)
      .eq('role', 'supervisor')
      .eq('is_active', true)
      .order('full_name');

    if (error) throw error;
    return data;
  },

  async getSupervisorLoad() {
    const { data, error } = await supabase.rpc('get_supervisor_load');
    if (error) throw error;
    return data;
  },

  async getOperariaLoad() {
    const { data, error } = await supabase.rpc('get_operaria_load');
    if (error) throw error;
    return data;
  }
};