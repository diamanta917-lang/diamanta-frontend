import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { garmentsService } from '../../services/garments';
import { StatsCard } from '../../components/UI/StatsCard';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { useAuth } from '../../context/useAuth';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isSupervisor, isSupervisorPrincipal, isAdmin } = useAuth();

  const statusByMetric = {
    pendientes: 'Pendiente de revisión',
    asignadas: 'Asignada',
    en_produccion: 'En Produccion',
    recibidas_calidad: 'Recibido por control de calidad',
    aprobadas: 'Aprobada',
    requiere_correccion: 'Requiere corrección',
    terminadas: 'Terminado',
  };

  const goToStatus = (status) => navigate(`/prendas?status=${encodeURIComponent(status)}`);

  const fetchData = useCallback(async () => {
    try {
      const data = await garmentsService.getDashboardMetrics();
      return {
        pendientes: data.pendientes ?? 0,
        asignadas: data.asignadas ?? 0,
        en_produccion: data.en_produccion ?? 0,
        aprobadas: data.aprobadas ?? 0,
        recibidas_calidad: data.recibidas_calidad ?? 0,
        requiere_correccion: data.requiere_correccion ?? 0,
        pendiente_recepcion: data.pendiente_recepcion ?? 0,
        terminadas: data.terminadas ?? 0,
        total_prendas: data.total_prendas ?? 0,
      };
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData().then(m => { if (m) setMetrics(m); });
  }, [fetchData]);

  useEffect(() => {
    const refresh = () => fetchData().then(m => { if (m) setMetrics(m); });
    let interval = null;

    const startInterval = () => {
      if (!interval) {
        interval = setInterval(() => {
          if (document.visibilityState === 'visible') refresh();
        }, 30000);
      }
    };
    const stopInterval = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.refreshSession().catch(() => {});
        refresh();
        startInterval();
      } else {
        stopInterval();
      }
    };

    const onFocus = () => {
      supabase.auth.refreshSession().catch(() => {});
      refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    startInterval();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      stopInterval();
    };
  }, [fetchData]);

  if (loading) return <LoadingSpinner text="Cargando dashboard..." />;

  return (
    <div>
      {/* Action Buttons */}
      <div className="row g-3 mb-4">
        {(isSupervisor || isAdmin) && (
          <>
            <div className="col-md-4">
              <button
                className="btn btn-info btn-lg w-100 shadow-lg border-0"
                style={{ minHeight: '130px', borderRadius: '16px' }}
                onClick={() => navigate('/asignar')}
              >
                <i className="bi bi-person-plus" style={{ fontSize: '2.5rem' }}></i>
                <h5 className="fw-bold mt-2 mb-0">ASIGNAR</h5>
                <small className="opacity-75">Asignar prendas a operarias</small>
              </button>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-outline-info btn-lg w-100 shadow-lg border-0"
                style={{ minHeight: '130px', borderRadius: '16px' }}
                onClick={() => navigate('/recepcion-area')}
              >
                <i className="bi bi-inbox-fill" style={{ fontSize: '2.5rem' }}></i>
                <h5 className="fw-bold mt-2 mb-0">RECEPCIÓN</h5>
                <small className="opacity-75">Recepcionar prendas de otras áreas</small>
              </button>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-primary btn-lg w-100 shadow-lg border-0"
                style={{ minHeight: '130px', borderRadius: '16px' }}
                onClick={() => navigate('/control-calidad')}
              >
                <i className="bi bi-clipboard-check" style={{ fontSize: '2.5rem' }}></i>
                <h5 className="fw-bold mt-2 mb-0">CONTROL DE CALIDAD</h5>
                <small className="opacity-75">Revisar, aprobar o rechazar</small>
              </button>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-success btn-lg w-100 shadow-lg border-0"
                style={{ minHeight: '130px', borderRadius: '16px' }}
                onClick={() => navigate('/pasar-area')}
              >
                <i className="bi bi-arrow-left-right" style={{ fontSize: '2.5rem' }}></i>
                <h5 className="fw-bold mt-2 mb-0">PASAR A ÁREA</h5>
                <small className="opacity-75">Enviar prendas a otra área</small>
              </button>
            </div>
          </>
        )}

        {isSupervisorPrincipal && (
          <div className="col-md-6">
            <button
              className="btn btn-warning btn-lg w-100 shadow-lg border-0"
              style={{ minHeight: '130px', borderRadius: '16px' }}
              onClick={() => navigate('/revision-principal')}
            >
              <i className="bi bi-star-check" style={{ fontSize: '2.5rem' }}></i>
              <h5 className="fw-bold mt-2 mb-0">REVISIÓN FINAL</h5>
              <small className="opacity-75">Terminar prendas</small>
            </button>
          </div>
        )}

        <div className={isSupervisorPrincipal ? "col-md-6" : "col-md-4"}>
          <button
            className="btn btn-secondary btn-lg w-100 shadow-lg border-0"
            style={{ minHeight: '130px', borderRadius: '16px' }}
            onClick={() => navigate('/cargas')}
          >
            <i className="bi bi-bar-chart-line" style={{ fontSize: '2.5rem' }}></i>
            <h5 className="fw-bold mt-2 mb-0">CARGAS</h5>
            <small className="opacity-75">Prendas por supervisor/operaria</small>
          </button>
        </div>

        <div className={isSupervisorPrincipal ? "col-md-6" : "col-md-4"}>
          <button
            className="btn btn-dark btn-lg w-100 shadow-lg border-0"
            style={{ minHeight: '130px', borderRadius: '16px' }}
            onClick={() => navigate('/historial')}
          >
            <i className="bi bi-clock-history" style={{ fontSize: '2.5rem' }}></i>
            <h5 className="fw-bold mt-2 mb-0">HISTORIAL</h5>
            <small className="opacity-75">Historial completo de prendas</small>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row g-3 mb-4">
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="Pendientes" value={metrics.pendientes} icon="bi-clock" color="warning" onClick={() => goToStatus(statusByMetric.pendientes)} />
        </div>
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="Asignadas" value={metrics.asignadas} icon="bi-person-check" color="info" onClick={() => goToStatus(statusByMetric.asignadas)} />
        </div>
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="En Producción" value={metrics.en_produccion} icon="bi-gear" color="primary" onClick={() => goToStatus(statusByMetric.en_produccion)} />
        </div>
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="En Control de Calidad" value={metrics.recibidas_calidad} icon="bi-clipboard-check" color="info" onClick={() => goToStatus(statusByMetric.recibidas_calidad)} />
        </div>
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="Aprobadas" value={metrics.aprobadas} icon="bi-check-circle" color="success" onClick={() => goToStatus(statusByMetric.aprobadas)} />
        </div>
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="Requiere Corr." value={metrics.requiere_correccion} icon="bi-arrow-return-left" color="danger" onClick={() => goToStatus(statusByMetric.requiere_correccion)} />
        </div>
        <div className="col-xl-3 col-lg-4 col-md-6">
          <StatsCard title="Terminadas" value={metrics.terminadas} icon="bi-patch-check" color="success" onClick={() => goToStatus(statusByMetric.terminadas)} />
        </div>
      </div>

      {/* Quick info */}
      <div className="row g-4">
        <div className="col-md-6">
          <div className="card shadow-sm border-secondary">
            <div className="card-body text-center py-4">
              <i className="bi bi-boxes text-secondary" style={{ fontSize: '2.5rem' }}></i>
              <h5 className="mt-2 fw-bold">{metrics.total_prendas} Total</h5>
              <p className="text-muted mb-3">Prendas en el sistema</p>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={() => navigate('/prendas')}>
                <i className="bi bi-eye me-2"></i>Ver Prendas
              </button>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card shadow-sm border-warning" style={{ cursor: 'pointer' }} onClick={() => goToStatus('Pendiente Recepcion')}>
            <div className="card-body text-center py-4">
              <i className="bi bi-inbox text-warning" style={{ fontSize: '2.5rem' }}></i>
              <h5 className="mt-2 fw-bold">{metrics.pendiente_recepcion} Pend. Recepción</h5>
              <p className="text-muted mb-3">Prendas en tránsito entre áreas</p>
              {(isSupervisor || isAdmin) && (
                <button className="btn btn-outline-warning btn-lg px-4" onClick={(e) => { e.stopPropagation(); navigate('/recepcion-area'); }}>
                  <i className="bi bi-inbox-fill me-2"></i>Ir a Recepción
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}