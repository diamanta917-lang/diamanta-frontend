import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { PageHeader } from '../../components/UI/PageHeader';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';

export const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const fetchLogs = useCallback(async () => {
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filter) query = query.or(`module.ilike.%${filter}%,action.ilike.%${filter}%,user_email.ilike.%${filter}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchLogs().then(setLogs);
  }, [fetchLogs]);

  const getActionColor = (action) => {
    if (action?.includes('Devolucion')) return 'danger';
    if (action?.includes('Aprobacion') || action?.includes('Aprobada')) return 'success';
    if (action?.includes('Importacion')) return 'info';
    if (action?.includes('Creacion') || action?.includes('creado')) return 'primary';
    return 'secondary';
  };

  const getModuleIcon = (module) => {
    const icons = {
      'Importar': 'bi-file-earmark-excel',
      'Escanear': 'bi-upc-scan',
      'Operarias': 'bi-people',
      'Login': 'bi-box-arrow-in-right',
      'Reportes': 'bi-file-earmark-bar-graph',
    };
    return icons[module] || 'bi-shield-check';
  };

  return (
    <div>
      <PageHeader title="Auditoría del Sistema" subtitle="Registro detallado de todas las acciones" icon="bi-shield-check" />

      <div className="card shadow-sm">
        <div className="card-header bg-white">
          <div className="row align-items-center">
            <div className="col-md-6">
              <h6 className="mb-0 fw-bold">
                <i className="bi bi-list-ul me-2"></i>
                Registro de Auditoría
                {logs.length > 0 && <span className="badge bg-primary ms-2">{logs.length}</span>}
              </h6>
            </div>
            <div className="col-md-4 ms-auto">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search text-muted"></i></span>
                <input type="text" className="form-control" placeholder="Filtrar por módulo, acción o usuario..."
                  value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); setLoading(true); }} />
                {filter && (
                  <button className="btn btn-outline-secondary" onClick={() => { setFilter(''); setPage(1); setLoading(true); }}>
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            {logs.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-inbox fs-1"></i>
                <p className="mt-2">No hay registros de auditoría</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Fecha/Hora</th>
                      <th>Usuario</th>
                      <th>Módulo</th>
                      <th>Acción</th>
                      <th>IP</th>
                      <th>Registro</th>
                      <th>Detalles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td>
                          <small className="text-muted">
                            {new Date(log.created_at).toLocaleString('es-ES')}
                          </small>
                        </td>
                        <td>
                          <span className="fw-semibold">{log.user_email || 'Sistema'}</span>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark">
                            <i className={`bi ${getModuleIcon(log.module)} me-1`}></i>
                            {log.module}
                          </span>
                        </td>
                        <td>
                          <span className={`badge bg-${getActionColor(log.action)} bg-opacity-10 text-${getActionColor(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td><small className="text-muted">{log.ip_address || 'N/A'}</small></td>
                        <td>
                          {log.record_id ? (
                            <span className="badge bg-secondary" style={{ fontSize: '0.7rem' }}>
                              {log.record_id.substring(0, 8)}...
                            </span>
                          ) : 'N/A'}
                        </td>
                        <td>
                          {log.details ? (
                            <button className="btn btn-outline-info btn-sm"
                              onClick={() => {
                                Swal.fire({
                                  title: 'Detalles',
                                  html: `<pre class="text-start">${JSON.stringify(log.details, null, 2)}</pre>`,
                                  confirmButtonColor: '#2563eb'
                                });
                              }}>
                              <i className="bi bi-eye"></i>
                            </button>
                          ) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="card-footer bg-white d-flex justify-content-between align-items-center">
              <small className="text-muted">Página {page}</small>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-primary btn-sm" disabled={page === 1}
                  onClick={() => { setPage(p => p - 1); setLoading(true); }}>
                  <i className="bi bi-chevron-left me-1"></i> Anterior
                </button>
                <button className="btn btn-outline-primary btn-sm"
                  onClick={() => { setPage(p => p + 1); setLoading(true); }}>
                  Siguiente <i className="bi bi-chevron-right ms-1"></i>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
