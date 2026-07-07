// Toast — presentational half of the toast pattern (see useToast.js for
// the state/timer). Same markup/classes as the original <div class="toast"
// id="toast">: a class of "toast show" (plus "error" when type is "error")
// toggles visibility/color via the existing CSS, so no new styles were
// needed here — just reused login.css/register.css rules.
function Toast({ visible, message, type }) {
  return (
    <div
      className={`toast${visible ? ' show' : ''}${type === 'error' ? ' error' : ''}`}
      role="alert"
    >
      <span className="toast-icon">{type === 'success' ? '✅' : '⚠️'}</span>
      <span>{message}</span>
    </div>
  );
}

export default Toast;
