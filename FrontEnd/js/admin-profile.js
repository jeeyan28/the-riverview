/* ── Config — adjust to match your real backend routes ── */
const ADMIN_API_BASE = 'http://localhost:3000/api';
const ADMIN_KEY = 'riverview_user';

function getStorageArea() {
    return localStorage.getItem(ADMIN_KEY) ? localStorage : sessionStorage;
}
function getStoredAdmin() {
    const raw = localStorage.getItem(ADMIN_KEY) || sessionStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}
function saveStoredAdmin(admin) {
    getStorageArea().setItem(ADMIN_KEY, JSON.stringify(admin));
}

let currentAdmin = getStoredAdmin();

// No admin session? Send them back to log in rather than showing placeholder data.
if (!currentAdmin) {
    window.location.href = 'login.html';
}

function fullName(admin) {
    return [admin.firstname, admin.lastname].filter(Boolean).join(' ') || admin.name || 'Admin';
}

function renderAdminIdentity(admin) {
    const name = fullName(admin);
    const initials = (admin.firstname?.[0] || '') + (admin.lastname?.[0] || '');

    document.getElementById('sb-admin-name').textContent = name;
    document.getElementById('sb-admin-av').textContent = (initials || name.charAt(0)).toUpperCase();
    document.getElementById('sb-admin-role').textContent = admin.role === 'admin' ? 'Super Admin' : (admin.role || 'Admin');

    document.getElementById('profile-fullname').textContent = name;
    document.getElementById('profile-av').textContent = (initials || name.charAt(0)).toUpperCase();
    document.getElementById('profile-meta-email').textContent = admin.email || '';
    document.getElementById('profile-meta-phone').textContent = admin.phone || '';

    document.getElementById('profile-firstname').value = admin.firstname || '';
    document.getElementById('profile-lastname').value = admin.lastname || '';
    document.getElementById('profile-email').value = admin.email || '';
    document.getElementById('profile-phone').value = admin.phone || '';
}

if (currentAdmin) renderAdminIdentity(currentAdmin);

/* ── Logout ── */
document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem(ADMIN_KEY);
    sessionStorage.removeItem(ADMIN_KEY);
    window.location.href = 'login.html';
});

/* ── Save profile details ── */
document.getElementById('profile-save-details-btn')?.addEventListener('click', async () => {
    if (!currentAdmin) return;
    const btn = document.getElementById('profile-save-details-btn');
    const originalText = btn.textContent;

    const firstname = document.getElementById('profile-firstname').value.trim();
    const lastname  = document.getElementById('profile-lastname').value.trim();
    const phone     = document.getElementById('profile-phone').value.trim();

    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
        // Adjust this endpoint/method to match your actual API.
        const res = await fetch(`${ADMIN_API_BASE}/users/${currentAdmin._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstname, lastname, phone })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not update your profile.');

        currentAdmin = { ...currentAdmin, firstname, lastname, phone };
        saveStoredAdmin(currentAdmin);
        renderAdminIdentity(currentAdmin);
        alert('Profile updated.');
    } catch (err) {
        alert(err.message || 'Could not reach the server. Is it running?');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

/* ── Change password ── */
document.getElementById('profile-save-password-btn')?.addEventListener('click', async () => {
    if (!currentAdmin) return;
    const btn = document.getElementById('profile-save-password-btn');
    const originalText = btn.textContent;

    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword     = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;

    if (!currentPassword) { alert('Enter your current password.'); return; }
    if (newPassword.length < 8) { alert('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { alert("New password and confirmation don't match."); return; }

    btn.textContent = 'Updating…';
    btn.disabled = true;

    try {
        // Adjust this endpoint/method to match your actual API.
        const res = await fetch(`${ADMIN_API_BASE}/users/${currentAdmin._id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not update your password.');

        document.getElementById('profile-current-password').value = '';
        document.getElementById('profile-new-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
        alert('Password updated.');
    } catch (err) {
        alert(err.message || 'Could not reach the server. Is it running?');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});