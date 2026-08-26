import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { auditService } from '../../services/audit';
import { locationsService } from '../../services/locations';
import { useAuth } from '../../context/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/UI/PageHeader';
import { StatusBadge } from '../../components/UI/StatusBadge';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { showToast, showError } from '../../components/UI/ConfirmDialog';
import { useDebounce } from '../../hooks/useDebounce';
import Swal from 'sweetalert2';

const PAGE_SIZE = 25;

const STATUS_TO_LOCATION = {
  'Pendiente de revisión': 'Supervisor',
  'Asignada': 'Operario',
  'En produccion': 'Operario',
  'Aprobado': 'Supervisor',
  'Recibido por control de calidad': 'Control de Calidad',
  'Requiere corrección': 'Operario',
};

const KNOWN_LOCATIONS = ['Almacén', 'Operario', 'Supervisor'];

export const GarmentsList = () => {
  const [garments, setGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const [locationFilter, setLocationFilter] = useState('');
  const [operarias, setOperarias] = useState([]);
  const [customLocations, setCustomLocations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [availableStatuses, setAvailableStatuses] = useState([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const searchDebounced = useDebounce(searchQuery, 300);
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [prevStatus, setPrevStatus] = useState(statusFilter);
  if (statusFilter !== prevStatus) {
    setPrevStatus(statusFilter);
    setPage(0);
    setLoading(true);
  }

  const fetchGarments = useCallback(async () => {
    try {
      if (searchDebounced) {
        const { data, error } = await supabase.rpc('search_garments', { p_search: searchDebounced });
        if (error) return null;
        const mapped = (data || []).map(g => ({
          ...g,
          operarias: g.operaria_name ? { full_name: g.operaria_name, areas: { name: g.area_name || null } } : null,
        }));
        return { garments: mapped, totalCount: mapped.length };
      }

      let query = supabase
        .from('garments')
        .select(`
          *,
          operarias ( id, full_name, areas ( name ) )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter) query = query.eq('status', statusFilter);
      if (locationFilter) query = query.eq('current_location', locationFilter);

      const { data, error, count } = await query;
      if (error) return null;
      return { garments: data || [], totalCount: count ?? 0 };
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [searchDebounced, statusFilter, locationFilter, page]);

  useEffect(() => {
    fetchGarments().then(res => {
      if (res) {
        setGarments(res.garments);
        setTotalCount(res.totalCount);
      }
      setLoading(false);
    });
  }, [fetchGarments]);

  const reload = () => {
    setLoading(true);
    fetchGarments().then(res => {
      if (res) {
        setGarments(res.garments);
        setTotalCount(res.totalCount);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    supabase
      .from('operarias')
      .select('id, full_name, areas ( id, name )')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setOperarias(data || []));

    supabase
      .from('garments')
      .select('current_location')
      .not('current_location', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(g => g.current_location).filter(Boolean))];
          setCustomLocations(unique.filter(l => !KNOWN_LOCATIONS.includes(l)));
        }
      });

    locationsService.getAll(true).then(setLocations).catch(() => {});

    supabase
      .from('garments')
      .select('status')
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(g => g.status).filter(Boolean))].sort();
          setAvailableStatuses(unique);
        }
      });
  }, []);

  const handleEdit = async (garment) => {
    if (garment.status === 'Aprobado' || garment.status === 'Despachada') {
      showToast({ icon: 'warning', title: 'Prenda finalizada', text: 'No se puede editar una prenda aprobada o despachada' });
      return;
    }

    const currentOperaria = operarias.find(o => o.id === garment.operaria_id);
    const currentAreaName = currentOperaria?.areas?.name || 'Sin área';

    const { value: formValues } = await Swal.fire({
      title: 'Editar Prenda',
      html: `
        <div class="text-start">
          <div class="mb-3">
            <label class="form-label fw-bold">Código de Barras</label>
            <input class="form-control" value="${garment.barcode}" readonly disabled>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Estado</label>
            <select id="swal-status" class="form-select">
              ${availableStatuses.map(s => `<option value="${s}" ${garment.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Ubicación Actual</label>
            <input id="swal-location" class="form-control" value="${garment.current_location || ''}" placeholder="Ubicación en el flujo de producción">
            <small class="text-muted">Se actualiza automáticamente al cambiar el estado: Almacén / Operario / Supervisor</small>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Ubicación Física</label>
            <select id="swal-location-id" class="form-select">
              <option value="">Sin ubicación</option>
              ${locations.map(l => `<option value="${l.id}" ${l.id === garment.location_id ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <small class="text-muted">Área de producción donde se encuentra físicamente la prenda</small>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Operaria</label>
            <select id="swal-operaria" class="form-select">
              <option value="">Sin asignar</option>
              ${operarias.map(o => `<option value="${o.id}" ${o.id === garment.operaria_id ? 'selected' : ''}>${o.full_name} — ${o.areas?.name || 'Sin área'}</option>`).join('')}
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label fw-bold">Área de Producción (auto)</label>
            <input id="swal-area" class="form-control" value="${currentAreaName}" readonly>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const operariaSelect = document.getElementById('swal-operaria');
        const areaInput = document.getElementById('swal-area');
        const statusSelect = document.getElementById('swal-status');
        const locationInput = document.getElementById('swal-location');

        operariaSelect.addEventListener('change', () => {
          const selected = operarias.find(o => o.id === operariaSelect.value);
          areaInput.value = selected?.areas?.name || 'Sin área';
        });

        statusSelect.addEventListener('change', () => {
          const autoLoc = STATUS_TO_LOCATION[statusSelect.value];
          if (autoLoc) locationInput.value = autoLoc;
        });
      },
      preConfirm: () => {
        const operariaId = document.getElementById('swal-operaria').value;
        const status = document.getElementById('swal-status').value;
        const currentLocation = document.getElementById('swal-location').value.trim();
        const locationId = document.getElementById('swal-location-id').value;
        if (status === 'Asignada' && !operariaId) {
          Swal.showValidationMessage('Para estado "Asignada" debe seleccionar una operaria');
          return false;
        }
        return { operariaId: operariaId || null, status, currentLocation: currentLocation || null, locationId: locationId || null };
      }
    });

    if (!formValues) return;

    try {
      const autoLocation = STATUS_TO_LOCATION[formValues.status];
      const finalLocation = formValues.currentLocation || autoLocation;
      const updates = {
        operaria_id: formValues.operariaId,
        status: formValues.status,
        current_location: finalLocation,
        location_id: formValues.locationId || null
      };
      const { error } = await supabase.from('garments').update(updates).eq('id', garment.id);
      if (error) throw error;

      const operariaChanged = (garment.operaria_id || null) !== formValues.operariaId;
      const statusChanged = garment.status !== formValues.status;
      const locationChanged = (garment.current_location || null) !== finalLocation;
      const physicalLocationChanged = (garment.location_id || null) !== formValues.locationId;

      if (operariaChanged || statusChanged || locationChanged || physicalLocationChanged) {
        const parts = [];
        if (statusChanged) parts.push(`Estado: ${garment.status} → ${formValues.status}`);
        if (locationChanged) parts.push(`Ubicación: ${garment.current_location || 'N/A'} → ${finalLocation}`);
        if (operariaChanged) {
          const sel = operarias.find(o => o.id === formValues.operariaId);
          parts.push(formValues.operariaId ? `Asignada a ${sel?.full_name}` : 'Operaria removida');
        }
        if (physicalLocationChanged) {
          const oldLoc = locations.find(l => l.id === garment.location_id);
          const newLoc = locations.find(l => l.id === formValues.locationId);
          parts.push(`Ubicación física: ${oldLoc?.name || 'N/A'} → ${newLoc?.name || 'Sin ubicación'}`);
        }

        const movObj = {
          garment_id: garment.id,
          user_id: user.id,
          action: 'Edición manual',
          from_status: garment.status,
          to_status: formValues.status,
          observation: parts.join(' | ')
        };
        if (physicalLocationChanged) {
          movObj.from_location_id = garment.location_id || null;
          movObj.to_location_id = formValues.locationId || null;
        }
        await supabase.from('movements').insert(movObj);
      }

      auditService.log({
        userId: user.id,
        userEmail: profile?.email,
        action: 'Edición manual de prenda',
        module: 'Prendas',
        details: { barcode: garment.barcode, changes: updates, locationIdChanged: physicalLocationChanged }
      });

      showToast({ icon: 'success', title: 'Prenda actualizada' });
      reload();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDelete = async (id, barcode) => {
    const result = await Swal.fire({
      title: '¿Eliminar Prenda?',
      text: `Se eliminará la prenda ${barcode} y todo su historial`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      confirmButtonColor: '#dc3545'
    });

    if (result.isConfirmed) {
      const { data, error } = await supabase.from('garments').delete().eq('id', id).select();
      if (error) {
        console.error('Error al eliminar prenda:', error);
        Swal.fire({ icon: 'error', title: 'Error al eliminar', text: error.message || 'No se pudo eliminar la prenda.' });
        return;
      }
      if (!data || data.length === 0) {
        Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: 'No tiene permisos de administrador para eliminar prendas.' });
        return;
      }
      auditService.log({
        userId: user.id,
        userEmail: profile?.email,
        action: 'Eliminación de prenda',
        module: 'Prendas',
        details: { barcode }
      });
      Swal.fire({ icon: 'success', title: 'Prenda eliminada', timer: 1500, showConfirmButton: false });
      reload();
    }
  };

  const allLocationOptions = [
    ...KNOWN_LOCATIONS,
    ...customLocations
  ];

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Prendas" subtitle={`Listado completo — ${totalCount} prenda(s)`} icon="bi-boxes"
        actions={
          <div className="d-flex gap-2 flex-wrap">
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por código, referencia o producto..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); setLoading(true); }}
              style={{ width: '280px' }}
            />
            <select className="form-select" value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); setPage(0); setLoading(true); }} style={{ width: 'auto' }}>
              <option value="">Todas las ubicaciones</option>
              {allLocationOptions.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select className="form-select" value={statusFilter}
              onChange={(e) => {
                const v = e.target.value;
                setPage(0);
                setLoading(true);
                setSearchParams(v ? { status: v } : {}, { replace: true });
              }} style={{ width: 'auto' }}>
              <option value="">Todos los estados</option>
              {availableStatuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

          </div>
        }
      />

      <div className="card shadow-sm">
        {loading ? <LoadingSpinner /> : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Código</th>
                  <th>Referencia</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th>Operaria</th>
                  <th>Área</th>
                  <th>Devoluciones</th>
                  <th>Ubicación</th>
                  <th>Asignada</th>
                  <th>Finalizada</th>
                  <th>Importada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {garments.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="text-center py-5 text-muted">
                      <i className="bi bi-inbox fs-1"></i>
                      <p className="mt-2">No hay prendas registradas. Importe un archivo Excel para comenzar.</p>
                    </td>
                  </tr>
                ) : garments.map(g => (
                  <tr key={g.id}>
                    <td><span className="badge bg-secondary">{g.barcode}</span></td>
                    <td>{g.reference || 'N/A'}</td>
                    <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                    <td>{g.category || 'N/A'}</td>
                    <td>{g.origin || 'N/A'}</td>
                    <td><StatusBadge status={g.status} /></td>
                    <td>{g.operarias?.full_name || 'Sin asignar'}</td>
                    <td>{g.operarias?.areas?.name || 'N/A'}</td>
                    <td>
                      {g.return_count > 0
                        ? <span className="badge bg-danger">{g.return_count}</span>
                        : <span className="text-muted">0</span>
                      }
                    </td>
                    <td><span className="badge bg-info">{g.current_location || 'N/A'}</span></td>
                    <td><small className="text-muted">{g.assigned_at ? new Date(g.assigned_at).toLocaleDateString('es-ES') : '—'}</small></td>
                    <td><small className="text-muted">{g.finished_at ? new Date(g.finished_at).toLocaleDateString('es-ES') : '—'}</small></td>
                    <td><small className="text-muted">{new Date(g.created_at).toLocaleDateString('es-ES')}</small></td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-outline-primary btn-sm"
                          onClick={() => navigate(`/search/${g.id}`)} title="Ver trazabilidad">
                          <i className="bi bi-eye"></i>
                        </button>
                        <button className="btn btn-outline-secondary btn-sm"
                          onClick={() => handleEdit(g)} title="Editar">
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button className="btn btn-outline-danger btn-sm"
                          onClick={() => handleDelete(g.id, g.barcode)} title="Eliminar">
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && totalCount > PAGE_SIZE && (
          <div className="card-footer bg-white d-flex justify-content-between align-items-center py-2">
            <small className="text-muted">
              Página {page + 1} de {Math.max(totalPages, 1)} ({totalCount} registros)
            </small>
            <div className="d-flex gap-1">
              <button className="btn btn-outline-secondary btn-sm" disabled={page === 0}
                onClick={() => { setPage(p => Math.max(0, p - 1)); setLoading(true); }}>
                <i className="bi bi-chevron-left"></i>
              </button>
              <button className="btn btn-outline-secondary btn-sm" disabled={page >= totalPages - 1}
                onClick={() => { setPage(p => p + 1); setLoading(true); }}>
                <i className="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
