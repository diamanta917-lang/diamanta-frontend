import { supabase } from './supabase';

export const garmentsService = {
  async getAll(filters = {}) {
    let query = supabase
      .from('garments')
      .select(`
        *,
        operarias (
          id,
          full_name,
          areas ( id, name )
        )
      `);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.origin) query = query.eq('origin', filters.origin);
    if (filters.operaria_id) query = query.eq('operaria_id', filters.operaria_id);
    if (filters.barcode) query = query.ilike('barcode', `%${filters.barcode}%`);
    if (filters.current_location) query = query.eq('current_location', filters.current_location);
    if (filters.current_area_id) query = query.eq('current_area_id', filters.current_area_id);
    if (filters.current_supervisor_id) query = query.eq('current_supervisor_id', filters.current_supervisor_id);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getByBarcode(barcode) {
    const { data, error } = await supabase
      .from('garments')
      .select(`
        *,
        operarias (
          id,
          full_name,
          areas ( id, name )
        )
      `)
      .eq('barcode', barcode)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getByBarcodeOrReference(code) {
    const { data, error } = await supabase
      .from('garments')
      .select(`
        *,
        operarias ( id, full_name, areas ( id, name ) )
      `)
      .or(`barcode.eq.${code},reference.eq.${code}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('garments')
      .select(`
        *,
        operarias (
          id,
          full_name,
          areas ( id, name )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('garments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();

    if (error) throw error;
    return data;
  },

  async search(query) {
    const { data, error } = await supabase
      .rpc('search_garments', { p_search: query });

    if (error) throw error;
    return data;
  },

  async getDashboardMetrics() {
    const { data, error } = await supabase.rpc('get_dashboard_metrics');
    if (error) throw error;
    return data;
  },

  async incrementReturnCount(garmentId) {
    const { data, error } = await supabase.rpc('increment_return_count', {
      p_garment_id: garmentId
    });
    if (error) throw error;
    return data;
  },

  async getBySupervisor(supervisorId) {
    const { data, error } = await supabase
      .rpc('get_garments_by_supervisor', { p_supervisor_id: supervisorId });
    if (error) throw error;
    return data;
  },

  async getByOperaria(operariaId) {
    const { data, error } = await supabase
      .rpc('get_garments_by_operaria', { p_operaria_id: operariaId });
    if (error) throw error;
    return data;
  },

  async getPendingReception(areaId) {
    const { data, error } = await supabase
      .from('garments')
      .select(`
        *,
        operarias ( id, full_name, areas ( id, name ) ),
        movements!garment_id ( id, action, observation, created_at )
      `)
      .eq('status', 'Pendiente Recepcion')
      .eq('current_area_id', areaId)
      .order('created_at', { foreignTable: 'movements', ascending: false })
      .limit(1, { foreignTable: 'movements' })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getQcReceivedGarments(supervisorId, areaId) {
    let query = supabase
      .from('garments')
      .select(`
        *,
        operarias ( id, full_name, areas ( id, name ) )
      `)
      .eq('status', 'Recibido por control de calidad')
      .order('updated_at', { ascending: false });
    if (supervisorId) query = query.eq('current_supervisor_id', supervisorId);
    if (areaId) query = query.eq('current_area_id', areaId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getFinished() {
    const { data, error } = await supabase
      .from('garments')
      .select(`
        *,
        operarias ( id, full_name, areas ( id, name ) )
      `)
      .eq('is_finished', true)
      .order('finished_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async transitionToArea(garmentId, destAreaId, supervisorId) {
    const { error } = await supabase
      .rpc('transition_garment_to_area', {
        p_garment_id: garmentId,
        p_dest_area_id: destAreaId,
        p_supervisor_id: supervisorId
      });
    if (error) throw error;
  },

  async receptionGarment(garmentId, supervisorId) {
    const { error } = await supabase
      .rpc('reception_garment', {
        p_garment_id: garmentId,
        p_supervisor_id: supervisorId
      });
    if (error) throw error;
  },

  async finishGarment(garmentId, supervisorPrincipalId) {
    const { error } = await supabase
      .rpc('finish_garment', {
        p_garment_id: garmentId,
        p_supervisor_principal_id: supervisorPrincipalId
      });
    if (error) throw error;
  },

  async reassignOperaria(garmentId, newOperariaId, returnReasonId, observation) {
    const { error } = await supabase
      .rpc('reassign_garment_operaria', {
        p_garment_id: garmentId,
        p_new_operaria_id: newOperariaId,
        p_return_reason_id: returnReasonId,
        p_observation: observation
      });
    if (error) throw error;
  },

  async getApprovedBySupervisor(supervisorId, areaId) {
    let query = supabase
      .from('garments')
      .select(`
        *,
        operarias ( id, full_name, areas ( id, name ) )
      `)
      .in('status', ['Aprobada', 'Aprobado'])
      .eq('current_supervisor_id', supervisorId)
      .order('updated_at', { ascending: false });
    if (areaId) query = query.eq('current_area_id', areaId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getReadyForFinalReview() {
    const { data, error } = await supabase
      .from('garments')
      .select(`
        *,
        operarias ( id, full_name, areas ( id, name ) )
      `)
      .in('status', ['Aprobada', 'Aprobado'])
      .eq('is_finished', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async returnFromReview(garmentId, supervisorId, destAreaId, observation) {
    const { error } = await supabase
      .rpc('return_garment_from_review', {
        p_garment_id: garmentId,
        p_supervisor_principal_id: supervisorId,
        p_dest_area_id: destAreaId,
        p_observation: observation,
      });
    if (error) throw error;
  }
};