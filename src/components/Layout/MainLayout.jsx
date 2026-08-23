import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import Swal from 'sweetalert2';

export const MainLayout = () => {
  const { profile, signOut, isAdmin, isSupervisor, isSupervisorPrincipal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(location.pathname);

  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 992) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSignOut = async () => {
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      await signOut();
      navigate('/login');
    }
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'bi-speedometer2', show: true },
    { path: '/asignar', label: 'Asignar', icon: 'bi-person-plus', show: isSupervisor || isAdmin },
    { path: '/control-calidad', label: 'Control Calidad', icon: 'bi-clipboard-check', show: true },
    { path: '/pasar-area', label: 'Pasar a Área', icon: 'bi-arrow-left-right', show: isSupervisor || isAdmin },
    { path: '/recepcion-area', label: 'Recepción', icon: 'bi-inbox-fill', show: isSupervisor || isAdmin },
    { path: '/revision-principal', label: 'Revisión Final', icon: 'bi-star-check', show: isSupervisorPrincipal || isAdmin },
    { path: '/prendas', label: 'Prendas', icon: 'bi-boxes', show: true },
    { path: '/search', label: 'Búsqueda', icon: 'bi-search', show: true },
    { path: '/historial', label: 'Historial', icon: 'bi-clock-history', show: true },
    { path: '/cargas', label: 'Cargas', icon: 'bi-bar-chart-line', show: true },
  ].filter(item => item.show);

  const adminItems = [
    { path: '/import', label: 'Importar Excel', icon: 'bi-file-earmark-excel' },
    { path: '/operarias', label: 'Operarias', icon: 'bi-people' },
    { path: '/admin/users', label: 'Usuarios', icon: 'bi-person-badge' },
    { path: '/admin/areas', label: 'Áreas', icon: 'bi-building' },
    { path: '/admin/locations', label: 'Ubicaciones', icon: 'bi-geo-alt' },
    { path: '/admin/statuses', label: 'Estados de Prenda', icon: 'bi-tags' },
    { path: '/admin/return-reasons', label: 'Motivos Devolución', icon: 'bi-exclamation-triangle' },
    { path: '/reports', label: 'Reportes', icon: 'bi-file-earmark-bar-graph' },
    { path: '/audit', label: 'Auditoría', icon: 'bi-shield-check' },
  ];

  const sidebarWidth = sidebarCollapsed ? 60 : 250;

  return (
    <div className="diamanta-app d-flex">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="diamanta-backdrop d-lg-none" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar bg-dark text-white d-flex flex-column ${sidebarCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        style={{ width: sidebarWidth }}
      >
        <div className={`p-3 border-bottom border-secondary ${sidebarCollapsed ? 'text-center' : ''}`}>
          {sidebarCollapsed ? (
            <h5 className="fw-bold mb-0">D</h5>
          ) : (
            <>
              <h5 className="fw-bold mb-1">
                <i className="bi bi-gem me-2 text-primary"></i>DIAMANTA
              </h5>
              <small className="text-muted text-truncate d-block">{profile?.full_name || profile?.email}</small>
            </>
          )}
        </div>

        <nav className="nav flex-column p-2 flex-grow-1 overflow-auto">
          {navItems.map(item => (
            <Link key={item.path} to={item.path}
              className={`nav-link d-flex align-items-center gap-2 rounded-3 mb-1 ${isActive(item.path) ? 'bg-primary text-white' : 'text-white hover-bg'} ${sidebarCollapsed ? 'justify-content-center px-0' : 'px-3'}`}
              style={{ minHeight: '42px' }}>
              <i className={`bi ${item.icon} fs-5`}></i>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          ))}

          {isAdmin && !sidebarCollapsed && (
            <>
              <hr className="border-secondary my-2" />
              <small className="text-muted px-3 py-1 fw-semibold">
                <i className="bi bi-gear me-1"></i>Administración
              </small>
              {adminItems.map(item => (
                <Link key={item.path} to={item.path}
                  className={`nav-link d-flex align-items-center gap-2 rounded-3 mb-1 ${isActive(item.path) ? 'bg-primary text-white' : 'text-white hover-bg'} px-3`}
                  style={{ minHeight: '38px' }}>
                  <i className={`bi ${item.icon} fs-5`}></i>
                  <span>{item.label}</span>
                </Link>
              ))}
            </>
          )}

          {isAdmin && sidebarCollapsed && adminItems.map(item => (
            <Link key={item.path} to={item.path}
              className={`nav-link d-flex align-items-center justify-content-center rounded-3 mb-1 ${isActive(item.path) ? 'bg-primary text-white' : 'text-white hover-bg'} px-0`}
              style={{ minHeight: '38px' }} title={item.label}>
              <i className={`bi ${item.icon} fs-5`}></i>
            </Link>
          ))}
        </nav>

        <button className="btn btn-outline-light btn-sm m-2 d-none d-lg-flex" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <i className={`bi ${sidebarCollapsed ? 'bi-chevron-right' : 'bi-chevron-left'}`}></i>
        </button>
      </aside>

      {/* Content */}
      <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: '100vh', minWidth: 0 }}>
        <div className="bg-white shadow-sm px-3 px-lg-4 py-3 d-flex justify-content-between align-items-center border-bottom">
          <div className="d-flex align-items-center gap-2 gap-lg-3">
            <button
              className="btn btn-outline-secondary btn-sm d-lg-none"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <i className="bi bi-list fs-5"></i>
            </button>
            <span className="badge bg-primary fs-7 px-2 px-lg-3 py-2">
              <i className={`bi ${profile?.role === 'admin' ? 'bi-shield-check' : profile?.role === 'supervisora_principal' ? 'bi-star-fill' : 'bi-person-check'} me-1`}></i>
              <span className="d-none d-sm-inline">{profile?.role === 'admin' ? 'Administrador' : profile?.role === 'supervisora_principal' ? 'Supervisora Principal' : 'Supervisora'}</span>
              <span className="d-sm-none">{profile?.role === 'admin' ? 'Admin' : profile?.role === 'supervisora_principal' ? 'S.P.' : 'Sup.'}</span>
            </span>
            <small className="text-muted d-none d-xl-inline">
              <i className="bi bi-clock me-1"></i>
              {new Date().toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </small>
          </div>
          <div className="d-flex align-items-center gap-2 gap-lg-3">
            <div className="text-end d-none d-md-block">
              <small className="text-muted d-block">{profile?.full_name}</small>
              <small className="text-muted">{profile?.email}</small>
            </div>
            <button className="btn btn-outline-danger btn-sm rounded-pill px-2 px-lg-3" onClick={handleSignOut}>
              <i className="bi bi-box-arrow-right"></i>
              <span className="d-none d-sm-inline ms-1">Salir</span>
            </button>
          </div>
        </div>

        <div className="flex-grow-1 p-3 p-lg-4 bg-light" style={{ overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};