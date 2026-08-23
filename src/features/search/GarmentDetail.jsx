import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/useAuth';
import { garmentsService } from '../../services/garments';
import { movementsService } from '../../services/movements';
import { productionCentersService } from '../../services/productionCenters';
import { pcOperariasService } from '../../services/pcOperarias';
import { showError } from '../../components/UI/ConfirmDialog';
import { PageHeader } from '../../components/UI/PageHeader';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';

export const GarmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [garment, setGarment] = useState(null);
  const [movements, setMovements] = useState([]);
  const [fullHistory, setFullHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const { user } = useAuth();

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

  const handleAddObservation = async () => {
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
        if (!val || !val.trim()) { Swal.showValidationMessage('La observación no puede estar vacía'); return false; }
        return val.trim();
      }
    });
    if (text) {
      await registerMovement(garment.id, garment.status, garment.status, 'Observación', null, text);
      Swal.fire({ icon: 'success', title: 'Observación guardada', timer: 1500, showConfirmButton: false });
      // Reload movements
      const m = await movementsService.getByGarmentId(id);
      setMovements(m);
    }
  };

  const handleReturn = async () => {
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
          <select id="swal-center-d" class="form-select">
            <option value="">Seleccione un centro...</option>
            ${centers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Operario del Centro</label>
          <select id="swal-pc-operaria-d" class="form-select">
            <option value="">Primero seleccione un centro...</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Motivo de Devolución</label>
          <select id="swal-reason-d" class="form-select">
            <option value="">Seleccione un motivo...</option>
            ${reasons.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Observación (Opcional)</label>
          <textarea id="swal-observation-d" class="form-control" rows="3" placeholder="Describa el defecto..."></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Devolver',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      didOpen: () => {
        const centerSelect = document.getElementById('swal-center-d');
        const operariaSelect = document.getElementById('swal-pc-operaria-d');
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
        const centerId = document.getElementById('swal-center-d').value;
        const operariaId = document.getElementById('swal-pc-operaria-d').value;
        const reasonId = document.getElementById('swal-reason-d').value;
        const observation = document.getElementById('swal-observation-d').value;
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

    setGarment(prev => ({
      ...prev,
      status: 'Devuelta',
      current_location: `Centro de Producción - ${center?.name || ''}`,
      production_center_id: formValues.centerId,
      pc_operaria_id: formValues.operariaId,
      return_count: (prev.return_count || 0) + 1
    }));
    const m = await movementsService.getByGarmentId(id);
    setMovements(m);

    const reason = reasons.find(r => r.id === formValues.reasonId);
    Swal.fire({
      icon: 'success', title: 'Prenda Devuelta',
      html: `<p>Centro: <strong>${center?.name || ''}</strong></p><p>Motivo: <strong>${reason?.name || ''}</strong></p>`,
      timer: 2500, showConfirmButton: false
    });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [g, m, hist] = await Promise.all([
          garmentsService.getById(id),
          movementsService.getByGarmentId(id),
          movementsService.getFullHistory(id).catch(() => [])
        ]);
        setGarment(g);
        setMovements(m);
        setFullHistory(hist || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!garment) return (
    <div className="text-center py-5">
      <i className="bi bi-exclamation-triangle fs-1 text-warning"></i>
      <h4 className="mt-3">Prenda no encontrada</h4>
      <button className="btn btn-primary mt-3" onClick={() => navigate('/search')}>
        Volver a Búsqueda
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader title="Trazabilidad de Prenda"
        subtitle={`Código: ${garment.barcode}`}
        icon="bi-diagram-3"
        actions={
          <button className="btn btn-outline-secondary" onClick={() => navigate('/search')}>
            <i className="bi bi-arrow-left me-1"></i> Volver
          </button>
        }
      />

      {/* Garment Info */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-white">
              <h6 className="mb-0 fw-bold"><i className="bi bi-info-circle me-2"></i>Información General</h6>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="text-muted small">Código de Barras</label>
                  <p className="fw-bold mb-0"><span className="badge bg-secondary fs-6">{garment.barcode}</span></p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Referencia</label>
                  <p className="fw-bold mb-0">{garment.reference || 'N/A'}</p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Producto</label>
                  <p className="fw-bold mb-0">{garment.product_name || 'N/A'}</p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Categoría</label>
                  <p className="mb-0">{garment.category || 'N/A'}</p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Origen</label>
                  <p className="mb-0">{garment.origin || 'N/A'}</p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Estado</label>
                  <p className="mb-0"><StatusBadge status={garment.status} size="lg" /></p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Asignada</label>
                  <p className="mb-0">{garment.assigned_at ? new Date(garment.assigned_at).toLocaleString('es-ES') : '—'}</p>
                </div>
                <div className="col-md-4">
                  <label className="text-muted small">Finalizada</label>
                  <p className="mb-0">{garment.finished_at ? new Date(garment.finished_at).toLocaleString('es-ES') : '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="col-lg-4">
          <div className="card shadow-sm h-100 border-primary">
            <div className="card-header bg-primary text-white">
              <h6 className="mb-0"><i className="bi bi-geo-alt me-2"></i>Ubicación Actual</h6>
            </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="text-muted small">Ubicación</label>
                  <p className="fw-bold fs-5 mb-0">
                    <span className="badge bg-info fs-6">{garment.current_location || 'N/A'}</span>
                  </p>
                </div>
                <div className="mb-3">
                  <label className="text-muted small">Operaria Responsable</label>
                  <p className="fw-bold mb-0">{garment.operarias?.full_name || 'Sin asignar'}</p>
                </div>
                <div className="mb-3">
                  <label className="text-muted small">Área de Producción</label>
                  <p className="mb-0">
                    <i className="bi bi-building me-1"></i>
                    {garment.operarias?.areas?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-muted small">Devoluciones</label>
                  <p className="mb-0">
                    {garment.return_count > 0 ? (
                      <span className="badge bg-danger fs-6">{garment.return_count} devolución(es)</span>
                    ) : (
                      <span className="badge bg-success fs-6">Sin devoluciones</span>
                    )}
                  </p>
                </div>
                <hr />
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-info btn-sm" onClick={handleAddObservation}>
                    <i className="bi bi-chat-text me-1"></i>Observación
                  </button>
                  {garment.status !== 'Devuelta' && garment.status !== 'Terminado' && !garment.is_finished && garment.status !== 'Aprobada' && garment.status !== 'Aprobado' && garment.status !== 'Requiere corrección' && (
                    <button className="btn btn-outline-danger btn-sm" onClick={handleReturn}>
                      <i className="bi bi-arrow-return-left me-1"></i>Devolver a Producción
                    </button>
                  )}
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold"><i className="bi bi-clock-history me-2"></i>Historial de Movimientos</h6>
          {fullHistory.length > 0 && (
            <button className="btn btn-outline-primary btn-sm" onClick={() => setShowFullHistory(!showFullHistory)}>
              <i className="bi bi-list-ul me-1"></i>{showFullHistory ? 'Ver básico' : 'Ver completo'}
            </button>
          )}
        </div>
        <div className="card-body">
          {showFullHistory && fullHistory.length > 0 ? (
            <div className="timeline-vertical">
              {fullHistory.map((h, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-marker">
                    <div className={`timeline-dot bg-${
                      h.to_status === 'Terminado' ? 'success' :
                      h.to_status === 'Devuelta' || h.to_status === 'Requiere corrección' ? 'danger' :
                      h.action?.includes('Pasar') || h.action?.includes('Recepción') ? 'info' :
                      'primary'
                    }`}></div>
                    {i < fullHistory.length - 1 && <div className="timeline-line"></div>}
                  </div>
                  <div className="timeline-content card border-start border-4 mb-2"
                    style={{
                      borderLeftColor:
                        h.to_status === 'Terminado' ? '#198754' :
                        h.to_status === 'Devuelta' || h.to_status === 'Requiere corrección' ? '#dc3545' :
                        h.action?.includes('Pasar') || h.action?.includes('Recepción') ? '#0dcaf0' :
                        '#2563eb'
                    }}>
                    <div className="card-body p-2">
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <small className="fw-bold">{h.action}</small>
                        <small className="text-muted">{new Date(h.event_date).toLocaleString('es-ES')}</small>
                      </div>
                      {(h.from_area || h.to_area) && (
                        <small className="d-block text-muted">
                          <i className="bi bi-building me-1"></i>{h.from_area || '—'} → {h.to_area || '—'}
                        </small>
                      )}
                      {(h.from_supervisor || h.to_supervisor) && (
                        <small className="d-block text-muted">
                          <i className="bi bi-person-badge me-1"></i>{h.from_supervisor || '—'} → {h.to_supervisor || '—'}
                        </small>
                      )}
                      {(h.old_operaria || h.new_operaria) && (
                        <small className="d-block text-muted">
                          <i className="bi bi-person me-1"></i>{h.old_operaria || '—'} → {h.new_operaria || '—'}
                        </small>
                      )}
                      {(h.from_status || h.to_status) && (
                        <div className="mt-1">
                          {h.from_status && <StatusBadge status={h.from_status} />}
                          {h.from_status && h.to_status && <i className="bi bi-arrow-right mx-1"></i>}
                          {h.to_status && <StatusBadge status={h.to_status} />}
                        </div>
                      )}
                      {h.reason && (
                        <p className="mb-1 text-danger small mt-1">
                          <i className="bi bi-exclamation-triangle me-1"></i>Motivo: {h.reason}
                        </p>
                      )}
                      {h.observation && (
                        <p className="mb-1 text-muted small">
                          <i className="bi bi-chat-text me-1"></i>{h.observation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <i className="bi bi-inbox fs-1"></i>
              <p className="mt-2">Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="timeline-vertical">
              {movements.map((m, i) => (
                <div key={m.id} className="timeline-item">
                  <div className="timeline-marker">
                    <div className={`timeline-dot bg-${m.to_status === 'Terminado' ? 'success' : m.to_status === 'Devuelta' ? 'danger' : 'primary'}`}></div>
                    {i < movements.length - 1 && <div className="timeline-line"></div>}
                  </div>
                  <div className="timeline-content card border-start border-4 mb-3"
                    style={{ borderLeftColor: m.to_status === 'Terminado' ? '#198754' : m.to_status === 'Devuelta' ? '#dc3545' : '#2563eb' }}>
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="mb-0">{m.action}</h6>
                        <small className="text-muted">{new Date(m.created_at).toLocaleString('es-ES')}</small>
                      </div>
                      <div className="mb-2">
                        <span className="badge bg-secondary me-1">{m.from_status || 'N/A'}</span>
                        <i className="bi bi-arrow-right mx-1"></i>
                        <StatusBadge status={m.to_status} />
                      </div>
                      {m.return_reasons?.name && (
                        <p className="mb-1 text-danger small">
                          <i className="bi bi-exclamation-triangle me-1"></i>
                          Motivo: {m.return_reasons.name}
                        </p>
                      )}
                      {m.observation && (
                        <p className="mb-1 text-muted small">
                          <i className="bi bi-chat-text me-1"></i>
                          {m.observation}
                        </p>
                      )}
                      <small className="text-muted">
                        <i className="bi bi-person me-1"></i>
                        Sistema
                      </small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
