import { useEffect } from 'react';

function Modal({ open, onClose, title, size, children, actions }) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size ? ` modal-${size}` : '';

  return (
    <div className={`modal-bg${open ? ' open' : ''}`}>
      <div className={`modal-box${sizeClass}`}>
        {title ? <div className="modal-title">{title}</div> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default Modal;