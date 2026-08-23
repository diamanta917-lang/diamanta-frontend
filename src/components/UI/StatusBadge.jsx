import { STATUS_COLORS, STATUS_ICONS, STATUS_NAMES } from '../../constants';

export const StatusBadge = ({ status, size = 'sm' }) => {
  const normalizedStatus = status?.trim();
  const displayName = STATUS_NAMES[normalizedStatus] || normalizedStatus;
  const color = STATUS_COLORS[normalizedStatus] || 'secondary';

  return (
    <span className={`badge bg-${color} fs-${size === 'lg' ? '6' : '7'}`}>
      {STATUS_ICONS[normalizedStatus] && <i className={`bi ${STATUS_ICONS[normalizedStatus]} me-1`}></i>}
      {displayName}
    </span>
  );
};