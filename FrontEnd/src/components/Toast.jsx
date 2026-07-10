import { createPortal } from 'react-dom';

function Toast({ visible, message, type }) {
  return createPortal(
    <div
      className={`toast${visible ? ' show' : ''}${type === 'error' ? ' error' : ''}`}
      role="alert"
    >
      <span className="toast-icon">{type === 'success' ? '✅' : '⚠️'}</span>
      <span>{message}</span>
    </div>,
    document.body
  );
}

export default Toast;