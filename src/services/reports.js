import { supabase } from './supabase';
import * as XLSX from 'xlsx';

export const reportsService = {
  async getProduccionPorOperaria(startDate, endDate) {
    let query = supabase
      .from('movements')
      .select(`
        *,
        garments!inner (
          barcode,
          product_name,
          operarias!inner (
            id,
            full_name,
            areas ( name )
          )
        )
      `)
      .in('action', ['Asignación a Operaria', 'Entrega a Almacén', 'Entrega a Despachada']);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getDevolucionesPorMotivo(startDate, endDate) {
    let query = supabase
      .from('movements')
      .select(`
        *,
        return_reasons ( name ),
        garments ( barcode, product_name, operarias ( full_name, areas ( name ) ) )
      `)
      .eq('action', 'Devolución a Centro de Producción');

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getDevolucionesPorArea() {
    const { data, error } = await supabase.rpc('get_returns_by_area');
    if (error) throw error;
    return data;
  },

  async getTendenciaMensual() {
    const { data, error } = await supabase.rpc('get_monthly_trend');
    if (error) throw error;
    return data;
  },

  async getProductividadDiaria(days = 7) {
    const { data, error } = await supabase.rpc('get_daily_productivity', { p_days: days });
    if (error) throw error;
    return data;
  },

  async getImportSummary() {
    const { data, error } = await supabase.rpc('get_import_summary');
    if (error) throw error;
    return data;
  },

  async getGarmentsByLocation() {
    const { data, error } = await supabase.rpc('get_garments_by_current_location');
    if (error) throw error;
    return data;
  },

  async exportToExcel(data, sheetName, fileName) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  },

  exportToPDF(data, columns, title) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permita ventanas emergentes para exportar PDF');
      return;
    }

    const tableRows = data.map(row => {
      return `<tr>${columns.map(col => `<td>${col.render ? col.render(row) : (row[col.key] ?? '')}</td>`).join('')}</tr>`;
    }).join('');

    const html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #1e3a5f; color: white; padding: 10px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            tr:hover { background: #f5f5f5; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <table>
            <thead><tr>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">Generado el ${new Date().toLocaleString('es-ES')} - DIAMANTA</div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }
};
