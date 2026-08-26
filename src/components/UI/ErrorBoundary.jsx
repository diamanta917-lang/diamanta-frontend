import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error capturado por ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
          <div className="text-center p-4">
            <i className="bi bi-exclamation-triangle text-warning" style={{ fontSize: '3rem' }}></i>
            <h4 className="fw-bold mt-3">Algo salió mal</h4>
            <p className="text-muted mb-4">Ocurrió un error inesperado. Recarga la página para continuar.</p>
            <button className="btn btn-primary px-4" onClick={this.handleReload}>
              <i className="bi bi-arrow-clockwise me-2"></i>Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}