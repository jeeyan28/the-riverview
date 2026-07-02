/* ── API base — change this if your backend runs somewhere else ── */
const API_BASE = 'http://localhost:3000/api';
const SERVER_ORIGIN = API_BASE.replace(/\/api$/, ''); // used to build full URLs for /uploads/... images

function resolveImageUrl(image) {
    if (!image) return '';
    if (image.startsWith('http://') || image.startsWith('https://')) return image;
    return `${SERVER_ORIGIN}${image}`;
}

/* ── Navigation ── */
const titles = {
    dashboard:'Dashboard', monitor:'Room Monitor', bookings:'Bookings',
    analytics:'Analytics', reports:'Reports', logs:'Login History',
    settings:'Settings', profile:'Profile'
};

function switchPanel(name) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('panel-' + name);
    const btn   = document.querySelector('[data-panel="' + name + '"]');
    if (panel) panel.classList.add('active');
    if (btn)   btn.classList.add('active');
    document.getElementById('page-title').textContent = titles[name] || name;
    if (name === 'analytics' && !window._chartsBuilt) buildCharts();
    if (name === 'monitor') renderRoomMonitor();
    if (name === 'bookings') renderBookingsTable();
    if (name === 'settings') renderFacilities();
    if (name === 'dashboard') renderDashboard();
}

document.querySelectorAll('.sb-item').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
});

/* ── Settings sub-tabs ── */
document.querySelectorAll('.set-tab').forEach(tab => {
    tab.addEventListener('click', () => {
    document.querySelectorAll('.set-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.set-subpanel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('set-' + tab.dataset.set).classList.add('active');
    });
});

/* ── Day pill toggles ── */
document.querySelectorAll('.day-pill').forEach(p => {
    p.addEventListener('click', () => p.classList.toggle('on'));
});

/* ── Live clock ── */
function tick() {
    document.getElementById('live-time').textContent =
    new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}
tick(); setInterval(tick, 30000);

/* ══════════════════════════════════════════
   ── ROOM / FACILITY DATA (shared cache) ──
   ══════════════════════════════════════════ */
let roomsCache = [];

async function fetchRooms() {
    try {
        const res = await fetch(`${API_BASE}/rooms`);
        if (!res.ok) throw new Error('Failed to load rooms');
        roomsCache = await res.json();
        return roomsCache;
    } catch (err) {
        console.error(err);
        return [];
    }
}

/* ══════════════════════════════════════════
   ── SETTINGS → FACILITIES ──
   ══════════════════════════════════════════ */
async function renderFacilities() {
    const grid = document.getElementById('fac-grid');
    grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">Loading facilities…</div>';

    const rooms = await fetchRooms();
    if (!rooms.length) {
        grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">No facilities yet. Click "Add Facility" to create one.</div>';
        return;
    }

    grid.innerHTML = rooms.map(r => `
        <div class="fac-card">
            <div class="fac-img">
                ${r.image
                    ? `<img src="${resolveImageUrl(r.image)}" alt="${escapeHtml(r.name)}" style="width:100%;height:100%;object-fit:cover;">`
                    : `<i class="ti ti-photo" style="font-size:22px;margin-right:6px;"></i>${escapeHtml(r.category)} Image`}
            </div>
            <div class="fac-body">
                <div class="fac-title-row">
                    <div>
                        <div class="fac-name">${escapeHtml(r.name)}</div>
                        <div class="fac-meta">${escapeHtml(r.category)} · ${escapeHtml(r.roomNumber)} · Max ${escapeHtml(r.capacity)}</div>
                    </div>
                    <div class="fac-price">₱${r.price}/hr</div>
                </div>
                <div class="fac-desc">${escapeHtml(r.description || '')}</div>
                <div class="fac-tags">${(r.features || []).map(f => `<span class="fac-tag">${escapeHtml(f)}</span>`).join('')}</div>
                <div class="fac-actions">
                    <button class="fac-edit-btn" onclick='openFacilityModal("edit", ${JSON.stringify(roomToFormData(r)).replace(/'/g, "&#39;")})'><i class="ti ti-edit"></i>Edit</button>
                    <button class="fac-icon-btn" onclick="duplicateFacility('${r._id}')"><i class="ti ti-copy"></i></button>
                    <button class="fac-icon-btn del" onclick="quickDeleteFacility('${r._id}')"><i class="ti ti-trash"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

function roomToFormData(r) {
    return {
        id: r._id,
        name: r.name,
        category: r.category,
        room: r.roomNumber,
        capacity: r.capacity,
        desc: r.description || '',
        price: r.price,
        status: r.status,
        features: (r.features || []).join(', '),
        image: r.image || ''
    };
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let currentFacilityId = null;
let selectedImageFile = null; // the actual File object chosen in the modal, if any

function openFacilityModal(mode, data) {
    data = data || {};
    const isEdit = mode === 'edit';
    currentFacilityId = isEdit ? data.id : null;
    selectedImageFile = null;

    document.getElementById('fm-title').textContent = isEdit ? 'Edit Facility' : 'Add Facility';
    document.getElementById('fm-sub').textContent = isEdit
    ? 'Update facility information, status and settings.'
    : 'Add a new facility to your listing.';
    document.getElementById('fm-name').value = data.name || '';
    document.getElementById('fm-category').value = data.category || 'Billiards';
    document.getElementById('fm-room').value = data.room || '';
    document.getElementById('fm-capacity').value = data.capacity || '';
    document.getElementById('fm-desc').value = data.desc || '';
    document.getElementById('fm-price').value = data.price || '';
    document.getElementById('fm-status').value = data.status || 'Available';
    document.getElementById('fm-features').value = data.features || '';
    document.getElementById('fm-remove-btn').style.display = isEdit ? 'inline-block' : 'none';
    document.getElementById('fm-save-btn').textContent = isEdit ? 'Save Changes' : 'Add Facility';
    document.getElementById('fm-image-input').value = '';
    setFacilityImagePreview(data.image ? resolveImageUrl(data.image) : '');
    document.getElementById('facility-modal').classList.add('open');
}
function closeFacilityModal() {
    document.getElementById('facility-modal').classList.remove('open');
    currentFacilityId = null;
    selectedImageFile = null;
}
document.getElementById('facility-modal').addEventListener('click', function(e) {
    if (e.target === this) closeFacilityModal();
});

function setFacilityImagePreview(url) {
    const preview = document.getElementById('fm-image-preview');
    const icon = document.getElementById('fm-upload-icon');
    const title = document.getElementById('fm-upload-title');
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
        icon.style.display = 'none';
        title.textContent = 'Click to change image';
    } else {
        preview.style.display = 'none';
        icon.style.display = '';
        title.textContent = 'Click to upload facility images';
    }
}

document.getElementById('fm-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) { selectedImageFile = null; return; }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        alert('Please choose a PNG or JPG image.');
        e.target.value = '';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert('Image must be under 10MB.');
        e.target.value = '';
        return;
    }
    selectedImageFile = file;
    setFacilityImagePreview(URL.createObjectURL(file));
});

function readFacilityForm() {
    return {
        name: document.getElementById('fm-name').value.trim(),
        category: document.getElementById('fm-category').value,
        roomNumber: document.getElementById('fm-room').value.trim(),
        capacity: document.getElementById('fm-capacity').value.trim(),
        description: document.getElementById('fm-desc').value.trim(),
        price: Number(document.getElementById('fm-price').value),
        status: document.getElementById('fm-status').value,
        features: document.getElementById('fm-features').value
    };
}

async function saveFacility() {
    const payload = readFacilityForm();

    if (!payload.name || !payload.roomNumber || !payload.capacity || !payload.price) {
        alert('Please fill in name, room number, capacity, and price.');
        return;
    }

    const btn = document.getElementById('fm-save-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
        const url = currentFacilityId ? `${API_BASE}/rooms/${currentFacilityId}` : `${API_BASE}/rooms`;
        const method = currentFacilityId ? 'PUT' : 'POST';

        // Use FormData (not JSON) so the selected image file rides along in the same request.
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
        if (selectedImageFile) formData.append('image', selectedImageFile);

        const res = await fetch(url, { method, body: formData }); // no Content-Type header — browser sets the multipart boundary

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to save facility.');
        }

        closeFacilityModal();
        await renderFacilities();
    } catch (err) {
        console.error(err);
        alert(err.message || 'Something went wrong saving the facility.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function removeFacility() {
    if (!currentFacilityId) return closeFacilityModal();
    if (!confirm('Remove this facility? This cannot be undone.')) return;

    try {
        const res = await fetch(`${API_BASE}/rooms/${currentFacilityId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete facility.');
        closeFacilityModal();
        await renderFacilities();
    } catch (err) {
        console.error(err);
        alert('Could not delete this facility.');
    }
}

async function quickDeleteFacility(id) {
    if (!confirm('Remove this facility? This cannot be undone.')) return;
    try {
        const res = await fetch(`${API_BASE}/rooms/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete facility.');
        await renderFacilities();
    } catch (err) {
        console.error(err);
        alert('Could not delete this facility.');
    }
}

async function duplicateFacility(id) {
    const room = roomsCache.find(r => r._id === id);
    if (!room) return;
    const payload = {
        name: room.name,
        category: room.category,
        roomNumber: room.roomNumber + ' (Copy)',
        capacity: room.capacity,
        description: room.description,
        price: room.price,
        status: room.status,
        features: room.features
    };
    try {
        const res = await fetch(`${API_BASE}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to duplicate facility.');
        await renderFacilities();
    } catch (err) {
        console.error(err);
        alert('Could not duplicate this facility.');
    }
}

/* ══════════════════════════════════════════
   ── MANUAL BOOKING MODAL ──
   ══════════════════════════════════════════ */
async function openModal() {
    document.getElementById('modal').classList.add('open');
    const select = document.getElementById('mb-room');
    select.innerHTML = '<option value="">Loading rooms…</option>';

    const rooms = await fetchRooms();
    if (!rooms.length) {
        select.innerHTML = '<option value="">No rooms available — add one in Settings</option>';
        return;
    }
    select.innerHTML = rooms
        .map(r => `<option value="${r._id}" data-price="${r.price}">${escapeHtml(r.name)} — ${escapeHtml(r.roomNumber)} (₱${r.price}/hr)</option>`)
        .join('');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
document.getElementById('modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

async function submitManualBooking() {
    const guestName = document.getElementById('mb-guest').value.trim();
    const roomId = document.getElementById('mb-room').value;
    const date = document.getElementById('mb-date').value;
    const timeIn = document.getElementById('mb-time').value;
    const duration = Number(document.getElementById('mb-duration').value);
    const paymentMethod = document.getElementById('mb-payment').value;

    if (!guestName || !roomId || !date || !timeIn || !duration) {
        alert('Please fill in all fields.');
        return;
    }

    const btn = document.getElementById('mb-confirm-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Booking…';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guestName, roomId, date, timeIn, duration, paymentMethod, status: 'Active' })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to create booking.');
        }
        closeModal();
        document.getElementById('mb-guest').value = '';
        renderBookingsTable();
        renderDashboard();
    } catch (err) {
        console.error(err);
        alert(err.message || 'Something went wrong creating the booking.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

/* ══════════════════════════════════════════
   ── BOOKINGS PANEL ──
   ══════════════════════════════════════════ */
const statusPillClass = {
    Active: 'pill-active', Pending: 'pill-pending', Done: 'pill-done',
    Overdue: 'pill-overdue', Cancelled: 'pill-done'
};

async function renderBookingsTable() {
    const tbody = document.getElementById('bookings-tbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px 0;">Loading…</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/bookings`);
        if (!res.ok) throw new Error('Failed to load bookings.');
        const bookings = await res.json();

        if (!bookings.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px 0;">No bookings yet.</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td style="padding:9px 12px;">${escapeHtml(b.guestName)}</td>
                <td>${escapeHtml(b.roomLabel)}</td>
                <td>${escapeHtml(b.date)}</td>
                <td>${escapeHtml(b.timeIn)}</td>
                <td>${b.duration} hr${b.duration > 1 ? 's' : ''}</td>
                <td>₱${b.amount.toLocaleString()}</td>
                <td><span class="pill ${statusPillClass[b.status] || 'pill-pending'}">${escapeHtml(b.status)}</span></td>
                <td>
                    ${b.status === 'Overdue'
                        ? `<button style="border:none;background:none;font-size:.75rem;color:#ff6b6b;cursor:pointer;" onclick="updateBookingStatus('${b._id}','Done')">Resolve</button>`
                        : b.status !== 'Done'
                            ? `<button style="border:none;background:none;font-size:.75rem;color:var(--teal);cursor:pointer;" onclick="updateBookingStatus('${b._id}','Done')">Mark Done</button>`
                            : `<span style="font-size:.75rem;color:var(--muted);">—</span>`
                    }
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:16px 0;">Could not load bookings.</td></tr>';
    }
}

async function updateBookingStatus(id, status) {
    try {
        const res = await fetch(`${API_BASE}/bookings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('Failed to update booking.');
        renderBookingsTable();
        renderDashboard();
    } catch (err) {
        console.error(err);
        alert('Could not update this booking.');
    }
}

/* ══════════════════════════════════════════
   ── ROOM MONITOR PANEL ──
   ══════════════════════════════════════════ */
async function renderRoomMonitor() {
    const grid = document.getElementById('monitor-room-grid');
    grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">Loading rooms…</div>';

    const rooms = await fetchRooms();
    if (!rooms.length) {
        grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">No rooms yet — add facilities in Settings.</div>';
        return;
    }

    const statusClass = { Available: 'vacant', Occupied: 'occupied', 'Under Maintenance': 'overdue', Inactive: 'vacant' };

    grid.innerHTML = rooms.map(r => `
        <div class="rm ${statusClass[r.status] || 'vacant'}">
            <div class="rm-head">
                <div><div class="rm-name">${escapeHtml(r.name)}</div><div class="rm-type">${escapeHtml(r.roomNumber)}</div></div>
                <div class="rm-ico ${r.status === 'Occupied' ? 'ico-teal' : r.status === 'Under Maintenance' ? 'ico-amber' : 'ico-blue'}">
                    <i class="ti ${r.status === 'Occupied' ? 'ti-circle-dashed' : r.status === 'Under Maintenance' ? 'ti-alert-triangle' : 'ti-circle-off'}"></i>
                </div>
            </div>
            <div class="rm-rows">
                <div class="rm-row"><span class="lbl">Category</span><span class="val">${escapeHtml(r.category)}</span></div>
                <div class="rm-row"><span class="lbl">Capacity</span><span class="val">${escapeHtml(r.capacity)}</span></div>
                <div class="rm-row"><span class="lbl">Status</span><span class="val">${escapeHtml(r.status)}</span></div>
                <div class="rm-row"><span class="lbl">Rate</span><span class="val">₱${r.price}/hr</span></div>
            </div>
            <div class="rm-bar-wrap"><div class="rm-bar" style="width:${r.status === 'Occupied' ? 60 : 0}%;background:${r.status === 'Occupied' ? 'var(--teal)' : '#378ADD'};"></div></div>
            <div class="rm-actions">
                <button class="rm-btn" onclick="switchPanel('settings')">Manage</button>
                <button class="rm-btn danger" onclick="quickDeleteFacility('${r._id}')">Remove</button>
            </div>
        </div>
    `).join('');
}

/* ══════════════════════════════════════════
   ── DASHBOARD ──
   ══════════════════════════════════════════ */
async function renderDashboard() {
    // Room status card — from live rooms
    const statusWrap = document.getElementById('dash-room-status');
    const rooms = await fetchRooms();
    if (!rooms.length) {
        statusWrap.innerHTML = '<div style="text-align:center;color:var(--muted);padding:16px 0;font-size:.8rem;">No rooms yet.</div>';
    } else {
        const pillFor = { Available: 'pill-vacant', Occupied: 'pill-active', 'Under Maintenance': 'pill-overdue', Inactive: 'pill-vacant' };
        statusWrap.innerHTML = rooms.map(r => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--navy3);border-radius:8px;">
                <span style="font-size:.8rem;color:#c8d6e5;">${escapeHtml(r.roomNumber)}</span>
                <span class="pill ${pillFor[r.status] || 'pill-vacant'}">${escapeHtml(r.status)}</span>
            </div>
        `).join('');
    }

    // Recent bookings — from live bookings
    const tbody = document.getElementById('dash-recent-bookings');
    try {
        const res = await fetch(`${API_BASE}/bookings`);
        const bookings = await res.json();
        if (!bookings.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px 0;">No bookings yet.</td></tr>';
        } else {
            tbody.innerHTML = bookings.slice(0, 5).map(b => `
                <tr>
                    <td>${escapeHtml(b.guestName)}</td>
                    <td>${escapeHtml(b.roomLabel)}</td>
                    <td>${escapeHtml(b.timeIn)}</td>
                    <td><span class="pill ${statusPillClass[b.status] || 'pill-pending'}">${escapeHtml(b.status)}</span></td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px 0;">Could not load bookings.</td></tr>';
    }
}

/* ── Charts ── */
function buildCharts() {
    window._chartsBuilt = true;

    new Chart(document.getElementById('c-revenue'), {
    type: 'bar',
    data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
        label: 'Revenue',
        data: [4200,5100,4800,6450,7200,6900,3550],
        backgroundColor: '#00C9A7',
        borderRadius: 5,
        barPercentage: 0.6
        }]
    },
    options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
        x: { grid: { display: false }, ticks: { color: '#8A9BB0', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#8A9BB0', font: { size: 11 }, callback: v => '₱' + v.toLocaleString() } }
        }
    }
    });

    new Chart(document.getElementById('c-rooms'), {
    type: 'doughnut',
    data: {
        labels: ['Billiards','KTV','Court','VIP'],
        datasets: [{
        data: [58,22,12,8],
        backgroundColor: ['#00C9A7','#378ADD','#EF9F27','#D4537E'],
        borderWidth: 0
        }]
    },
    options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '65%'
    }
    });

    /* Heatmap */
    const traffic = [0,0,1,2,3,4,6,8,7,9,8,6,5,7,9,10,5];
    const max = Math.max(...traffic);
    const hm = document.getElementById('heatmap');
    traffic.forEach((v, i) => {
    const cell = document.createElement('div');
    cell.className = 'hm-cell';
    const alpha = (0.08 + (v / max) * 0.82).toFixed(2);
    cell.style.background = 'rgba(0,201,167,' + alpha + ')';
    cell.title = (7 + i) + ':00 — ' + v + ' bookings';
    hm.appendChild(cell);
    });
}

/* ── Initial load ── */
renderDashboard();