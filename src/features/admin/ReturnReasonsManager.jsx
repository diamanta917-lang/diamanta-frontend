import { useState, useEffect, useCallback } from 'react';
import { returnReasonsService } from '../../services/returnReasons';
import { showConfirm, showToast, showError } from '../../components/UI/ConfirmDialog';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';
import { auditService } from '../../services/audit';
import { useAuth } from '../../context/useAuth';

export const ReturnReasonsManager = () => {
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const load = useCallback(async () => {
    try {
      return await returnReasonsService.getAll(false);
    } catch {
      showError('Error al cargar motivos');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    setLoading(true);
    load().then(setReasons);
  };

  useEffect(() => {
    load().then(setReasons);
  }, [load]);

  const handleCreate = async () => {
    const { value: name } = await Swal.fire({
      title: 'Nuevo Motivo de Devolución',
      input: 'text',
      inputPlaceholder: 'Nombre del motivo',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      confirmButtonColor: '#2563eb',
      inputValidator: (value) => !value?.trim() && 'El nombre es obligatorio'
    });

    if (name) {
      try {
        await returnReasonsService.create(name.trim());
        showToast({ icon: 'success', title: 'Motivo creado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Crear motivo',
          module: 'Motivos Devolución',
          details: { name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleEdit = async (reason) => {
    const { value: name } = await Swal.fire({
      title: 'Editar Motivo',
      input: 'text',
      inputValue: reason.name,
      inputPlaceholder: 'Nombre del motivo',
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      confirmButtonColor: '#2563eb',
      inputValidator: (value) => !value?.trim() && 'El nombre es obligatorio'
    });

    if (name && name.trim() !== reason.name) {
      try {
        await returnReasonsService.update(reason.id, { name: name.trim() });
        showToast({ icon: 'success', title: 'Motivo actualizado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Editar motivo',
          module: 'Motivos Devolución',
          details: { id: reason.id, old: reason.name, new: name.trim() }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleDelete = async (reason) => {
    const result = await Swal.fire({
      title: 'Eliminar Motivo',
      html: `¿Estás seguro de eliminar <strong>"${reason.name}"</strong>?<br><small class="text-danger">Esta acción no se puede deshacer.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      confirmButtonColor: '#dc3545',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await returnReasonsService.delete(reason.id);
        showToast({ icon: 'success', title: 'Motivo eliminado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Eliminar motivo',
          module: 'Motivos Devolución',
          details: { id: reason.id, name: reason.name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleToggle = async (reason) => {
    const confirmed = await showConfirm({
      title: `${reason.is_active ? 'Desactivar' : 'Activar'} Motivo`,
      text: `¿${reason.is_active ? 'Desactivar' : 'Activar'} "${reason.name}"?`,
      confirmColor: reason.is_active ? '#dc3545' : '#198754'
    });
    if (confirmed) {
      try {
        if (reason.is_active) await returnReasonsService.deactivate(reason.id);
        else await returnReasonsService.reactivate(reason.id);
        showToast({ icon: 'success', title: 'Actualizado' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: reason.is_active ? 'Desactivar motivo' : 'Activar motivo',
          module: 'Motivos Devolución',
          details: { id: reason.id, name: reason.name }
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
          <h4 className="fw-bold mb-0"><i className="bi bi-exclamation-triangle me-2 text-warning"></i>Motivos de Devolución</h4>
          <p className="text-muted mb-0">Catálogo de motivos para devoluciones de prendas</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>
          <i className="bi bi-plus-lg me-1"></i> Nuevo Motivo
        </button>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Fecha Creación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map(reason => (
                <tr key={reason.id}>
                  <td className="fw-bold">{reason.name}</td>
                  <td>
                    {reason.is_active
                      ? <span className="badge bg-success">Activo</span>
                      : <span className="badge bg-danger">Inactivo</span>
                    }
                  </td>
                  <td><small className="text-muted">{new Date(reason.created_at).toLocaleDateString('es-ES')}</small></td>
                  <td>
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm"
                        onClick={() => handleEdit(reason)}>
                        <i className="bi bi-pencil me-1"></i>Editar
                      </button>
                      <button className={`btn btn-outline-${reason.is_active ? 'danger' : 'success'} btn-sm`}
                        onClick={() => handleToggle(reason)}>
                        <i className={`bi ${reason.is_active ? 'bi-x-circle' : 'bi-check-circle'} me-1`}></i>
                        {reason.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="btn btn-outline-dark btn-sm"
                        onClick={() => handleDelete(reason)}>
                        <i className="bi bi-trash me-1"></i>Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {reasons.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-muted">
                    <i className="bi bi-inbox fs-1"></i>
                    <p className="mt-2">No hay motivos registrados</p>
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
