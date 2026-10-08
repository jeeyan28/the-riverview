import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import ModalPortal from './ModalPortal';
import { useDialogFocus } from '../hooks/useDialogFocus';

function Modal({ open, onClose, title, ariaLabel = 'Dialog', size, className = '', backdropClassName = '', children, actions }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useDialogFocus(open, dialogRef, onClose);

  if (!open) return null;

  const sizeClass = size ? ` modal-${size}` : '';

  return (
    <ModalPortal>
      <div className={`modal-bg${open ? ' open' : ''}${backdropClassName ? ` ${backdropClassName}` : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
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
