/* ── Password toggles ── */
function makeToggle(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(btnId);
    let vis = false;
    btn.addEventListener('click', () => {
        vis = !vis;
        input.type = vis ? 'text' : 'password';
        btn.textContent = vis ? '🙈' : '👁';
    });
}
makeToggle('password', 'toggle-pw');
makeToggle('confirm',  'toggle-confirm');

/* ── Password strength ── */
const pwInput      = document.getElementById('password');
const strengthBar  = document.getElementById('strength-bar');
const strengthLbl  = document.getElementById('strength-label');

const strengthLevels = [
    { label: '',         color: 'var(--muted)' },
    { label: 'Weak',     color: '#ff6b6b' },
    { label: 'Fair',     color: '#ffb347' },
    { label: 'Good',     color: '#ffd700' },
    { label: 'Strong',   color: 'var(--teal)' },
];

function calcStrength(pw) {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw))   score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(4, Math.ceil(score * 4 / 5));
}

pwInput.addEventListener('input', () => {
    const val = pwInput.value;
    const lvl = val.length === 0 ? 0 : Math.max(1, calcStrength(val));
    strengthBar.className = 'strength-bar-wrap' + (lvl ? ' str-' + lvl : '');
    strengthLbl.textContent = lvl ? strengthLevels[lvl].label : '';
    strengthLbl.style.color = strengthLevels[lvl].color;
});

/* ── Terms checkbox ── */
const termsCheck = document.getElementById('terms-check');
const termsInput = document.getElementById('terms-input');
function toggleTerms() {
    const checked = termsCheck.classList.toggle('checked');
    termsInput.checked = checked;
    termsCheck.setAttribute('aria-checked', checked);
    if (checked) document.getElementById('terms-error').style.display = 'none';
}
termsCheck.addEventListener('click', toggleTerms);
termsCheck.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleTerms(); }
});

/* ── Toast ── */
let toastTimer;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent  = msg;
    document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '⚠️';
    toast.className = 'toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* ── Validation helpers ── */
function setError(fieldId, errorId, show) {
    const field = document.getElementById(fieldId);
    const err   = document.getElementById(errorId);
    if (!field || !err) return;
    if (show) { field.classList.add('has-error');    err.style.display = 'block'; }
    else      { field.classList.remove('has-error'); err.style.display = 'none';  }
}

/* ── Inline clear errors ── */
['firstname','lastname','phone','email','password','confirm'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        setError('field-' + id, id + '-error', false);
    });
});

/* ── Backend base URL — must match the API server's actual host/port,
   NOT the Live Server port this page itself is served from. ── */
const API_BASE_URL = 'http://localhost:3000';

/* ── Form submit ── */
const form = document.getElementById('signup-form');
const btn  = document.getElementById('btn-submit');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstname = document.getElementById('firstname').value.trim();
    const lastname  = document.getElementById('lastname').value.trim();
    const phone     = document.getElementById('phone').value.trim();
    const email     = document.getElementById('email').value.trim();
    const password  = document.getElementById('password').value;
    const confirm   = document.getElementById('confirm').value;
    const terms     = termsInput.checked;

    // Validate
    const emailOk    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneOk    = /^(09|\+639)\d{9}$/.test(phone.replace(/\s/g, ''));
    const passOk     = password.length >= 8;
    const confirmOk  = password === confirm;

    setError('field-firstname', 'firstname-error', !firstname);
    setError('field-lastname',  'lastname-error',  !lastname);
    setError('field-phone',     'phone-error',     !phoneOk);
    setError('field-email',     'email-error',     !emailOk);
    setError('field-password',  'password-error',  !passOk);
    setError('field-confirm',   'confirm-error',   !confirmOk);

    const termsErr = document.getElementById('terms-error');
    if (!terms) termsErr.style.display = 'block';
    else        termsErr.style.display = 'none';

    if (!firstname || !lastname || !phoneOk || !emailOk || !passOk || !confirmOk || !terms) return;

    // Submit
    btn.classList.add('loading');

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstname, lastname, phone, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Account created! Redirecting to login…', 'success');
            setTimeout(() => { window.location.href = 'login.html'; }, 1800);
        } else {
            showToast(data.message || 'Registration failed. Try again.', 'error');
        }
    } catch (err) {
        showToast('Could not reach the server. Is it running?', 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

/* ── Google sign-up (Google Identity Services) ──
   Requires this in register.html's <head>:
     <script src="https://accounts.google.com/gsi/client" async defer></script>
   GOOGLE_CLIENT_ID must match the backend's GOOGLE_CLIENT_ID env var.
   Reuses POST /api/auth/google — the same endpoint login.js uses — which
   already creates a new customer account on the fly for a first-time
   Google sign-in, so "register with Google" and "log in with Google" are
   the same server-side action by design. */
const GOOGLE_CLIENT_ID = '488226777682-bvm3f2kr7oi1nkbmcs96mm0n09gvgvf0.apps.googleusercontent.com';

function redirectAfterAuth(user) {
    const isAdmin = ['staff', 'manager', 'super_admin'].includes(user.role);
    window.location.href = isAdmin ? 'admin.html' : 'index.html';
}

async function handleGoogleCredential(response) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: response.credential })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Google sign-up failed.');

        localStorage.setItem('riverview_user', JSON.stringify(data.user));
        showToast('Welcome! Redirecting…', 'success');
        setTimeout(() => redirectAfterAuth(data.user), 1200);
    } catch (err) {
        showToast(err.message || 'Google sign-up failed.', 'error');
    }
}

function initGoogleSignUp() {
    if (!window.google || !google.accounts?.id) {
        return setTimeout(initGoogleSignUp, 300);
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        use_fedcm_for_prompt: true,
    });

    // Render Google's real button into a hidden host and forward clicks to it,
    // since the One Tap prompt() call can be silently suppressed by the browser.
    const hiddenHost = document.getElementById('google-btn-host') || (() => {
        const div = document.createElement('div');
        div.id = 'google-btn-host';
        div.style.display = 'none';
        document.body.appendChild(div);
        return div;
    })();
    google.accounts.id.renderButton(hiddenHost, { type: 'standard' });
}

document.getElementById('btn-google').addEventListener('click', () => {
    if (!window.google || !google.accounts?.id) {
        showToast('Google sign-in is still loading — try again in a second.', 'error');
        return;
    }
    const realGoogleButton = document.querySelector('#google-btn-host div[role="button"]');
    if (realGoogleButton) {
        realGoogleButton.click();
    } else {
        google.accounts.id.prompt();
    }
});

initGoogleSignUp();