import { useState, useEffect, useCallback } from 'react';
import { locationsService } from '../../services/locations';
import { showConfirm, showToast, showError } from '../../components/UI/ConfirmDialog';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';
import { auditService } from '../../services/audit';
import { useAuth } from '../../context/useAuth';

export const LocationsManager = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const load = useCallback(async () => {
    try {
      return await locationsService.getAll(false);
    } catch {
      showError('Error al cargar ubicaciones');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    setLoading(true);
    load().then(setLocations);
  };

  useEffect(() => {
    load().then(setLocations);
  }, [load]);

  const handleCreate = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Nueva Ubicación Física',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre</label>
          <input id="swal-name" class="form-control" placeholder="Ej: Estante C-1, Rack Principal, Caja 5">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Descripción (Opcional)</label>
          <textarea id="swal-desc" class="form-control" rows="2" placeholder="Descripción de la ubicación"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        return { name, description: document.getElementById('swal-desc').value.trim() };
      }
    });

    if (formValues) {
      try {
        await locationsService.create(formValues.name, formValues.description);
        showToast({ icon: 'success', title: 'Ubicación creada' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Crear ubicación',
          module: 'Ubicaciones',
          details: { name: formValues.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleEdit = async (location) => {
    const { value: formValues } = await Swal.fire({
      title: 'Editar Ubicación',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre</label>
          <input id="swal-name" class="form-control" value="${location.name}">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Descripción (Opcional)</label>
          <textarea id="swal-desc" class="form-control" rows="2">${location.description || ''}</textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        return { name, description: document.getElementById('swal-desc').value.trim() };
      }
    });

    if (formValues) {
      try {
        await locationsService.update(location.id, formValues);
        showToast({ icon: 'success', title: 'Ubicación actualizada' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Editar ubicación',
          module: 'Ubicaciones',
          details: { id: location.id, name: formValues.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleDelete = async (location) => {
    const confirmed = await showConfirm({
      title: 'Eliminar Ubicación',
      text: `¿Eliminar definitivamente "${location.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmColor: '#dc3545'
    });
    if (!confirmed) return;
    try {
      await locationsService.remove(location.id);
      showToast({ icon: 'success', title: 'Ubicación eliminada' });
      auditService.log({
        userId: user.id,
        userEmail: profile?.email,
        action: 'Eliminar ubicación',
        module: 'Ubicaciones',
        details: { id: location.id, name: location.name }
      });
      refresh();
    } catch (err) {
      showError(err.message || 'No se pudo eliminar (puede tener prendas asociadas)');
    }
  };

  const handleToggle = async (location) => {
    const confirmed = await showConfirm({
      title: `${location.is_active ? 'Desactivar' : 'Activar'} Ubicación`,
      text: `¿${location.is_active ? 'Desactivar' : 'Activar'} ${location.name}?`,
      confirmColor: location.is_active ? '#dc3545' : '#198754'
    });
    if (confirmed) {
      try {
        if (location.is_active) await locationsService.deactivate(location.id);
        else await locationsService.reactivate(location.id);
        showToast({ icon: 'success', title: 'Actualizado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: location.is_active ? 'Desactivar ubicación' : 'Activar ubicación',
          module: 'Ubicaciones',
          details: { id: location.id, name: location.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-0"><i className="bi bi-geo-alt me-2 text-primary"></i>Ubicaciones Físicas</h4>
          <p className="text-muted mb-0">Gestione las ubicaciones donde se almacenan las prendas (estantes, racks, cajas)</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>
          <i className="bi bi-plus-lg me-1"></i> Nueva Ubicación
        </button>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th>Fecha Creación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {locations.map(loc => (
                <tr key={loc.id}>
                  <td className="fw-bold">
                    <i className="bi bi-geo-alt-fill text-primary me-1"></i>
                    {loc.name}
                  </td>
                  <td className="text-muted">{loc.description || 'N/A'}</td>
                  <td>
                    {loc.is_active
                      ? <span className="badge bg-success">Activa</span>
                      : <span className="badge bg-danger">Inactiva</span>
                    }
                  </td>
                  <td><small className="text-muted">{new Date(loc.created_at).toLocaleDateString('es-ES')}</small></td>
                  <td>
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => handleEdit(loc)} title="Editar">
                        <i className="bi bi-pencil"></i>
                      </button>
                      <button className={`btn btn-outline-${loc.is_active ? 'danger' : 'success'} btn-sm`}
                        onClick={() => handleToggle(loc)} title={loc.is_active ? 'Desactivar' : 'Activar'}>
                        <i className={`bi ${loc.is_active ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
                      </button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(loc)} title="Eliminar">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted">
                    <i className="bi bi-inbox fs-1"></i>
                    <p className="mt-2">No hay ubicaciones registradas</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
