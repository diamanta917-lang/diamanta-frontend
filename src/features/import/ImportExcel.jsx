import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/useAuth';
import { PageHeader } from '../../components/UI/PageHeader';
import { auditService } from '../../services/audit';
import Swal from 'sweetalert2';

export const ImportExcel = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const { user, profile } = useAuth();

  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        const mapped = jsonData.map((row, index) => ({
          barcode: String(row['ID'] || row['id'] || row['Codigo'] || row['codigo'] || '').trim(),
          reference: String(row['Referencia'] || row['referencia'] || '').trim(),
          product_name: String(row['Producto'] || row['producto'] || row['Producto/Nombre'] || row['Nombre'] || '').trim(),
          category: String(row['Categoria del Producto'] || row['categoria'] || row['Categoría'] || row['Categoria'] || '').trim(),
          origin: String(row['Origen'] || row['origen'] || '').trim(),
          product_id: String(row['Producto/ID'] || '').trim(),
          product_reference: String(row['Producto/Referencia'] || '').trim(),
          status: 'Pendiente de revisión',
          current_location: 'Almacén',
          _rowNumber: index + 2,
          _status: 'new',
        }));

        const withRef = mapped.filter(r => r.reference);
        const withoutRef = mapped.length - withRef.length;

        const seenRefs = new Set();
        const dupInFile = new Set();
        withRef.forEach(r => {
          if (seenRefs.has(r.reference)) {
            r._status = 'dup-file';
            dupInFile.add(r.reference);
          } else {
            seenRefs.add(r.reference);
          }
        });

        const uniqueRefs = [...new Set(withRef.filter(r => r._status === 'new').map(r => r.reference))];
        const existingInDb = new Set();
        if (uniqueRefs.length > 0) {
          const { data: existing, error } = await supabase
            .from('garments')
            .select('reference')
            .in('reference', uniqueRefs);
          if (!error && existing) {
            existing.forEach(g => existingInDb.add(g.reference));
          }
        }
        withRef.forEach(r => {
          if (r._status === 'new' && existingInDb.has(r.reference)) {
            r._status = 'dup-db';
          }
        });

        setPreview(withRef);

        const newCount = withRef.filter(r => r._status === 'new').length;
        const dupFileCount = withRef.filter(r => r._status === 'dup-file').length;
        const dupDbCount = withRef.filter(r => r._status === 'dup-db').length;

        Swal.fire({
          icon: 'info',
          title: 'Vista Previa con Validación',
          html: `
            <p>Archivo: <strong>${selectedFile.name}</strong></p>
            <p>Filas totales: <strong>${mapped.length}</strong></p>
            <p class="text-success">Prendas nuevas a importar: <strong>${newCount}</strong></p>
            ${dupFileCount > 0 ? `<p class="text-warning">Duplicados dentro del Excel: <strong>${dupFileCount}</strong> (se omite la 2ª aparición)</p>` : ''}
            ${dupDbCount > 0 ? `<p class="text-danger">Duplicados ya en BD: <strong>${dupDbCount}</strong> (se omiten)</p>` : ''}
            ${withoutRef > 0 ? `<p class="text-warning">Filas sin referencia: ${withoutRef}</p>` : ''}
          `,
          confirmButtonColor: '#2563eb'
        });
      } catch {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo leer el archivo. Verifique el formato.' });
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const handleImport = async () => {
    const toImport = preview.filter(r => r._status === 'new');

    if (toImport.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin prendas nuevas', text: 'Todas las prendas del archivo ya están duplicadas o existen en la base de datos' });
      return;
    }

    const dupFileCount = preview.filter(r => r._status === 'dup-file').length;
    const dupDbCount = preview.filter(r => r._status === 'dup-db').length;

    const result = await Swal.fire({
      title: '¿Importar Prendas?',
      html: `
        <p>Prendas nuevas a importar: <strong>${toImport.length}</strong></p>
        ${dupFileCount > 0 ? `<p class="text-warning">Duplicados en el Excel (omitidos): ${dupFileCount}</p>` : ''}
        ${dupDbCount > 0 ? `<p class="text-danger">Duplicados en BD (omitidos): ${dupDbCount}</p>` : ''}
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, Importar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb'
    });

    if (!result.isConfirmed) return;

    setImporting(true);
    let imported;
    let errors = 0;

    try {
      const importId = `IMP-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${user.id.slice(0, 8)}`;

      const insertData = toImport.map(r => {
        const rest = { ...r };
        delete rest._rowNumber;
        delete rest._status;
        return { ...rest, imported_by: user.id, excel_import_id: importId };
      });

      const { error: bulkError } = await supabase
        .from('garments')
        .insert(insertData);

      if (bulkError) {
        let success = 0;
        let fail = 0;
        for (const row of insertData) {
          const { error: singleError } = await supabase.from('garments').insert(row);
          if (singleError) { fail++; } else { success++; }
        }
        imported = success;
        errors = fail;
      } else {
        imported = toImport.length;
      }

      const resultData = {
        imported,
        duplicates_file: dupFileCount,
        duplicates_db: dupDbCount,
        errors,
        total: preview.length
      };
      setImportResult(resultData);

      await auditService.log({
        userId: user.id,
        userEmail: profile?.email,
        action: 'Importación Excel',
        module: 'Importar',
        details: resultData
      });

      Swal.fire({
        icon: 'success',
        title: 'Importación Completada',
        html: `
          <p>Importadas: <strong>${imported}</strong></p>
          ${dupFileCount > 0 ? `<p class="text-warning">Duplicados en Excel (omitidos): <strong>${dupFileCount}</strong></p>` : ''}
          ${dupDbCount > 0 ? `<p class="text-danger">Duplicados en BD (omitidos): <strong>${dupDbCount}</strong></p>` : ''}
          ${errors > 0 ? `<p class="text-danger">Errores: <strong>${errors}</strong></p>` : ''}
        `,
        confirmButtonColor: '#2563eb'
      });

      setPreview([]);
      setFile(null);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Importar Prendas" subtitle="Cargue prendas desde un archivo Excel" icon="bi-file-earmark-excel" />

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card shadow-sm">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-upload me-2"></i>Seleccionar Archivo
              </h5>

              <div className="border-2 border-dashed rounded-3 p-5 text-center mb-3"
                style={{ borderStyle: 'dashed', borderColor: '#dee2e6' }}>
                <i className="bi bi-file-earmark-excel text-success" style={{ fontSize: '3rem' }}></i>
                <p className="mt-2 mb-1 fw-semibold">Formato Excel (.xlsx, .xls)</p>
                <small className="text-muted">
                  El archivo debe contener columnas: ID, Referencia, Producto, Origen, Categoría del Producto
                </small>
                <div className="mt-3">
                  <input type="file" className="form-control" accept=".xlsx,.xls"
                    onChange={handleFileChange} disabled={importing} />
                </div>
              </div>

              {file && (
                <div className="alert alert-info py-2">
                  <i className="bi bi-file-earmark me-2"></i>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}

              {preview.length > 0 && (
                <button className="btn btn-success w-100 btn-lg" onClick={handleImport} disabled={importing || preview.filter(r => r._status === 'new').length === 0}>
                  {importing ? (
                    <><span className="spinner-border spinner-border-sm me-2" />Importando...</>
                  ) : (
                    <><i className="bi bi-database me-2"></i>Importar {preview.filter(r => r._status === 'new').length} Prenda(s) Nueva(s)</>
                  )}
                </button>
              )}
            </div>
          </div>

          {importResult && (
            <div className="card shadow-sm mt-3">
              <div className="card-body">
                <h6 className="fw-bold mb-3"><i className="bi bi-check-circle text-success me-2"></i>Resultado</h6>
                <div className="d-flex justify-content-around text-center">
                  <div>
                    <h3 className="text-success mb-0">{importResult.imported}</h3>
                    <small className="text-muted">Importadas</small>
                  </div>
                  {importResult.duplicates_file > 0 && (
                    <div>
                      <h3 className="text-warning mb-0">{importResult.duplicates_file}</h3>
                      <small className="text-muted">Dup. Excel</small>
                    </div>
                  )}
                  {importResult.duplicates_db > 0 && (
                    <div>
                      <h3 className="text-danger mb-0">{importResult.duplicates_db}</h3>
                      <small className="text-muted">Dup. BD</small>
                    </div>
                  )}
                  {importResult.errors > 0 && (
                    <div>
                      <h3 className="text-danger mb-0">{importResult.errors}</h3>
                      <small className="text-muted">Errores</small>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-lg-7">
          <div className="card shadow-sm">
            <div className="card-header bg-white">
              <h6 className="mb-0 fw-bold">
                <i className="bi bi-eye me-2"></i>
                Vista Previa {preview.length > 0 && <span className="badge bg-primary ms-2">{preview.filter(r => r._status === 'new').length} nuevas</span>}
                {preview.length > 0 && preview.some(r => r._status !== 'new') && <span className="badge bg-warning ms-1">{preview.filter(r => r._status !== 'new').length} duplicadas</span>}
              </h6>
            </div>
            <div className="card-body p-0">
              {preview.length > 0 ? (
                <div className="table-responsive" style={{ maxHeight: '500px' }}>
                  <table className="table table-hover mb-0">
                    <thead className="table-light sticky-top">
                      <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Referencia</th>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Origen</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 100).map((row, i) => (
                        <tr key={i} className={row._status !== 'new' ? 'table-warning' : ''}>
                          <td>{i + 1}</td>
                          <td><span className="badge bg-secondary">{row.barcode}</span></td>
                          <td>{row.reference || 'N/A'}</td>
                          <td>{row.product_name || 'N/A'}</td>
                          <td>{row.category || 'N/A'}</td>
                          <td>{row.origin || 'N/A'}</td>
                          <td>
                            {row._status === 'new' && <span className="badge bg-success">Nuevo</span>}
                            {row._status === 'dup-file' && <span className="badge bg-warning text-dark">Dup. Excel</span>}
                            {row._status === 'dup-db' && <span className="badge bg-danger">Dup. BD</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 100 && (
                    <div className="text-center text-muted p-3">
                      Mostrando 100 de {preview.length} registros
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-file-earmark fs-1"></i>
                  <p className="mt-2">Seleccione un archivo Excel para ver la vista previa</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
