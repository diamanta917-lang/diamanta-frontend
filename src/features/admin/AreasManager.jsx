import { useState, useEffect, useCallback } from 'react';
import { areasService } from '../../services/areas';
import { showConfirm, showToast, showError } from '../../components/UI/ConfirmDialog';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';
import { auditService } from '../../services/audit';
import { useAuth } from '../../context/useAuth';

export const AreasManager = () => {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const load = useCallback(async () => {
    try {
      return await areasService.getAll(false);
    } catch {
      showError('Error al cargar áreas');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    setLoading(true);
    load().then(setAreas);
  };

  useEffect(() => {
    load().then(setAreas);
  }, [load]);

  const handleCreate = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Nueva Área de Producción',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre</label>
          <input id="swal-name" class="form-control" placeholder="Nombre del área">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Descripción (Opcional)</label>
          <textarea id="swal-desc" class="form-control" rows="2" placeholder="Descripción del área"></textarea>
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
        await areasService.create(formValues.name, formValues.description);
        showToast({ icon: 'success', title: 'Área creada' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Crear área',
          module: 'Áreas',
          details: { name: formValues.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleEdit = async (area) => {
    const { value: formValues } = await Swal.fire({
      title: 'Editar Área de Producción',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre</label>
          <input id="swal-name" class="form-control" value="${area.name}">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Descripción (Opcional)</label>
          <textarea id="swal-desc" class="form-control" rows="2">${area.description || ''}</textarea>
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
        await areasService.update(area.id, formValues);
        showToast({ icon: 'success', title: 'Área actualizada' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Editar área',
          module: 'Áreas',
          details: { id: area.id, name: formValues.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleDelete = async (area) => {
    const confirmed = await showConfirm({
      title: 'Eliminar Área',
      text: `¿Eliminar definitivamente "${area.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmColor: '#dc3545'
    });
    if (!confirmed) return;
    try {
      await areasService.remove(area.id);
      showToast({ icon: 'success', title: 'Área eliminada' });
      auditService.log({
        userId: user.id,
        userEmail: profile?.email,
        action: 'Eliminar área',
        module: 'Áreas',
        details: { id: area.id, name: area.name }
      });
      refresh();
    } catch (err) {
      showError(err.message || 'No se pudo eliminar (puede tener operarias asociadas)');
    }
  };

  const handleToggle = async (area) => {
    const confirmed = await showConfirm({
      title: `${area.is_active ? 'Desactivar' : 'Activar'} Área`,
      text: `¿${area.is_active ? 'Desactivar' : 'Activar'} ${area.name}?`,
      confirmColor: area.is_active ? '#dc3545' : '#198754'
    });
    if (confirmed) {
      try {
        if (area.is_active) await areasService.deactivate(area.id);
        else await areasService.reactivate(area.id);
        showToast({ icon: 'success', title: 'Actualizado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: area.is_active ? 'Desactivar área' : 'Activar área',
          module: 'Áreas',
          details: { id: area.id, name: area.name }
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
          <h4 className="fw-bold mb-0"><i className="bi bi-building me-2 text-primary"></i>Áreas de Producción</h4>
          <p className="text-muted mb-0">Gestione las áreas de producción del sistema</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>
          <i className="bi bi-plus-lg me-1"></i> Nueva Área
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
              {areas.map(area => (
                <tr key={area.id}>
                  <td className="fw-bold">{area.name}</td>
                  <td className="text-muted">{area.description || 'N/A'}</td>
                  <td>
                    {area.is_active
                      ? <span className="badge bg-success">Activa</span>
                      : <span className="badge bg-danger">Inactiva</span>
                    }
                  </td>
                  <td><small className="text-muted">{new Date(area.created_at).toLocaleDateString('es-ES')}</small></td>
                  <td>
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => handleEdit(area)} title="Editar">
                        <i className="bi bi-pencil"></i>
                      </button>
                      <button className={`btn btn-outline-${area.is_active ? 'danger' : 'success'} btn-sm`}
                        onClick={() => handleToggle(area)} title={area.is_active ? 'Desactivar' : 'Activar'}>
                        <i className={`bi ${area.is_active ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
                      </button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(area)} title="Eliminar">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {areas.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted">
                    <i className="bi bi-inbox fs-1"></i>
                    <p className="mt-2">No hay áreas registradas</p>
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
