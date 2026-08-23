import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

export const ProtectedRoute = ({ children, requiredRole }) => {
    const { user, profile, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-vh-100 d-flex align-items-center justify-content-center">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Cargando...</span>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        if (!profile || !roles.includes(profile.role)) {
            return <Navigate to="/dashboard" replace />;
        }
    }

    return children;
};