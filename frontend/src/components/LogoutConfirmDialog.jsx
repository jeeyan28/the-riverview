import ConfirmDialog from './ConfirmDialog';

function LogoutConfirmDialog({ open, pending = false, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title="Log out?"
      message="Are you sure you want to log out?"
      confirmText={pending ? 'Logging out…' : 'Log out'}
      confirmDisabled={pending}
      cancelDisabled={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default LogoutConfirmDialog;
