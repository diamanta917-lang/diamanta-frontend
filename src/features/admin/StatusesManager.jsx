import { useState, useEffect, useCallback } from 'react';
import { statusesService } from '../../services/statuses';
import { showConfirm, showToast, showError } from '../../components/UI/ConfirmDialog';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';
import { auditService } from '../../services/audit';
import { useAuth } from '../../context/useAuth';

const COLORS = [
  { value: 'primary', label: 'Azul' },
  { value: 'secondary', label: 'Gris' },
  { value: 'success', label: 'Verde' },
  { value: 'danger', label: 'Rojo' },
  { value: 'warning', label: 'Amarillo' },
  { value: 'info', label: 'Cian' },
  { value: 'dark', label: 'Negro' }
];

const colorOptionsHtml = (selected) => COLORS
  .map(c => `<option value="${c.value}" ${c.value === selected ? 'selected' : ''}>${c.label}</option>`)
  .join('');

export const StatusesManager = () => {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const load = useCallback(async () => {
    try {
      return await statusesService.getAll(false);
    } catch {
      showError('Error al cargar estados');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    setLoading(true);
    load().then(setStatuses);
  };

  useEffect(() => {
    load().then(setStatuses);
  }, [load]);

  const handleCreate = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Estado de Prenda',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre</label>
          <input id="swal-name" class="form-control" placeholder="Ej: En Control de Calidad">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Descripción (Opcional)</label>
          <textarea id="swal-desc" class="form-control" rows="2" placeholder="Descripción del estado"></textarea>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Color del badge</label>
          <select id="swal-color" class="form-select">${colorOptionsHtml('secondary')}</select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        return {
          name,
          description: document.getElementById('swal-desc').value.trim() || null,
          color: document.getElementById('swal-color').value
        };
      }
    });

    if (formValues) {
      try {
        await statusesService.create(formValues);
        showToast({ icon: 'success', title: 'Estado creado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Crear estado',
          module: 'Estados',
          details: { name: formValues.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleEdit = async (status) => {
    const { value: formValues } = await Swal.fire({
      title: 'Editar Estado de Prenda',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre</label>
          <input id="swal-name" class="form-control" value="${status.name}">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Descripción (Opcional)</label>
          <textarea id="swal-desc" class="form-control" rows="2">${status.description || ''}</textarea>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Color del badge</label>
          <select id="swal-color" class="form-select">${colorOptionsHtml(status.color || 'secondary')}</select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        return {
          name,
          description: document.getElementById('swal-desc').value.trim() || null,
          color: document.getElementById('swal-color').value
        };
      }
    });

    if (formValues) {
      try {
        await statusesService.update(status.id, formValues);
        showToast({ icon: 'success', title: 'Estado actualizado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Editar estado',
          module: 'Estados',
          details: { id: status.id, name: formValues.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleDelete = async (status) => {
    const confirmed = await showConfirm({
      title: 'Eliminar Estado',
      text: `¿Eliminar definitivamente "${status.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmColor: '#dc3545'
    });
    if (!confirmed) return;
    try {
      await statusesService.remove(status.id);
      showToast({ icon: 'success', title: 'Estado eliminado' });
      auditService.log({
        userId: user.id,
        userEmail: profile?.email,
          action: 'Eliminar estado',
          module: 'Estados',
          details: { id: status.id, name: status.name }
        });
        refresh();
    } catch (err) {
      showError(err.message || 'No se pudo eliminar (puede tener prendas asociadas)');
    }
  };

  const handleToggle = async (status) => {
    const confirmed = await showConfirm({
      title: `${status.is_active ? 'Desactivar' : 'Activar'} Estado`,
      text: `¿${status.is_active ? 'Desactivar' : 'Activar'} "${status.name}"?`,
      confirmColor: status.is_active ? '#dc3545' : '#198754'
    });
    if (confirmed) {
      try {
        if (status.is_active) await statusesService.deactivate(status.id);
        else await statusesService.reactivate(status.id);
        showToast({ icon: 'success', title: 'Actualizado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: status.is_active ? 'Desactivar estado' : 'Activar estado',
          module: 'Estados',
          details: { id: status.id, name: status.name }
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
          <h4 className="fw-bold mb-0"><i className="bi bi-tags me-2 text-primary"></i>Estados de Prenda</h4>
          <p className="text-muted mb-0">Catálogo de estados por los que puede transitar una prenda</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>
          <i className="bi bi-plus-lg me-1"></i> Nuevo Estado
        </button>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Color</th>
                <th>Estado</th>
                <th>Fecha Creación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map(status => (
                <tr key={status.id}>
                  <td className="fw-bold">
                    <span className={`badge bg-${status.color || 'secondary'} me-2`}>●</span>
                    {status.name}
                  </td>
                  <td className="text-muted">{status.description || 'N/A'}</td>
                  <td><small className="text-muted">{status.color || 'secondary'}</small></td>
                  <td>
                    {status.is_active
                      ? <span className="badge bg-success">Activo</span>
                      : <span className="badge bg-danger">Inactivo</span>
                    }
                  </td>
                  <td><small className="text-muted">{new Date(status.created_at).toLocaleDateString('es-ES')}</small></td>
                  <td>
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => handleEdit(status)} title="Editar">
                        <i className="bi bi-pencil"></i>
                      </button>
                      <button className={`btn btn-outline-${status.is_active ? 'danger' : 'success'} btn-sm`}
                        onClick={() => handleToggle(status)} title={status.is_active ? 'Desactivar' : 'Activar'}>
                        <i className={`bi ${status.is_active ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
                      </button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(status)} title="Eliminar">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {statuses.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">
                    <i className="bi bi-inbox fs-1"></i>
                    <p className="mt-2">No hay estados registrados</p>
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