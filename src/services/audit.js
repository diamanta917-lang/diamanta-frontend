import { supabase } from './supabase';

export const auditService = {
  async log({ userId, userEmail, action, module, ipAddress, recordId, details }) {
    try {
      const { error } = await supabase.rpc('log_audit', {
        p_user_id: userId,
        p_user_email: userEmail,
        p_action: action,
        p_module: module,
        p_ip_address: ipAddress,
        p_record_id: recordId,
        p_details: details
      });

      if (error) console.error('Error logging audit:', error);
    } catch (err) {
      console.error('Exception logging audit:', err);
    }
  },

  async getAll({ limit = 100, offset = 0, module, action } = {}) {
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (module) query = query.eq('module', module);
    if (action) query = query.ilike('action', `%${action}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getCount() {
    const { count, error } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count;
  }
};
