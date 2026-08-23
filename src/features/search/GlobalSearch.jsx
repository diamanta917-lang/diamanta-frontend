import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/useAuth';
import { garmentsService } from '../../services/garments';
import { productionCentersService } from '../../services/productionCenters';
import { pcOperariasService } from '../../services/pcOperarias';
import { PageHeader } from '../../components/UI/PageHeader';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { showError } from '../../components/UI/ConfirmDialog';
import Swal from 'sweetalert2';

export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filters, setFilters] = useState({ status: '', category: '', origin: '' });
  const [availableStatuses, setAvailableStatuses] = useState([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    supabase
      .from('garments')
      .select('status')
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(g => g.status).filter(Boolean))].sort();
          setAvailableStatuses(unique);
        }
      });
  }, []);

  const registerMovement = async (garmentId, fromStatus, toStatus, action, returnReasonId = null, observation = null) => {
    await supabase.from('movements').insert({
      garment_id: garmentId,
      user_id: user.id,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      return_reason_id: returnReasonId,
      observation
    });
  };

  const handleAddObservation = async (garment) => {
    const { value: text } = await Swal.fire({
      title: 'Agregar Observación',
      input: 'textarea',
      inputPlaceholder: 'Escriba la observación...',
      inputAttributes: { rows: 4 },
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d6efd',
      preConfirm: (val) => {
        if (!val || !val.trim()) {
          Swal.showValidationMessage('La observación no puede estar vacía');
          return false;
        }
        return val.trim();
      }
    });

    if (text) {
      await registerMovement(garment.id, garment.status, garment.status, 'Observación', null, text);
      Swal.fire({ icon: 'success', title: 'Observación guardada', timer: 1500, showConfirmButton: false });
    }
  };

  const handleReturnFromSearch = async (garment) => {
    const [centersRes, reasonsRes] = await Promise.all([
      productionCentersService.getAll(true),
      supabase.from('return_reasons').select('*').eq('is_active', true).order('name')
    ]);

    const centers = centersRes || [];
    const reasons = reasonsRes.data || [];

    if (centers.length === 0) {
      showError('No hay centros de producción activos. Cree uno desde Administración.');
      return;
    }

    const { value: formValues } = await Swal.fire({
      title: 'Devolver a Centro de Producción',
      html: `
        <div class="text-start mb-3">
          <p class="mb-1"><strong>Prenda:</strong> <span class="badge bg-secondary">${garment.barcode}</span></p>
          <p class="mb-0"><strong>Estado actual:</strong> ${garment.status}</p>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Centro de Producción</label>
          <select id="swal-center-s" class="form-select">
            <option value="">Seleccione un centro...</option>
            ${centers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Operario del Centro</label>
          <select id="swal-pc-operaria-s" class="form-select">
            <option value="">Primero seleccione un centro...</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Motivo de Devolución</label>
          <select id="swal-reason-s" class="form-select">
            <option value="">Seleccione un motivo...</option>
            ${reasons.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Observación (Opcional)</label>
          <textarea id="swal-observation-s" class="form-control" rows="3" placeholder="Describa el defecto..."></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Devolver',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      didOpen: () => {
        const centerSelect = document.getElementById('swal-center-s');
        const operariaSelect = document.getElementById('swal-pc-operaria-s');
        centerSelect.addEventListener('change', async () => {
          const centerId = centerSelect.value;
          operariaSelect.innerHTML = '<option value="">Cargando operarios...</option>';
          if (centerId) {
            const operarios = await pcOperariasService.getByCenter(centerId, true);
            operariaSelect.innerHTML = '<option value="">Seleccione un operario...</option>' +
              operarios.map(o => `<option value="${o.id}">${o.full_name}</option>`).join('');
          } else {
            operariaSelect.innerHTML = '<option value="">Primero seleccione un centro...</option>';
          }
        });
      },
      preConfirm: () => {
        const centerId = document.getElementById('swal-center-s').value;
        const operariaId = document.getElementById('swal-pc-operaria-s').value;
        const reasonId = document.getElementById('swal-reason-s').value;
        const observation = document.getElementById('swal-observation-s').value;
        if (!centerId) { Swal.showValidationMessage('Debe seleccionar un centro de producción'); return false; }
        if (!operariaId) { Swal.showValidationMessage('Debe seleccionar un operario del centro'); return false; }
        if (!reasonId) { Swal.showValidationMessage('Debe seleccionar un motivo de devolución'); return false; }
        return { centerId, operariaId, reasonId, observation };
      }
    });

    if (!formValues) return;

    const center = centers.find(c => c.id === formValues.centerId);

    await supabase.rpc('increment_return_count', { p_garment_id: garment.id });
    const { error } = await supabase.from('garments').update({
      status: 'Devuelta',
      current_location: `Centro de Producción - ${center?.name || ''}`,
      production_center_id: formValues.centerId,
      pc_operaria_id: formValues.operariaId
    }).eq('id', garment.id);

    if (error) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      return;
    }

    await registerMovement(garment.id, garment.status, 'Devuelta',
      'Devolución a Centro de Producción', formValues.reasonId, formValues.observation);

    const reason = reasons.find(r => r.id === formValues.reasonId);
    Swal.fire({
      icon: 'success', title: 'Prenda Devuelta',
      html: `<p>Centro: <strong>${center?.name || ''}</strong></p><p>Motivo: <strong>${reason?.name || ''}</strong></p>`,
      timer: 2500, showConfirmButton: false
    });

    setResults(prev => prev.map(g =>
      g.id === garment.id
        ? { ...g, status: 'Devuelta', current_location: `Centro de Producción - ${center?.name || ''}`, production_center_id: formValues.centerId, pc_operaria_id: formValues.operariaId }
        : g
    ));
  };

  const handleSearch = useCallback(async (searchQuery, activeFilters) => {
    if (!searchQuery && !activeFilters?.status && !activeFilters?.category && !activeFilters?.origin) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      let data;
      if (searchQuery) {
        data = await garmentsService.search(searchQuery);
      } else {
        data = await garmentsService.getAll(activeFilters);
      }
      setResults(data || []);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const doSearch = () => handleSearch(query, filters);

  const clearFilters = () => {
    setQuery('');
    setFilters({ status: '', category: '', origin: '' });
    setResults([]);
    setSearched(false);
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('es-ES');
  };

  return (
    <div>
      <PageHeader title="Búsqueda Global" subtitle="Encuentre cualquier prenda en el sistema" icon="bi-search" />

      {/* Search Bar */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold">
                <i className="bi bi-search me-1"></i>Término de búsqueda
              </label>
              <div className="input-group input-group-lg">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Buscar por código de barras, referencia, producto, operaria..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  autoFocus
                />
                <button className="btn btn-primary" onClick={doSearch} disabled={loading}>
                  {loading ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-search"></i>}
                </button>
              </div>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">Estado</label>
              <select className="form-select" value={filters.status}
                onChange={(e) => setFilters(p => ({ ...p, status: e.target.value }))}>
                <option value="">Todos</option>
                {availableStatuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">Categoría</label>
              <input type="text" className="form-control" placeholder="Categoría"
                value={filters.category} onChange={(e) => setFilters(p => ({ ...p, category: e.target.value }))} />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold">Origen</label>
              <input type="text" className="form-control" placeholder="Origen"
                value={filters.origin} onChange={(e) => setFilters(p => ({ ...p, origin: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 d-flex gap-2">
            <button className="btn btn-primary" onClick={doSearch} disabled={loading}>
              <i className="bi bi-search me-1"></i> Buscar
            </button>
            <button className="btn btn-outline-secondary" onClick={clearFilters}>
              <i className="bi bi-x-circle me-1"></i> Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading && <LoadingSpinner text="Buscando..." />}

      {!loading && searched && (
        <div className="card shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <h6 className="mb-0 fw-bold">
              <i className="bi bi-list-ul me-2"></i>
              Resultados {results.length > 0 && <span className="badge bg-primary ms-2">{results.length}</span>}
            </h6>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox fs-1"></i>
              <p className="mt-2">No se encontraron prendas con los criterios de búsqueda</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Código</th>
                    <th>Referencia</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Operaria</th>
                    <th>Área</th>
                    <th>Estado</th>
                    <th>Devoluciones</th>
                    <th>Ubicación</th>
                    <th>Último Movimiento</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((g) => (
                    <tr key={g.id}>
                      <td><span className="badge bg-secondary">{g.barcode}</span></td>
                      <td>{g.reference || 'N/A'}</td>
                      <td>{g.product_name || 'N/A'}</td>
                      <td>{g.category || 'N/A'}</td>
                      <td>{g.operaria_name || 'Sin asignar'}</td>
                      <td>{g.area_name || 'N/A'}</td>
                      <td><StatusBadge status={g.status} /></td>
                      <td>
                        {g.return_count > 0 ? (
                          <span className="badge bg-danger">{g.return_count}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td>{g.current_location || 'N/A'}</td>
                      <td><small className="text-muted">{formatDate(g.ultimo_movimiento)}</small></td>
                      <td>
                        <div className="d-flex gap-1">
                          <button className="btn btn-outline-primary btn-sm"
                            title="Ver trazabilidad"
                            onClick={() => navigate(`/search/${g.id}`)}>
                            <i className="bi bi-eye"></i>
                          </button>
                          <button className="btn btn-outline-info btn-sm"
                            title="Agregar observación"
                            onClick={() => handleAddObservation(g)}>
                            <i className="bi bi-chat-text"></i>
                          </button>
                          {g.status !== 'Requiere corrección' && g.status !== 'Aprobado' && g.status !== 'Devuelta' && g.status !== 'Despachada' && (
                            <button className="btn btn-outline-danger btn-sm"
                              title="Devolver a Centro de Producción"
                              onClick={() => handleReturnFromSearch(g)}>
                              <i className="bi bi-arrow-return-left"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && !searched && (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-arrow-up-circle" style={{ fontSize: '4rem' }}></i>
          <h5 className="mt-3">Ingrese un término de búsqueda</h5>
          <p>Puede buscar por código de barras, referencia, nombre de producto, operaria, categoría, estado o área</p>
        </div>
      )}
    </div>
  );
};
