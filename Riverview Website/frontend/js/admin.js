/* ── API base — change this if your backend runs somewhere else ── */
const API_BASE = 'http://localhost:3000/api';
const SERVER_ORIGIN = API_BASE.replace(/\/api$/, ''); // used to build full URLs for /uploads/... images

function resolveImageUrl(image) {
    if (!image) return '';
    if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:')) return image;
    return `${SERVER_ORIGIN}${image}`;
}

/* ── Demo data — shown only if the backend at API_BASE can't be reached,
   so the panel still looks right while you preview or design against it. ── */
const DEMO_ROOMS = [
    {
        _id: 'demo-1', name: 'Family KTV Room', roomNumber: 'KTV-01',
        price: 200, status: 'Available',
        description: 'Spacious KTV room with high-end sound system, large screen, and party lighting.',
        features: ['Sound System', 'Party Lights', 'Air-conditioned'],
        variants: [
            { label: 'Solo — Regular', price: 200, pax: '4 pax' },
            { label: 'Big Room', price: 250, pax: '15 pax' }
        ],
        image: ''
    },
    {
        _id: 'demo-2', name: 'Classic Billiards Table', roomNumber: 'BIL-02',
        price: 200, status: 'Occupied',
        description: 'Regulation-size table in a quiet, air-conditioned corner room.',
        features: ['Air-conditioned', 'Cue Rental Included'],
        variants: [
            { label: 'Solo — Regular', price: 200, pax: '2 pax' },
            { label: 'Big Room', price: 250, pax: '6 pax' }
        ],
        image: ''
    },
    {
        _id: 'demo-3', name: 'Outdoor Basketball Court', roomNumber: 'CRT-01',
        price: 350, status: 'Available',
        description: 'Full-size outdoor court with lighting for evening games.',
        features: ['Floodlights', 'Scoreboard'],
        variants: [
            { label: 'Morning (AM)', price: 350, pax: '20 pax' },
            { label: 'Evening (PM)', price: 400, pax: '20 pax' }
        ],
        image: ''
    },
    {
        _id: 'demo-4', name: 'VIP Lounge Package', roomNumber: 'VIP-01',
        price: 400, status: 'Under Maintenance',
        description: 'Private lounge bundling KTV, billiards, and a dedicated server.',
        features: ['Private Bar', 'Dedicated Staff', 'Sound System'],
        variants: [
            { label: 'Standard', price: 400, pax: '10 pax' }
        ],
        image: ''
    }
];
let usingDemoData = false;

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
        const data = await res.json();
        roomsCache = normalizeRooms(data);
        usingDemoData = false;
        return roomsCache;
    } catch (err) {
        console.warn('Could not reach the rooms API — showing demo data instead.', err);
        roomsCache = normalizeRooms(DEMO_ROOMS);
        usingDemoData = true;
        return roomsCache;
    }
}

/* Make sure every room has the shape the UI expects, even if the backend
   hasn't been updated with the new `variants` / `features` fields yet. */
function normalizeRooms(rooms) {
    return (rooms || []).map(r => ({
        ...r,
        capacity: r.capacity != null ? r.capacity : '',
        features: Array.isArray(r.features) ? r.features : (typeof r.features === 'string' && r.features
            ? r.features.split(',').map(f => f.trim()).filter(Boolean) : []),
        variants: Array.isArray(r.variants) ? r.variants : (typeof r.variants === 'string' && r.variants
            ? safeParseJson(r.variants, []) : [])
    }));
}

function safeParseJson(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

/* ══════════════════════════════════════════
   ── SETTINGS → FACILITIES ──
   ══════════════════════════════════════════ */
const statusClassMap = {
    Available: 'st-available', Occupied: 'st-occupied',
    'Under Maintenance': 'st-maintenance', Inactive: 'st-inactive'
};

async function renderFacilities() {
    const grid = document.getElementById('fac-grid');
    grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">Loading facilities…</div>';

    const rooms = await fetchRooms();
    if (!rooms.length) {
        grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">No facilities yet. Click "Add Facility" to create one.</div>';
        return;
    }

    grid.innerHTML = rooms.map(r => {
        const hasVariants = r.variants && r.variants.length > 0;
        const topPrice = hasVariants
            ? `From ₱${Math.min(...r.variants.map(v => Number(v.price) || 0))}/hr`
            : (r.price ? `₱${r.price}/hr` : '—');

        const variantsHtml = hasVariants ? `
            <div class="fac-variants">
                ${r.variants.map(v => `
                    <div class="fac-variant-row">
                        <span class="fv-label">${escapeHtml(v.label)}${v.pax ? ' · ' + escapeHtml(v.pax) : ''}</span>
                        <span class="fv-price">₱${v.price}/hr</span>
                    </div>
                `).join('')}
            </div>` : '';

        return `
        <div class="fac-card">
            <div class="fac-img">
                ${r.image
                    ? `<img src="${resolveImageUrl(r.image)}" alt="${escapeHtml(r.name)}" style="width:100%;height:100%;object-fit:cover;">`
                    : `<i class="ti ti-photo" style="font-size:22px;margin-right:6px;"></i>${escapeHtml(r.name)} Image`}
            </div>
            <div class="fac-body">
                <div class="fac-title-row">
                    <div>
                        <div class="fac-name">${escapeHtml(r.name)}</div>
                        <div class="fac-meta">${escapeHtml(r.roomNumber)}</div>
                    </div>
                    <div class="fac-price">${topPrice}</div>
                </div>
                ${variantsHtml}
                <div class="fac-desc">${escapeHtml(r.description || '')}</div>
                <span class="fac-status ${statusClassMap[r.status] || 'st-available'}">${escapeHtml(r.status)}</span>
                <div class="fac-tags">${(r.features || []).map(f => `<span class="fac-tag">${escapeHtml(f)}</span>`).join('')}</div>
                <div class="fac-actions">
                    <button class="fac-edit-btn" onclick='openFacilityModal("edit", ${JSON.stringify(roomToFormData(r)).replace(/'/g, "&#39;")})'><i class="ti ti-edit"></i>Edit</button>
                    <button class="fac-icon-btn" onclick="duplicateFacility('${r._id}')" title="Duplicate"><i class="ti ti-copy"></i></button>
                    <button class="fac-icon-btn del" onclick="quickDeleteFacility('${r._id}')" title="Remove"><i class="ti ti-trash"></i></button>
                </div>
            </div>
        </div>
    `}).join('');

    if (usingDemoData) {
        grid.insertAdjacentHTML('beforeend',
            `<div style="grid-column:1/-1;font-size:.72rem;color:var(--muted);padding:4px 2px;">
                <i class="ti ti-info-circle"></i> Showing sample facilities — connect the API at ${API_BASE} to manage live data.
            </div>`);
    }
}

function roomToFormData(r) {
    return {
        id: r._id,
        name: r.name,
        room: r.roomNumber,
        desc: r.description || '',
        price: r.price,
        status: r.status,
        features: r.features || [],
        variants: r.variants || [],
        image: r.image || ''
    };
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let currentFacilityId = null;
let selectedImageFile = null;   // the actual File object chosen in the modal, if any
let currentVariants = [];       // [{label, price}]
let currentFeatures = [];       // ['Air-conditioned', ...]

/* ── Modal open/close ── */
function openFacilityModal(mode, data) {
    data = data || {};
    const isEdit = mode === 'edit';
    currentFacilityId = isEdit ? data.id : null;
    selectedImageFile = null;
    currentVariants = isEdit && Array.isArray(data.variants) ? data.variants.map(v => ({ ...v })) : [];
    currentFeatures = isEdit && Array.isArray(data.features) ? [...data.features] : [];

    document.getElementById('fm-title').textContent = isEdit ? 'Edit Facility' : 'Add Facility';
    document.getElementById('fm-sub').textContent = isEdit
    ? 'Update facility information, pricing tiers, and features.'
    : 'Add a new facility to your listing.';
    document.getElementById('fm-name').value = data.name || '';
    document.getElementById('fm-room').value = data.room || '';
    document.getElementById('fm-desc').value = data.desc || '';
    document.getElementById('fm-price').value = data.price || '';
    document.getElementById('fm-status').value = data.status || 'Available';
    document.getElementById('fm-remove-btn').style.display = isEdit ? 'inline-block' : 'none';
    document.getElementById('fm-save-btn').textContent = isEdit ? 'Save Changes' : 'Add Facility';
    document.getElementById('fm-image-input').value = '';
    document.getElementById('fm-feature-input').value = '';
    setFacilityImagePreview(data.image ? resolveImageUrl(data.image) : '');

    renderVariantRows();
    renderFeatureChips();

    document.getElementById('facility-modal').classList.add('open');
}
function closeFacilityModal() {
    document.getElementById('facility-modal').classList.remove('open');
    currentFacilityId = null;
    selectedImageFile = null;
    currentVariants = [];
    currentFeatures = [];
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
        title.textContent = 'Click to upload facility image';
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

/* ── Pricing tiers (sub-rooms) ── */
function renderVariantRows() {
    const list = document.getElementById('fm-variant-list');
    if (!currentVariants.length) {
        list.innerHTML = '<div class="variant-empty">No pricing tiers yet — add one for things like "Solo — Regular" or "Big Room".</div>';
        return;
    }
    list.innerHTML = currentVariants.map((v, i) => `
        <div class="variant-row">
            <input type="text" class="variant-label" value="${escapeHtml(v.label)}" placeholder="e.g. Big Room"
                oninput="updateVariant(${i}, 'label', this.value)">
            <div class="variant-price-wrap">
                <span>₱</span>
                <input type="number" min="0" value="${v.price}" placeholder="0"
                    oninput="updateVariant(${i}, 'price', this.value)">
                <span>/hr</span>
            </div>
            <input type="text" class="variant-pax" value="${escapeHtml(v.pax || '')}" placeholder="e.g. 6 pax"
                oninput="updateVariant(${i}, 'pax', this.value)">
            <button type="button" class="variant-remove-btn" onclick="removeVariantRow(${i})" title="Remove tier"><i class="ti ti-trash"></i></button>
        </div>
    `).join('');
}
function addVariantRow() {
    currentVariants.push({ label: '', price: '', pax: '' });
    renderVariantRows();
    const rows = document.querySelectorAll('#fm-variant-list .variant-label');
    if (rows.length) rows[rows.length - 1].focus();
}
function updateVariant(i, field, value) {
    if (!currentVariants[i]) return;
    currentVariants[i][field] = field === 'price' ? value : value;
}
function removeVariantRow(i) {
    currentVariants.splice(i, 1);
    renderVariantRows();
}

/* ── Feature chips ── */
function renderFeatureChips() {
    const wrap = document.getElementById('fm-feature-chips');
    wrap.innerHTML = currentFeatures.map((f, i) => `
        <span class="chip">${escapeHtml(f)}<button type="button" onclick="removeFeatureChip(${i})" title="Remove"><i class="ti ti-x" style="font-size:11px;"></i></button></span>
    `).join('');
}
function addFeatureChip() {
    const input = document.getElementById('fm-feature-input');
    const raw = input.value.trim();
    if (!raw) return;
    // allow comma-separated paste, e.g. "Aircon, Free WiFi"
    raw.split(',').map(s => s.trim()).filter(Boolean).forEach(f => {
        if (!currentFeatures.some(existing => existing.toLowerCase() === f.toLowerCase())) {
            currentFeatures.push(f);
        }
    });
    input.value = '';
    renderFeatureChips();
    input.focus();
}
function removeFeatureChip(i) {
    currentFeatures.splice(i, 1);
    renderFeatureChips();
}
document.getElementById('fm-feature-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addFeatureChip(); }
});

/* ── Save / Remove ── */
function readFacilityForm() {
    return {
        name: document.getElementById('fm-name').value.trim(),
        roomNumber: document.getElementById('fm-room').value.trim(),
        description: document.getElementById('fm-desc').value.trim(),
        price: Number(document.getElementById('fm-price').value) || 0,
        status: document.getElementById('fm-status').value,
        features: JSON.stringify(currentFeatures),
        variants: JSON.stringify(
            currentVariants
                .filter(v => v.label.trim() !== '' || v.price !== '')
                .map(v => ({ label: v.label.trim(), price: Number(v.price) || 0, pax: (v.pax || '').trim() }))
        )
    };
}

async function saveFacility() {
    const payload = readFacilityForm();

    if (!payload.name || !payload.roomNumber) {
    alert('Please fill in facility name and room number.');
    return;
    }
    if (!payload.price && JSON.parse(payload.variants).length === 0) {
        alert('Add a base price, or at least one pricing tier.');
        return;
    }

    const btn = document.getElementById('fm-save-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving…';
    btn.disabled = true;

    try {
        if (usingDemoData) {
            // No live backend reachable — apply the change to the in-memory demo set
            // so the UI still reflects the edit during preview.
            applyDemoSave(payload);
            closeFacilityModal();
            await renderFacilities();
            return;
        }

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

function applyDemoSave(payload) {
    const record = {
        name: payload.name, category: payload.category, roomNumber: payload.roomNumber,
        capacity: payload.capacity, description: payload.description, price: payload.price,
        status: payload.status, features: JSON.parse(payload.features), variants: JSON.parse(payload.variants),
        image: selectedImageFile ? URL.createObjectURL(selectedImageFile) : (document.getElementById('fm-image-preview').src || '')
    };
    if (currentFacilityId) {
        const idx = DEMO_ROOMS.findIndex(r => r._id === currentFacilityId);
        if (idx !== -1) DEMO_ROOMS[idx] = { ...DEMO_ROOMS[idx], ...record };
    } else {
        DEMO_ROOMS.push({ _id: 'demo-' + Date.now(), ...record });
    }
}

async function removeFacility() {
    if (!currentFacilityId) return closeFacilityModal();
    if (!confirm('Remove this facility? This cannot be undone.')) return;

    if (usingDemoData) {
        const idx = DEMO_ROOMS.findIndex(r => r._id === currentFacilityId);
        if (idx !== -1) DEMO_ROOMS.splice(idx, 1);
        closeFacilityModal();
        await renderFacilities();
        return;
    }

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

    if (usingDemoData) {
        const idx = DEMO_ROOMS.findIndex(r => r._id === id);
        if (idx !== -1) DEMO_ROOMS.splice(idx, 1);
        await renderFacilities();
        return;
    }

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
        name: room.name + ' (Copy)',
        category: room.category,
        roomNumber: room.roomNumber,
        capacity: room.capacity,
        description: room.description,
        price: room.price,
        status: room.status,
        features: JSON.stringify(room.features || []),
        variants: JSON.stringify(room.variants || [])
    };

    if (usingDemoData) {
        DEMO_ROOMS.push({ _id: 'demo-' + Date.now(), ...payload, features: room.features || [], variants: room.variants || [], image: room.image });
        await renderFacilities();
        return;
    }

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
                <div class="rm-row"><span class="lbl">Capacity</span><span class="val">${escapeHtml(String(r.capacity))}</span></div>
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