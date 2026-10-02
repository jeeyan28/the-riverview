import ConfirmDialog from './ConfirmDialog';

function LogoutConfirmDialog({ open, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title="Log out?"
      message="Are you sure you want to log out?"
      confirmText="Log out"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default LogoutConfirmDialog;
