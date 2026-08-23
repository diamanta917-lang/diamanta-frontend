import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { garmentsService } from '../../services/garments';
import { movementsService } from '../../services/movements';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { PageHeader } from '../../components/UI/PageHeader';
import { useDebounce } from '../../hooks/useDebounce';
import { showToast, showError } from '../../components/UI/ConfirmDialog';
import { reportsService } from '../../services/reports';

export const HistorialModule = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [selectedGarment, setSelectedGarment] = useState(null);
  const [history, setHistory] = useState([]);
  const [garmentDetail, setGarmentDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const navigate = useNavigate();
  const visibleResults = (!debouncedSearch || debouncedSearch.length < 2) ? [] : results;

  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      return;
    }
    let active = true;
    Promise.resolve()
      .then(() => setSearching(true))
      .then(() => garmentsService.search(debouncedSearch))
      .then(data => { if (active) setResults(data || []); })
      .catch(() => { if (active) setResults([]); })
      .finally(() => { if (active) setSearching(false); });
    return () => { active = false; };
  }, [debouncedSearch]);

  const handleSelectGarment = useCallback(async (g) => {
    setSelectedGarment(g);
    setLoading(true);
    try {
      const [detail, hist] = await Promise.all([
        garmentsService.getById(g.id),
        movementsService.getFullHistory(g.id),
      ]);
      setGarmentDetail(detail);
      setHistory(hist || []);
    } catch (err) {
      showError(err.message);
    }
    setLoading(false);
  }, []);

  const handleExport = async () => {
    if (!history || history.length === 0) {
      showToast({ icon: 'info', title: 'No hay historial para exportar' });
      return;
    }
    const exportData = history.map(h => ({
      'Fecha': new Date(h.event_date).toLocaleString('es-ES'),
      'Acción': h.action || '',
      'Área Origen': h.from_area || '',
      'Área Destino': h.to_area || '',
      'Supervisora Origen': h.from_supervisor || '',
      'Supervisora Destino': h.to_supervisor || '',
      'Operaria Anterior': h.old_operaria || '',
      'Operaria Nueva': h.new_operaria || '',
      'Estado Anterior': h.from_status || '',
      'Estado Nuevo': h.to_status || '',
      'Motivo': h.reason || '',
      'Observación': h.observation || '',
    }));
    await reportsService.exportToExcel(exportData, 'Historial', `historial-${selectedGarment?.barcode || ''}`);
    showToast({ icon: 'success', title: 'Excel generado' });
  };

  return (
    <div>
      <PageHeader title="Historial de Prendas" subtitle="Consulte el historial completo de cualquier prenda" icon="bi-clock-history" />

      <div className="row g-4">
        {/* Búsqueda */}
        <div className="col-lg-4">
          <div className="card shadow-sm">
            <div className="card-header bg-white">
              <h6 className="mb-0 fw-bold"><i className="bi bi-search me-2"></i>Buscar Prenda</h6>
            </div>
            <div className="card-body">
              <input
                type="text"
                className="form-control"
                placeholder="Código, referencia, producto, operaria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searching && <small className="text-muted mt-2 d-block"><span className="spinner-border spinner-border-sm me-1" />Buscando...</small>}

              <div className="mt-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {visibleResults.length === 0 && searchTerm.length >= 2 && !searching && (
                  <div className="text-center text-muted py-3">
                    <i className="bi bi-search fs-3"></i>
                    <p className="mt-1 mb-0 small">Sin resultados</p>
                  </div>
                )}
                {visibleResults.map(g => (
                  <div
                    key={g.id}
                    className={`list-group-item list-group-item-action cursor-pointer ${selectedGarment?.id === g.id ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSelectGarment(g)}
                  >
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <span className="badge bg-secondary me-1">{g.barcode}</span>
                        <small className="fw-semibold">{g.product_name || 'N/A'}</small>
                        <small className="text-muted d-block">
                          {g.operaria_name || 'Sin operaria'} — {g.current_area_name || g.area_name || 'Sin área'}
                        </small>
                      </div>
                      <div className="text-end">
                        <StatusBadge status={g.status} />
                        {g.is_finished && <span className="badge bg-success ms-1">Terminada</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Detalle + Historial */}
        <div className="col-lg-8">
          {loading ? (
            <LoadingSpinner text="Cargando historial..." />
          ) : selectedGarment && garmentDetail ? (
            <div>
              {/* Info */}
              <div className="card shadow-sm mb-3">
                <div className="card-header bg-white d-flex justify-content-between align-items-center">
                  <h6 className="mb-0 fw-bold">
                    <i className="bi bi-info-circle me-2"></i>
                    {garmentDetail.barcode}
                  </h6>
                  <div className="d-flex gap-2">
                    <button className="btn btn-outline-success btn-sm" onClick={handleExport}>
                      <i className="bi bi-file-earmark-excel me-1"></i>Excel
                    </button>
                    <button className="btn btn-outline-primary btn-sm" onClick={() => navigate(`/search/${garmentDetail.id}`)}>
                      <i className="bi bi-eye me-1"></i>Detalle
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row g-2">
                    <div className="col-md-4">
                      <label className="text-muted small">Producto</label>
                      <p className="fw-bold mb-0">{garmentDetail.product_name || 'N/A'}</p>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted small">Referencia</label>
                      <p className="mb-0">{garmentDetail.reference || 'N/A'}</p>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted small">Estado</label>
                      <p className="mb-0"><StatusBadge status={garmentDetail.status} /></p>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted small">Operaria</label>
                      <p className="mb-0">{garmentDetail.operarias?.full_name || 'Sin asignar'}</p>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted small">Área</label>
                      <p className="mb-0">{garmentDetail.operarias?.areas?.name || 'N/A'}</p>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted small">Devoluciones</label>
                      <p className="mb-0">
                        {garmentDetail.return_count > 0
                          ? <span className="badge bg-danger">{garmentDetail.return_count}</span>
                          : <span className="badge bg-success">Sin devoluciones</span>}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="card shadow-sm">
                <div className="card-header bg-white">
                  <h6 className="mb-0 fw-bold"><i className="bi bi-clock-history me-2"></i>Historial Completo ({history.length})</h6>
                </div>
                <div className="card-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {history.length === 0 ? (
                    <div className="text-center py-4 text-muted">
                      <i className="bi bi-inbox fs-1"></i>
                      <p className="mt-2">Sin movimientos registrados</p>
                    </div>
                  ) : (
                    <div className="timeline-vertical">
                      {history.map((h, i) => (
                        <div key={i} className="timeline-item">
                          <div className="timeline-marker">
                            <div className={`timeline-dot bg-${
                              h.to_status === 'Terminado' ? 'success' :
                              h.to_status === 'Devuelta' || h.to_status === 'Requiere corrección' ? 'danger' :
                              h.action?.includes('Pasar') || h.action?.includes('Recepción') ? 'info' :
                              'primary'
                            }`}></div>
                            {i < history.length - 1 && <div className="timeline-line"></div>}
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
                                  {h.from_area || '—'} → {h.to_area || '—'}
                                </small>
                              )}
                              {(h.from_supervisor || h.to_supervisor) && (
                                <small className="d-block text-muted">
                                  {h.from_supervisor || '—'} → {h.to_supervisor || '—'}
                                </small>
                              )}
                              {(h.old_operaria || h.new_operaria) && (
                                <small className="d-block text-muted">
                                  Operaria: {h.old_operaria || '—'} → {h.new_operaria || '—'}
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
                                <small className="text-danger d-block mt-1">
                                  <i className="bi bi-exclamation-triangle me-1"></i>Motivo: {h.reason}
                                </small>
                              )}
                              {h.observation && (
                                <small className="text-muted d-block">{h.observation}</small>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card shadow-sm">
              <div className="card-body text-center py-5 text-muted">
                <i className="bi bi-clock-history" style={{ fontSize: '4rem' }}></i>
                <h5 className="mt-3">Seleccione una prenda</h5>
                <p>Busque y seleccione una prenda para ver su historial completo</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};