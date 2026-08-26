export const STATUSES = {
  PENDIENTE: 'Pendiente de revisión',
  ASIGNADA: 'Asignada',
  EN_PROCESO: 'En produccion',
  APROBADA: 'Aprobada',
  APROBADO: 'Aprobado',
  REQUIERE_CORRECCION: 'Requiere corrección',
  RECIBIDO_CALIDAD: 'Recibido por control de calidad',
  PENDIENTE_RECEPCION: 'Pendiente Recepcion',
  TERMINADO: 'Terminado',
  DEVUELTA: 'Devuelta',
};

export const STATUS_NAMES = {
  [STATUSES.PENDIENTE]: 'Pendiente de Revisión',
  [STATUSES.ASIGNADA]: 'Asignada',
  [STATUSES.EN_PROCESO]: 'En Produccion',
  [STATUSES.APROBADA]: 'Aprobada',
  [STATUSES.APROBADO]: 'Aprobado',
  [STATUSES.REQUIERE_CORRECCION]: 'Requiere Corrección',
  [STATUSES.RECIBIDO_CALIDAD]: 'Recibido por Control de Calidad',
  [STATUSES.PENDIENTE_RECEPCION]: 'Pendiente Recepción',
  [STATUSES.TERMINADO]: 'Terminado',
  [STATUSES.DEVUELTA]: 'Devuelta',
};

export const STATUS_COLORS = {
  [STATUSES.PENDIENTE]: 'warning',
  [STATUSES.ASIGNADA]: 'info',
  [STATUSES.EN_PROCESO]: 'primary',
  [STATUSES.APROBADA]: 'success',
  [STATUSES.APROBADO]: 'success',
  [STATUSES.REQUIERE_CORRECCION]: 'danger',
  [STATUSES.RECIBIDO_CALIDAD]: 'info',
  [STATUSES.PENDIENTE_RECEPCION]: 'info',
  [STATUSES.TERMINADO]: 'success',
  [STATUSES.DEVUELTA]: 'danger',
};

export const STATUS_ICONS = {
  [STATUSES.PENDIENTE]: 'bi-clock',
  [STATUSES.ASIGNADA]: 'bi-person-check',
  [STATUSES.EN_PROCESO]: 'bi-gear',
  [STATUSES.APROBADA]: 'bi-check-circle',
  [STATUSES.APROBADO]: 'bi-check-circle',
  [STATUSES.REQUIERE_CORRECCION]: 'bi-arrow-return-left',
  [STATUSES.RECIBIDO_CALIDAD]: 'bi-clipboard-check',
  [STATUSES.PENDIENTE_RECEPCION]: 'bi-inbox',
  [STATUSES.TERMINADO]: 'bi-patch-check',
  [STATUSES.DEVUELTA]: 'bi-x-circle',
};

export const STATUS_OPTIONS = Object.entries(STATUS_NAMES).map(([value, label]) => ({
  value,
  label,
}));

export const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  SUPERVISORA_PRINCIPAL: 'supervisora_principal',
};

export const ROLE_NAMES = {
  [ROLES.ADMIN]: 'Administrador',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.SUPERVISORA_PRINCIPAL]: 'Supervisor Principal',
};