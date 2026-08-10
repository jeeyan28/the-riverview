import { useAuth } from '../context/AuthContext';

function GuestBanner({ onSave }) {
  const { user } = useAuth();

  if (!user || !user.isGuest) return null;

  return (
    <div className="guest-banner">
      <span>You're browsing as a Guest — logging out will delete this account and its bookings.</span>
      <button type="button" className="guest-banner-save" onClick={onSave}>
        Save my account
      </button>
    </div>
  );
}

export default GuestBanner;