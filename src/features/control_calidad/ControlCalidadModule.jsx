import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/useAuth';
import { areasService } from '../../services/areas';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { STATUSES } from '../../constants';
import Swal from 'sweetalert2';

export default function ControlCalidadModule() {
  const [garment, setGarment] = useState(null);
  const [isReReview, setIsReReview] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stats, setStats] = useState({ recibidas: [], devueltas: [], totalRecibidas: 0, totalDevueltas: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [areas, setAreas] = useState([]);
  const [receptionQueue, setReceptionQueue] = useState([]);
  const [lastScanned, setLastScanned] = useState(null);
  const { user, isSupervisor, areaId } = useAuth();

  const fetchStats = useCallback(async () => {
    try {
      let recibidasQuery = supabase
        .from('garments')
        .select('*, operarias(id, full_name, areas(name))', { count: 'exact' })
        .in('status', ['Pendiente de revisión', 'Pendiente de Revision', STATUSES.RECIBIDO_CALIDAD])
        .order('updated_at', { ascending: false })
        .limit(100);

      let devueltasQuery = supabase
        .from('garments')
        .select('*, operarias(id, full_name, areas(name))', { count: 'exact' })
        .eq('status', STATUSES.REQUIERE_CORRECCION)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (isSupervisor && user?.id) {
        recibidasQuery = recibidasQuery.eq('current_supervisor_id', user.id).eq('current_area_id', areaId);
        devueltasQuery = devueltasQuery.eq('current_supervisor_id', user.id).eq('current_area_id', areaId);
      }

      const [{ data: recibidas, count: totalRecibidas }, { data: devueltas, count: totalDevueltas }] = await Promise.all([
        recibidasQuery,
        devueltasQuery,
      ]);
      return {
        recibidas: recibidas || [],
        devueltas: devueltas || [],
        totalRecibidas: totalRecibidas ?? 0,
        totalDevueltas: totalDevueltas ?? 0,
      };
    } catch (err) {
      console.error(err);
      return { recibidas: [], devueltas: [], totalRecibidas: 0, totalDevueltas: 0 };
    } finally {
      setStatsLoading(false);
    }
  }, [user, isSupervisor, areaId]);

  const refreshStats = () => {
    setStatsLoading(true);
    fetchStats().then(setStats);
  };

  const clearState = () => {
    setGarment(null);
    setIsReReview(false);
    setResult(null);
    refreshStats();
  };

  useEffect(() => {
    fetchStats().then(setStats);
  }, [fetchStats]);

  useEffect(() => {
    areasService.getAll(true).then(data => setAreas(data || [])).catch(() => setAreas([]));
  }, []);

  const handleScan = useCallback(async (scannedCode) => {
    setScanning(true);
    try {
      const { data, error } = await supabase
        .from('garments')
        .select('*, operarias(id, full_name, areas(id, name))')
        .eq('reference', scannedCode)
        .single();

      if (error || !data) {
        Swal.fire({ icon: 'error', title: 'Prenda No Encontrada', text: `El código ${scannedCode} no existe en el sistema`, timer: 2000, showConfirmButton: false });
        return;
      }

      if (isSupervisor && data.current_supervisor_id && data.current_supervisor_id !== user.id) {
        Swal.fire({ icon: 'warning', title: 'No tiene acceso', text: 'Esta prenda pertenece a otra supervisora', timer: 2000, showConfirmButton: false });
        return;
      }

      const garmentAreaId = data.operarias?.areas?.id || data.current_area_id;
      if (isSupervisor && areaId && garmentAreaId && garmentAreaId !== areaId) {
        Swal.fire({
          icon: 'warning',
          title: 'Prenda de otra área',
          text: `Esta prenda pertenece al área ${data.operarias?.areas?.name || 'otra área'} y usted solo gestiona su área`,
          timer: 3000,
          showConfirmButton: false,
        });
        return;
      }

      if (data.status === 'Terminado' || data.is_finished) {
        Swal.fire({ icon: 'info', title: 'Prenda terminada', text: 'Esta prenda ya fue terminada y no puede modificarse', timer: 2000, showConfirmButton: false });
        return;
      }

      // Ya recepcionada: abrir la revisión de control de calidad
      if (data.status === STATUSES.RECIBIDO_CALIDAD) {
        setGarment(data);
        setIsReReview((data.return_count || 0) > 0);
        setResult(null);
        return;
      }

      // Ya aprobada: no se vuelve a recepcionar
      if (data.status === 'Aprobada' || data.status === 'Aprobado') {
        Swal.fire({ icon: 'info', title: 'Prenda ya aprobada', text: 'Esta prenda ya fue aprobada. Puede pasarla a otra área desde "Pasar a Área"', timer: 2500, showConfirmButton: false });
        return;
      }

      // Devolución por observación: la operaria trae la prenda corregida
      if (data.status === STATUSES.REQUIERE_CORRECCION) {
        Swal.fire({
          icon: 'warning',
          title: 'Devolución por observación',
          text: `La operaria ${data.operarias?.full_name || 'de esta prenda'} está devolviendo la prenda que fue devuelta por observación. Se registrará en recepción por control de calidad.`,
          timer: 3000,
          showConfirmButton: false,
        });
      }

      // Recepción: registrar una por una
      if (receptionQueue.some(g => g.id === data.id)) {
        Swal.fire({ icon: 'warning', title: 'Ya escaneada', text: 'Esta prenda ya está en la lista de recepción', timer: 1500, showConfirmButton: false });
        return;
      }

      setReceptionQueue(prev => (prev.some(g => g.id === data.id) ? prev : [...prev, data]));
      setLastScanned(data);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
      setScanning(false);
    }
  }, [user.id, isSupervisor, areaId, receptionQueue]);

  useBarcodeScanner(handleScan);

  const handleRemoveFromQueue = (id) => {
    setReceptionQueue(prev => prev.filter(g => g.id !== id));
  };

  const receiveGarments = async (list) => {
    if (!list || list.length === 0) return 0;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const updates = {
        status: STATUSES.RECIBIDO_CALIDAD,
        current_location: 'Control de Calidad',
        updated_at: now,
      };
      if (isSupervisor && user?.id) updates.current_supervisor_id = user.id;
      if (isSupervisor && areaId) updates.current_area_id = areaId;

      const { error } = await supabase
        .from('garments')
        .update(updates)
        .in('id', list.map(g => g.id));
      if (error) throw error;

      const movements = list.map(g => ({
        garment_id: g.id,
        user_id: user.id,
        action: 'Control de Calidad — Recepción de prenda',
        from_status: g.status,
        to_status: STATUSES.RECIBIDO_CALIDAD,
        observation: 'Prenda recibida por control de calidad, pendiente de revisión',
      }));
      const { error: movError } = await supabase.from('movements').insert(movements);
      if (movError) throw movError;

      return list.length;
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReception = async () => {
    if (receptionQueue.length === 0) return;

    const result = await Swal.fire({
      title: 'Recepcionar por Control de Calidad',
      html: `
        <div class="text-start">
          <p>Se recepcionarán <strong>${receptionQueue.length} prenda(s)</strong>:</p>
          <ul class="mb-0" style="max-height:200px;overflow-y:auto;">
            ${receptionQueue.slice(0, 20).map(g => `<li><span class="badge bg-secondary me-1">${g.barcode}</span>${g.product_name || 'N/A'} — ${g.operarias?.full_name || 'Sin operaria'}</li>`).join('')}
            ${receptionQueue.length > 20 ? `<li class="text-muted">... y ${receptionQueue.length - 20} más</li>` : ''}
          </ul>
          <p class="text-muted mt-2 mb-0">Quedarán <strong>pendientes de revisión por control de calidad</strong>.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recepcionar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d6efd',
    });

    if (!result.isConfirmed) return;

    try {
      const count = await receiveGarments(receptionQueue);
      setReceptionQueue([]);
      setLastScanned(null);
      refreshStats();
      await Swal.fire({
        icon: 'success',
        title: 'Recepción confirmada',
        html: `<strong>${count}</strong> prenda(s) recibidas por control de calidad<br><small>Quedan pendientes de revisión</small>`,
        timer: 2500,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  const handleReceiveSingle = async (g) => {
    const result = await Swal.fire({
      title: 'Recepcionar Prenda',
      html: `
        <div class="text-start">
          <p><strong>Código:</strong> <span class="badge bg-secondary">${g.barcode}</span></p>
          <p><strong>Producto:</strong> ${g.product_name || 'N/A'}</p>
          <p><strong>Operaria:</strong> ${g.operarias?.full_name || 'Sin asignar'}</p>
          <p class="text-muted mb-0">Se recepcionará por control de calidad y quedará pendiente de revisión.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recepcionar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0d6efd',
    });

    if (!result.isConfirmed) return;

    try {
      const count = await receiveGarments([g]);
      if (count) {
        await Swal.fire({
          icon: 'success',
          title: 'Prenda recepcionada',
          text: `${g.barcode} — Recibida por control de calidad, pendiente de revisión`,
          timer: 2000,
          showConfirmButton: false,
        });
        refreshStats();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  const openReview = (g) => {
    setGarment(g);
    setIsReReview((g.return_count || 0) > 0);
    setResult(null);
  };

  const handleAprobar = async () => {
    const result = await Swal.fire({
      title: '¿Confirmar aprobación?',
      html: `
        <div class="text-start">
          <p><strong>Código:</strong> <span class="badge bg-secondary">${garment.barcode}</span></p>
          <p><strong>Producto:</strong> ${garment.product_name || 'N/A'}</p>
          <p><strong>Operaria:</strong> ${garment.operarias?.full_name || 'Sin asignar'}</p>
          <p><strong>Área:</strong> ${garment.operarias?.areas?.name || 'N/A'}</p>
          <hr>
          <p class="mb-0"><strong>Resultado:</strong> <span class="badge bg-success fs-6">Correcto → Aprobado</span></p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aprobar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const previousStatus = garment.status;

      const { error } = await supabase
        .from('garments')
        .update({
          status: 'Aprobada',
          current_location: 'Aprobada',
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', garment.id);
      if (error) throw error;

      const { data: movData } = await supabase
        .from('movements')
        .insert({
          garment_id: garment.id,
          user_id: user.id,
          action: 'Control de Calidad — Aprobada',
          from_status: previousStatus,
          to_status: 'Aprobada',
          observation: 'Prenda correcta, aprobada por supervisora. Lista para pasar a otra área.',
        })
        .select();

      await Swal.fire({
        icon: 'success',
        title: 'Prenda Aprobada',
        html: `${garment.barcode} — Inspección correcta<br><small>Puede pasarla a otra área desde el módulo "Pasar a Área"</small>`,
        timer: 3000,
        showConfirmButton: false,
      });

      setGarment(prev => ({ ...prev, status: 'Aprobada', current_location: 'Aprobada' }));
      setResult({
        type: 'aprobado',
        previousStatus,
        garmentId: garment.id,
        movementId: movData?.[0]?.id,
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
    setLoading(false);
  };

  const handleRechazar = async () => {
    const { data: reasonsData } = await supabase.from('return_reasons').select('*').eq('is_active', true).order('name');
    const reasons = reasonsData || [];

    const areaActualNombre = garment.operarias?.areas?.name || 'N/A';

    const { value: formValues } = await Swal.fire({
      title: isReReview ? 'No cumple — Requiere corrección' : 'Con observaciones — Requiere corrección',
      html: `
        <div class="text-start mb-3">
          <p class="mb-1"><strong>Prenda:</strong> <span class="badge bg-secondary">${garment.barcode}</span></p>
          <p class="mb-1"><strong>Producto:</strong> ${garment.product_name || 'N/A'}</p>
          <p class="mb-1"><strong>Operaria:</strong> ${garment.operarias?.full_name || 'Sin asignar'}</p>
          <p class="mb-0"><strong>Área actual:</strong> ${areaActualNombre}</p>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Área de destino</label>
          <select id="swal-dest-area" class="form-select">
            <option value="">Seleccione el área...</option>
            ${areas.map(a => `<option value="${a.id}">${a.name}${a.id === (garment.operarias?.areas?.id || garment.current_area_id) ? ' (área actual)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Motivo de Devolución</label>
          <select id="swal-reason" class="form-select">
            <option value="">Seleccione un motivo...</option>
            ${reasons.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Observación</label>
          <textarea id="swal-observation" class="form-control" rows="3" placeholder="Describa la observación encontrada..."></textarea>
        </div>
        <p class="text-muted mb-0">
          <i class="bi bi-info-circle me-1"></i>
          La prenda quedará como <strong>pendiente de recepción</strong> en el área seleccionada y su supervisora deberá recepcionarla y reasignarla.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Rechazar y devolver',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545',
      preConfirm: () => {
        const destAreaId = document.getElementById('swal-dest-area').value;
        const reasonId = document.getElementById('swal-reason').value;
        const observation = document.getElementById('swal-observation').value.trim();
        if (!destAreaId) { Swal.showValidationMessage('Debe seleccionar un área de destino'); return false; }
        if (!reasonId) { Swal.showValidationMessage('Debe seleccionar un motivo de devolución'); return false; }
        return { destAreaId, reasonId, observation };
      },
    });

    if (!formValues) return;

    setLoading(true);
    try {
      const previousStatus = garment.status;
      const reason = reasons.find(r => r.id === formValues.reasonId);
      const destArea = areas.find(a => a.id === formValues.destAreaId);

      await supabase.rpc('return_garment_from_review', {
        p_garment_id: garment.id,
        p_supervisor_principal_id: user.id,
        p_dest_area_id: formValues.destAreaId,
        p_observation: formValues.observation || `Motivo: ${reason?.name || ''}`,
      });

      await Swal.fire({
        icon: 'warning',
        title: 'Prenda Devuelta al Área',
        html: `
          <p><strong>${garment.barcode}</strong></p>
          <p>Devuelta a: <strong>${destArea?.name || 'área seleccionada'}</strong></p>
          <p>Motivo: <strong>${reason?.name || ''}</strong></p>
        `,
        timer: 3000,
        showConfirmButton: false,
      });

      setGarment(prev => ({
        ...prev,
        status: STATUSES.PENDIENTE_RECEPCION,
        current_location: `Pendiente Recepción - ${destArea?.name || ''}`,
        current_area_id: formValues.destAreaId,
        return_count: (prev.return_count || 0) + 1,
      }));
      setResult({
        type: 'requiere_correccion',
        previousStatus,
        garmentId: garment.id,
        returnCount: garment.return_count || 0,
        areaName: destArea?.name || '',
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message?.replace(/^ERROR:\s*/, '') || 'No se pudo devolver la prenda' });
    }
    setLoading(false);
  };

  const handleUndo = async () => {
    if (!garment || !result) return;
    setLoading(true);
    try {
      const updates = {
        status: result.previousStatus,
        updated_at: new Date().toISOString(),
      };
      if (result.returnCount !== undefined) {
        updates.return_count = result.returnCount;
      }

      const { error } = await supabase.from('garments').update(updates).eq('id', garment.id);
      if (error) throw error;

      if (result.movementId) {
        await supabase.from('movements').delete().eq('id', result.movementId);
      }

      Swal.fire({ icon: 'success', title: 'Operación deshecha', text: 'La prenda volvió a su estado anterior', timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
    clearState();
    setLoading(false);
  };

  if (loading) {
    return (
      <div>
        <div className="row mb-4">
          <div className="col-12">
            <div className="alert alert-primary d-flex align-items-center" role="alert">
              <i className="bi bi-clipboard-check fs-3 me-3"></i>
              <div>
                <h5 className="alert-heading mb-0">Control de Calidad</h5>
                <small>Escanee una prenda para registrarla en recepción o revisarla</small>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Procesando...</span>
          </div>
          <p className="mt-3 text-muted">Procesando prenda...</p>
        </div>
      </div>
    );
  }

  if (garment && !result) {
    return (
      <div>
        <div className="row mb-4">
          <div className="col-12">
            <div className="alert alert-primary d-flex align-items-center" role="alert">
              <i className="bi bi-clipboard-check fs-3 me-3"></i>
              <div>
                <h5 className="alert-heading mb-0">Control de Calidad</h5>
                <small>Revise la prenda y determine el resultado de la inspección</small>
              </div>
            </div>
          </div>
        </div>
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className={`card shadow-sm ${isReReview ? 'border-warning' : 'border-primary'}`}>
              <div className={`card-header text-white ${isReReview ? 'bg-warning text-dark' : 'bg-primary'}`}>
                <h4 className="mb-0">
                  <i className={`bi ${isReReview ? 'bi-arrow-repeat' : 'bi-search'} me-2`}></i>
                  {isReReview ? 'Revisión de Correcciones' : 'Inspección de Calidad'}
                </h4>
              </div>
              <div className="card-body">
                <div className="row mb-4">
                  <div className="col-md-6">
                    <p className="mb-2"><strong>Código:</strong> <span className="badge bg-secondary fs-6">{garment.barcode}</span></p>
                    <p className="mb-2"><strong>Referencia:</strong> {garment.reference || 'N/A'}</p>
                    <p className="mb-2"><strong>Producto:</strong> {garment.product_name || 'N/A'}</p>
                    <p className="mb-2"><strong>Categoría:</strong> {garment.category || 'N/A'}</p>
                  </div>
                  <div className="col-md-6">
                    <p className="mb-2"><strong>Operaria:</strong> {garment.operarias?.full_name || 'Sin asignar'}</p>
                    <p className="mb-2"><strong>Área:</strong> {garment.operarias?.areas?.name || 'N/A'}</p>
                    <p className="mb-2"><strong>Devoluciones:</strong> <span className="badge bg-danger">{garment.return_count || 0}</span></p>
                    <p className="mb-2"><strong>Estado:</strong> <StatusBadge status={garment.status} /></p>
                    <p className="mb-0"><strong>Ubicación:</strong> {garment.current_location || 'N/A'}</p>
                  </div>
                </div>

                {garment.status === STATUSES.RECIBIDO_CALIDAD && (
                  <div className="alert alert-info d-flex align-items-center">
                    <i className="bi bi-hourglass-split me-2 fs-4"></i>
                    <span>
                      <strong>Pendiente de revisión por control de calidad.</strong> Determine si la prenda está correcta o requiere observaciones.
                    </span>
                  </div>
                )}

                <hr />
                {isReReview ? (
                  <>
                    <h5 className="fw-bold mb-3 text-center text-warning">
                      <i className="bi bi-question-circle me-2"></i>
                      ¿Cumple especificaciones?
                    </h5>
                    <p className="text-center text-muted mb-4">
                      La prenda fue corregida por la operaria. Verifique si ahora cumple con las especificaciones.
                    </p>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <button
                          className="btn btn-success btn-lg w-100 py-4"
                          onClick={handleAprobar}
                          disabled={loading}
                        >
                          <i className="bi bi-check-circle fs-1 d-block mb-2"></i>
                          <span className="fs-5 fw-bold">SÍ, CUMPLE</span>
                          <small className="d-block mt-1">Aprobar definitivamente</small>
                        </button>
                      </div>
                      <div className="col-md-6">
                        <button
                          className="btn btn-danger btn-lg w-100 py-4"
                          onClick={handleRechazar}
                          disabled={loading}
                        >
                          <i className="bi bi-x-circle fs-1 d-block mb-2"></i>
                          <span className="fs-5 fw-bold">NO, CORREGIR</span>
                          <small className="d-block mt-1">Devolver nuevamente a operaria</small>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h6 className="fw-bold mb-3 text-center">Evaluación de Inspección</h6>
                    <div className="row g-3 mb-3">
                      <div className="col-md-6">
                        <button
                          className="btn btn-success btn-lg w-100 py-4"
                          onClick={handleAprobar}
                          disabled={loading}
                        >
                          <i className="bi bi-check-circle fs-1 d-block mb-2"></i>
                          <span className="fs-5 fw-bold">CORRECTO</span>
                          <small className="d-block mt-1">Prenda sin observaciones</small>
                        </button>
                      </div>
                      <div className="col-md-6">
                        <button
                          className="btn btn-warning btn-lg w-100 py-4"
                          onClick={handleRechazar}
                          disabled={loading}
                        >
                          <i className="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
                          <span className="fs-5 fw-bold">CON OBSERVACIONES</span>
                          <small className="d-block mt-1">Requiere corrección por la operaria</small>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (garment && result) {
    return (
      <div>
        <div className="row mb-4">
          <div className="col-12">
            <div className="alert alert-primary d-flex align-items-center" role="alert">
              <i className="bi bi-clipboard-check fs-3 me-3"></i>
              <div>
                <h5 className="alert-heading mb-0">Control de Calidad</h5>
                <small>Resultado de la inspección</small>
              </div>
            </div>
          </div>
        </div>
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className={`card shadow-sm ${result.type === 'requiere_correccion' ? 'border-danger' : 'border-success'}`}>
              <div className={`card-header text-white d-flex justify-content-between align-items-center ${result.type === 'requiere_correccion' ? 'bg-danger' : 'bg-success'}`}>
                <h4 className="mb-0">
                  <i className={`bi ${result.type === 'aprobado' ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-2`}></i>
                  {result.type === 'aprobado' ? 'Prenda Aprobada' : 'Requiere Corrección'}
                </h4>
                <span className="badge bg-light text-dark fs-6">
                  {result.type === 'aprobado' ? 'Aprobado' : `Devuelta — ${result.areaName || 'área'}`}
                </span>
              </div>
              <div className="card-body">
                <div className="row mb-4">
                  <div className="col-md-6">
                    <p className="mb-2"><strong>Código:</strong> <span className="badge bg-secondary fs-6">{garment.barcode}</span></p>
                    <p className="mb-2"><strong>Referencia:</strong> {garment.reference || 'N/A'}</p>
                    <p className="mb-2"><strong>Producto:</strong> {garment.product_name || 'N/A'}</p>
                  </div>
                  <div className="col-md-6">
                    <p className="mb-2">
                      <strong>Estado anterior:</strong>
                      <span className="badge bg-secondary ms-2">{result.previousStatus}</span>
                    </p>
                    <p className="mb-2">
                      <strong>Estado actual:</strong>
                      <span className={`badge ${result.type === 'aprobado' ? 'bg-success' : 'bg-danger'} ms-2`}>
                        {result.type === 'aprobado' ? 'Aprobado' : 'Requiere corrección'}
                      </span>
                    </p>
                    {result.type === 'requiere_correccion' && (
                      <p className="mb-2"><strong>Devoluciones:</strong> <span className="badge bg-danger">{(result.returnCount || 0) + 1}</span></p>
                    )}
                  </div>
                </div>
                <div className="alert alert-warning d-flex align-items-center">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  <span>¿Desea deshacer esta operación? La prenda volverá a su estado anterior.</span>
                </div>
                <div className="d-flex gap-3 justify-content-center">
                  <button className="btn btn-warning btn-lg px-4" onClick={handleUndo} disabled={loading}>
                    <i className="bi bi-arrow-counterclockwise me-2"></i>Deshacer
                  </button>
                  <button className="btn btn-outline-secondary btn-lg px-4" onClick={clearState}>
                    <i className="bi bi-check2 me-2"></i>Listo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const receivedRows = [...receptionQueue, ...stats.recibidas.filter(g => !receptionQueue.some(q => q.id === g.id))];
  const pendingReception = stats.recibidas.filter(g => g.status !== STATUSES.RECIBIDO_CALIDAD).length + receptionQueue.length;
  const inReview = stats.recibidas.filter(g => g.status === STATUSES.RECIBIDO_CALIDAD).length;
  const totalRecibidas = pendingReception + inReview;

  return (
    <div>
      <div className="row mb-4">
        <div className="col-12">
          <div className="alert alert-primary d-flex align-items-center" role="alert">
            <i className="bi bi-clipboard-check fs-3 me-3"></i>
            <div>
              <h5 className="alert-heading mb-0">Control de Calidad</h5>
              <small>Escanee las prendas una por una para registrarlas en recepción. Escanee de nuevo una prenda recepcionada para revisarla.</small>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center py-4">
        {scanning ? (
          <div className="py-4">
            <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
              <span className="visually-hidden">Escaneando...</span>
            </div>
            <p className="mt-3 text-muted">Escaneando prenda...</p>
          </div>
        ) : (
          <>
            <i className="bi bi-upc-scan text-primary" style={{ fontSize: '4rem' }}></i>
            <h4 className="mt-2 text-muted">Esperando referencias...</h4>
            <p className="text-muted">Escanee el código de barra de cada prenda. Se registrará automáticamente una por una.</p>
          </>
        )}
        {lastScanned && (
          <div className="alert alert-success py-2 d-flex justify-content-between align-items-center mx-auto" style={{ maxWidth: '400px' }}>
            <span>
              <i className="bi bi-check-circle me-2"></i>
              <strong>{lastScanned.barcode}</strong> — {lastScanned.product_name || 'N/A'}
              <small className="d-block text-muted">Registrada en recepción</small>
            </span>
            <span className="badge bg-success fs-6">{receptionQueue.length}</span>
          </div>
        )}
        {receptionQueue.length > 0 && (
          <div className="alert alert-warning py-2 mx-auto" style={{ maxWidth: '400px' }}>
            <i className="bi bi-info-circle me-2"></i>
            <strong>{receptionQueue.length} prenda(s)</strong> escaneadas, sin confirmar. Presione{" "}
            <strong>"Recepcionar por Control de Calidad"</strong> para registrarlas.
          </div>
        )}
        <hr className="w-50 mx-auto" />
        <form onSubmit={(e) => { e.preventDefault(); const code = e.target.elements.manualCode?.value?.trim(); if (code) { handleScan(code); e.target.reset(); } }} className="d-flex gap-2 mt-3 justify-content-center">
          <input
            type="text"
            name="manualCode"
            className="form-control"
            placeholder="O escriba la referencia manualmente..."
            style={{ maxWidth: '350px' }}
            disabled={loading || scanning}
          />
          <button type="submit" className="btn btn-outline-primary" disabled={loading || scanning}>
            <i className="bi bi-search"></i>
          </button>
        </form>
      </div>

      {/* Stats Section */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card shadow-sm border-primary h-100">
            <div className="card-body text-center">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted small">Actualizar</span>
                <button className="btn btn-sm btn-outline-secondary" onClick={fetchStats} disabled={statsLoading}>
                  <i className={`bi bi-arrow-clockwise ${statsLoading ? '' : ''}`}></i>
                </button>
              </div>
              <i className="bi bi-inbox text-primary" style={{ fontSize: '2.5rem' }}></i>
              <h2 className="fw-bold mt-2 mb-0">{totalRecibidas}</h2>
              <p className="text-muted mb-0 fw-semibold">Prendas Recibidas</p>
              <small className="text-muted">
                {pendingReception > 0 ? `${pendingReception} por recibir — ${inReview} en revisión` : 'Pendientes de revisión por control de calidad'}
              </small>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card shadow-sm border-danger h-100">
            <div className="card-body text-center">
              <div className="d-flex justify-content-between align-items-center mb-2"></div>
              <i className="bi bi-arrow-return-left text-danger" style={{ fontSize: '2.5rem' }}></i>
              <h2 className="fw-bold mt-2 mb-0">{stats.totalDevueltas}</h2>
              <p className="text-muted mb-0 fw-semibold">Prendas Devueltas</p>
              <small className="text-muted">Requieren corrección</small>
            </div>
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
              <h6 className="mb-0">
                <i className="bi bi-inbox me-2"></i>
                Prendas Recibidas ({totalRecibidas})
              </h6>
              <button
                className="btn btn-light btn-sm"
                onClick={handleConfirmReception}
                disabled={loading || receptionQueue.length === 0}
              >
                <i className="bi bi-clipboard-check me-1"></i>
                Recepcionar por Control de Calidad {receptionQueue.length > 0 ? `(${receptionQueue.length})` : ''}
              </button>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="table table-hover align-middle table-sm mb-0">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Operaria</th>
                      <th>Estado</th>
                      <th>Registrada</th>
                      <th style={{ width: '90px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-3 text-muted">
                          <small>No hay prendas recibidas pendientes</small>
                        </td>
                      </tr>
                    ) : (
                      receivedRows.map(g => {
                        const isPending = receptionQueue.some(q => q.id === g.id);
                        const isReceived = g.status === STATUSES.RECIBIDO_CALIDAD;
                        return (
                          <tr key={g.id} className={isPending ? 'table-warning' : ''}>
                            <td><span className="badge bg-secondary">{g.barcode}</span></td>
                            <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                            <td>{g.operarias?.full_name || 'Sin asignar'}</td>
                            <td>
                              {isPending ? (
                                <span className="badge bg-warning text-dark">
                                  <i className="bi bi-hourglass-split me-1"></i>Sin confirmar
                                </span>
                              ) : isReceived ? (
                                <StatusBadge status={g.status} />
                              ) : (
                                <span className="badge bg-info">
                                  <i className="bi bi-inbox me-1"></i>Pendiente de recepción
                                </span>
                              )}
                            </td>
                            <td>
                              <small className="text-muted">
                                {isPending ? 'Ahora mismo' : new Date(g.updated_at).toLocaleDateString('es-ES')}
                              </small>
                            </td>
                            <td>
                              {isPending ? (
                                <button
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleRemoveFromQueue(g.id)}
                                  disabled={loading}
                                  title="Quitar de la lista de recepción"
                                >
                                  <i className="bi bi-x-lg"></i>
                                </button>
                              ) : isReceived ? (
                                <button
                                  className="btn btn-info btn-sm"
                                  onClick={() => openReview(g)}
                                  disabled={loading}
                                  title="Revisar prenda"
                                >
                                  <i className="bi bi-search me-1"></i>Revisar
                                </button>
                              ) : (
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleReceiveSingle(g)}
                                  disabled={loading}
                                  title="Recepcionar por control de calidad"
                                >
                                  <i className="bi bi-check-lg me-1"></i>Recepcionar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card shadow-sm">
            <div className="card-header bg-danger text-white">
              <h6 className="mb-0">
                <i className="bi bi-arrow-return-left me-2"></i>
                Prendas Devueltas ({stats.totalDevueltas})
              </h6>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="table table-hover align-middle table-sm mb-0">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Operaria</th>
                      <th>Devoluciones</th>
                      <th>Devuelta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.devueltas.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-3 text-muted">
                          <small>No hay prendas devueltas</small>
                        </td>
                      </tr>
                    ) : (
                      stats.devueltas.map(g => (
                        <tr key={g.id}>
                          <td><span className="badge bg-secondary">{g.barcode}</span></td>
                          <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                          <td>{g.operarias?.full_name || 'Sin asignar'}</td>
                          <td><span className="badge bg-danger">{g.return_count || 0}</span></td>
                          <td><small className="text-muted">{new Date(g.updated_at).toLocaleDateString('es-ES')}</small></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
