import { useEffect } from 'react';

function Modal({ open, onClose, title, size, children, actions }) {
  // Without this, the page behind the fixed overlay stays scrollable —
  // scrolling inside a tall modal (e.g. Room Management's two-pane form)
  // can end up scrolling the body instead, showing a second scrollbar.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size ? ` modal-${size}` : ''; // size: 'lg' | 'xl' | undefined

  return (
    <div
      className={`modal-bg${open ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal-box${sizeClass}`}>
        {title ? <div className="modal-title">{title}</div> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default Modal;