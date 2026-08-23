import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { MainLayout } from './components/Layout/MainLayout';
import { Login } from './features/auth/Login';

const AsignarModule = lazy(() => import('./features/asignar/AsignarModule'));
const ControlCalidadModule = lazy(() => import('./features/control_calidad/ControlCalidadModule'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const GlobalSearch = lazy(() => import('./features/search/GlobalSearch').then(m => ({ default: m.GlobalSearch })));
const GarmentDetail = lazy(() => import('./features/search/GarmentDetail').then(m => ({ default: m.GarmentDetail })));
const ImportExcel = lazy(() => import('./features/import/ImportExcel').then(m => ({ default: m.ImportExcel })));
const OperariasManager = lazy(() => import('./features/operarias/OperariasManager').then(m => ({ default: m.OperariasManager })));
const Reports = lazy(() => import('./features/reports/Reports').then(m => ({ default: m.Reports })));
const AuditLog = lazy(() => import('./features/audit/AuditLog').then(m => ({ default: m.AuditLog })));
const GarmentsList = lazy(() => import('./features/garments/GarmentsList').then(m => ({ default: m.GarmentsList })));
const UsersManager = lazy(() => import('./features/admin/UsersManager').then(m => ({ default: m.UsersManager })));
const AreasManager = lazy(() => import('./features/admin/AreasManager').then(m => ({ default: m.AreasManager })));
const ReturnReasonsManager = lazy(() => import('./features/admin/ReturnReasonsManager').then(m => ({ default: m.ReturnReasonsManager })));
const StatusesManager = lazy(() => import('./features/admin/StatusesManager').then(m => ({ default: m.StatusesManager })));
const LocationsManager = lazy(() => import('./features/admin/LocationsManager').then(m => ({ default: m.LocationsManager })));
const PasarAreaModule = lazy(() => import('./features/area_transition/PasarAreaModule').then(m => ({ default: m.PasarAreaModule })));
const RecepcionAreaModule = lazy(() => import('./features/area_transition/RecepcionAreaModule').then(m => ({ default: m.RecepcionAreaModule })));
const RevisionPrincipalModule = lazy(() => import('./features/supervisor_principal/RevisionPrincipalModule').then(m => ({ default: m.RevisionPrincipalModule })));
const CargasModule = lazy(() => import('./features/cargas/CargasModule').then(m => ({ default: m.CargasModule })));
const HistorialModule = lazy(() => import('./features/historial/HistorialModule').then(m => ({ default: m.HistorialModule })));

const PageLoader = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
    <div className="spinner-border text-primary" role="status"></div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />

            <Route path="asignar" element={
              <ProtectedRoute requiredRole={['supervisor', 'admin']}>
                <AsignarModule />
              </ProtectedRoute>
            } />
            <Route path="control-calidad" element={<ControlCalidadModule />} />

            <Route path="pasar-area" element={
              <ProtectedRoute requiredRole={['supervisor', 'admin']}>
                <PasarAreaModule />
              </ProtectedRoute>
            } />
            <Route path="recepcion-area" element={
              <ProtectedRoute requiredRole={['supervisor', 'admin']}>
                <RecepcionAreaModule />
              </ProtectedRoute>
            } />
            <Route path="revision-principal" element={
              <ProtectedRoute requiredRole={['supervisora_principal', 'admin']}>
                <RevisionPrincipalModule />
              </ProtectedRoute>
            } />

            <Route path="cargas" element={<CargasModule />} />
            <Route path="historial" element={<HistorialModule />} />

            <Route path="prendas" element={<GarmentsList />} />
            <Route path="search" element={<GlobalSearch />} />
            <Route path="search/:id" element={<GarmentDetail />} />

            <Route
              path="import"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ImportExcel />
                </ProtectedRoute>
              }
            />
            <Route
              path="operarias"
              element={
                <ProtectedRoute requiredRole="admin">
                  <OperariasManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="audit"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <ProtectedRoute requiredRole="admin">
                  <UsersManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/areas"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AreasManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/return-reasons"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ReturnReasonsManager />
                </ProtectedRoute>
              }
            />
              <Route
                path="admin/statuses"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <StatusesManager />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/locations"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <LocationsManager />
                  </ProtectedRoute>
                }
              />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;