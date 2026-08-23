import Swal from 'sweetalert2';

export const showConfirm = async ({ title, text, icon = 'question', confirmText = 'Confirmar', cancelText = 'Cancelar', confirmColor = '#2563eb' }) => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: confirmColor,
    customClass: { popup: 'diamanta-swal-popup' }
  });

  return result.isConfirmed;
};

export const showToast = ({ icon = 'success', title, timer = 2000 }) => {
  Swal.fire({
    icon,
    title,
    timer,
    showConfirmButton: false,
    toast: true,
    position: 'top-end',
    customClass: { popup: 'diamanta-swal-popup' }
  });
};

export const showError = (message) => {
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: message,
    confirmButtonColor: '#2563eb',
    customClass: { popup: 'diamanta-swal-popup' }
  });
};
