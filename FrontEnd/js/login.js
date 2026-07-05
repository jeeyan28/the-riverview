/* ── Password toggle ── */
const pwInput   = document.getElementById('password');
const toggleBtn = document.getElementById('toggle-pw');
let pwVisible = false;
toggleBtn.addEventListener('click', () => {
    pwVisible = !pwVisible;
    pwInput.type = pwVisible ? 'text' : 'password';
    toggleBtn.textContent = pwVisible ? '🙈' : '👁';
});

/* ── Remember me checkbox ── */
const checkBox   = document.getElementById('custom-check');
const checkInput = document.getElementById('remember-input');
function toggleCheck() {
    const checked = checkBox.classList.toggle('checked');
    checkInput.checked = checked;
    checkBox.setAttribute('aria-checked', checked);
}
checkBox.addEventListener('click', toggleCheck);
checkBox.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCheck(); }
});

/* ── Toast ── */
let toastTimer;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent  = msg;
    document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '⚠️';
    toast.className = 'toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3200);
}

/* ── Validation ── */
function setError(fieldId, errorId, show) {
    const field = document.getElementById(fieldId);
    const err   = document.getElementById(errorId);
    if (show) { field.classList.add('has-error');    err.style.display = 'block'; }
    else      { field.classList.remove('has-error'); err.style.display = 'none';  }
}

document.getElementById('email').addEventListener('input', () => {
    setError('field-email', 'email-error', false);
});
document.getElementById('password').addEventListener('input', () => {
    setError('field-password', 'password-error', false);
});

/* ── Backend base URL — the API server (Express/Node), NOT the Live Server
   port this page itself is served from. Change this if your backend runs
   somewhere else. ── */
const API_BASE_URL = 'http://localhost:3000';

/* ── Where to send a signed-in admin vs a regular customer ── */
function redirectAfterLogin(user) {
    const isAdmin = ['staff', 'manager', 'super_admin'].includes(user.role);
    window.location.href = isAdmin ? 'admin.html' : 'index.html';
}

/* ── Form submit ── */
const form = document.getElementById('login-form');
const btn  = document.getElementById('btn-submit');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const remember = checkInput.checked;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const passOk  = password.length >= 8;

    setError('field-email',    'email-error',    !emailOk);
    setError('field-password', 'password-error', !passOk);
    if (!emailOk || !passOk) return;

    btn.classList.add('loading');

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method:  'POST',
            credentials: 'include', // required so the server's session cookie gets set/sent
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // NOTE: this stored copy is for display convenience only (name, avatar
            // initial, etc). The server's session cookie — not this — is what
            // actually protects admin routes, so tampering with this object
            // client-side doesn't grant any real access.
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem('riverview_user', JSON.stringify(data.user));

            const isAdmin = ['staff', 'manager', 'super_admin'].includes(data.user.role);
            showToast(isAdmin ? 'Welcome, Admin! Redirecting…' : `Welcome back, ${data.user.firstname}!`, 'success');
            setTimeout(() => redirectAfterLogin(data.user), 1200);
        } else if (response.status === 423) {
            showToast(data.message, 'error'); // account locked
        } else {
            showToast(data.message || 'Login failed.', 'error');
        }
    } catch (err) {
        showToast('Could not reach the server. Is it running?', 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

/* ── Forgot password ── */
document.querySelector('.forgot-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = prompt('Enter your account email and we\'ll send you a reset link:');
    if (!email) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() })
        });
        const data = await res.json().catch(() => ({}));
        showToast(data.message || 'If that email exists, a reset link has been sent.', 'success');
    } catch (err) {
        showToast('Could not reach the server. Is it running?', 'error');
    }
});

/* ── Google sign-in (Google Identity Services) ──
   Requires this in login.html's <head>:
     <script src="https://accounts.google.com/gsi/client" async defer></script>
   and GOOGLE_CLIENT_ID set below to match your backend's GOOGLE_CLIENT_ID. */
const GOOGLE_CLIENT_ID = '488226777682-bvm3f2kr7oi1nkbmcs96mm0n09gvgvf0.apps.googleusercontent.com';

function initGoogleSignIn() {
    if (!window.google || !google.accounts?.id) {
        // GSI script hasn't loaded yet — try again shortly.
        return setTimeout(initGoogleSignIn, 300);
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        // Needed for browsers (Safari, Chrome w/ 3rd-party-cookie blocking, etc.)
        // that reject Google's default FedCM/One-Tap flow silently.
        use_fedcm_for_prompt: true,
    });

    // google.accounts.id.prompt() (One Tap) is frequently suppressed by the
    // browser with no error and no callback — that's why the button looked
    // "broken." Render Google's own button as the reliable, guaranteed-visible
    // fallback into a hidden container, then forward a click on our styled
    // button to it.
    const hiddenHost = document.getElementById('google-btn-host') || (() => {
        const div = document.createElement('div');
        div.id = 'google-btn-host';
        div.style.display = 'none';
        document.body.appendChild(div);
        return div;
    })();
    google.accounts.id.renderButton(hiddenHost, { type: 'standard' });
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
        if (!res.ok) throw new Error(data.message || 'Google sign-in failed.');

        localStorage.setItem('riverview_user', JSON.stringify(data.user));
        showToast('Welcome! Redirecting…', 'success');
        setTimeout(() => redirectAfterLogin(data.user), 1200);
    } catch (err) {
        showToast(err.message || 'Google sign-in failed.', 'error');
    }
}

document.getElementById('btn-google').addEventListener('click', () => {
    if (!window.google || !google.accounts?.id) {
        showToast('Google sign-in is still loading — try again in a second.', 'error');
        return;
    }
    // Click the real (hidden) Google-rendered button rather than relying on
    // prompt() alone, since prompt() can be silently dismissed with no
    // callback firing at all.
    const realGoogleButton = document.querySelector('#google-btn-host div[role="button"]');
    if (realGoogleButton) {
        realGoogleButton.click();
    } else {
        google.accounts.id.prompt();
    }
});

initGoogleSignIn();