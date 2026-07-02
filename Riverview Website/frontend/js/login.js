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
        const response = await fetch('http://localhost:3000/login', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Save to localStorage (persistent) or sessionStorage (tab only)
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem('riverview_user', JSON.stringify(data.user));

            if (data.user.role === 'admin') {
                showToast('Welcome, Admin! Redirecting…', 'success');
                setTimeout(() => { window.location.href = 'admin.html'; }, 1500);
            } else {
                showToast(`Welcome back, ${data.user.firstname}!`, 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 1500);
            }
        } else {
            showToast(data.message || 'Login failed.', 'error');
        }
    } catch (err) {
        showToast('Could not reach the server. Is it running?', 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

/* ── Google (demo) ── */
document.getElementById('btn-google').addEventListener('click', () => {
    showToast('Google sign-in coming soon.', 'error');
});