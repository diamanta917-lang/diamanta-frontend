import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/useAuth';
import { operariasService } from '../../services/operarias';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { StatusBadge } from '../../components/UI/StatusBadge';
import Swal from 'sweetalert2';

export default function AsignarModule() {
  const [operaria, setOperaria] = useState(null);
  const [garments, setGarments] = useState([]);
  const [currentGarment, setCurrentGarment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [operarias, setOperarias] = useState([]);
  const [manualCode, setManualCode] = useState('');
  const [activeTableTab, setActiveTableTab] = useState('sin-asignar');
  const [unassignedGarments, setUnassignedGarments] = useState([]);
  const [assignedGarments, setAssignedGarments] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const { user, profile, isSupervisor, isAdmin, areaId } = useAuth();

  const fetchTables = useCallback(async () => {
    try {
      const approvedStatuses = ['Asignada', 'En produccion', 'En proceso', 'Pendiente de revisión', 'Pendiente de Revision', 'Requiere corrección', 'Aprobada', 'Aprobado', 'Recibido por control de calidad', 'Pendiente Recepcion'];

      if (isSupervisor && user?.id) {
        const [{ data: unassigned }, { data: assigned }] = await Promise.all([
          supabase
            .from('garments')
            .select('*, operarias(id, full_name, areas(name))')
            .in('status', ['Pendiente de revisión', 'Pendiente de Revision'])
            .is('operaria_id', null)
            .eq('current_supervisor_id', user.id)
            .eq('current_area_id', areaId)
            .order('created_at', { ascending: false }),
          supabase
            .from('garments')
            .select('*, operarias(id, full_name, areas(name))')
            .in('status', approvedStatuses)
            .eq('current_supervisor_id', user.id)
            .eq('operarias.area_id', areaId)
            .order('created_at', { ascending: false }),
        ]);
        return { unassigned: unassigned || [], assigned: assigned || [] };
      } else {
        const [{ data: unassigned }, { data: assigned }] = await Promise.all([
          supabase
            .from('garments')
            .select('*')
            .in('status', ['Pendiente de revisión', 'Pendiente de Revision'])
            .is('operaria_id', null)
            .order('created_at', { ascending: false }),
          supabase
            .from('garments')
            .select('*, operarias(id, full_name, areas(name))')
            .in('status', approvedStatuses)
            .order('created_at', { ascending: false }),
        ]);
        return { unassigned: unassigned || [], assigned: assigned || [] };
      }
    } catch (err) {
      console.error(err);
      return { unassigned: [], assigned: [] };
    } finally {
      setTableLoading(false);
    }
  }, [user, isSupervisor, areaId]);

  const applyTables = ({ unassigned, assigned }) => {
    setUnassignedGarments(unassigned);
    setAssignedGarments(assigned);
  };

  const refreshTables = () => {
    setTableLoading(true);
    fetchTables().then(applyTables);
  };

  useEffect(() => {
    fetchTables().then(applyTables);
  }, [fetchTables]);

  useEffect(() => {
    const loadOperarias = async () => {
      try {
        if (isSupervisor && user?.id) {
          const data = await operariasService.getBySupervisor(user.id, true);
          setOperarias(data || []);
        } else if (isAdmin) {
          const { data } = await supabase
            .from('operarias')
            .select('*, areas(name), profiles!supervisor_id(full_name)')
            .eq('is_active', true)
            .order('full_name');
          setOperarias(data || []);
        } else {
          setOperarias([]);
        }
      } catch (err) {
        console.error(err);
        setOperarias([]);
      }
    };
    loadOperarias();
  }, [user?.id, isSupervisor, isAdmin]);

  const addGarment = useCallback(() => {
    if (currentGarment) {
      setGarments(prev => [...prev, currentGarment]);
      setCurrentGarment(null);
    }
  }, [currentGarment]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && currentGarment) {
        addGarment();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentGarment, addGarment]);

  const handleScan = useCallback(async (scannedCode) => {
    setScanning(true);
    setLoading(true);
    const { data, error } = await supabase
      .from('garments')
      .select('*, operarias(id, full_name, areas(id, name))')
      .eq('reference', scannedCode)
      .single();

    if (error || !data) {
      Swal.fire({ icon: 'error', title: 'Prenda No Encontrada', text: `El código ${scannedCode} no existe en el sistema`, timer: 2000, showConfirmButton: false });
      setCurrentGarment(null);
    } else {
      const garmentAreaId = data.operarias?.areas?.id || data.current_area_id;
      if (isSupervisor && areaId && garmentAreaId && garmentAreaId !== areaId) {
        Swal.fire({
          icon: 'warning',
          title: 'Prenda de otra área',
          text: `Esta prenda pertenece al área ${data.operarias?.areas?.name || 'otra área'} y usted solo puede asignar prendas de su área`,
          timer: 3000,
          showConfirmButton: false,
        });
        setCurrentGarment(null);
      } else if (garments.some(g => g.id === data.id)) {
        Swal.fire({ icon: 'warning', title: 'Ya agregada', text: 'Esta prenda ya está en la lista', timer: 1500, showConfirmButton: false });
        setCurrentGarment(null);
      } else {
        setCurrentGarment(data);
      }
    }
    setLoading(false);
    setScanning(false);
  }, [garments, isSupervisor, areaId]);

  useBarcodeScanner(handleScan);

  const removeGarment = (id) => {
    setGarments(prev => prev.filter(g => g.id !== id));
  };

  const clearAll = () => {
    setGarments([]);
    setCurrentGarment(null);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    handleScan(code);
    setManualCode('');
  };

  const getOperariaLoad = async (operariaId) => {
    try {
      const { data } = await supabase
        .from('garments')
        .select('status')
        .eq('operaria_id', operariaId)
        .eq('is_finished', false);
      const items = data || [];
      const possessionStatuses = ['Asignada', 'En produccion', 'En proceso', 'Requiere corrección'];
      return {
        enPoder: items.filter(g => possessionStatuses.includes(g.status)).length,
        devueltas: items.filter(g => g.status === 'Requiere corrección').length,
        total: items.length,
      };
    } catch {
      return { enPoder: 0, devueltas: 0, total: 0 };
    }
  };

  const selectOperaria = async () => {
    if (operarias.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin operarias', text: 'No tiene operarias asignadas. Contacte al administrador.' });
      return;
    }

    let selectedId = null;

    const { isConfirmed } = await Swal.fire({
      title: 'Seleccionar Operaria',
      html: `
        <div class="text-start">
          <input id="swal-search-operaria" class="form-control mb-3" placeholder="Escriba el nombre para filtrar..." autofocus>
          <div id="swal-operaria-list" class="list-group" style="max-height: 250px; overflow-y: auto;">
            ${operarias.map(o => `
              <button type="button" class="list-group-item list-group-item-action operaria-item"
                data-id="${o.id}" data-name="${o.full_name.toLowerCase()}" data-area="${(o.areas?.name || 'Sin área').toLowerCase()}">
                <div class="fw-semibold">${o.full_name}</div>
                <small class="text-muted"><i class="bi bi-building me-1"></i>${o.areas?.name || 'Sin área'}</small>
              </button>
            `).join('')}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Seleccionar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      didOpen: () => {
        const searchInput = document.getElementById('swal-search-operaria');
        const items = document.querySelectorAll('.operaria-item');
        let highlightedIndex = -1;

        searchInput.addEventListener('input', () => {
          const term = searchInput.value.toLowerCase();
          highlightedIndex = -1;
          items.forEach(item => {
            const name = item.dataset.name;
            const area = item.dataset.area;
            item.style.display = name.includes(term) || area.includes(term) ? '' : 'none';
            item.classList.remove('active');
          });
        });

        searchInput.addEventListener('keydown', (e) => {
          const visible = [...items].filter(i => i.style.display !== 'none');
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, visible.length - 1);
            visible.forEach((el, i) => el.classList.toggle('active', i === highlightedIndex));
            visible[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            visible.forEach((el, i) => el.classList.toggle('active', i === highlightedIndex));
            visible[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && visible[highlightedIndex]) {
              visible[highlightedIndex].click();
            } else if (visible.length === 1) {
              visible[0].click();
            }
          }
        });

        document.querySelectorAll('.operaria-item').forEach(item => {
          item.addEventListener('click', () => {
            selectedId = item.dataset.id;
            document.querySelectorAll('.operaria-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            Swal.clickConfirm();
          });
        });
      },
      preConfirm: () => {
        if (!selectedId) {
          const visible = [...document.querySelectorAll('.operaria-item')].filter(i => i.style.display !== 'none');
          if (visible.length === 0) return Swal.showValidationMessage('No se encontraron operarias');
          visible[0].click();
          return false;
        }
        return selectedId;
      }
    });

    if (isConfirmed && selectedId) {
      const selected = operarias.find(o => o.id === selectedId);
      const load = await getOperariaLoad(selectedId);

      if (load.enPoder > 0) {
        const { isConfirmed: proceed } = await Swal.fire({
          title: `Carga actual de ${selected.full_name}`,
          html: `
            <div class="text-start">
              <p class="mb-1"><strong>Operaria:</strong> ${selected.full_name}</p>
              <p class="mb-0"><strong>Área:</strong> ${selected.areas?.name || 'Sin área'}</p>
              <hr>
              <div class="d-flex gap-3 justify-content-center text-center">
                <div class="border rounded p-3 flex-fill bg-light">
                  <h3 class="fw-bold mb-0 text-primary">${load.enPoder}</h3>
                  <small class="text-muted">Prendas en su poder</small>
                </div>
                <div class="border rounded p-3 flex-fill bg-light">
                  <h3 class="fw-bold mb-0 text-danger">${load.devueltas}</h3>
                  <small class="text-muted">Prendas devueltas</small>
                </div>
              </div>
              <p class="text-muted mt-3 mb-0">
                <i class="bi bi-info-circle me-1"></i>
                Esta operaria aún tiene prendas en su poder (incluye las devueltas por observación). ¿Desea asignarle más prendas?
              </p>
            </div>
          `,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, asignar más',
          cancelButtonText: 'No, no asignar',
          confirmButtonColor: '#0d6efd',
          cancelButtonColor: '#dc3545',
        });
        if (!proceed) return;
      }

      setOperaria(selected);
    }
  };

  const confirmAssignment = async () => {
    if (!operaria) {
      Swal.fire({ icon: 'warning', title: 'Sin operaria', text: 'Seleccione una operaria primero' });
      return;
    }
    if (garments.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin prendas', text: 'Agregue al menos una prenda a la lista' });
      return;
    }

    const load = await getOperariaLoad(operaria.id);

    const result = await Swal.fire({
      title: 'Confirmar Asignación',
      html: `
        <div class="text-start">
          <p><strong>Operaria:</strong> ${operaria.full_name}</p>
          <p><strong>Área:</strong> ${operaria.areas?.name || 'Sin área'}</p>
          <p><strong>Prendas a asignar:</strong> ${garments.length}</p>
          ${load.enPoder > 0 ? `
            <hr>
            <div class="d-flex gap-3 justify-content-center text-center mb-2">
              <div class="border rounded p-2 flex-fill bg-light">
                <h4 class="fw-bold mb-0 text-primary">${load.enPoder}</h4>
                <small class="text-muted">Prendas en su poder</small>
              </div>
              <div class="border rounded p-2 flex-fill bg-light">
                <h4 class="fw-bold mb-0 text-danger">${load.devueltas}</h4>
                <small class="text-muted">Prendas devueltas</small>
              </div>
            </div>
            <p class="text-muted small mb-0"><i class="bi bi-info-circle me-1"></i>Al confirmar tendrá ${load.enPoder + garments.length} prendas en total.</p>
          ` : ''}
          <hr>
           <p class="text-muted mb-0">Las prendas pasarán a estado <strong>"Asignada"</strong></p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Asignar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#198754'
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const supervisorId = isSupervisor ? user.id : operaria.supervisor_id || user.id;
      const supervisorAreaId = isSupervisor ? areaId : operaria.area_id || profile?.area_id;

      const { error } = await supabase
        .from('garments')
        .update({
          operaria_id: operaria.id,
          status: 'Asignada',
          current_location: 'Operario',
          assigned_at: now,
          updated_at: now,
          current_supervisor_id: supervisorId,
          current_area_id: supervisorAreaId,
          first_area_id: supervisorAreaId
        })
        .in('id', garments.map(g => g.id));

      if (error) throw error;

      const movements = garments.map(g => ({
        garment_id: g.id,
        user_id: user.id,
        action: 'Asignación a Operaria',
        from_status: g.status,
        to_status: 'Asignada',
        observation: `Asignada a ${operaria.full_name} — ${operaria.areas?.name || ''}`
      }));
      const { error: movError } = await supabase.from('movements').insert(movements);
      if (movError) throw movError;

      await Swal.fire({
        icon: 'success',
        title: 'Asignación Completada',
        html: `<p><strong>${garments.length}</strong> prendas asignadas a <strong>${operaria.full_name}</strong></p>`,
        timer: 2500,
        showConfirmButton: false
      });

      setGarments([]);
      setCurrentGarment(null);
      setOperaria(null);
      refreshTables();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
    setLoading(false);
  };

  const grouped = assignedGarments.reduce((acc, g) => {
    const area = g.operarias?.areas?.name || 'Sin área';
    const operariaName = g.operarias?.full_name || 'Sin operaria';
    if (!acc[area]) acc[area] = {};
    if (!acc[area][operariaName]) acc[area][operariaName] = [];
    acc[area][operariaName].push(g);
    return acc;
  }, {});

  return (
    <div>
      <div className="row mb-4">
        <div className="col-12">
          <div className="alert alert-primary d-flex align-items-center" role="alert">
            <i className="bi bi-person-plus fs-3 me-3"></i>
            <div>
              <h5 className="alert-heading mb-0">Módulo de Asignación</h5>
              <small>Seleccione una operaria, escanee códigos de barras y agregue prendas para asignar</small>
            </div>
          </div>
        </div>
      </div>

      {/* Tables Section */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white p-0">
          <ul className="nav nav-tabs card-header-tabs">
            <li className="nav-item">
              <button
                className={`nav-link ${activeTableTab === 'sin-asignar' ? 'active' : ''}`}
                onClick={() => setActiveTableTab('sin-asignar')}
              >
                <i className="bi bi-inbox me-1"></i>
                Sin Asignar
                <span className="badge bg-warning ms-2">{unassignedGarments.length}</span>
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTableTab === 'asignadas' ? 'active' : ''}`}
                onClick={() => setActiveTableTab('asignadas')}
              >
                <i className="bi bi-person-check me-1"></i>
                Asignadas
                <span className="badge bg-info ms-2">{assignedGarments.length}</span>
              </button>
            </li>
            <li className="nav-item ms-auto d-flex align-items-center px-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={fetchTables} disabled={tableLoading}>
                <i className={`bi bi-arrow-clockwise ${tableLoading ? '' : ''}`}></i>
                {tableLoading ? (
                  <span className="spinner-border spinner-border-sm ms-1" style={{ width: '0.8rem', height: '0.8rem' }} />
                ) : (
                  <span>Actualizar</span>
                )}
              </button>
            </li>
          </ul>
        </div>
        <div className="card-body p-0">
          {activeTableTab === 'sin-asignar' && (
            <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>Código</th>
                    <th>Referencia</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Estado</th>
                    <th>Importada</th>
                    <th>Registrado</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedGarments.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="text-center py-4 text-muted">
                        <i className="bi bi-check-circle fs-4"></i>
                        <p className="mt-1 mb-0">No hay prendas sin asignar</p>
                      </td>
                    </tr>
                  ) : (
                    unassignedGarments.map(g => (
                      <tr key={g.id}>
                        <td><span className="badge bg-secondary">{g.barcode}</span></td>
                        <td>{g.reference || 'N/A'}</td>
                        <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                        <td>{g.category || 'N/A'}</td>
                        <td><StatusBadge status={g.status} /></td>
                        <td><small className="text-muted">{new Date(g.created_at).toLocaleDateString('es-ES')}</small></td>
                        <td><small className="text-muted">{new Date(g.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTableTab === 'asignadas' && (
            <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
              {Object.keys(grouped).length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-person-dash fs-1"></i>
                  <p className="mt-2">No hay prendas asignadas actualmente</p>
                </div>
              ) : (
                Object.entries(grouped).map(([area, operariasMap]) => (
                  <div key={area} className="mb-0">
                    <div className="bg-light px-3 py-2 border-bottom fw-bold small text-uppercase text-muted">
                      <i className="bi bi-building me-2"></i>{area}
                    </div>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{ width: '200px' }}>Operaria</th>
                            <th>Código</th>
                            <th>Referencia</th>
                            <th>Producto</th>
                            <th>Estado</th>
                            <th>Asignada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(operariasMap).map(([operariaName, prendas]) => (
                            prendas.map((g, i) => (
                              <tr key={g.id}>
                                {i === 0 && (
                                  <td
                                    rowSpan={prendas.length}
                                    className="fw-semibold align-middle bg-white"
                                    style={{ borderRight: '2px solid #dee2e6' }}
                                  >
                                    <i className="bi bi-person me-1 text-primary"></i>
                                    {operariaName}
                                    <span className="badge bg-secondary ms-2">{prendas.length}</span>
                                  </td>
                                )}
                                <td><span className="badge bg-secondary">{g.barcode}</span></td>
                                <td>{g.reference || 'N/A'}</td>
                                <td className="fw-semibold">{g.product_name || 'N/A'}</td>
                                <td><StatusBadge status={g.status} /></td>
                                <td><small className="text-muted">{g.assigned_at ? new Date(g.assigned_at).toLocaleDateString('es-ES') : 'N/A'}</small></td>
                              </tr>
                            ))
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Operaria Selection */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-8">
              <h6 className="fw-bold mb-2">
                <i className="bi bi-person-badge me-2"></i>Operaria Asignada
              </h6>
              {operaria ? (
                <div className="d-flex align-items-center">
                  <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center text-white me-3" style={{ width: '50px', height: '50px' }}>
                    <i className="bi bi-person fs-4"></i>
                  </div>
                  <div>
                    <h5 className="mb-0 fw-bold">{operaria.full_name}</h5>
                    <small className="text-muted">
                      <i className="bi bi-building me-1"></i>{operaria.areas?.name || 'Sin área'}
                    </small>
                  </div>
                  <button className="btn btn-outline-secondary btn-sm ms-3" onClick={selectOperaria}>
                    <i className="bi bi-arrow-repeat me-1"></i>Cambiar
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary btn-lg" onClick={selectOperaria}>
                  <i className="bi bi-person-plus me-2"></i>Seleccionar Operaria
                </button>
              )}
            </div>
            <div className="col-md-4 text-md-end mt-3 mt-md-0">
              {operaria && (
                <span className="badge bg-primary fs-6 px-3 py-2">
                  <i className="bi bi-boxes me-1"></i>{garments.length} prenda(s)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {operaria && (
        <>
          {/* Scan Area */}
          <div className="row mb-4">
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white">
                  <h6 className="mb-0 fw-bold">
                    <i className="bi bi-upc-scan me-2"></i>Escanear Prenda
                  </h6>
                </div>
                <div className="card-body text-center py-4">
                  {scanning && (
                    <div className="mb-3">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Escaneando...</span>
                      </div>
                      <p className="mt-2 text-muted">Escaneando...</p>
                    </div>
                  )}

                  {!scanning && !currentGarment && (
                    <div>
                      <i className="bi bi-upc-scan text-muted" style={{ fontSize: '4rem' }}></i>
                      <h5 className="mt-3 text-muted">Esperando referencias</h5>
                      <p className="text-muted">Acerque el código de barra al lector USB</p>
                      <hr />
                      <form onSubmit={handleManualSubmit} className="d-flex gap-2 mt-3">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="O escriba la referencia manualmente..."
                          value={manualCode}
                          onChange={(e) => setManualCode(e.target.value)}
                          disabled={loading}
                        />
                        <button type="submit" className="btn btn-outline-primary" disabled={loading || !manualCode.trim()}>
                          <i className="bi bi-search"></i>
                        </button>
                      </form>
                    </div>
                  )}

                  {currentGarment && !scanning && (
                    <div className="text-start">
                      <div className="alert alert-success">
                        <h6 className="fw-bold mb-2">
                          <i className="bi bi-check-circle me-1"></i>Prenda Detectada
                        </h6>
                        <p className="mb-1"><strong>Código:</strong> <span className="badge bg-secondary">{currentGarment.barcode}</span></p>
                        <p className="mb-1"><strong>Producto:</strong> {currentGarment.product_name || 'N/A'}</p>
                        <p className="mb-1"><strong>Referencia:</strong> {currentGarment.reference || 'N/A'}</p>
                        <p className="mb-1"><strong>Estado:</strong> <span className="badge bg-warning">{currentGarment.status}</span></p>
                        <p className="mb-0"><strong>Ubicación:</strong> {currentGarment.current_location || 'N/A'}</p>
                      </div>
                      <button className="btn btn-success btn-lg w-100" onClick={addGarment}>
                        <i className="bi bi-plus-circle me-2"></i>Agregar (Enter)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Garments List */}
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-white d-flex justify-content-between align-items-center">
                  <h6 className="mb-0 fw-bold">
                    <i className="bi bi-list-check me-2"></i>Prendas a Asignar
                    {garments.length > 0 && <span className="badge bg-primary ms-2">{garments.length}</span>}
                  </h6>
                  {garments.length > 0 && (
                    <button className="btn btn-outline-danger btn-sm" onClick={clearAll}>
                      <i className="bi bi-trash me-1"></i>Limpiar
                    </button>
                  )}
                </div>
                <div className="card-body p-0" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {garments.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="bi bi-inbox fs-1"></i>
                      <p className="mt-2">No hay prendas agregadas</p>
                      <small>Escanee códigos de barras para agregar prendas</small>
                    </div>
                  ) : (
                    <div className="list-group list-group-flush">
                      {garments.map((g, i) => (
                        <div key={g.id} className="list-group-item d-flex justify-content-between align-items-center py-3">
                          <div>
                            <span className="badge bg-secondary me-2">{i + 1}</span>
                            <strong>{g.barcode}</strong>
                            <small className="text-muted d-block">
                              {g.product_name || 'N/A'} — {g.reference || 'N/A'}
                            </small>
                            <small className="text-muted">
                              <i className="bi bi-person me-1"></i>
                              {operaria.full_name}
                            </small>
                          </div>
                          <button className="btn btn-outline-danger btn-sm" onClick={() => removeGarment(g.id)}>
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Confirm Button */}
          {garments.length > 0 && (
            <div className="text-center mb-4">
              <button className="btn btn-success btn-lg px-5 shadow" onClick={confirmAssignment} disabled={loading}>
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-2" />Asignando...</>
                ) : (
                  <><i className="bi bi-check2-circle me-2"></i>Confirmar Asignación — {garments.length} Prenda(s)</>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
