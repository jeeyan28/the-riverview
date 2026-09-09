import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function ModalPortal({ children }) {
  const [host, setHost] = useState(null);

  useLayoutEffect(() => {
    setHost(document.querySelector('[data-modal-portal]') || document.body);
  }, []);

  return host ? createPortal(children, host) : null;
}

export default ModalPortal;
