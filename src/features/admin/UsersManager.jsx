import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { areasService } from '../../services/areas';
import { showConfirm, showToast, showError } from '../../components/UI/ConfirmDialog';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import Swal from 'sweetalert2';
import { auditService } from '../../services/audit';
import { useAuth } from '../../context/useAuth';

export const UsersManager = () => {
  const [users, setUsers] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser, profile } = useAuth();

  const roleLabels = {
    admin: 'Administrador',
    supervisor: 'Supervisora',
    supervisora_principal: 'Supervisora Principal',
  };

  const roleBadges = {
    admin: 'bg-danger',
    supervisora_principal: 'bg-warning text-dark',
    supervisor: 'bg-info',
  };

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, areas(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error(err);
      showError(err?.message || 'No se pudieron cargar los usuarios');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUsers = () => {
    setLoading(true);
    loadUsers().then(setUsers);
  };

  useEffect(() => {
    areasService.getAll(false).then(setAreas).catch(() => {});
    loadUsers().then(setUsers);
  }, [loadUsers]);

  // CREATE
  const handleCreateUser = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Crear Usuario',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Correo Electrónico</label>
          <input id="swal-email" type="email" class="form-control" placeholder="correo@ejemplo.com">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Contraseña</label>
          <input id="swal-password" type="password" class="form-control" placeholder="Mínimo 6 caracteres">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre Completo</label>
          <input id="swal-name" class="form-control" placeholder="Nombre completo">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Rol</label>
          <select id="swal-role" class="form-select">
            <option value="supervisor">Supervisora</option>
            <option value="supervisora_principal">Supervisora Principal</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div class="mb-3" id="swal-area-wrapper">
          <label class="form-label fw-bold">Área (solo para supervisoras)</label>
          <select id="swal-area" class="form-select">
            <option value="">Sin área específica</option>
            ${areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear Usuario',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const roleSelect = document.getElementById('swal-role');
        const areaWrapper = document.getElementById('swal-area-wrapper');
        const toggle = () => {
          areaWrapper.style.display = roleSelect.value === 'supervisor' ? 'block' : 'none';
        };
        roleSelect.addEventListener('change', toggle);
        toggle();
      },
      preConfirm: () => {
        const email = document.getElementById('swal-email').value.trim();
        const password = document.getElementById('swal-password').value;
        const name = document.getElementById('swal-name').value.trim();
        const role = document.getElementById('swal-role').value;
        const areaId = document.getElementById('swal-area').value || null;
        if (!email) { Swal.showValidationMessage('El correo es obligatorio'); return false; }
        if (!password || password.length < 6) { Swal.showValidationMessage('La contraseña debe tener al menos 6 caracteres'); return false; }
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        if (role === 'supervisor' && !areaId) { Swal.showValidationMessage('Debe seleccionar un área para la supervisora'); return false; }
        return { email, password, full_name: name, role, area_id: areaId };
      }
    });

    if (formValues) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: formValues.email,
          password: formValues.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: formValues.full_name,
              role: formValues.role,
              area_id: formValues.area_id || null
            }
          }
        });

        if (error) throw error;

        const newUserId = data?.user?.id || data?.session?.user?.id;
        const identities = data?.identities || [];

        // Si no se creó un usuario nuevo, el correo ya está registrado
        if (!newUserId || identities.length === 0) {
          showError('Ese correo ya está registrado en el sistema');
          return;
        }

        // El trigger handle_new_user (migration_v14) confirma el email automáticamente.
        // La RPC confirm_user_email se mantiene como respaldo.
        let emailConfirmed = true;
        const { error: confirmError } = await supabase.rpc('confirm_user_email', { p_user_id: newUserId });
        if (confirmError) {
          const isMissingFn = String(confirmError.message || '').includes('Could not find the function');
          console.warn('No se pudo confirmar el email del usuario:', confirmError);
          if (isMissingFn) {
            emailConfirmed = false;
            console.warn('La función confirm_user_email no existe. Ejecute la migración database/migration_v14_fix_email_confirm.sql en el SQL Editor de Supabase.');
          }
        }

        // Asegurar que el perfil quede con el rol y área correctos
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: newUserId,
            email: formValues.email,
            full_name: formValues.full_name,
            role: formValues.role,
            area_id: formValues.area_id || null
          });
        if (profileError) throw profileError;

        showToast({ icon: 'success', title: 'Usuario creado correctamente' });

        if (!emailConfirmed) {
          Swal.fire({
            icon: 'warning',
            title: 'Email sin confirmar',
            text: 'El usuario se creó, pero el email podría no quedar confirmado. Ejecute la migración v14 en Supabase (confirma el email automáticamente) o confírmelo manualmente en el panel.',
            confirmButtonColor: '#2563eb'
          });
        }
        auditService.log({
          userId: currentUser.id,
          userEmail: profile?.email,
          action: 'Crear usuario',
          module: 'Usuarios',
          details: { email: formValues.email, full_name: formValues.full_name, role: formValues.role, area_id: formValues.area_id }
        });
        refreshUsers();
      } catch (err) {
        // Mostrar el error real del servidor (el 500 de Supabase trae el detalle aquí)
        const parts = [err?.message, err?.details, err?.hint, err?.code && `Código: ${err?.code}`, err?.status && `Estado: ${err?.status}`].filter(Boolean);
        showError(
          parts.length
            ? parts.join('\n')
            : 'No se pudo crear el usuario. Verifique que el correo no esté registrado.'
        );
        console.error('Error creando usuario:', err);
      }
    }
  };

  // UPDATE — Edit completo
  const handleEditUser = async (user) => {
    const { value: formValues } = await Swal.fire({
      title: 'Editar Usuario',
      html: `
        <div class="mb-3">
          <label class="form-label fw-bold">Nombre Completo</label>
          <input id="swal-name" class="form-control" value="${user.full_name || ''}">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Correo Electrónico</label>
          <input id="swal-email" type="email" class="form-control" value="${user.email || ''}">
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Rol</label>
          <select id="swal-role" class="form-select">
            <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>Supervisora</option>
            <option value="supervisora_principal" ${user.role === 'supervisora_principal' ? 'selected' : ''}>Supervisora Principal</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </div>
        <div class="mb-3" id="swal-area-wrapper">
          <label class="form-label fw-bold">Área (solo para supervisoras)</label>
          <select id="swal-area" class="form-select">
            <option value="">Sin área</option>
            ${areas.map(a => `<option value="${a.id}" ${a.id === user.area_id ? 'selected' : ''}>${a.name}</option>`).join('')}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">Estado</label>
          <select id="swal-active" class="form-select">
            <option value="true" ${user.is_active ? 'selected' : ''}>Activo</option>
            <option value="false" ${!user.is_active ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar Cambios',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const roleSelect = document.getElementById('swal-role');
        const areaWrapper = document.getElementById('swal-area-wrapper');
        const toggle = () => {
          areaWrapper.style.display = roleSelect.value === 'supervisor' ? 'block' : 'none';
        };
        roleSelect.addEventListener('change', toggle);
        toggle();
      },
      preConfirm: () => {
        const name = document.getElementById('swal-name').value.trim();
        const email = document.getElementById('swal-email').value.trim();
        const role = document.getElementById('swal-role').value;
        const areaId = document.getElementById('swal-area').value || null;
        const isActive = document.getElementById('swal-active').value === 'true';
        if (!name) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        if (!email) { Swal.showValidationMessage('El correo es obligatorio'); return false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Swal.showValidationMessage('El correo no es válido'); return false; }
        if (role === 'supervisor' && !areaId) { Swal.showValidationMessage('Debe seleccionar un área para la supervisora'); return false; }
        return { full_name: name, email, role, area_id: role === 'supervisor' ? areaId : null, is_active: isActive };
      }
    });

    if (formValues) {
      try {
        if (formValues.email && formValues.email !== user.email) {
          const { error: emailError } = await supabase.rpc('change_user_email', {
            p_user_id: user.id,
            p_new_email: formValues.email
          });
          if (emailError) {
            if (String(emailError.message || '').includes('Could not find the function')) {
              showError('La función change_user_email no existe en la base de datos. Ejecute el archivo database/migration_v15_edit_email.sql en el SQL Editor de Supabase.');
              return;
            }
            throw emailError;
          }
        }

        const { full_name, email, role, area_id, is_active } = formValues;
        const { error } = await supabase
          .from('profiles')
          .update({ full_name, email, role, area_id, is_active })
          .eq('id', user.id);

        if (error) throw error;
        showToast({ icon: 'success', title: 'Usuario actualizado' });
        auditService.log({
          userId: currentUser.id,
          userEmail: profile?.email,
          action: 'Editar usuario',
          module: 'Usuarios',
          details: { id: user.id, email, full_name, role, area_id, is_active }
        });
        refreshUsers();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  // TOGGLE active (acceso rápido)
  const handleToggleActive = async (user) => {
    const action = user.is_active ? 'desactivar' : 'activar';
    const confirmed = await showConfirm({
      title: `${action === 'desactivar' ? 'Desactivar' : 'Activar'} Usuario`,
      text: `¿Está seguro de ${action} a ${user.full_name || user.email}?`,
      confirmColor: user.is_active ? '#dc3545' : '#198754'
    });

    if (confirmed) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ is_active: !user.is_active })
          .eq('id', user.id);

        if (error) throw error;
        showToast({ icon: 'success', title: `Usuario ${action}do` });
        auditService.log({
          userId: currentUser.id,
          userEmail: profile?.email,
          action: user.is_active ? 'Desactivar usuario' : 'Activar usuario',
          module: 'Usuarios',
          details: { id: user.id, email: user.email, full_name: user.full_name }
        });
        refreshUsers();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  // CHANGE role (acceso rápido)
  const handleChangeRole = async (user) => {
    const { value: newRole } = await Swal.fire({
      title: 'Cambiar Rol',
      text: `Rol actual: ${roleLabels[user.role] || user.role}`,
      input: 'select',
      inputOptions: {
        supervisor: 'Supervisora',
        supervisora_principal: 'Supervisora Principal',
        admin: 'Administrador'
      },
      inputValue: user.role,
      showCancelButton: true,
      confirmButtonText: 'Cambiar',
      confirmButtonColor: '#2563eb'
    });

    if (newRole && newRole !== user.role) {
      let areaId = user.area_id;
      if (newRole === 'supervisor' && !areaId) {
        const { value: areaVal } = await Swal.fire({
          title: 'Seleccionar Área',
          input: 'select',
          inputOptions: Object.fromEntries(areas.map(a => [a.id, a.name])),
          showCancelButton: true,
          confirmButtonText: 'Asignar',
          confirmButtonColor: '#2563eb',
          inputValidator: (v) => !v ? 'Debe seleccionar un área' : undefined
        });
        if (!areaVal) return;
        areaId = areaVal;
      }

      try {
        const updates = { role: newRole };
        if (newRole !== 'supervisor') {
          updates.area_id = null;
        } else {
          updates.area_id = areaId;
        }

        const { error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id);

        if (error) throw error;
        showToast({ icon: 'success', title: 'Rol actualizado' });
        auditService.log({
          userId: currentUser.id,
          userEmail: profile?.email,
          action: 'Cambiar rol',
          module: 'Usuarios',
          details: { id: user.id, email: user.email, from: user.role, to: newRole }
        });
        refreshUsers();
      } catch (err) {
        showError(err.message);
      }
    }
  };

  // RESET PASSWORD
  const handleResetPassword = async (user) => {
    const { value: formValues } = await Swal.fire({
      title: 'Cambiar Contraseña',
      html: `
        <div class="text-start">
          <p class="mb-1"><strong>Usuario:</strong> ${user.full_name || user.email}</p>
          <p class="mb-3"><strong>Correo:</strong> <small>${user.email}</small></p>
          <div class="mb-3">
            <label class="form-label fw-bold">Nueva Contraseña</label>
            <input id="swal-password" type="password" class="form-control" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Confirmar Contraseña</label>
            <input id="swal-password2" type="password" class="form-control" placeholder="Repita la contraseña" autocomplete="new-password">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Cambiar Contraseña',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const input = document.getElementById('swal-password');
        const input2 = document.getElementById('swal-password2');
        const check = () => {
          const password = input.value;
          if (password.length >= 6 && input2.value === password) {
            Swal.clickConfirm();
          }
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input2.focus(); } });
        input2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
      },
      preConfirm: () => {
        const password = document.getElementById('swal-password').value;
        const password2 = document.getElementById('swal-password2').value;
        if (!password || password.length < 6) { Swal.showValidationMessage('La contraseña debe tener al menos 6 caracteres'); return false; }
        if (password !== password2) { Swal.showValidationMessage('Las contraseñas no coinciden'); return false; }
        return { password };
      }
    });

    if (!formValues) return;

    try {
      const { error } = await supabase.rpc('reset_user_password', {
        p_user_id: user.id,
        p_new_password: formValues.password
      });

      if (error) {
        if (String(error.message || '').includes('Could not find the function')) {
          showError('La función reset_user_password no existe en la base de datos. Ejecute el archivo database/migration_v11_user_management.sql en el SQL Editor de Supabase.');
          return;
        }
        throw error;
      }

      showToast({ icon: 'success', title: 'Contraseña actualizada' });
      auditService.log({
        userId: currentUser.id,
        userEmail: profile?.email,
        action: 'Cambiar contraseña',
        module: 'Usuarios',
        details: { id: user.id, email: user.email, full_name: user.full_name }
      });
    } catch (err) {
      showError(err?.message || 'No se pudo cambiar la contraseña');
    }
  };

  // DELETE
  const handleDeleteUser = async (user) => {
    const isSelf = user.id === currentUser.id;

    if (isSelf) {
      showError('No puede eliminar su propia cuenta');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Eliminar Usuario',
      text: `¿Eliminar definitivamente a ${user.full_name || user.email}?\nEsta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmColor: '#dc3545'
    });

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .rpc('delete_user', { p_user_id: user.id });

      if (error) {
        if (error.message?.includes('operarias') || error.message?.includes('garments') || error.code === '23503') {
          showError('No se puede eliminar: el usuario tiene operarias o prendas asociadas. Desactive el usuario en su lugar.');
        } else {
          throw error;
        }
        return;
      }

      showToast({ icon: 'success', title: 'Usuario eliminado' });
      auditService.log({
        userId: currentUser.id,
        userEmail: profile?.email,
        action: 'Eliminar usuario',
        module: 'Usuarios',
        details: { id: user.id, email: user.email, full_name: user.full_name }
      });
      refreshUsers();
    } catch (err) {
      showError(err.message || 'No se pudo eliminar el usuario');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-0"><i className="bi bi-people me-2 text-primary"></i>Usuarios del Sistema</h4>
          <p className="text-muted mb-0">Gestione los usuarios y sus roles de acceso</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateUser}>
          <i className="bi bi-plus-lg me-1"></i> Nuevo Usuario
        </button>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Área</th>
                <th>Estado</th>
                <th>Registrado</th>
                <th style={{ width: '170px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td className="fw-bold">
                    {user.full_name || 'N/A'}
                    {user.id === currentUser.id && <span className="badge bg-primary ms-1">Usted</span>}
                  </td>
                  <td><small>{user.email}</small></td>
                  <td>
                    <span className={`badge ${roleBadges[user.role] || 'bg-secondary'}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td><small>{user.areas?.name || '—'}</small></td>
                  <td>
                    {user.is_active
                      ? <span className="badge bg-success">Activo</span>
                      : <span className="badge bg-danger">Inactivo</span>
                    }
                  </td>
                  <td><small className="text-muted">{new Date(user.created_at).toLocaleDateString('es-ES')}</small></td>
                  <td>
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => handleEditUser(user)} title="Editar">
                        <i className="bi bi-pencil"></i>
                      </button>
                      <button className="btn btn-outline-warning btn-sm" onClick={() => handleResetPassword(user)} title="Cambiar Contraseña">
                        <i className="bi bi-key"></i>
                      </button>
                      <button className="btn btn-outline-info btn-sm" onClick={() => handleChangeRole(user)} title="Cambiar Rol">
                        <i className="bi bi-shield"></i>
                      </button>
                      <button className={`btn btn-outline-${user.is_active ? 'warning' : 'success'} btn-sm`}
                        onClick={() => handleToggleActive(user)} title={user.is_active ? 'Desactivar' : 'Activar'}>
                        <i className={`bi ${user.is_active ? 'bi-x-circle' : 'bi-check-circle'}`}></i>
                      </button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteUser(user)} title="Eliminar">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    <i className="bi bi-inbox fs-1"></i>
                    <p className="mt-2">No hay usuarios registrados</p>
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