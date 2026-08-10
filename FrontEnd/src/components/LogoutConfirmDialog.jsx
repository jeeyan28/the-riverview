import { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

const GUEST_LOGOUT_DELAY_SECONDS = 5;

function LogoutConfirmDialog({ open, isGuest, onConfirm, onCancel }) {
  const [secondsLeft, setSecondsLeft] = useState(isGuest ? GUEST_LOGOUT_DELAY_SECONDS : 0);

  useEffect(() => {
    if (!open) return;
    if (!isGuest) {
      setSecondsLeft(0);
      return;
    }
    setSecondsLeft(GUEST_LOGOUT_DELAY_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, isGuest]);

  return (
    <ConfirmDialog
      open={open}
      danger={isGuest}
      title={isGuest ? 'Delete this guest account?' : 'Log out?'}
      message={
        isGuest
          ? "You're logging out of a guest account. This will permanently delete the account and its bookings unless you save it first."
          : 'Are you sure you want to log out?'
      }
      confirmText={isGuest && secondsLeft > 0 ? `Log out (${secondsLeft})` : 'Log out'}
      confirmDisabled={isGuest && secondsLeft > 0}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default LogoutConfirmDialog;