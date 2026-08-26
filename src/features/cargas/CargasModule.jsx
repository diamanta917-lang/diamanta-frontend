import { useState, useEffect, useCallback } from 'react';
import { supervisorsService } from '../../services/supervisors';
import { PageHeader } from '../../components/UI/PageHeader';
import { LoadingSpinner } from '../../components/UI/LoadingSpinner';
import { showToast } from '../../components/UI/ConfirmDialog';
import { reportsService } from '../../services/reports';
import { useAuth } from '../../context/useAuth';

export const CargasModule = () => {
  const [supervisorLoad, setSupervisorLoad] = useState([]);
  const [operariaLoad, setOperariaLoad] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, isSupervisor } = useAuth();

  const loadData = useCallback(async () => {
    try {
      const [supLoad, opLoad] = await Promise.all([
        supervisorsService.getSupervisorLoad(),
        supervisorsService.getOperariaLoad(),
      ]);
      return { supLoad: supLoad || [], opLoad: opLoad || [] };
    } catch (err) {
      console.error(err);
      return { supLoad: [], opLoad: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().then(({ supLoad, opLoad }) => {
      setSupervisorLoad(supLoad);
      setOperariaLoad(opLoad);
    });
  }, [loadData]);

  const handleExportSupervisors = async () => {
    if (supervisorLoad.length === 0) return;
    const exportData = supervisorLoad.map(s => ({
      'Supervisor': s.supervisor_name,
      'Área': s.area_name,
      'Total': s.total,
      'Pendientes': s.pendientes,
      'Asignadas': s.asignadas,
      'En Producción': s.en_produccion,
      'Aprobadas': s.aprobadas,
      'Requiere Corrección': s.requiere_correccion,
    }));
    await reportsService.exportToExcel(exportData, 'Cargas por Supervisor', 'cargas-supervisoras');
    showToast({ icon: 'success', title: 'Excel generado' });
  };

  const handleExportOperarias = async () => {
    if (operariaLoad.length === 0) return;
    const exportData = operariaLoad.map(o => ({
      'Operaria': o.operaria_name,
      'Supervisor': o.supervisor_name,
      'Área': o.area_name,
      'Total': o.total,
      'Pendientes': o.pendientes,
      'Asignadas': o.asignadas,
      'En Producción': o.en_produccion,
      'Aprobadas': o.aprobadas,
      'Requiere Corrección': o.requiere_correccion,
    }));
    await reportsService.exportToExcel(exportData, 'Cargas por Operaria', 'cargas-operarias');
    showToast({ icon: 'success', title: 'Excel generado' });
  };

  if (loading) return <LoadingSpinner text="Cargando cargas de trabajo..." />;

  return (
    <div>
      <PageHeader title="Cargas de Trabajo" subtitle="Prendas asignadas por supervisor y operaria" icon="bi-bar-chart-line" />

      <div className="row g-4">
        {/* Supervisores */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <h6 className="mb-0 fw-bold">
                <i className="bi bi-person-badge me-2 text-primary"></i>
                Prendas por Supervisor
                <span className="badge bg-primary ms-2">{supervisorLoad.length}</span>
              </h6>
              <button className="btn btn-outline-success btn-sm" onClick={handleExportSupervisors}>
                <i className="bi bi-file-earmark-excel me-1"></i>Excel
              </button>
            </div>
            <div className="card-body p-0">
              {supervisorLoad.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-inbox fs-1"></i>
                  <p className="mt-2">No hay supervisores con prendas asignadas</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-sm align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Supervisor</th>
                        <th>Área</th>
                        <th className="text-center">Total</th>
                        <th className="text-center">Pendientes</th>
                        <th className="text-center">Asignadas</th>
                        <th className="text-center">En Producción</th>
                        <th className="text-center">Aprobadas</th>
                        <th className="text-center">Requiere Corr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supervisorLoad.map((s, i) => (
                        <tr key={i} className={isSupervisor && s.supervisor_id === user.id ? 'table-primary' : ''}>
                          <td className="fw-semibold">
                            <i className="bi bi-person me-1"></i>
                            {s.supervisor_name}
                            {isSupervisor && s.supervisor_id === user.id && <span className="badge bg-primary ms-1">Usted</span>}
                          </td>
                          <td><small>{s.area_name}</small></td>
                          <td className="text-center fw-bold">{s.total}</td>
                          <td className="text-center"><span className="badge bg-warning">{s.pendientes}</span></td>
                          <td className="text-center"><span className="badge bg-info">{s.asignadas}</span></td>
                          <td className="text-center"><span className="badge bg-primary">{s.en_produccion}</span></td>
                          <td className="text-center"><span className="badge bg-success">{s.aprobadas}</span></td>
                          <td className="text-center"><span className="badge bg-danger">{s.requiere_correccion}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Operarias */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <h6 className="mb-0 fw-bold">
                <i className="bi bi-people me-2 text-info"></i>
                Prendas por Operaria
                <span className="badge bg-info ms-2">{operariaLoad.length}</span>
              </h6>
              <button className="btn btn-outline-success btn-sm" onClick={handleExportOperarias}>
                <i className="bi bi-file-earmark-excel me-1"></i>Excel
              </button>
            </div>
            <div className="card-body p-0">
              {operariaLoad.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-inbox fs-1"></i>
                  <p className="mt-2">No hay operarias con prendas asignadas</p>
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <table className="table table-hover table-sm align-middle mb-0">
                    <thead className="table-light sticky-top">
                      <tr>
                        <th>Operaria</th>
                        <th>Supervisor</th>
                        <th>Área</th>
                        <th className="text-center">Total</th>
                        <th className="text-center">Pendientes</th>
                        <th className="text-center">Asignadas</th>
                        <th className="text-center">En Producción</th>
                        <th className="text-center">Aprobadas</th>
                        <th className="text-center">Requiere Corr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operariaLoad.map((o, i) => (
                        <tr key={i}>
                          <td className="fw-semibold">
                            <i className="bi bi-person me-1"></i>
                            {o.operaria_name}
                          </td>
                          <td><small>{o.supervisor_name}</small></td>
                          <td><small>{o.area_name}</small></td>
                          <td className="text-center fw-bold">{o.total}</td>
                          <td className="text-center"><span className="badge bg-warning">{o.pendientes}</span></td>
                          <td className="text-center"><span className="badge bg-info">{o.asignadas}</span></td>
                          <td className="text-center"><span className="badge bg-primary">{o.en_produccion}</span></td>
                          <td className="text-center"><span className="badge bg-success">{o.aprobadas}</span></td>
                          <td className="text-center"><span className="badge bg-danger">{o.requiere_correccion}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};