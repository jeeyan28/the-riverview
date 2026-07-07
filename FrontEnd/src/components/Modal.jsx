// ─────────────────────────────────────────────────────────────────────────
// Modal — generic wrapper, per components/README.md ("Modal.jsx — generic
// wrapper for booking/room/user/payment-method modals"). Modeled on
// admin.html's repeated `.modal-bg` / `.modal` / `.modal-title` /
// `.modal-actions` pattern (Manual Booking, Edit Booking, Facility, User,
// Role modals all used this exact structure — a `open` class toggled the
// overlay's visibility, and clicking the overlay background closed it).
//
// DECISION (Phase 7): this targets the admin.css `.modal-bg`/`.modal`
// pattern specifically, NOT the public site's booking modal (`.bk-overlay`/
// `.bk-modal` in index.html) or profile modal (`.pf-modal`) — those use
// different, page-specific CSS classes and only appear once each, so
// reusing this generic Modal for them would risk a styling mismatch.
// Those two stay built directly in their own page components in Phase 8,
// using their existing CSS as-is.
//
// Usage (as an Admin/*.jsx page will use it in Phase 8):
//   <Modal open={showBookingModal} onClose={() => setShowBookingModal(false)}
//     title="Manual Booking" actions={<>
//       <button className="btn-cancel" onClick={...}>Cancel</button>
//       <button className="btn-confirm" onClick={...}>Confirm Booking</button>
//     </>}>
//     <div className="mfield">...</div>
//   </Modal>
// ─────────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, size, children, actions }) {
  if (!open) return null;

  const sizeClass = size ? ` modal-${size}` : ''; // size: 'lg' | 'xl' | undefined

  return (
    <div
      className={`modal-bg${open ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal${sizeClass}`}>
        {title ? <div className="modal-title">{title}</div> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default Modal;
