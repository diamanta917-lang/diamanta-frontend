import { useState } from 'react';
import { supabase } from '../../services/supabase';
import { reportsService } from '../../services/reports';
import { supervisorsService } from '../../services/supervisors';
import { PageHeader } from '../../components/UI/PageHeader';
import { showToast, showError } from '../../components/UI/ConfirmDialog';

const getTodayRange = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    startDate: firstDay.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0]
  };
};

export const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState(getTodayRange());
  const [reportType, setReportType] = useState('');
  const [preview, setPreview] = useState(null);

  const fetchReportData = async (type) => {
    setLoading(true);
    setPreview(null);
    setReportType(type);
    try {
      let data, title, columns;

      switch (type) {
        case 'produccion-operaria': {
          data = await reportsService.getProduccionPorOperaria(dateRange.startDate, dateRange.endDate);
          title = 'Producción por Operaria';
          columns = [
            { label: 'Fecha', key: 'created_at', render: (r) => new Date(r.created_at).toLocaleString('es-ES') },
            { label: 'Código', key: 'barcode', render: (r) => r.garments?.barcode || 'N/A' },
            { label: 'Producto', key: 'product', render: (r) => r.garments?.product_name || 'N/A' },
            { label: 'Operaria', key: 'operaria', render: (r) => r.garments?.operarias?.full_name || 'N/A' },
            { label: 'Área', key: 'area', render: (r) => r.garments?.operarias?.areas?.name || 'N/A' },
            { label: 'Acción', key: 'action' },
          ];
          break;
        }
        case 'devoluciones-motivo': {
          data = await reportsService.getDevolucionesPorMotivo(dateRange.startDate, dateRange.endDate);
          title = 'Devoluciones por Motivo';
          columns = [
            { label: 'Fecha', key: 'created_at', render: (r) => new Date(r.created_at).toLocaleString('es-ES') },
            { label: 'Código', key: 'barcode', render: (r) => r.garments?.barcode || 'N/A' },
            { label: 'Producto', key: 'product', render: (r) => r.garments?.product_name || 'N/A' },
            { label: 'Motivo', key: 'motivo', render: (r) => r.return_reasons?.name || 'N/A' },
            { label: 'Observación', key: 'observation' },
            { label: 'Operaria', key: 'operaria', render: (r) => r.garments?.operarias?.full_name || 'N/A' },
          ];
          break;
        }
        case 'devoluciones-area': {
          data = await reportsService.getDevolucionesPorArea();
          title = 'Devoluciones por Área';
          columns = [
            { label: 'Área', key: 'area_name' },
            { label: 'Devoluciones', key: 'return_count' },
          ];
          break;
        }
        case 'tendencia-mensual': {
          data = await reportsService.getTendenciaMensual();
          title = 'Tendencia Mensual (últimos 12 meses)';
          columns = [
            { label: 'Mes', key: 'mes' },
            { label: 'Despachadas', key: 'despachadas' },
            { label: 'Devueltas', key: 'devueltas' },
          ];
          break;
        }
        case 'productividad-diaria': {
          data = await reportsService.getProductividadDiaria(30);
          title = 'Productividad Diaria (últimos 30 días)';
          columns = [
            { label: 'Fecha', key: 'fecha', render: (r) => new Date(r.fecha).toLocaleDateString('es-ES') },
            { label: 'Revisadas', key: 'revisadas' },
            { label: 'Devueltas', key: 'devueltas' },
            { label: 'Aprobadas', key: 'aprobadas' },
          ];
          break;
        }
        case 'prendas-recibidas-calidad': {
          const { data: recibidas } = await supabase
            .from('garments')
            .select('*, operarias(full_name, areas(name))')
            .eq('status', 'Recibido por control de calidad')
            .order('updated_at', { ascending: false });
          data = recibidas;
          title = 'Prendas en Control de Calidad';
          columns = [
            { label: 'Código', key: 'barcode' },
            { label: 'Referencia', key: 'reference' },
            { label: 'Producto', key: 'product_name' },
            { label: 'Categoría', key: 'category' },
            { label: 'Operaria', key: 'operaria', render: (r) => r.operarias?.full_name || 'Sin asignar' },
            { label: 'Área', key: 'area', render: (r) => r.operarias?.areas?.name || 'N/A' },
            { label: 'Recibida', key: 'updated_at', render: (r) => new Date(r.updated_at).toLocaleDateString('es-ES') },
          ];
          break;
        }
        case 'prendas-pendientes': {
          const { data: pendientes } = await supabase
            .from('garments')
            .select('*, operarias(full_name, areas(name))')
            .in('status', ['Pendiente de revisión', 'Pendiente de Revision']);
          data = pendientes;
          title = 'Prendas Pendientes de Revisión';
          columns = [
            { label: 'Código', key: 'barcode' },
            { label: 'Referencia', key: 'reference' },
            { label: 'Producto', key: 'product_name' },
            { label: 'Categoría', key: 'category' },
            { label: 'Operaria', key: 'operaria', render: (r) => r.operarias?.full_name || 'Sin asignar' },
            { label: 'Fecha Ingreso', key: 'created_at', render: (r) => new Date(r.created_at).toLocaleDateString('es-ES') },
          ];
          break;
        }
        case 'productividad': {
          const { data: garments } = await supabase.from('garments').select('*');
          const { data: movements } = await supabase
            .from('movements')
            .select('*')
            .gte('created_at', dateRange.startDate)
            .lte('created_at', dateRange.endDate);

          const aprobadas = garments?.filter(g => g.status === 'Aprobado' || g.status === 'Aprobada').length || 0;
          const enControlCalidad = garments?.filter(g => g.status === 'Recibido por control de calidad').length || 0;
          const requiereCorreccion = garments?.filter(g => g.status === 'Requiere corrección' || g.status === 'Devuelta').length || 0;
          const movs = movements?.length || 0;
          const total = garments?.length || 0;
          const eficiencia = total > 0 ? ((aprobadas / total) * 100).toFixed(1) : 0;

          data = [
            { metric: 'Total Prendas', value: total },
            { metric: 'Aprobadas', value: aprobadas },
            { metric: 'En Control de Calidad', value: enControlCalidad },
            { metric: 'Requieren Corrección', value: requiereCorreccion },
            { metric: 'Movimientos en período', value: movs },
            { metric: 'Eficiencia', value: `${eficiencia}%` },
          ];

          title = 'Productividad General';
          columns = [
            { label: 'Indicador', key: 'metric' },
            { label: 'Valor', key: 'value' },
          ];
          break;
        }
        case 'import-summary': {
          data = await reportsService.getImportSummary();
          title = 'Resumen de Importaciones';
          columns = [
            { label: 'ID Importación', key: 'import_id' },
            { label: 'Total', key: 'total' },
            { label: 'Fecha', key: 'date', render: (r) => new Date(r.date).toLocaleString('es-ES') },
          ];
          break;
        }
        case 'prendas-por-ubicacion': {
          data = await reportsService.getGarmentsByLocation();
          title = 'Prendas por Ubicación (Flujo de Producción)';
          columns = [
            { label: 'Ubicación', key: 'location_name' },
            { label: 'Total', key: 'total' },
          ];
          break;
        }
        case 'prendas-por-supervisora': {
          data = await supervisorsService.getSupervisorLoad();
          title = 'Prendas por Supervisor';
          columns = [
            { label: 'Supervisor', key: 'supervisor_name' },
            { label: 'Área', key: 'area_name' },
            { label: 'Total', key: 'total' },
            { label: 'Pendientes', key: 'pendientes' },
            { label: 'Asignadas', key: 'asignadas' },
            { label: 'En Producción', key: 'en_produccion' },
            { label: 'Aprobadas', key: 'aprobadas' },
            { label: 'Requiere Corr.', key: 'requiere_correccion' },
          ];
          break;
        }
        case 'prendas-por-operaria': {
          data = await supervisorsService.getOperariaLoad();
          title = 'Prendas por Operaria';
          columns = [
            { label: 'Operaria', key: 'operaria_name' },
            { label: 'Supervisor', key: 'supervisor_name' },
            { label: 'Área', key: 'area_name' },
            { label: 'Total', key: 'total' },
            { label: 'Pendientes', key: 'pendientes' },
            { label: 'Asignadas', key: 'asignadas' },
            { label: 'En Producción', key: 'en_produccion' },
            { label: 'Aprobadas', key: 'aprobadas' },
            { label: 'Requiere Corr.', key: 'requiere_correccion' },
          ];
          break;
        }
        default:
          showError('Seleccione un tipo de reporte');
          setLoading(false);
          return;
      }

      if (!data || data.length === 0) {
        showToast({ icon: 'info', title: 'No hay datos para el período seleccionado' });
        setLoading(false);
        return;
      }

      setPreview({ data, title, columns });
    } catch (err) {
      showError('Error al generar reporte: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    if (!preview) return;
    const { data, title, columns } = preview;
    let exportData = data.map(row => {
      const obj = {};
      columns.forEach(col => {
        obj[col.label] = col.render ? col.render(row) : row[col.key];
      });
      return obj;
    });

    const seenRefs = new Set();
    const deduped = exportData.filter(row => {
      const ref = row['Referencia'];
      if (ref !== undefined && ref !== '' && ref !== 'N/A') {
        if (seenRefs.has(ref)) return false;
        seenRefs.add(ref);
      }
      return true;
    });
    const dupRefsRemoved = exportData.length - deduped.length;
    exportData = deduped;

    if (format === 'excel') {
      await reportsService.exportToExcel(exportData, title, `${title}-${dateRange.startDate}`);
      showToast({ icon: 'success', title: `Excel generado${dupRefsRemoved > 0 ? ` (${dupRefsRemoved} dups por referencia omitidos)` : ''}` });
    } else {
      reportsService.exportToPDF(data, columns, title);
    }
  };

  const reportTypes = [
    { id: 'produccion-operaria', label: 'Producción por Operaria', icon: 'bi-person-gear' },
    { id: 'devoluciones-motivo', label: 'Devoluciones por Motivo', icon: 'bi-exclamation-triangle' },
    { id: 'devoluciones-area', label: 'Devoluciones por Área', icon: 'bi-building' },
    { id: 'tendencia-mensual', label: 'Tendencia Mensual', icon: 'bi-graph-up' },
    { id: 'productividad-diaria', label: 'Productividad Diaria', icon: 'bi-calendar-check' },
    { id: 'prendas-pendientes', label: 'Prendas Pendientes', icon: 'bi-clock' },
    { id: 'prendas-recibidas-calidad', label: 'Prendas en Control de Calidad', icon: 'bi-clipboard-check' },
    { id: 'productividad', label: 'Productividad General', icon: 'bi-graph-up-arrow' },
    { id: 'import-summary', label: 'Resumen Importaciones', icon: 'bi-file-earmark-excel' },
    { id: 'prendas-por-ubicacion', label: 'Prendas por Ubicación', icon: 'bi-geo-alt' },
    { id: 'prendas-por-supervisora', label: 'Prendas por Supervisor', icon: 'bi-person-badge' },
    { id: 'prendas-por-operaria', label: 'Prendas por Operaria', icon: 'bi-people' },
  ];

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Genere reportes de producción y calidad" icon="bi-file-earmark-bar-graph" />

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="fw-bold mb-3"><i className="bi bi-funnel me-2"></i>Filtros</h5>
              <div className="mb-3">
                <label className="form-label fw-semibold">Fecha Inicio</label>
                <input type="date" className="form-control"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold">Fecha Fin</label>
                <input type="date" className="form-control"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(p => ({ ...p, endDate: e.target.value }))} />
              </div>
              <hr />
              <h6 className="fw-bold mb-3">Tipo de Reporte</h6>
              <div className="d-grid gap-2">
                {reportTypes.map(rt => (
                  <button key={rt.id}
                    className={`btn text-start ${reportType === rt.id ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => fetchReportData(rt.id)}
                    disabled={loading}>
                    <i className={`bi ${rt.icon} me-2`}></i>
                    {rt.label}
                    {loading && reportType === rt.id && <span className="spinner-border spinner-border-sm ms-2" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card shadow-sm">
            <div className="card-body">
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }} />
                  <p className="text-muted">Generando reporte...</p>
                </div>
              ) : preview ? (
                <div>
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h5 className="fw-bold mb-0">
                      <i className="bi bi-table me-2"></i>{preview.title}
                      <span className="badge bg-primary ms-2">{preview.data.length}</span>
                    </h5>
                    <div className="d-flex gap-2">
                      <button className="btn btn-success btn-sm" onClick={() => handleExport('excel')}>
                        <i className="bi bi-file-earmark-excel me-1"></i>Excel
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleExport('pdf')}>
                        <i className="bi bi-file-earmark-pdf me-1"></i>PDF
                      </button>
                    </div>
                  </div>
                  <div className="table-responsive" style={{ maxHeight: '500px', overflow: 'auto' }}>
                    <table className="table table-hover table-sm align-middle mb-0">
                      <thead className="table-light sticky-top">
                        <tr>
                          {preview.columns.map(col => <th key={col.key}>{col.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.data.map((row, i) => (
                          <tr key={i}>
                            {preview.columns.map(col => (
                              <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-file-earmark-bar-graph" style={{ fontSize: '4rem' }}></i>
                  <h5 className="mt-3">Seleccione un Reporte</h5>
                  <p>Configure los filtros y seleccione el tipo de reporte que desea generar</p>
                  <p className="small">
                    <i className="bi bi-file-earmark-excel me-1 text-success"></i> Exportación a Excel
                    <i className="bi bi-file-earmark-pdf ms-3 me-1 text-danger"></i> Exportación a PDF
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};