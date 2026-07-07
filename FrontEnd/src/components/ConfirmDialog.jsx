    import { useEffect, useRef } from 'react';
import '../styles/confirm-dialog.css';

// ─────────────────────────────────────────────────────────────────────────
// ConfirmDialog — React port of the legacy js/ui-modal.js's UIModal.confirm().
//
// Built to close the project-wide gap flagged across Bookings.jsx,
// Monitor.jsx, and Users.jsx: those three still used the browser's native
// window.confirm()/confirm(), which the original app never actually showed
// (admin.js always routed through the themed UIModal.confirm() instead).
// This is a styling/consistency fix only — no confirm-site's underlying
// logic (what happens on yes/no) is changed, only how the yes/no question
// itself is presented.
//
// Usage (via the paired useConfirm() hook in hooks/useConfirm.js):
//   const { confirm, confirmProps } = useConfirm();
//   ...
//   if (!(await confirm('Delete this?', { danger: true, confirmText: 'Delete' }))) return;
//   ...
//   return (<> ... <ConfirmDialog {...confirmProps} /> </>);
//
// Behavior preserved 1:1 from UIModal.confirm():
//   - Escape key -> cancel (false)
//   - Enter key -> confirm (true)
//   - Click on the overlay backdrop (outside the box) -> cancel (false)
//   - Confirm button auto-focused when the dialog opens
//   - `danger` option swaps the icon (question -> triangle) and the confirm
//     button's color (teal -> red), same as the original's `opts.danger`
// ─────────────────────────────────────────────────────────────────────────

const ICONS = {
  question: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.9-2.4 3.7"></path>
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"></circle>
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20L12 3z"></path>
      <line x1="12" y1="10" x2="12" y2="15"></line>
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"></circle>
    </svg>
  ),
};

function ConfirmDialog({
  open,
  title,
  message,
  danger = false,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    confirmBtnRef.current?.focus();

    function onKey(e) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  const resolvedTitle = title || (danger ? 'Please confirm' : 'Confirm');

  return (
    <div
      className="uimodal-overlay uimodal-show"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="uimodal-box">
        <div className={`uimodal-icon${danger ? ' uimodal-danger' : ''}`}>
          {danger ? ICONS.danger : ICONS.question}
        </div>
        <div className="uimodal-title">{resolvedTitle}</div>
        <p className="uimodal-message">{message}</p>
        <div className="uimodal-actions">
          <button className="uimodal-btn" onClick={onCancel}>
            {cancelText || 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            className={`uimodal-btn ${danger ? 'uimodal-btn-danger' : 'uimodal-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmText || (danger ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;