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
makeToggle('confirm', 'toggle-confirm');

let toastTimer;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent  = msg;
    document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '⚠️';
    toast.className = 'toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function setError(fieldId, errorId, show) {
    const field = document.getElementById(fieldId);
    const err   = document.getElementById(errorId);
    if (show) { field.classList.add('has-error');    err.style.display = 'block'; }
    else      { field.classList.remove('has-error'); err.style.display = 'none';  }
}

const token = new URLSearchParams(window.location.search).get('token');
if (!token) {
    showToast('This reset link is missing its token. Request a new one from the login page.', 'error');
}

const form = document.getElementById('reset-form');
const btn  = document.getElementById('btn-submit');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!token) return;

    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm').value;

    const passOk    = password.length >= 8;
    const confirmOk = password === confirm;

    setError('field-password', 'password-error', !passOk);
    setError('field-confirm',  'confirm-error',  !confirmOk);
    if (!passOk || !confirmOk) return;

    btn.classList.add('loading');

    try {
        const res = await fetch(`http://localhost:3000/api/auth/reset-password/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (res.ok) {
            showToast('Password updated! Redirecting to login…', 'success');
            setTimeout(() => { window.location.href = 'login.html'; }, 1800);
        } else {
            showToast(data.message || 'Could not reset password.', 'error');
        }
    } catch (err) {
        showToast('Could not reach the server. Is it running?', 'error');
    } finally {
        btn.classList.remove('loading');
    }
});
