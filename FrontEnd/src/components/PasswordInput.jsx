import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// PasswordInput — replaces the duplicated show/hide-password logic that
// used to be its own little block in login.js, register.js, and
// reset-password.js (each one grabbed an input by id and flipped its
// `type` between "password"/"text" and swapped an emoji on the button).
// Per components/README.md: "PasswordInput.jsx — show/hide toggle,
// replaces duplicated logic in login.js, register.js, reset-password.js".
//
// This renders just the `.input-wrap` (🔒 icon + input + 👁/🙈 toggle
// button) + its `.field-error`, matching the original markup exactly. The
// surrounding `.field` div, `<label>`, and (on the login page only) the
// "Forgot password?" link differ per page, so those stay in each page
// component (Login.jsx / Register.jsx / ResetPassword.jsx, built in
// Phase 8) rather than being baked in here.
//
// `children`, if passed, renders between `.input-wrap` and `.field-error`
// — this is how RegisterForm's password-strength meter/checklist slots in
// without forking the show/hide toggle logic back out into its own copy.
//
// Example (as Login.jsx will use it):
//   <div className="field" id="field-password">
//     <div className="password-row">
//       <label htmlFor="password">Password</label>
//       <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
//     </div>
//     <PasswordInput id="password" name="password" placeholder="Enter your password"
//       autoComplete="current-password" value={password} onChange={...} error={pwError} />
//   </div>
// ─────────────────────────────────────────────────────────────────────────
function PasswordInput({ id, name, placeholder, autoComplete, value, onChange, error, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <div className="input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          id={id}
          name={name}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
        />
        <span className="input-icon">🔒</span>
        <button
          type="button"
          className="toggle-pw"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
      {children}
      <span className="field-error" style={{ display: error ? 'block' : 'none' }}>
        {error}
      </span>
    </>
  );
}

export default PasswordInput;