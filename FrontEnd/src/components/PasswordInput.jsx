import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

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
        <Lock size={18} className="input-icon" />
        <button
          type="button"
          className="toggle-pw"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
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