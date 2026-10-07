import { useCallback, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// useConfirm — pairs with <ConfirmDialog/>. Gives call sites the same
// `if (!(await confirm('...'))) return;` shape the original's
// `await UIModal.confirm('...')` had, instead of the synchronous native
// confirm()/window.confirm() Bookings.jsx/Monitor.jsx/Users.jsx were using.
//
// Returns:
//   confirm(message, opts?) -> Promise<boolean>
//     opts: { title, danger, confirmText, cancelText } — same shape as
//     UIModal.confirm()'s second argument.
//   confirmProps -> spread onto <ConfirmDialog {...confirmProps} /> once,
//     anywhere in the component's JSX tree (matches how <Toast/> is already
//     rendered once per page via useToast()).
// ─────────────────────────────────────────────────────────────────────────
export function useConfirm() {
  const [state, setState] = useState({
    open: false,
    title: '',
    message: '',
    danger: false,
    confirmText: '',
    cancelText: '',
  });
  const resolverRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        message,
        title: opts.title || '',
        danger: !!opts.danger,
        confirmText: opts.confirmText || '',
        cancelText: opts.cancelText || '',
      });
    });
  }, []);

  const settle = useCallback((result) => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const confirmProps = {
    ...state,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };

  return { confirm, confirmProps };
}