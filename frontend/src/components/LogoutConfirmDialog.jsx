import ConfirmDialog from './ConfirmDialog';

function LogoutConfirmDialog({ open, pending = false, error = '', onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title="Log out?"
      message={error || 'Are you sure you want to log out?'}
      confirmText={pending ? 'Logging out…' : error ? 'Retry sign out' : 'Log out'}
      confirmDisabled={pending}
      cancelDisabled={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default LogoutConfirmDialog;
