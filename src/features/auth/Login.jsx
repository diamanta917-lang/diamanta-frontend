import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import Swal from 'sweetalert2';

export const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await signIn(email, password);
            Swal.fire({
                icon: 'success',
                title: '¡Bienvenido!',
                text: 'Inicio de sesión exitoso',
                timer: 2000,
                showConfirmButton: false,
                customClass: {
                    popup: 'diamanta-swal-popup'
                }
            });
            navigate('/dashboard');
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error de Acceso',
                text: error.message || 'Credenciales inválidas',
                confirmButtonColor: '#2563eb',
                customClass: {
                    popup: 'diamanta-swal-popup'
                }
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page-container">
            <div className="login-card">
                {/* Panel de Marca Izquierdo */}
                <div className="login-brand-panel">
                    <div className="brand-gem-shape"></div>
                    <div className="brand-gem-shape-small"></div>

                    <div className="brand-logo-text">
                        <i className="bi bi-gem brand-logo-icon"></i>
                        DIAMANTA
                    </div>

                    <div className="brand-content">
                        <h1 className="brand-title">Sistema de Trazabilidad</h1>
                        <p className="brand-subtitle">
                            Plataforma de alta precisión para el control, auditoría y trazabilidad de piezas y procesos de manufactura.
                        </p>
                    </div>

                    <div className="brand-footer">
                        <span>v1.0.0</span>
                        <span>DIAMANTA &copy; {new Date().getFullYear()}</span>
                    </div>
                </div>

                {/* Panel de Formulario Derecho */}
                <div className="login-form-panel">
                    <div className="login-form-header">
                        <h2 className="login-title">Iniciar Sesión</h2>
                        <p className="login-subtitle">Ingresa tus credenciales para acceder al sistema</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group-custom">
                            <label className="form-label-custom">Correo Electrónico</label>
                            <div className="input-wrapper-custom">
                                <input
                                    type="email"
                                    autoComplete="username"
                                    className="form-input-custom"
                                    placeholder="correo@ejemplo.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                                <i className="bi bi-envelope input-icon-custom"></i>
                            </div>
                        </div>

                        <div className="form-group-custom">
                            <label className="form-label-custom">Contraseña</label>
                            <div className="input-wrapper-custom">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    className="form-input-custom has-toggle"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <i className="bi bi-lock input-icon-custom"></i>
                                <button
                                    type="button"
                                    className="password-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                >
                                    <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-submit-custom"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                    <span>Verificando...</span>
                                </>
                            ) : (
                                <>
                                    <span>Ingresar al Sistema</span>
                                    <i className="bi bi-arrow-right"></i>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};