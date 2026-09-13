import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import ModalPortal from './ModalPortal';

function Modal({ open, onClose, title, ariaLabel = 'Dialog', size, className = '', children, actions }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const firstField = dialogRef.current?.querySelector(
        '[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      const first = firstField || dialogRef.current?.querySelector('button:not([disabled]), [tabindex="0"]');
      (first || dialogRef.current)?.focus({ preventScroll: true });
    });
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = size ? ` modal-${size}` : '';

  return (
    <ModalPortal>
      <div className={`modal-bg${open ? ' open' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
        <div className={`modal-box${sizeClass}${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : ariaLabel} ref={dialogRef} tabIndex={-1}>
          {title ? (
            <div className="modal-heading">
              <h2 className="modal-title" id={titleId}>{title}</h2>
              <button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
            </div>
          ) : null}
          {children}
          {actions ? <div className="modal-actions">{actions}</div> : null}
        </div>
      </div>
    </ModalPortal>
  );
}

export default Modal;
