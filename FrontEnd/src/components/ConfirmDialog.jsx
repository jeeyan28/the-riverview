import { useEffect, useRef } from 'react';
import '../styles/confirm-dialog.css';

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
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    confirmBtnRef.current?.focus();

    function onKey(e) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && !confirmDisabled) onConfirm();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel, confirmDisabled]);

  if (!open) return null;

  const resolvedTitle = title || (danger ? 'Please confirm' : 'Confirm');

  return (
    <div className="uimodal-overlay uimodal-show">
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
            disabled={confirmDisabled}
          >
            {confirmText || (danger ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;