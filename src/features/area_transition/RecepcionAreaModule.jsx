import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { garmentsService } from '../../services/garments';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { PageHeader } from '../../components/UI/PageHeader';
import Swal from 'sweetalert2';

export const RecepcionAreaModule = () => {
  const [pendingGarments, setPendingGarments] = useState([]);
  const [qcGarments, setQcGarments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { user, areaId, isSupervisor } = useAuth();

  const loadData = useCallback(async () => {
    try {
      const [data, qcData] = await Promise.all([
        areaId ? garmentsService.getPendingReception(areaId) : Promise.resolve([]),
        garmentsService.getQcReceivedGarments(isSupervisor ? user?.id : null, isSupervisor ? areaId : null),
      ]);
      return { pending: data || [], qc: qcData || [] };
    } catch (err) {
      console.error(err);
      return { pending: [], qc: [] };
    } finally {
      setRefreshing(false);
    }
  }, [user, areaId, isSupervisor]);

  const refresh = () => {
    setRefreshing(true);
    loadData().then(({ pending, qc }) => {
      setPendingGarments(pending);
      setQcGarments(qc);
    });
  };

  useEffect(() => {
    loadData().then(({ pending, qc }) => {
      setPendingGarments(pending);
      setQcGarments(qc);
    });
  }, [loadData]);

  const handleReception = async (g) => {
    const result = await Swal.fire({
      title: 'Recepcionar Prenda',
      html: `
        <div class="text-start">
          <p><strong>Código:</strong> <span class="badge bg-secondary">${g.barcode}</span></p>
          <p><strong>Producto:</strong> ${g.product_name || 'N/A'}</p>
          <p>¿Confirma la recepción de esta prenda en su área?</p>
          <p class="text-muted">Al recepcionar, podrá asignarla a sus operarias.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recepcionar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      await garmentsService.receptionGarment(g.id, user.id);
      await Swal.fire({
        icon: 'success',
        title: 'Prenda recepcionada',
        text: `${g.barcode} — Ya puede asignarla a sus operarias`,
        timer: 2000,
        showConfirmButton: false,
      });
      refresh();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
    setLoading(false);
  };

  const handleReceptionAll = async () => {
    if (pendingGarments.length === 0) return;

    const result = await Swal.fire({
      title: 'Recepcionar todas',
      text: `¿Recepcionar las ${pendingGarments.length} prendas pendientes?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recepcionar todas',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      for (const g of pendingGarments) {
        await garmentsService.receptionGarment(g.id, user.id);
      }
      await Swal.fire({
        icon: 'success',
        title: 'Todas recepcionadas',
        text: `${pendingGarments.length} prendas recepcionadas`,
        timer: 2000,
        showConfirmButton: false,
      });
      refresh();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
    setLoading(false);
  };

  const getReturnObservation = (g) => {
    const last = (g.movements || [])[0];
    if (!last || !/devuelta|devoluci/i.test(last.action || '')) return null;
    return last.observation || null;
  };

  if (refreshing && pendingGarments.length === 0) return <LoadingSpinner text="Cargando prendas..." />;

  return (
    <div>
      <PageHeader
        title="Recepción de Prendas"
        subtitle="Recepcione las prendas que llegaron a su área desde otras áreas"
        icon="bi-inbox-fill"
        actions={
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={loadData} disabled={refreshing}>
              <i className="bi bi-arrow-clockwise"></i> Actualizar
            </button>
            {pendingGarments.length > 0 && (
              <button className="btn btn-success btn-sm" onClick={handleReceptionAll} disabled={loading}>
                <i className="bi bi-check2-all me-1"></i>Recepcionar todas
              </button>
            )}
          </div>
        }
      />

      <div className="card shadow-sm">
        <div className="card-header bg-white">
          <h6 className="mb-0 fw-bold">
            <i className="bi bi-inbox me-2 text-info"></i>
            Pendientes de Recepción
            <span className="badge bg-info ms-2">{pendingGarments.length}</span>
          </h6>
        </div>
        <div className="card-body p-0">
          {pendingGarments.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox fs-1"></i>
              <p className="mt-2">No hay prendas pendientes de recepción</p>
              <small>Las prendas enviadas desde otras áreas aparecerán aquí</small>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Referencia</th>
                    <th>Observación</th>
                    <th>Estado</th>
                    <th>Enviada</th>
                    <th style={{ width: '120px' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingGarments.map(g => (
                    <tr key={g.id}>
                      <td><span className="badge bg-secondary">{g.barcode}</span></td>
                      <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                      <td>{g.reference || 'N/A'}</td>
                      <td>
                        {getReturnObservation(g) ? (
                          <small className="text-danger d-block" style={{ maxWidth: '220px', whiteSpace: 'normal' }}>
                            <i className="bi bi-exclamation-triangle me-1"></i>
                            {getReturnObservation(g)}
                          </small>
                        ) : (
                          <small className="text-muted">—</small>
                        )}
                      </td>
                      <td><StatusBadge status={g.status} /></td>
                      <td><small className="text-muted">{new Date(g.updated_at).toLocaleDateString('es-ES')}</small></td>
                      <td>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleReception(g)}
                          disabled={loading}
                        >
                          <i className="bi bi-check-lg me-1"></i>Recepcionar
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

      <div className="card shadow-sm mt-3">
        <div className="card-header bg-white">
          <h6 className="mb-0 fw-bold">
            <i className="bi bi-clipboard-check me-2 text-primary"></i>
            En Control de Calidad
            <span className="badge bg-primary ms-2">{qcGarments.length}</span>
          </h6>
        </div>
        <div className="card-body p-0">
          {qcGarments.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <i className="bi bi-clipboard-check fs-1"></i>
              <p className="mt-2 mb-0">No hay prendas recibidas por control de calidad</p>
              <small>Las prendas recepcionadas por control de calidad aparecerán aquí hasta que se aprueben o se devuelvan con observaciones</small>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Referencia</th>
                    <th>Operaria</th>
                    <th>Estado</th>
                    <th>Recibida</th>
                  </tr>
                </thead>
                <tbody>
                  {qcGarments.map(g => (
                    <tr key={g.id}>
                      <td><span className="badge bg-secondary">{g.barcode}</span></td>
                      <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                      <td>{g.reference || 'N/A'}</td>
                      <td>{g.operarias?.full_name || 'N/A'}</td>
                      <td><StatusBadge status={g.status} /></td>
                      <td><small className="text-muted">{new Date(g.updated_at).toLocaleString('es-ES')}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {qcGarments.length > 0 && (
            <div className="p-2 border-top bg-light small text-muted">
              <i className="bi bi-info-circle me-1"></i>
              Estas prendas desaparecerán al aprobarlas o devolverlas con observaciones desde el módulo de Control de Calidad
            </div>
          )}
        </div>
      </div>
    </div>
  );
};