export const DataTable = ({ columns, data, loading, emptyMessage = 'No hay datos disponibles', onRowClick }) => {
  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-5 text-muted">
        <i className="bi bi-inbox fs-1"></i>
        <p className="mt-2">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle">
        <thead className="table-light">
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={col.width ? { width: col.width } : {}}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={row.id || rowIndex}
              style={onRowClick ? { cursor: 'pointer' } : {}}
              onClick={() => onRowClick?.(row)}>
              {columns.map((col, colIndex) => (
                <td key={colIndex}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
