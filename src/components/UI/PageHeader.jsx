export const PageHeader = ({ title, subtitle, icon, actions }) => (
  <div className="diamanta-page-header d-flex justify-content-between align-items-start mb-4 flex-wrap gap-2">
    <div className="me-2">
      <div className="d-flex align-items-center gap-2 mb-1">
        {icon && <i className={`bi ${icon} fs-3 text-primary`}></i>}
        <h3 className="fw-bold mb-0">{title}</h3>
      </div>
      {subtitle && <p className="text-muted mb-0 ms-1">{subtitle}</p>}
    </div>
    {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
  </div>
);
