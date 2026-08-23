import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/useAuth';
import { garmentsService } from '../../services/garments';
import { movementsService } from '../../services/movements';
import { areasService } from '../../services/areas';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { PageHeader } from '../../components/UI/PageHeader';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import Swal from 'sweetalert2';

export const RevisionPrincipalModule = () => {
  const [readyGarments, setReadyGarments] = useState([]);
  const [finishedGarments, setFinishedGarments] = useState([]);
  const [currentGarment, setCurrentGarment] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [areas, setAreas] = useState([]);
  const { user } = useAuth();

  const loadData = useCallback(async () => {
    try {
      const [ready, finished, allAreas] = await Promise.all([
        garmentsService.getReadyForFinalReview(),
        garmentsService.getFinished(),
        areasService.getAll(true),
      ]);
      return { ready: ready || [], finished: (finished || []).slice(0, 20), allAreas: allAreas || [] };
    } catch (err) {
      console.error(err);
      return { ready: [], finished: [], allAreas: [] };
    } finally {
      setRefreshing(false);
    }
  }, []);

  const applyData = ({ ready, finished, allAreas }) => {
    setReadyGarments(ready);
    setFinishedGarments(finished);
    setAreas(allAreas);
  };

  const refresh = () => {
    setRefreshing(true);
    loadData().then(applyData);
  };

  useEffect(() => {
    loadData().then(applyData);
  }, [loadData]);

  const handleScan = useCallback(async (scannedCode) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('garments')
      .select('*, operarias(id, full_name, areas(id, name))')
      .eq('reference', scannedCode)
      .single();

    if (error || !data) {
      Swal.fire({ icon: 'error', title: 'Prenda No Encontrada', text: `Código ${scannedCode} no encontrado`, timer: 2000, showConfirmButton: false });
      setCurrentGarment(null);
      setLoading(false);
      return;
    }

    if (data.is_finished || data.status === 'Terminado') {
      Swal.fire({ icon: 'info', title: 'Ya terminada', text: 'Esta prenda ya fue terminada', timer: 2000, showConfirmButton: false });
      setCurrentGarment(null);
      setLoading(false);
      return;
    }

    setCurrentGarment(data);

    try {
      const hist = await movementsService.getFullHistory(data.id);
      setHistory(hist || []);
    } catch {
      setHistory([]);
    }
    setLoading(false);
  }, []);

  useBarcodeScanner(handleScan);

  const handleManualSearch = (e) => {
    e.preventDefault();
    const code = e.target.elements.manualCode?.value?.trim();
    if (code) {
      handleScan(code);
      e.target.reset();
    }
  };

  const handleFinish = async () => {
    if (!currentGarment) return;

    const result = await Swal.fire({
      title: '¿Marcar como Terminado?',
      html: `
        <div class="text-start">
          <p><strong>Código:</strong> <span class="badge bg-secondary">${currentGarment.barcode}</span></p>
          <p><strong>Producto:</strong> ${currentGarment.product_name || 'N/A'}</p>
          <p class="text-muted">La prenda quedará como <strong>Terminada</strong></p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, terminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      await garmentsService.finishGarment(currentGarment.id, user.id);
      await Swal.fire({
        icon: 'success',
        title: 'Prenda Terminada',
        text: `${currentGarment.barcode} — Finalizada correctamente`,
        timer: 2000,
        showConfirmButton: false,
      });
      setCurrentGarment(null);
      setHistory([]);
      refresh();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message?.replace(/^ERROR:\s*/, '') || 'No se pudo terminar la prenda' });
    }
    setLoading(false);
  };

  const handleReturn = async () => {
    if (!currentGarment) return;

    if (areas.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin áreas', text: 'No hay áreas disponibles para devolver la prenda' });
      return;
    }

    const areaActualNombre = areas.find(a => a.id === currentGarment.current_area_id)?.name || currentGarment.operarias?.areas?.name || 'N/A';

    const { value: formValues } = await Swal.fire({
      title: 'Devolver con Observación',
      html: `
        <div class="text-start">
          <div class="card card-body bg-light p-3 mb-3">
            <p class="mb-1"><strong>Código:</strong> <span class="badge bg-secondary">${currentGarment.barcode}</span></p>
            <p class="mb-1"><strong>Producto:</strong> ${currentGarment.product_name || 'N/A'}</p>
            <p class="mb-1"><strong>Referencia:</strong> ${currentGarment.reference || 'N/A'}</p>
            <p class="mb-1"><strong>Operaria:</strong> ${currentGarment.operarias?.full_name || 'Sin asignar'}</p>
            <p class="mb-0"><strong>Área actual:</strong> ${areaActualNombre}</p>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Área de destino</label>
            <select id="swal-dest-area" class="form-select">
              <option value="">Seleccione el área...</option>
              ${areas.map(a => `<option value="${a.id}">${a.name}${a.id === currentGarment.current_area_id ? ' (área actual)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Observación / Motivo de devolución</label>
            <textarea id="swal-observation" class="form-control" rows="3" placeholder="Describa la observación o defecto encontrado..."></textarea>
          </div>
          <p class="text-muted mb-0">
            <i class="bi bi-info-circle me-1"></i>
            La prenda quedará como <strong>pendiente de recepción</strong> en el área seleccionada y su supervisora deberá recepcionarla para reasignarla.
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Devolver',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      preConfirm: () => {
        const destAreaId = document.getElementById('swal-dest-area').value;
        const observation = document.getElementById('swal-observation').value.trim();
        if (!destAreaId) { Swal.showValidationMessage('Debe seleccionar un área de destino'); return false; }
        if (!observation) { Swal.showValidationMessage('Debe escribir una observación'); return false; }
        return { destAreaId, observation };
      },
    });

    if (!formValues) return;

    const destAreaNombre = areas.find(a => a.id === formValues.destAreaId)?.name || 'área seleccionada';

    setLoading(true);
    try {
      await garmentsService.returnFromReview(currentGarment.id, user.id, formValues.destAreaId, formValues.observation);
      await Swal.fire({
        icon: 'success',
        title: 'Prenda Devuelta',
        html: `
          <p class="mb-1"><span class="badge bg-secondary">${currentGarment.barcode}</span></p>
          <p class="mb-0">Enviada a recepción de <strong>${destAreaNombre}</strong></p>
          <small class="text-muted">La supervisora deberá recepcionarla y reasignarla.</small>
        `,
        timer: 3000,
        showConfirmButton: false,
      });
      setCurrentGarment(null);
      setHistory([]);
      refresh();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message?.replace(/^ERROR:\s*/, '') || 'No se pudo devolver la prenda' });
    }
    setLoading(false);
  };

  const handleSelectFromList = async (g) => {
    setLoading(true);
    setCurrentGarment(g);
    try {
      const hist = await movementsService.getFullHistory(g.id);
      setHistory(hist || []);
    } catch {
      setHistory([]);
    }
    setLoading(false);
  };

  if (refreshing && readyGarments.length === 0 && finishedGarments.length === 0) return <LoadingSpinner text="Cargando..." />;

  return (
    <div>
      <PageHeader
        title="Revisión Final"
        subtitle="Supervisora Principal — Revise y termine prendas"
        icon="bi-star-check"
        actions={
          <button className="btn btn-outline-secondary btn-sm" onClick={loadData} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        }
      />

      {currentGarment ? (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card shadow-sm border-success">
              <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <i className="bi bi-star-check me-2"></i>Revisión de Prenda
                </h5>
                <button className="btn btn-sm btn-light" onClick={() => { setCurrentGarment(null); setHistory([]); }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="card-body">
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <label className="text-muted small">Código</label>
                    <p className="fw-bold"><span className="badge bg-secondary fs-6">{currentGarment.barcode}</span></p>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted small">Producto</label>
                    <p className="fw-bold">{currentGarment.product_name || 'N/A'}</p>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted small">Referencia</label>
                    <p className="fw-bold">{currentGarment.reference || 'N/A'}</p>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted small">Operaria</label>
                    <p>{currentGarment.operarias?.full_name || 'Sin asignar'}</p>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted small">Área</label>
                    <p>{currentGarment.operarias?.areas?.name || 'N/A'}</p>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted small">Estado</label>
                    <p><StatusBadge status={currentGarment.status} /></p>
                  </div>
                </div>

                <div className="d-flex gap-3 justify-content-center">
                  <button className="btn btn-success btn-lg px-4" onClick={handleFinish} disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" />Terminando...</>
                    ) : (
                      <><i className="bi bi-check-circle me-2"></i>Aprobar y Terminar</>
                    )}
                  </button>
                  <button className="btn btn-danger btn-lg px-4" onClick={handleReturn} disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" />Devolviendo...</>
                    ) : (
                      <><i className="bi bi-arrow-return-left me-2"></i>Devolver con Observación</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card shadow-sm">
              <div className="card-header bg-white">
                <h6 className="mb-0 fw-bold"><i className="bi bi-clock-history me-2"></i>Historial Completo</h6>
              </div>
              <div className="card-body p-0" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {history.length === 0 ? (
                  <div className="text-center py-4 text-muted">
                    <small>Sin historial</small>
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {history.map((h, i) => (
                      <div key={i} className="list-group-item py-2">
                        <small className="text-muted d-block">{new Date(h.event_date).toLocaleString('es-ES')}</small>
                        <span className="fw-semibold">{h.action}</span>
                        {h.from_area && h.to_area && (
                          <small className="text-muted d-block">{h.from_area} → {h.to_area}</small>
                        )}
                        {h.from_status && h.to_status && (
                          <small className="d-block">
                            <StatusBadge status={h.from_status} /> → <StatusBadge status={h.to_status} />
                          </small>
                        )}
                        {h.reason && <small className="text-danger d-block">Motivo: {h.reason}</small>}
                        {h.observation && <small className="text-muted d-block">{h.observation}</small>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center py-4 mb-4">
            <i className="bi bi-upc-scan text-primary" style={{ fontSize: '4rem' }}></i>
            <h4 className="mt-3 text-muted">Escanee una prenda para revisión final</h4>
            <form onSubmit={handleManualSearch} className="d-flex gap-2 mt-3 justify-content-center">
              <input
                type="text"
                name="manualCode"
                className="form-control"
                placeholder="O escriba la referencia..."
                style={{ maxWidth: '350px' }}
                disabled={loading}
              />
              <button type="submit" className="btn btn-outline-primary" disabled={loading}>
                <i className="bi bi-search"></i>
              </button>
            </form>
          </div>

          <div className="row g-4">
            <div className="col-lg-6">
              <div className="card shadow-sm border-success">
                <div className="card-header bg-success text-white">
                  <h6 className="mb-0"><i className="bi bi-check-circle me-2"></i>Listas para Revisión Final ({readyGarments.length})</h6>
                </div>
                <div className="card-body p-0" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {readyGarments.length === 0 ? (
                    <div className="text-center py-4 text-muted">
                      <i className="bi bi-inbox fs-1"></i>
                      <p className="mt-2">No hay prendas listas</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover table-sm align-middle mb-0">
                        <thead className="table-light sticky-top">
                          <tr>
                            <th>Código</th>
                            <th>Producto</th>
                            <th>Área</th>
                            <th>Seleccionar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readyGarments.map(g => (
                            <tr key={g.id}>
                              <td><span className="badge bg-secondary">{g.barcode}</span></td>
                              <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                              <td><small>{g.operarias?.areas?.name || 'N/A'}</small></td>
                              <td>
                                <button className="btn btn-outline-success btn-sm" onClick={() => handleSelectFromList(g)}>
                                  <i className="bi bi-eye"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card shadow-sm">
                <div className="card-header bg-light">
                  <h6 className="mb-0"><i className="bi bi-patch-check me-2 text-success"></i>Prendas Terminadas ({finishedGarments.length})</h6>
                </div>
                <div className="card-body p-0" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {finishedGarments.length === 0 ? (
                    <div className="text-center py-4 text-muted">
                      <i className="bi bi-inbox fs-1"></i>
                      <p className="mt-2">No hay prendas terminadas</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover table-sm align-middle mb-0">
                        <thead className="table-light sticky-top">
                          <tr>
                            <th>Código</th>
                            <th>Producto</th>
                            <th>Terminada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finishedGarments.map(g => (
                            <tr key={g.id}>
                              <td><span className="badge bg-secondary">{g.barcode}</span></td>
                              <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                              <td><small className="text-muted">{g.finished_at ? new Date(g.finished_at).toLocaleDateString('es-ES') : 'N/A'}</small></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};