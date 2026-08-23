export const LoadingSpinner = ({ text = 'Cargando...', size = 'md' }) => {
  const sizes = { sm: '1rem', md: '3rem', lg: '5rem' };
  return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status" style={{ width: sizes[size], height: sizes[size] }}>
        <span className="visually-hidden">{text}</span>
      </div>
      <p className="mt-3 text-muted">{text}</p>
    </div>
  );
};

export const LoadingButton = ({ loading, children, ...props }) => (
  <button {...props} disabled={loading || props.disabled}>
    {loading ? (
      <>
        <span className="spinner-border spinner-border-sm me-2" role="status" />
        Procesando...
      </>
    ) : children}
  </button>
);
