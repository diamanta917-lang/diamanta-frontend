import { useState, useEffect, useCallback } from 'react';
import { operariasService } from '../../services/operarias';
import { areasService } from '../../services/areas';
import { supervisorsService } from '../../services/supervisors';
import { PageHeader } from '../../components/UI/PageHeader';
import { DataTable } from '../../components/UI/DataTable';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { showConfirm, showToast, showError } from '../../components/UI/ConfirmDialog';
import Swal from 'sweetalert2';
import { auditService } from '../../services/audit';
import { useAuth } from '../../context/useAuth';

export const OperariasManager = () => {
  const [operarias, setOperarias] = useState([]);
  const [areas, setAreas] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const loadData = useCallback(async () => {
    try {
      const [ops, areasData, sups] = await Promise.all([
        operariasService.getAll(false),
        areasService.getAll(false),
        supervisorsService.getAllSupervisors()
      ]);
      return { ops, areasData, sups };
    } catch {
      showError('Error al cargar datos');
      return { ops: [], areasData: [], sups: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    setLoading(true);
    loadData().then(({ ops, areasData, sups }) => {
      setOperarias(ops);
      setAreas(areasData);
      setSupervisors(sups);
    });
  };

  useEffect(() => {
    loadData().then(({ ops, areasData, sups }) => {
      setOperarias(ops);
      setAreas(areasData);
      setSupervisors(sups);
    });
  }, [loadData]);

  const handleCreate = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Nueva Operaria',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre Completo</label>
          <input id="swal-name" class="form-control" placeholder="Nombre de la operaria" autofocus>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Área de Producción</label>
          <select id="swal-area" class="form-select">
            <option value="">Seleccione un área...</option>
            ${areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
          <div class="mt-2 d-grid">
            <button type="button" id="swal-new-area" class="btn btn-outline-primary btn-sm">
              <i class="bi bi-plus-lg me-1"></i>Crear nueva área
            </button>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Supervisora Asignada</label>
          <select id="swal-supervisor" class="form-select">
            <option value="">Primero seleccione un área...</option>
          </select>
          <small class="text-muted">El admin asigna la operaria a una supervisora específica del área</small>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const areaSelect = document.getElementById('swal-area');
        const supervisorSelect = document.getElementById('swal-supervisor');

        const updateSupervisors = () => {
          const areaId = areaSelect.value;
          if (!areaId) {
            supervisorSelect.innerHTML = '<option value="">Primero seleccione un área...</option>';
            return;
          }
          const areaSupervisors = supervisors.filter(s => s.area_id === areaId);
          if (areaSupervisors.length === 0) {
            supervisorSelect.innerHTML = '<option value="">No hay supervisoras en esta área</option>';
          } else {
            supervisorSelect.innerHTML = '<option value="">Seleccione una supervisora...</option>' +
              areaSupervisors.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');
          }
        };

        areaSelect.addEventListener('change', updateSupervisors);

        document.getElementById('swal-new-area').addEventListener('click', async () => {
          const { value: areaName } = await Swal.fire({
            title: 'Crear Nueva Área',
            input: 'text',
            inputPlaceholder: 'Nombre del área',
            inputAttributes: { autofocus: true },
            showCancelButton: true,
            confirmButtonText: 'Crear',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#2563eb',
            inputValidator: (v) => !v || !v.trim() ? 'El nombre es obligatorio' : undefined
          });
          if (!areaName || !areaName.trim()) return;
          try {
            await areasService.create(areaName.trim());
            const updated = await areasService.getAll(false);
            setAreas(updated);
            const refreshedSups = await supervisorsService.getAllSupervisors();
            setSupervisors(refreshedSups);
            const select = document.getElementById('swal-area');
            const newArea = updated.find(a => a.name.toLowerCase() === areaName.trim().toLowerCase());
            select.innerHTML = '<option value="">Seleccione un área...</option>' +
              updated.map(a => `<option value="${a.id}" ${newArea && a.id === newArea.id ? 'selected' : ''}>${a.name}</option>`).join('');
            updateSupervisors();
            showToast({ icon: 'success', title: 'Área creada' });
          } catch (err) {
            showError(err.message);
          }
        });
      },
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        const areaId = document.getElementById('swal-area').value;
        const supervisorId = document.getElementById('swal-supervisor').value;
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        if (!areaId) { Swal.showValidationMessage('Debe seleccionar un área'); return false; }
        if (!supervisorId) { Swal.showValidationMessage('Debe seleccionar una supervisora'); return false; }
        return { full_name: name, area_id: areaId, supervisor_id: supervisorId };
      }
    });

    if (formValues) {
      try {
        await operariasService.create(formValues);
        showToast({ icon: 'success', title: 'Operaria creada correctamente' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: 'Crear operaria',
          module: 'Operarias',
          details: { full_name: formValues.full_name, area_id: formValues.area_id, supervisor_id: formValues.supervisor_id }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleDeleteOperaria = async (operaria) => {
    const confirmed = await showConfirm({
      title: 'Eliminar Operaria',
      text: `¿Eliminar definitivamente a ${operaria.full_name}?\nSi tiene prendas asignadas, se le asignarán a NULL.`,
      confirmText: 'Sí, eliminar',
      confirmColor: '#dc3545'
    });
    if (!confirmed) return;
    try {
      await operariasService.remove(operaria.id);
      showToast({ icon: 'success', title: 'Operaria eliminada' });
      auditService.log({
        userId: user.id,
        userEmail: profile?.email,
action: 'Eliminar operaria',
          module: 'Operarias',
          details: { id: operaria.id, full_name: operaria.full_name }
        });
        refresh();
    } catch {
      showError('No se pudo eliminar. La operaria tiene prendas asignadas. Desactívela en su lugar.');
    }
  };

  const handleToggleActive = async (operaria) => {
    const action = operaria.is_active ? 'desactivar' : 'activar';
    const confirmed = await showConfirm({
      title: `${action === 'desactivar' ? 'Desactivar' : 'Activar'} Operaria`,
      text: `¿Está seguro de ${action} a ${operaria.full_name}?`,
      confirmText: `Sí, ${action}`,
      confirmColor: operaria.is_active ? '#dc3545' : '#198754'
    });

    if (confirmed) {
      try {
        if (operaria.is_active) {
          await operariasService.deactivate(operaria.id);
        } else {
          await operariasService.update(operaria.id, { is_active: true });
        }
        showToast({ icon: 'success', title: `Operaria ${action}da` });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
          action: operaria.is_active ? 'Desactivar operaria' : 'Activar operaria',
          module: 'Operarias',
          details: { id: operaria.id, full_name: operaria.full_name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  const handleEdit = async (operaria) => {
    const areaSupervisors = supervisors.filter(s => s.area_id === operaria.area_id);

    const { value: formValues } = await Swal.fire({
      title: 'Editar Operaria',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre Completo</label>
          <input id="swal-name" class="form-control" value="${operaria.full_name}">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Área de Producción</label>
          <select id="swal-area" class="form-select">
            ${areas.map(a =>
              `<option value="${a.id}" ${a.id === operaria.area_id ? 'selected' : ''}>${a.name}</option>`
            ).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Supervisora Asignada</label>
          <select id="swal-supervisor" class="form-select">
            ${areaSupervisors.length === 0
              ? '<option value="">No hay supervisoras en esta área</option>'
              : areaSupervisors.map(s =>
                  `<option value="${s.id}" ${s.id === operaria.supervisor_id ? 'selected' : ''}>${s.full_name}</option>`
                ).join('')
            }
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const areaSelect = document.getElementById('swal-area');
        const supervisorSelect = document.getElementById('swal-supervisor');
        areaSelect.addEventListener('change', () => {
          const areaId = areaSelect.value;
          const areaSupervisors = supervisors.filter(s => s.area_id === areaId);
          supervisorSelect.innerHTML = areaSupervisors.length === 0
            ? '<option value="">No hay supervisoras en esta área</option>'
            : areaSupervisors.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');
        });
      },
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        const areaId = document.getElementById('swal-area').value;
        const supervisorId = document.getElementById('swal-supervisor').value;
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        if (!areaId) { Swal.showValidationMessage('Debe seleccionar un área'); return false; }
        if (!supervisorId) { Swal.showValidationMessage('Debe seleccionar una supervisora'); return false; }
        return { full_name: name, area_id: areaId, supervisor_id: supervisorId };
      }
    });

    if (formValues) {
      try {
        await operariasService.update(operaria.id, formValues);
        showToast({ icon: 'success', title: 'Operaria actualizada' });
        auditService.log({
          userId: user.id,
          userEmail: profile?.email,
action: 'Editar operaria',
          module: 'Operarias',
          details: { id: operaria.id, full_name: formValues.full_name }
        });
        refresh();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  if (loading) return <LoadingSpinner />;

  const columns = [
    { label: 'Nombre', key: 'full_name', render: (r) => <span className="fw-bold">{r.full_name}</span> },
    { label: 'Área', key: 'area', render: (r) => r.areas?.name || 'N/A' },
    { label: 'Supervisora', key: 'supervisor', render: (r) => r.profiles?.full_name || 'Sin asignar' },
    { label: 'Estado', key: 'is_active', render: (r) =>
      r.is_active ? <span className="badge bg-success">Activa</span> : <span className="badge bg-danger">Inactiva</span>
    },
    { label: 'Prendas Asignadas', key: 'garment_count', render: (r) => r.garment_count || 0 },
    { label: 'Registrada', key: 'created_at', render: (r) => new Date(r.created_at).toLocaleDateString('es-ES') },
    { label: 'Acciones', key: 'actions', render: (r) => (
      <div className="d-flex gap-1">
        <button className="btn btn-outline-primary btn-sm" onClick={() => handleEdit(r)} title="Editar">
          <i className="bi bi-pencil"></i>
        </button>
        <button className={`btn btn-outline-${r.is_active ? 'warning' : 'success'} btn-sm`}
          onClick={() => handleToggleActive(r)} title={r.is_active ? 'Desactivar' : 'Activar'}>
          <i className={`bi ${r.is_active ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
        </button>
        <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteOperaria(r)} title="Eliminar">
          <i className="bi bi-trash"></i>
        </button>
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader title="Gestión de Operarias"
        subtitle="Administre las operarias de producción"
        icon="bi-people"
        actions={
          <button className="btn btn-primary" onClick={handleCreate}>
            <i className="bi bi-plus-lg me-1"></i> Nueva Operaria
          </button>
        }
      />

      <div className="card shadow-sm">
        <div className="card-body p-0">
          <DataTable columns={columns} data={operarias} emptyMessage="No hay operarias registradas" />
        </div>
      </div>
    </div>
  );
};
