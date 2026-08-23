import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { garmentsService } from '../../services/garments';
import { areasService } from '../../services/areas';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { PageHeader } from '../../components/UI/PageHeader';
import Swal from 'sweetalert2';

export const PasarAreaModule = () => {
  const [approvedGarments, setApprovedGarments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedGarments, setSelectedGarments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { user, areaId } = useAuth();

  const loadData = useCallback(async () => {
    try {
      const supervisorId = user.id;
      const [approved, allAreas] = await Promise.all([
        garmentsService.getApprovedBySupervisor(supervisorId, areaId),
        areasService.getAll(true),
      ]);
      return { approved: approved || [], allAreas: allAreas || [] };
    } catch (err) {
      console.error(err);
      return { approved: [], allAreas: [] };
    } finally {
      setRefreshing(false);
    }
  }, [user.id, areaId]);

  const refresh = () => {
    setRefreshing(true);
    loadData().then(({ approved, allAreas }) => {
      setApprovedGarments(approved);
      setAreas(allAreas);
    });
  };

  useEffect(() => {
    loadData().then(({ approved, allAreas }) => {
      setApprovedGarments(approved);
      setAreas(allAreas);
    });
  }, [loadData]);

  const toggleGarment = (g) => {
    setSelectedGarments(prev =>
      prev.some(x => x.id === g.id)
        ? prev.filter(x => x.id !== g.id)
        : [...prev, g]
    );
  };

  const handlePassToArea = async () => {
    if (selectedGarments.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin prendas', text: 'Seleccione al menos una prenda' });
      return;
    }

    const { value: destAreaId } = await Swal.fire({
      title: 'Pasar a Área',
      html: `
        <div class="text-start">
          <p>Prendas seleccionadas: <strong>${selectedGarments.length}</strong></p>
          <label class="form-label fw-bold mt-2">Área de destino</label>
          <select id="swal-dest-area" class="form-select">
            <option value="">Seleccione un área...</option>
            ${areas.filter(a => a.id !== areaId).map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Pasar a Área',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const val = document.getElementById('swal-dest-area').value;
        if (!val) { Swal.showValidationMessage('Seleccione un área de destino'); return false; }
        return val;
      },
    });

    if (!destAreaId) return;

    const destArea = areas.find(a => a.id === destAreaId);

    const result = await Swal.fire({
      title: 'Confirmar',
      html: `<p>¿Pasar <strong>${selectedGarments.length}</strong> prenda(s) al área <strong>${destArea?.name}</strong>?</p>
             <p class="text-muted">La supervisora de esa área deberá recepcionarlas.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, pasar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754',
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      for (const g of selectedGarments) {
        await garmentsService.transitionToArea(g.id, destAreaId, user.id);
      }

      await Swal.fire({
        icon: 'success',
        title: 'Prendas enviadas',
        html: `<p><strong>${selectedGarments.length}</strong> prenda(s) enviadas a <strong>${destArea?.name}</strong></p>`,
        timer: 2500,
        showConfirmButton: false,
      });

      setSelectedGarments([]);
      refresh();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
    setLoading(false);
  };

  if (refreshing && approvedGarments.length === 0) return <LoadingSpinner text="Cargando prendas aprobadas..." />;

  return (
    <div>
      <PageHeader
        title="Pasar a Área"
        subtitle="Envíe prendas aprobadas a otra área de producción"
        icon="bi-arrow-left-right"
        actions={
          <button className="btn btn-outline-secondary btn-sm" onClick={loadData} disabled={refreshing}>
            <i className="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        }
      />

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold">
            <i className="bi bi-check-circle me-2 text-success"></i>
            Prendas Aprobadas
            <span className="badge bg-success ms-2">{approvedGarments.length}</span>
          </h6>
          {selectedGarments.length > 0 && (
            <button className="btn btn-success btn-sm" onClick={handlePassToArea} disabled={loading}>
              {loading ? (
                <><span className="spinner-border spinner-border-sm me-1" />Pasando...</>
              ) : (
                <><i className="bi bi-arrow-right me-1"></i>Pasar {selectedGarments.length} a Área</>
              )}
            </button>
          )}
        </div>
        <div className="card-body p-0">
          {approvedGarments.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox fs-1"></i>
              <p className="mt-2">No hay prendas aprobadas para pasar a otra área</p>
              <small>Apruebe prendas desde el módulo de Control de Calidad</small>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selectedGarments.length === approvedGarments.length}
                        onChange={(e) => {
                          setSelectedGarments(e.target.checked ? approvedGarments : []);
                        }}
                      />
                    </th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Operaria</th>
                    <th>Área Actual</th>
                    <th>Estado</th>
                    <th>Aprobada</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedGarments.map(g => (
                    <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => toggleGarment(g)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selectedGarments.some(x => x.id === g.id)}
                          onChange={() => toggleGarment(g)}
                        />
                      </td>
                      <td><span className="badge bg-secondary">{g.barcode}</span></td>
                      <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                      <td>{g.operarias?.full_name || 'Sin asignar'}</td>
                      <td><small>{areas.find(a => a.id === g.current_area_id)?.name || g.operarias?.areas?.name || 'N/A'}</small></td>
                      <td><StatusBadge status={g.status} /></td>
                      <td><small className="text-muted">{new Date(g.updated_at).toLocaleDateString('es-ES')}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};