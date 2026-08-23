export const StatsCard = ({ title, value, icon, color = 'primary', subtitle, onClick }) => (
  <div className={`card border-start border-${color} border-4 shadow-sm h-100 ${onClick ? 'cursor-pointer' : ''}`}
    style={onClick ? { cursor: 'pointer' } : {}}
    onClick={onClick}>
    <div className="card-body d-flex align-items-center justify-content-between">
      <div>
        <h6 className="text-muted mb-1 fw-normal">{title}</h6>
        <h2 className={`mb-0 text-${color} fw-bold`}>{value}</h2>
        {subtitle && <small className="text-muted">{subtitle}</small>}
      </div>
      <div className={`bg-${color} bg-opacity-10 p-3 rounded-3`}>
        <i className={`bi ${icon} fs-2 text-${color}`}></i>
      </div>
    </div>
  </div>
);
