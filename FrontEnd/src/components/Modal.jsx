
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
      <div className={`modal-box${sizeClass}`}>
        {title ? <div className="modal-title">{title}</div> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default Modal;