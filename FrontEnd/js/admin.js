    /* ── API base — change this if your backend runs somewhere else ── */
    const API_BASE = 'http://localhost:3000/api';
    const SERVER_ORIGIN = API_BASE.replace(/\/api$/, ''); // used to build full URLs for /uploads/... images

    function resolveImageUrl(image) {
        if (!image) return '';
        if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:')) return image;
        return `${SERVER_ORIGIN}${image}`;
    }

    /* ══════════════════════════════════════════
    ── ADMIN AUTH GUARD ──
    Add this block to the very top of admin.js, before anything else runs.
    It confirms the session cookie is still valid server-side (not just that
    *something* is sitting in localStorage) and hides UI sections the
    logged-in role isn't allowed to touch.
    ══════════════════════════════════════════ */

    const ROLE_PERMISSIONS = {
        super_admin: ['pos:access', 'pos:refund', 'room:view', 'room:manage', 'booking:view', 'booking:manage', 'reports:view', 'admin:manage', 'settings:view', 'settings:manage'],
        manager:     ['pos:access', 'pos:refund', 'room:view', 'room:manage', 'booking:view', 'booking:manage', 'reports:view', 'settings:view', 'settings:manage'],
        staff:       ['pos:access', 'room:view', 'booking:view', 'booking:manage', 'settings:view'],
    };

    let sessionAdmin = null;

    async function guardAdminPage() {
        try {
            const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
            if (!res.ok) throw new Error('not authenticated');

            const { user } = await res.json();
            if (!['staff', 'manager', 'super_admin'].includes(user.role)) {
                throw new Error('not an admin');
            }

            sessionAdmin = user;
            applyRoleVisibility(user.role);
        } catch (err) {
            window.location.href = 'login.html';
        }
    }

    function hasAdminPermission(permission) {
        if (!sessionAdmin) return false;
        return (ROLE_PERMISSIONS[sessionAdmin.role] || []).includes(permission);
    }

    function applyRoleVisibility(role) {
        // Hide sidebar sections the role has no permissions for.
        document.querySelectorAll('[data-requires-permission]').forEach(el => {
            const needed = el.dataset.requiresPermission;
            applyRoleGate(el, hasAdminPermission(needed));
        });
        // Hide anything restricted to a specific role list, e.g. data-requires-role="super_admin"
        document.querySelectorAll('[data-requires-role]').forEach(el => {
            const allowed = el.dataset.requiresRole.split(',').map(r => r.trim());
            applyRoleGate(el, allowed.includes(role));
        });
    }

    // ── Tier 3: Role-Based UI Gating ──────────────────────────────────────────
    // Shared by both attribute types in applyRoleVisibility() above, and reused
    // by the dynamically-rendered cards/rows elsewhere in this file. Default is
    // to hide the element entirely (this is how the sidebar already behaved); an
    // element can opt into "grey out instead of hide" with data-gate-mode="disable"
    // — useful when it's more helpful for someone to see a feature exists but
    // isn't available to their role, rather than have it vanish.
    function applyRoleGate(el, allowed) {
        if (el.dataset.gateMode === 'disable') {
            el.style.display = '';
            el.disabled = !allowed;
            el.style.opacity = allowed ? '' : '.5';
            el.style.cursor = allowed ? '' : 'not-allowed';
            el.title = allowed ? '' : (el.title || "You don't have permission to do that.");
        } else {
            el.style.display = allowed ? '' : 'none';
        }
    }

    // Client-side mirror of the backend's requirePermission()/requireRole() gates
    // (adminAuth.js + utils/permissions.js). This never grants anything the
    // server wouldn't — every route still enforces its own rule regardless — it
    // just stops the UI from letting someone start an action their role can't
    // finish, instead of letting them fill out a form and hit a 403 at the end.
    function guardPermission(permission, message) {
        if (hasAdminPermission(permission)) return true;
        alert(message || "You don't have permission to do that.");
        return false;
    }

    document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
        localStorage.removeItem('riverview_user');
        sessionStorage.removeItem('riverview_user');
        window.location.href = 'login.html';
    });

    // Opens the public site in a new tab using the SAME session cookie — the
    // admin stays logged into the dashboard in this tab and never has to log
    // in again to get back here.
    document.getElementById('view-user-site-btn')?.addEventListener('click', () => {
        window.open('index.html', '_blank');
    });

    guardAdminPage();

    /* ══════════════════════════════════════════
    Usage in admin.html — tag sidebar buttons / panels like this:

        <button class="sb-item" data-panel="settings" data-requires-permission="room:manage">Room Settings</button>
        <button class="sb-item" data-panel="admins" data-requires-role="super_admin">Manage Admins</button>

    Any element with data-requires-permission / data-requires-role gets
    hidden automatically once guardAdminPage() resolves.
    ══════════════════════════════════════════ */

    


    /* ── Navigation ── */
    const titles = {
        dashboard:'Dashboard', monitor:'Room Monitor', bookings:'Bookings', pos:'Point of Sale',
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
        if (name === 'monitor') { renderRoomMonitor(); } else { stopRoomMonitorTicker(); }
        if (name === 'bookings') renderBookingsTable();
        if (name === 'settings') { renderFacilities(); loadOperatingSettings(); renderAnnouncementsList(); renderPaymentMethodsList(); }
        if (name === 'dashboard') renderDashboard();
        if (name === 'pos') renderPOS();
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
            const res = await fetch(`${API_BASE}/rooms`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load rooms');
            const data = await res.json();
            roomsCache = normalizeRooms(data);
            return roomsCache;
        } catch (err) {
            // Surface the real failure instead of quietly substituting fake data —
            // an empty result plus a console error is the honest behavior here.
            console.error('Could not load rooms from the API:', err);
            roomsCache = [];
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
                        ${hasAdminPermission('room:manage') ? `
                            <button class="fac-edit-btn" onclick='openFacilityModal("edit", ${JSON.stringify(roomToFormData(r)).replace(/'/g, "&#39;")})'><i class="ti ti-edit"></i>Edit</button>
                            <button class="fac-icon-btn" onclick="duplicateFacility('${r._id}')" title="Duplicate"><i class="ti ti-copy"></i></button>
                            <button class="fac-icon-btn del" onclick="quickDeleteFacility('${r._id}')" title="Remove"><i class="ti ti-trash"></i></button>
                        ` : `<span style="font-size:.72rem;color:var(--muted);">View only</span>`}
                    </div>
                </div>
            </div>
        `}).join('');
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
    async function openFacilityModal(mode, data) {
        if (!guardPermission('room:manage')) return;
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
        if (!guardPermission('room:manage')) return;
        const payload = readFacilityForm();

        if (!payload.name || !payload.roomNumber) {
        alert('Please fill in category and room number.');
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
            const url = currentFacilityId ? `${API_BASE}/rooms/${currentFacilityId}` : `${API_BASE}/rooms`;
            const method = currentFacilityId ? 'PUT' : 'POST';

            // Use FormData (not JSON) so the selected image file rides along in the same request.
            const formData = new FormData();
            Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
            if (selectedImageFile) formData.append('image', selectedImageFile);

            const res = await fetch(url, { method, credentials: 'include', body: formData }); // no Content-Type header — browser sets the multipart boundary

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
        if (!guardPermission('room:manage')) return;
        if (!currentFacilityId) return closeFacilityModal();
        if (!confirm('Remove this facility? This cannot be undone.')) return;

        try {
            const res = await fetch(`${API_BASE}/rooms/${currentFacilityId}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error('Failed to delete facility.');
            closeFacilityModal();
            await renderFacilities();
        } catch (err) {
            console.error(err);
            alert('Could not delete this facility.');
        }
    }

    async function quickDeleteFacility(id) {
        if (!guardPermission('room:manage')) return;
        if (!confirm('Remove this facility? This cannot be undone.')) return;

        try {
            const res = await fetch(`${API_BASE}/rooms/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error('Failed to delete facility.');
            await renderFacilities();
        } catch (err) {
            console.error(err);
            alert('Could not delete this facility.');
        }
    }

    async function duplicateFacility(id) {
        if (!guardPermission('room:manage')) return;
        const room = roomsCache.find(r => r._id === id);
        if (!room) return;
        const payload = {
            name: room.name + ' (Copy)',
            roomNumber: room.roomNumber,
            capacity: room.capacity,
            description: room.description,
            price: room.price,
            status: room.status,
            features: JSON.stringify(room.features || []),
            variants: JSON.stringify(room.variants || [])
        };

        try {
            const res = await fetch(`${API_BASE}/rooms`, {
                method: 'POST',
                credentials: 'include',
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
        if (!guardPermission('booking:manage')) return;
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
        if (!guardPermission('booking:manage')) return;
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
                credentials: 'include',
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
        Overdue: 'pill-overdue', Cancelled: 'pill-done',
        'Pending Payment Verification': 'pill-pending', Confirmed: 'pill-active', Rejected: 'pill-overdue'
    };
    const paymentPillClass = {
        Unpaid: 'pill-done', 'Pending Verification': 'pill-pending', Paid: 'pill-active', Rejected: 'pill-overdue'
    };

    let bookingsCache = [];
    let bkFilterDebounce;

    function bkFilterParams() {
        const params = new URLSearchParams();
        const search = document.getElementById('bk-search')?.value.trim();
        const status = document.getElementById('bk-filter-status')?.value;
        const paymentStatus = document.getElementById('bk-filter-payment')?.value;
        const room = document.getElementById('bk-filter-room')?.value;
        // ADDED (Tier 1): the backend (GET /api/bookings) already accepted ?date=,
        // this was just missing a UI control to actually set it.
        const date = document.getElementById('bk-filter-date')?.value;
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        if (paymentStatus) params.set('paymentStatus', paymentStatus);
        if (room) params.set('room', room);
        if (date) params.set('date', date);
        return params.toString();
    }

    async function renderBookingsTable() {
        const tbody = document.getElementById('bookings-tbody');
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px 0;">Loading…</td></tr>';

        try {
            const qs = bkFilterParams();
            const res = await fetch(`${API_BASE}/bookings${qs ? '?' + qs : ''}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load bookings.');
            const bookings = await res.json();
            bookingsCache = bookings;

            if (!bookings.length) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px 0;">No bookings match your filters.</td></tr>';
                return;
            }

            tbody.innerHTML = bookings.map(b => {
                const isPendingVerification = b.status === 'Pending Payment Verification';
                const canManage = hasAdminPermission('booking:manage');

                const paymentCell = b.paymentScreenshot
                    ? `<span class="pill ${paymentPillClass[b.paymentStatus] || 'pill-pending'}" style="cursor:pointer;" onclick="openProofModal('${b._id}')" title="Click to view screenshot">${escapeHtml(b.paymentStatus)}</span>`
                    : `<span class="pill ${paymentPillClass[b.paymentStatus] || 'pill-pending'}">${escapeHtml(b.paymentStatus)}</span>`;

                const actions = [];
                // View is available to anyone who can see the Bookings panel at
                // all — it's read-only unless they also have booking:manage
                // (the modal itself hides Confirm/Edit/Cancel buttons accordingly).
                actions.push(`<button style="border:none;background:none;font-size:.75rem;color:#c8d6e5;cursor:pointer;font-weight:600;" onclick="openBookingDetailModal('${b._id}')">View</button>`);
                if (canManage) {
                    if (isPendingVerification) {
                        actions.push(`<button style="border:none;background:none;font-size:.75rem;color:var(--teal);cursor:pointer;" onclick="approveBooking('${b._id}')">Approve</button>`);
                        actions.push(`<button style="border:none;background:none;font-size:.75rem;color:var(--red);cursor:pointer;" onclick="rejectBooking('${b._id}')">Reject</button>`);
                    } else if (b.status === 'Overdue') {
                        actions.push(`<button style="border:none;background:none;font-size:.75rem;color:#ff6b6b;cursor:pointer;" onclick="updateBookingStatus('${b._id}','Done')">Resolve</button>`);
                    } else if (!['Done', 'Cancelled', 'Rejected'].includes(b.status)) {
                        actions.push(`<button style="border:none;background:none;font-size:.75rem;color:var(--teal);cursor:pointer;" onclick="updateBookingStatus('${b._id}','Done')">Mark Done</button>`);
                    }
                    if (!['Cancelled', 'Rejected'].includes(b.status)) {
                        actions.push(`<button style="border:none;background:none;font-size:.75rem;color:var(--amber);cursor:pointer;" onclick="updateBookingStatus('${b._id}','Cancelled')">Cancel</button>`);
                    }
                    // ADDED (Tier 1): direct edit of duration/paymentMethod/status — the
                    // backend PUT /:id route already supported all three, there was just
                    // no UI entry point for it beyond the quick status-transition buttons above.
                    actions.push(`<button style="border:none;background:none;font-size:.75rem;color:#c8d6e5;cursor:pointer;" onclick="openEditBookingModal('${b._id}')">Edit</button>`);
                    actions.push(`<button style="border:none;background:none;font-size:.75rem;color:var(--muted);cursor:pointer;" onclick="deleteBooking('${b._id}')">Delete</button>`);
                }

                return `
                <tr>
                    <td style="padding:9px 12px;">${escapeHtml(b.guestName)}</td>
                    <td>${escapeHtml(b.guestContact || '—')}</td>
                    <td>${escapeHtml(b.variantLabel || 'Standard')}</td>
                    <td>${escapeHtml(b.roomLabel)}</td>
                    <td>${escapeHtml(b.date)}</td>
                    <td>${escapeHtml(b.timeIn)}</td>
                    <td>${b.duration}h</td>
                    <td>${paymentCell}</td>
                    <td><span class="pill ${statusPillClass[b.status] || 'pill-pending'}">${escapeHtml(b.status)}</span></td>
                    <td style="display:flex;gap:8px;flex-wrap:wrap;">${actions.join('') || '<span style="font-size:.75rem;color:var(--muted);">—</span>'}</td>
                </tr>
            `;
            }).join('');
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:16px 0;">Could not load bookings.</td></tr>';
        }
    }

    // ADDED (Tier 1): 'bk-filter-date' wired in alongside the existing filters.
    ['bk-filter-status', 'bk-filter-payment', 'bk-filter-room', 'bk-filter-date'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', renderBookingsTable);
    });
    document.getElementById('bk-search')?.addEventListener('input', () => {
        clearTimeout(bkFilterDebounce);
        bkFilterDebounce = setTimeout(renderBookingsTable, 350); // debounce so we don't hit the API on every keystroke
    });
    // ADDED (Tier 1): one-click reset for all bookings filters.
    document.getElementById('bk-clear-filters')?.addEventListener('click', () => {
        const searchEl = document.getElementById('bk-search');
        if (searchEl) searchEl.value = '';
        ['bk-filter-status', 'bk-filter-payment', 'bk-filter-room', 'bk-filter-date'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        renderBookingsTable();
    });

    async function updateBookingStatus(id, status) {
        if (!guardPermission('booking:manage')) return;
        try {
            const res = await fetch(`${API_BASE}/bookings/${id}`, {
                method: 'PUT',
                credentials: 'include',
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

    async function deleteBooking(id) {
        if (!guardPermission('booking:manage')) return;
        if (!confirm('Permanently delete this booking? This cannot be undone.')) return;
        try {
            const res = await fetch(`${API_BASE}/bookings/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error('Failed to delete booking.');
            renderBookingsTable();
            renderDashboard();
        } catch (err) {
            console.error(err);
            alert('Could not delete this booking.');
        }
    }

    async function approveBooking(id) {
        if (!guardPermission('booking:manage')) return;
        try {
            const res = await fetch(`${API_BASE}/bookings/${id}/approve`, { method: 'PUT', credentials: 'include' });
            if (!res.ok) throw new Error('Failed to approve booking.');
            renderBookingsTable();
            renderDashboard();
        } catch (err) {
            console.error(err);
            alert('Could not approve this booking.');
        }
    }

    async function rejectBooking(id) {
        if (!guardPermission('booking:manage')) return;
        if (!confirm('Reject this payment? The customer\'s slot will not be held.')) return;
        try {
            const res = await fetch(`${API_BASE}/bookings/${id}/reject`, { method: 'PUT', credentials: 'include' });
            if (!res.ok) throw new Error('Failed to reject booking.');
            renderBookingsTable();
            renderDashboard();
        } catch (err) {
            console.error(err);
            alert('Could not reject this booking.');
        }
    }

    /* ── Payment proof viewer modal ── */
    let proofModalBookingId = null;

    function openProofModal(id) {
        const booking = bookingsCache.find(b => b._id === id);
        if (!booking || !booking.paymentScreenshot) return;

        proofModalBookingId = id;
        document.getElementById('proof-modal-img').src = booking.paymentScreenshot;
        document.getElementById('proof-modal-meta').textContent =
            `${booking.guestName} · ${booking.roomLabel} · ₱${(booking.downPayment || 0).toLocaleString()} down payment via ${booking.paymentMethod}`;

        const isPendingVerification = booking.status === 'Pending Payment Verification';
        const canManage = hasAdminPermission('booking:manage');
        document.getElementById('proof-approve-btn').style.display = (isPendingVerification && canManage) ? '' : 'none';
        document.getElementById('proof-reject-btn').style.display = (isPendingVerification && canManage) ? '' : 'none';

        document.getElementById('proof-modal').classList.add('open');
    }
    function closeProofModal() {
        document.getElementById('proof-modal').classList.remove('open');
        proofModalBookingId = null;
    }
    document.getElementById('proof-modal')?.addEventListener('click', function(e) {
        if (e.target === this) closeProofModal();
    });
    async function approveFromProofModal() {
        if (!proofModalBookingId) return;
        await approveBooking(proofModalBookingId);
        closeProofModal();
    }
    async function rejectFromProofModal() {
        if (!proofModalBookingId) return;
        await rejectBooking(proofModalBookingId);
        closeProofModal();
    }

    /* ── Booking Details modal (View button) ──
    Full read view of a single booking: customer info, booking specifics,
    the guest's uploaded payment screenshot (if any), their past booking
    history at this business, and any comment/special request they left
    when booking. Confirm/Edit/Cancel reuse the same endpoints the table's
    quick-action buttons already call. */
    let currentBookingDetailId = null;

    function shortBookingId(b) {
        const year = b.createdAt ? new Date(b.createdAt).getFullYear() : new Date().getFullYear();
        const tail = String(b._id || '').slice(-6).toUpperCase();
        return `#BK-${year}-${tail}`;
    }

    // Booking status can look confusing to a non-technical admin at a
    // glance ("Pending Payment Verification" is a mouthful) — shorten it for
    // the badge while keeping the underlying value intact everywhere else.
    function shortStatusLabel(status) {
        const map = { 'Pending Payment Verification': 'Pending' };
        return map[status] || status;
    }

    function openBookingDetailModal(id) {
        const booking = bookingsCache.find(b => b._id === id);
        if (!booking) return;
        currentBookingDetailId = id;

        document.getElementById('bd-booking-id').textContent = `Booking ID: ${shortBookingId(booking)}`;
        const statusPill = document.getElementById('bd-status-pill');
        statusPill.textContent = shortStatusLabel(booking.status);
        statusPill.className = `pill ${statusPillClass[booking.status] || 'pill-pending'}`;

        document.getElementById('bd-guest-name').textContent = booking.guestName || '—';
        document.getElementById('bd-guest-email').textContent = booking.guestEmail || (String(booking.guestContact || '').includes('@') ? booking.guestContact : '—');
        document.getElementById('bd-guest-phone').textContent = (booking.guestContact && !String(booking.guestContact).includes('@')) ? booking.guestContact : (booking.guestContact || '—');

        document.getElementById('bd-room').textContent = `${booking.roomLabel || '—'}${booking.variantLabel ? ' (' + booking.variantLabel + ')' : ''}`;
        document.getElementById('bd-date').textContent = booking.date || '—';
        document.getElementById('bd-time').textContent = booking.timeIn || '—';
        document.getElementById('bd-duration').textContent = booking.duration ? `${booking.duration} hr${booking.duration > 1 ? 's' : ''}` : '—';
        document.getElementById('bd-guests').textContent = booking.guestCount ? String(booking.guestCount) : '—';
        document.getElementById('bd-amount').textContent = `₱${Number(booking.amount || 0).toLocaleString()}`;

        // Payment screenshot — this is exactly what the guest uploaded as
        // proof of their down payment; clicking it opens the same
        // approve/reject proof modal the table's payment pill already uses.
        const screenshotSection = document.getElementById('bd-screenshot-section');
        if (booking.paymentScreenshot) {
            document.getElementById('bd-screenshot').src = resolveImageUrl(booking.paymentScreenshot);
            screenshotSection.style.display = '';
        } else {
            screenshotSection.style.display = 'none';
        }

        // Booking history — this guest's other bookings (matched by contact,
        // falling back to name if contact is missing), most recent first.
        const historyTbody = document.getElementById('bd-history-tbody');
        const history = bookingsCache
            .filter(b => b._id !== booking._id && (
                (booking.guestContact && b.guestContact === booking.guestContact) ||
                (!booking.guestContact && b.guestName === booking.guestName)
            ))
            .sort((a, b2) => (b2.date || '').localeCompare(a.date || ''))
            .slice(0, 5);

        historyTbody.innerHTML = history.length
            ? history.map(h => `
                <tr>
                    <td style="padding:8px 10px;">${escapeHtml(h.date)}</td>
                    <td>${escapeHtml(h.roomLabel)}</td>
                    <td>${h.duration}hrs</td>
                    <td><span class="pill ${statusPillClass[h.status] || 'pill-pending'}">${escapeHtml(shortStatusLabel(h.status))}</span></td>
                </tr>`).join('')
            : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:10px 0;font-size:.8rem;">No previous bookings from this guest.</td></tr>';

        // Additional notes — the comment/special request left at booking time.
        document.getElementById('bd-notes').textContent = booking.specialRequests?.trim()
            ? booking.specialRequests.trim()
            : 'No special requests provided.';

        // Action buttons — hidden entirely for view-only staff, and adapted
        // to whatever state this particular booking is actually in.
        const canManage = hasAdminPermission('booking:manage');
        const confirmBtn = document.getElementById('bd-confirm-btn');
        const editBtn = document.getElementById('bd-edit-btn');
        const cancelBtn = document.getElementById('bd-cancel-btn');
        const isConfirmable = ['Pending', 'Pending Payment Verification'].includes(booking.status);
        const isCancellable = !['Cancelled', 'Rejected', 'Done'].includes(booking.status);

        confirmBtn.style.display = (canManage && isConfirmable) ? '' : 'none';
        editBtn.style.display = canManage ? '' : 'none';
        cancelBtn.style.display = (canManage && isCancellable) ? '' : 'none';

        document.getElementById('booking-detail-modal').classList.add('open');
    }

    function closeBookingDetailModal() {
        document.getElementById('booking-detail-modal').classList.remove('open');
        currentBookingDetailId = null;
    }
    document.getElementById('booking-detail-modal')?.addEventListener('click', function (e) {
        if (e.target === this) closeBookingDetailModal();
    });

    async function confirmBookingFromDetail() {
        if (!currentBookingDetailId) return;
        const booking = bookingsCache.find(b => b._id === currentBookingDetailId);
        if (!booking) return;
        // Online bookings awaiting payment verification go through the
        // approve endpoint (sets paymentStatus too); admin-created "Pending"
        // walk-ins just move straight to Confirmed.
        if (booking.status === 'Pending Payment Verification') {
            await approveBooking(currentBookingDetailId);
        } else {
            await updateBookingStatus(currentBookingDetailId, 'Confirmed');
        }
        closeBookingDetailModal();
    }

    function editBookingFromDetail() {
        if (!currentBookingDetailId) return;
        const id = currentBookingDetailId;
        closeBookingDetailModal();
        openEditBookingModal(id);
    }

    async function cancelBookingFromDetail() {
        if (!currentBookingDetailId) return;
        if (!confirm('Cancel this booking? The guest will need to rebook if they still want the slot.')) return;
        await updateBookingStatus(currentBookingDetailId, 'Cancelled');
        closeBookingDetailModal();
    }

    /* ── Edit Booking modal (ADDED — Tier 1) ──
    Direct edit of duration / paymentMethod / status via the existing
    PUT /api/bookings/:id route (bookingRoutes.js already accepts all three —
    this only adds the UI to reach them). */
    let editBookingId = null;

    function openEditBookingModal(id) {
        if (!guardPermission('booking:manage')) return;
        const booking = bookingsCache.find(b => b._id === id);
        if (!booking) return;

        editBookingId = id;
        document.getElementById('eb-summary').textContent =
            `${booking.guestName} · ${booking.roomLabel}${booking.variantLabel ? ' (' + booking.variantLabel + ')' : ''} · ${booking.date} at ${booking.timeIn}`;
        document.getElementById('eb-duration').value = booking.duration;
        document.getElementById('eb-payment').value = booking.paymentMethod || 'Cash';
        document.getElementById('eb-status').value = booking.status;

        document.getElementById('edit-booking-modal').classList.add('open');
    }

    function closeEditBookingModal() {
        document.getElementById('edit-booking-modal').classList.remove('open');
        editBookingId = null;
    }
    document.getElementById('edit-booking-modal')?.addEventListener('click', function(e) {
        if (e.target === this) closeEditBookingModal();
    });

    async function saveBookingEdit() {
        if (!guardPermission('booking:manage')) return;
        if (!editBookingId) return;

        const duration = Number(document.getElementById('eb-duration').value);
        const paymentMethod = document.getElementById('eb-payment').value;
        const status = document.getElementById('eb-status').value;

        if (!Number.isFinite(duration) || duration < 1 || duration > 5) {
            alert('Duration must be between 1 and 5 hours.');
            return;
        }

        const saveBtn = document.getElementById('eb-save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving…';
        saveBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/bookings/${editBookingId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration, paymentMethod, status })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Failed to update booking.');
            }
            closeEditBookingModal();
            renderBookingsTable();
            renderDashboard();
        } catch (err) {
            console.error(err);
            alert(err.message || 'Could not save changes to this booking.');
        } finally {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }

    /* ══════════════════════════════════════════
    ── ROOM MONITOR PANEL (Tier 2) ──
    Walk-in occupancy only — online bookings never appear here. A room's
    "occupied" countdown is derived straight from its live walk-in booking's
    date + timeIn + duration, so it survives page reloads without needing any
    extra client-only state. When a countdown hits zero we PUT the room's
    status back to "Available" automatically; the booking record itself is
    left alone (never deleted).
    ══════════════════════════════════════════ */
    let monitorBookingsCache = [];      // walk-in bookings with status "Active", refreshed each panel load
    let monitorTimerHandle = null;      // setInterval id for the live 1s countdown ticker
    const monitorExpiredHandled = new Set(); // booking ids already auto-reset, so we don't re-fire the PUT every tick
    const MONITOR_WARNING_MS = 5 * 60 * 1000; // "almost over" warning window — 5 minutes left

    const monitorBaseStatusClass = { Available: 'vacant', Occupied: 'occupied', 'Under Maintenance': 'overdue', Inactive: 'vacant' };

    /* booking.date is "YYYY-MM-DD", booking.timeIn is "HH:MM" (see bookingRoutes.js) */
    function monitorBookingStart(booking) {
        const [h, m] = String(booking.timeIn).split(':').map(Number);
        const start = new Date(booking.date + 'T00:00:00');
        start.setHours(h || 0, m || 0, 0, 0);
        return start;
    }
    function monitorBookingEnd(booking) {
        return new Date(monitorBookingStart(booking).getTime() + booking.duration * 60 * 60 * 1000);
    }
    function formatTimeRemaining(ms) {
        if (ms <= 0) return "Time's up";
        const totalMin = Math.ceil(ms / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
    }

    // Walk-in bookings only, and only ones still actually occupying a room —
    // online bookings, and finished/cancelled ones, must never show up here.
    function activeWalkInBookings(bookings) {
        return (bookings || []).filter(b => b.source === 'walk-in' && b.status === 'Active');
    }

    // The walk-in booking currently occupying a given room, if any. If a room
    // somehow has more than one live walk-in booking, use whichever ends latest.
    function findRoomOccupancy(roomId, walkIns) {
        const matches = walkIns.filter(b => String(b.room?._id || b.room) === String(roomId));
        if (!matches.length) return null;
        return matches.reduce((latest, b) => (!latest || monitorBookingEnd(b) > monitorBookingEnd(latest)) ? b : latest, null);
    }

    async function fetchMonitorBookings() {
        try {
            const res = await fetch(`${API_BASE}/bookings?status=Active`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load bookings for the room monitor.');
            const bookings = await res.json();
            // Belt-and-suspenders client-side filter — the API's ?status filter
            // doesn't know about `source`, and online bookings must never surface here.
            monitorBookingsCache = activeWalkInBookings(bookings);
        } catch (err) {
            console.error(err);
            monitorBookingsCache = [];
        }
        return monitorBookingsCache;
    }

    async function renderRoomMonitor() {
        const grid = document.getElementById('monitor-room-grid');
        grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">Loading rooms…</div>';

        const [rooms] = await Promise.all([fetchRooms(), fetchMonitorBookings()]);
        if (!rooms.length) {
            grid.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;grid-column:1/-1;">No rooms yet — add facilities in Settings.</div>';
            return;
        }

        paintRoomMonitorGrid();

        if (monitorTimerHandle) clearInterval(monitorTimerHandle);
        monitorTimerHandle = setInterval(tickRoomMonitor, 1000);
    }

    function stopRoomMonitorTicker() {
        if (monitorTimerHandle) {
            clearInterval(monitorTimerHandle);
            monitorTimerHandle = null;
        }
    }

    // Runs every second while the panel is open: checks for newly-expired walk-in
    // sessions (auto-resetting their room to Available) and repaints the grid so
    // the countdowns actually count down.
    function tickRoomMonitor() {
        const grid = document.getElementById('monitor-room-grid');
        if (!grid) { stopRoomMonitorTicker(); return; }

        monitorBookingsCache.forEach(b => {
            if (monitorExpiredHandled.has(b._id)) return;
            if (monitorBookingEnd(b).getTime() - Date.now() <= 0) {
                monitorExpiredHandled.add(b._id); // claim it now so we don't fire the PUT twice while it's in flight
                autoExpireRoom(b);
            }
        });

        paintRoomMonitorGrid();
    }

    function paintRoomMonitorGrid() {
        const grid = document.getElementById('monitor-room-grid');
        if (!grid) return;
        grid.innerHTML = roomsCache.map(r => roomMonitorCardHtml(r)).join('');
    }

    function roomMonitorCardHtml(r) {
        const occupancy = findRoomOccupancy(r._id, monitorBookingsCache);
        const remaining = occupancy ? monitorBookingEnd(occupancy).getTime() - Date.now() : null;
        const isExpired = occupancy && remaining <= 0;
        const isWarning = occupancy && !isExpired && remaining <= MONITOR_WARNING_MS;
        const canManageRoom = hasAdminPermission('room:manage');

        const stateClass = isExpired ? 'overdue' : isWarning ? 'warning' : (monitorBaseStatusClass[r.status] || 'vacant');
        const icoClass = r.status === 'Occupied' ? 'ico-teal' : r.status === 'Under Maintenance' ? 'ico-amber' : 'ico-blue';
        const icoGlyph = r.status === 'Occupied' ? 'ti-circle-dashed' : r.status === 'Under Maintenance' ? 'ti-alert-triangle' : 'ti-circle-off';

        const barPercent = occupancy
            ? Math.max(0, Math.min(100, (remaining / (occupancy.duration * 60 * 60 * 1000)) * 100))
            : (r.status === 'Occupied' ? 60 : 0);
        const barColor = isExpired ? 'var(--red)' : isWarning ? 'var(--amber)' : (occupancy || r.status === 'Occupied') ? 'var(--teal)' : '#378ADD';

        let occupancyRows = `<div class="rm-row"><span class="lbl">Rate</span><span class="val">₱${r.price}/hr</span></div>`;
        let actions = `<span style="font-size:.7rem;color:var(--muted);">${escapeHtml(r.status)}</span>`;
        let warnBadge = '';

        if (occupancy) {
            occupancyRows = `
                <div class="rm-row"><span class="lbl">Guest</span><span class="val">${escapeHtml(occupancy.guestName)}</span></div>
                <div class="rm-row"><span class="lbl">Time Left</span><span class="val rm-timer ${isWarning ? 'warn' : ''} ${isExpired ? 'expired' : ''}">${formatTimeRemaining(remaining)}</span></div>
            `;
            if (isWarning) warnBadge = `<div class="rm-warn-badge"><i class="ti ti-alert-triangle"></i>Ending soon</div>`;
            actions = canManageRoom
                ? `<button class="rm-btn danger" onclick="endWalkInSession('${occupancy._id}','${r._id}')">End Session</button>`
                : `<span style="font-size:.7rem;color:var(--muted);">In use</span>`;
        } else if (r.status === 'Available') {
            actions = canManageRoom
                ? `<button class="rm-btn primary" onclick="openAssignModal('${r._id}')">Assign Walk-in</button>`
                : `<span style="font-size:.7rem;color:var(--muted);">No permission</span>`;
        }

        return `
            <div class="rm ${stateClass}">
                <div class="rm-head">
                    <div><div class="rm-name">${escapeHtml(r.name)}</div><div class="rm-type">${escapeHtml(r.roomNumber)}</div></div>
                    <div class="rm-ico ${icoClass}"><i class="ti ${icoGlyph}"></i></div>
                </div>
                <div class="rm-rows">
                    <div class="rm-row"><span class="lbl">Status</span><span class="val">${escapeHtml(r.status)}</span></div>
                    ${occupancyRows}
                </div>
                ${warnBadge}
                <div class="rm-bar-wrap"><div class="rm-bar" style="width:${barPercent}%;background:${barColor};"></div></div>
                <div class="rm-actions">${actions}</div>
            </div>
        `;
    }

    // Flip a room back to Available once its walk-in session's time is up. Retries
    // on the next tick if the request fails (e.g. transient network error) rather
    // than silently giving up. Skipped entirely if this admin can't manage rooms —
    // the grid will just reflect the correct state once someone who can views it.
    async function autoExpireRoom(booking) {
        if (!hasAdminPermission('room:manage')) return;

        const roomId = booking.room?._id || booking.room;
        const room = roomsCache.find(rm => rm._id === roomId);
        if (!room || room.status === 'Available') return; // nothing to reset

        try {
            const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Available' })
            });
            if (!res.ok) throw new Error('Failed to reset room status.');
            const updated = await res.json();
            const idx = roomsCache.findIndex(rm => rm._id === roomId);
            if (idx !== -1) roomsCache[idx] = { ...roomsCache[idx], ...updated };
        } catch (err) {
            console.error(err);
            monitorExpiredHandled.delete(booking._id); // let the next tick try again
        }
    }

    // Let staff end a walk-in session early — marks the booking Done and frees the
    // room right away, instead of waiting for the timer to run out on its own.
    async function endWalkInSession(bookingId, roomId) {
        if (!guardPermission('room:manage')) return;
        if (!confirm('End this session now? The room will be marked Available.')) return;
        try {
            const res = await fetch(`${API_BASE}/bookings/${bookingId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Done' })
            });
            if (!res.ok) throw new Error('Failed to end the session.');

            const roomRes = await fetch(`${API_BASE}/rooms/${roomId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Available' })
            });
            if (roomRes.ok) {
                const updatedRoom = await roomRes.json();
                const idx = roomsCache.findIndex(r => r._id === roomId);
                if (idx !== -1) roomsCache[idx] = { ...roomsCache[idx], ...updatedRoom };
            }

            monitorExpiredHandled.add(bookingId); // it's over — the ticker shouldn't touch it again
            await fetchMonitorBookings();
            paintRoomMonitorGrid();
        } catch (err) {
            console.error(err);
            alert('Could not end this session.');
        }
    }

    /* ── Assign Walk-in modal ──
    admin.html doesn't ship dedicated markup for this, so it's built once here
    (on first use) and reuses the app's existing .modal-bg / .modal / .mfield
    conventions so it looks native rather than bolted-on. */
    let assignModalRoomId = null;

    function ensureAssignModal() {
        if (document.getElementById('assign-walkin-modal')) return;

        const wrap = document.createElement('div');
        wrap.id = 'assign-walkin-modal';
        wrap.className = 'modal-bg';
        wrap.innerHTML = `
            <div class="modal">
                <div class="modal-title">Assign Walk-in</div>
                <p id="aw-room-label" style="margin:-10px 0 16px;font-size:.78rem;color:var(--muted);"></p>
                <div class="mfield">
                    <label>Guest Name</label>
                    <input type="text" id="aw-guest" placeholder="Walk-in guest name">
                </div>
                <div class="mfield">
                    <label>Duration</label>
                    <select id="aw-duration">
                        <option value="1">1 hour</option>
                        <option value="2">2 hours</option>
                        <option value="3">3 hours</option>
                        <option value="4">4 hours</option>
                        <option value="5">5 hours</option>
                    </select>
                </div>
                <div class="mfield">
                    <label>Payment Method</label>
                    <select id="aw-payment">
                        <option value="Cash">Cash</option>
                        <option value="GCash">GCash</option>
                        <option value="Maya">Maya</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeAssignModal()">Cancel</button>
                    <button class="btn-confirm" id="aw-confirm-btn" onclick="submitWalkInAssignment()">Start Session</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) closeAssignModal(); });
    }

    function openAssignModal(roomId) {
        if (!guardPermission('room:manage')) return;
        ensureAssignModal();
        const room = roomsCache.find(r => r._id === roomId);
        if (!room) return;

        assignModalRoomId = roomId;
        document.getElementById('aw-room-label').textContent = `${room.name} — ${room.roomNumber}`;
        document.getElementById('aw-guest').value = '';
        document.getElementById('aw-duration').value = '1';
        document.getElementById('aw-payment').value = 'Cash';
        document.getElementById('assign-walkin-modal').classList.add('open');
    }
    function closeAssignModal() {
        document.getElementById('assign-walkin-modal')?.classList.remove('open');
        assignModalRoomId = null;
    }

    function monitorTodayDateStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function monitorNowTimeStr() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    async function submitWalkInAssignment() {
        if (!guardPermission('room:manage')) return;
        if (!assignModalRoomId) return;
        const guestName = document.getElementById('aw-guest').value.trim();
        const duration = Number(document.getElementById('aw-duration').value);
        const paymentMethod = document.getElementById('aw-payment').value;

        if (!guestName) { alert('Please enter the guest name.'); return; }

        const btn = document.getElementById('aw-confirm-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Starting…';
        btn.disabled = true;

        try {
            // Admin/staff sessions hitting POST /bookings automatically get
            // source: "walk-in", status: "Active", paymentStatus: "Paid" — see
            // bookingRoutes.js — so we don't send (and couldn't override) those.
            const res = await fetch(`${API_BASE}/bookings`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guestName,
                    roomId: assignModalRoomId,
                    date: monitorTodayDateStr(),
                    timeIn: monitorNowTimeStr(),
                    duration,
                    paymentMethod
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Failed to start the session.');
            }

            // Reflect the room as occupied right away rather than waiting for a refetch.
            const roomRes = await fetch(`${API_BASE}/rooms/${assignModalRoomId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Occupied' })
            });
            if (roomRes.ok) {
                const updatedRoom = await roomRes.json();
                const idx = roomsCache.findIndex(r => r._id === assignModalRoomId);
                if (idx !== -1) roomsCache[idx] = { ...roomsCache[idx], ...updatedRoom };
            }

            closeAssignModal();
            await fetchMonitorBookings();
            paintRoomMonitorGrid();
        } catch (err) {
            console.error(err);
            alert(err.message || 'Could not start this walk-in session.');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /* ══════════════════════════════════════════
    ── DASHBOARD ──
    ══════════════════════════════════════════ */

    // ── Tier 5: Dashboard Visual Modernization ──────────────────────────────
    // Purely cosmetic, one-time DOM upgrade of the *static* dashboard markup
    // that admin.html ships with inline styles on (the Recent Bookings/Room
    // Status two-column wrapper, and the Quick Actions buttons). It swaps those
    // inline styles for CSS classes so admin.css can fully own the look —
    // no logic, routes, onclick handlers, or data flow are touched, and it's
    // idempotent (dataset guard) so switching panels back and forth is safe.
    function enhanceDashboardStaticMarkup() {
        const panel = document.getElementById('panel-dashboard');
        if (!panel || panel.dataset.visualUpgraded) return;
        panel.dataset.visualUpgraded = '1';

        // Recent Bookings + Room Status row
        const twoCol = panel.querySelector(':scope > div[style*="grid-template-columns"]');
        if (twoCol) {
            twoCol.removeAttribute('style');
            twoCol.classList.add('dash-grid');
        }

        // Quick Actions row + buttons — keep each button's existing onclick
        // handler untouched, only re-skin the inner content.
        const qaCard = panel.querySelector(':scope > .card:last-of-type');
        const qaRow = qaCard ? qaCard.querySelector(':scope > div[style*="flex-wrap"]') : null;
        if (qaRow) {
            qaRow.removeAttribute('style');
            qaRow.classList.add('qa-row');
            qaRow.querySelectorAll('button').forEach(btn => {
                const icon = btn.querySelector('i');
                const iconClass = icon ? icon.className : 'ti ti-bolt';
                const label = btn.textContent.trim();
                btn.removeAttribute('style');
                btn.classList.add('qa-btn');
                btn.innerHTML = `<span class="qa-ico"><i class="${iconClass}"></i></span><span class="qa-label">${escapeHtml(label)}</span>`;
            });
        }
    }

    async function renderDashboard() {
        enhanceDashboardStaticMarkup();

        // Room status card — from live rooms
        const statusWrap = document.getElementById('dash-room-status');
        const rooms = await fetchRooms();
        if (!rooms.length) {
            statusWrap.innerHTML = '<div class="dash-empty-state">No rooms yet.</div>';
        } else {
            const pillFor = { Available: 'pill-vacant', Occupied: 'pill-active', 'Under Maintenance': 'pill-overdue', Inactive: 'pill-vacant' };
            const dotFor  = { Available: 'dash-dot-vacant', Occupied: 'dash-dot-active', 'Under Maintenance': 'dash-dot-overdue', Inactive: 'dash-dot-vacant' };
            statusWrap.innerHTML = rooms.map(r => `
                <div class="dash-room-row">
                    <span class="dash-room-dot ${dotFor[r.status] || 'dash-dot-vacant'}"></span>
                    <span class="dash-room-num">${escapeHtml(r.roomNumber)}</span>
                    <span class="pill ${pillFor[r.status] || 'pill-vacant'}">${escapeHtml(r.status)}</span>
                </div>
            `).join('');
        }

        // Recent bookings — from live bookings
        const tbody = document.getElementById('dash-recent-bookings');
        try {
            const res = await fetch(`${API_BASE}/bookings`, { credentials: 'include' });
            const bookings = await res.json();
            if (!bookings.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="dash-empty-state">No bookings yet.</td></tr>';
            } else {
                tbody.innerHTML = bookings.slice(0, 5).map(b => {
                    const initials = (b.guestName || '?').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
                    return `
                    <tr>
                        <td>
                            <div class="dash-guest-cell">
                                <span class="dash-avatar">${escapeHtml(initials)}</span>
                                <span>${escapeHtml(b.guestName)}</span>
                            </div>
                        </td>
                        <td>${escapeHtml(b.roomLabel)}</td>
                        <td>${escapeHtml(b.timeIn)}</td>
                        <td><span class="pill ${statusPillClass[b.status] || 'pill-pending'}">${escapeHtml(b.status)}</span></td>
                    </tr>
                `;
                }).join('');
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" class="dash-empty-state">Could not load bookings.</td></tr>';
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

    /* ══════════════════════════════════════════
    ── POS (POINT OF SALE) ──
    Simple line-item register: staff type in an item name/price/qty, it goes
    into an in-memory cart, then "Complete Sale" posts the whole cart to
    POST /api/pos/sales in one call. No product catalog is required — this
    matches a walk-in snack/rental counter more than a full inventory system,
    which is what the existing rooms/bookings data model supports today.
    ══════════════════════════════════════════ */
    let posCart = []; // { name, price, qty }

    function posSubtotal() {
        return posCart.reduce((sum, it) => sum + it.price * it.qty, 0);
    }

    function renderPosCart() {
        const body = document.getElementById('pos-cart-body');
        if (!body) return;

        if (!posCart.length) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px 0;">Cart is empty</td></tr>';
        } else {
            body.innerHTML = posCart.map((it, i) => `
                <tr>
                    <td style="padding:8px 10px;">${escapeHtml(it.name)}</td>
                    <td>₱${it.price.toFixed(2)}</td>
                    <td>${it.qty}</td>
                    <td>₱${(it.price * it.qty).toFixed(2)}</td>
                    <td><button type="button" class="rm-btn danger" onclick="removePosItem(${i})"><i class="ti ti-trash"></i></button></td>
                </tr>
            `).join('');
        }

        const subtotal = posSubtotal();
        const discount = Math.max(0, Number(document.getElementById('pos-discount')?.value) || 0);
        const total = Math.max(0, subtotal - discount);
        document.getElementById('pos-subtotal').textContent = `₱${subtotal.toFixed(2)}`;
        document.getElementById('pos-total').textContent = `₱${total.toFixed(2)}`;
    }

    function removePosItem(index) {
        posCart.splice(index, 1);
        renderPosCart();
    }
    window.removePosItem = removePosItem; // used by the inline onclick above

    document.getElementById('pos-add-item-btn')?.addEventListener('click', () => {
        const nameInput = document.getElementById('pos-item-name');
        const priceInput = document.getElementById('pos-item-price');
        const qtyInput = document.getElementById('pos-item-qty');

        const name = nameInput.value.trim();
        const price = Number(priceInput.value);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);

        if (!name || !Number.isFinite(price) || price < 0) {
            alert('Enter an item name and a valid price.');
            return;
        }

        posCart.push({ name, price, qty });
        nameInput.value = '';
        priceInput.value = '';
        qtyInput.value = '1';
        nameInput.focus();
        renderPosCart();
    });

    document.getElementById('pos-discount')?.addEventListener('input', renderPosCart);

    async function fetchPosSalesToday() {
        try {
            const today = new Date();
            const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const res = await fetch(`${API_BASE}/pos/sales?date=${dateStr}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load sales.');
            return await res.json();
        } catch (err) {
            console.error(err);
            return [];
        }
    }

    function posSaleRowHtml(sale) {
        const time = new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const itemsSummary = sale.items.map(it => `${it.name} ×${it.quantity}`).join(', ');
        const cashierName = sale.cashier ? [sale.cashier.firstname, sale.cashier.lastname].filter(Boolean).join(' ') : '—';
        const isVoided = sale.status === 'Voided';
        const statusPill = isVoided
            ? '<span class="pill pill-pending">Voided</span>'
            : '<span class="pill pill-active">Completed</span>';
        const canRefund = hasAdminPermission('pos:refund');
        const actions = (!isVoided && canRefund)
            ? `<button type="button" class="rm-btn danger" onclick="voidPosSale('${sale._id}')">Void</button>`
            : '<span style="font-size:.7rem;color:var(--muted);">—</span>';

        return `
            <tr>
                <td style="padding:10px 12px;">${time}</td>
                <td>${escapeHtml(itemsSummary)}</td>
                <td>₱${sale.total.toFixed(2)}</td>
                <td>${escapeHtml(sale.paymentMethod)}</td>
                <td>${escapeHtml(cashierName)}</td>
                <td>${statusPill}</td>
                <td data-requires-permission="pos:refund">${actions}</td>
            </tr>
        `;
    }

    async function renderPosSalesTable() {
        const body = document.getElementById('pos-sales-tbody');
        if (!body) return;
        const sales = await fetchPosSalesToday();
        body.innerHTML = sales.length
            ? sales.map(posSaleRowHtml).join('')
            : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:16px 0;">No sales yet today.</td></tr>';
        applyRoleVisibility(sessionAdmin?.role); // re-apply gating to freshly-rendered Actions cells
    }

    async function voidPosSale(id) {
        if (!guardPermission('pos:refund', "You don't have permission to void a sale.")) return;
        if (!confirm('Void this sale? This cannot be undone.')) return;
        try {
            const res = await fetch(`${API_BASE}/pos/sales/${id}/void`, { method: 'PUT', credentials: 'include' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to void sale.');
            renderPosSalesTable();
        } catch (err) {
            alert(err.message);
        }
    }
    window.voidPosSale = voidPosSale;

    document.getElementById('pos-checkout-btn')?.addEventListener('click', async () => {
        if (!posCart.length) { alert('Add at least one item before completing the sale.'); return; }
        const btn = document.getElementById('pos-checkout-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Processing…';
        try {
            const res = await fetch(`${API_BASE}/pos/sales`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: posCart.map(it => ({ name: it.name, price: it.price, quantity: it.qty })),
                    discount: Number(document.getElementById('pos-discount').value) || 0,
                    paymentMethod: document.getElementById('pos-payment-method').value,
                    note: document.getElementById('pos-note').value.trim(),
                }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to complete sale.');

            posCart = [];
            document.getElementById('pos-discount').value = '0';
            document.getElementById('pos-note').value = '';
            renderPosCart();
            renderPosSalesTable();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    function renderPOS() {
        if (!guardPermission('pos:access', "You don't have permission to access the POS.")) {
            switchPanel('dashboard');
            return;
        }
        renderPosCart();
        renderPosSalesTable();
    }

    /* ══════════════════════════════════════════
    ── SETTINGS: Operating Hours, Holidays, Announcements ──
    Wires the previously-static "Operating Schedule" / "Holiday & Closure
    Dates" / new "Announcements" tab to the real GET/PUT /api/settings*
    endpoints in settingsRoutes.js, so what admins set here is exactly what
    guests see on the public homepage and booking calendar.
    ══════════════════════════════════════════ */
    async function fetchAdminSettings() {
        try {
            const res = await fetch(`${API_BASE}/settings/admin`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load settings.');
            return await res.json();
        } catch (err) {
            console.error(err);
            return null;
        }
    }

    async function loadOperatingSettings() {
        const settings = await fetchAdminSettings();
        if (!settings) return;

        const oh = settings.operatingHours || {};
        const openTimeEl = document.getElementById('op-open-time');
        const closeTimeEl = document.getElementById('op-close-time');
        const maxAdvEl = document.getElementById('op-max-advance');
        const cutoffEl = document.getElementById('op-cutoff-hours');
        if (openTimeEl) openTimeEl.value = oh.openTime || '06:00';
        if (closeTimeEl) closeTimeEl.value = oh.closeTime || '22:00';
        if (maxAdvEl) maxAdvEl.value = String(oh.maxAdvanceDays || 30);
        if (cutoffEl) cutoffEl.value = String(oh.bookingCutoffHours ?? 2);

        const openDays = Array.isArray(oh.openDays) ? oh.openDays : [0, 1, 2, 3, 4, 5, 6];
        document.querySelectorAll('#op-day-row .day-pill').forEach(pill => {
            pill.classList.toggle('on', openDays.includes(Number(pill.dataset.day)));
        });

        renderHolidayList(settings.holidays || []);
    }

    function renderHolidayList(holidays) {
        const list = document.getElementById('holiday-list');
        if (!list) return;
        if (!holidays.length) {
            list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:12px 0;">No holidays or closures added yet.</div>';
            return;
        }
        const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
        list.innerHTML = sorted.map(h => {
            const dateLabel = new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            return `
                <div class="holiday-item">
                    <i class="ti ti-calendar-off ico"></i>
                    <div><div class="holiday-name">${escapeHtml(h.name)}</div><div class="holiday-date">${dateLabel} — ${h.fullDay ? 'Full Day Closure' : 'Partial'}</div></div>
                    <button class="holiday-del" type="button" onclick="deleteHoliday('${h._id}')" ${guardAdminHasPermission('settings:manage') ? '' : 'style="display:none;"'}><i class="ti ti-trash"></i></button>
                </div>
            `;
        }).join('');
    }

    // Small alias so template strings above read cleanly without risking a
    // name clash with the existing hasAdminPermission() used elsewhere.
    function guardAdminHasPermission(p) { return hasAdminPermission(p); }

    // Note: clicking a day-pill to toggle it "on"/"off" is already handled by
    // the pre-existing generic .day-pill listener above (Day pill toggles) —
    // no separate handler is needed here, we just read .day-pill.on states
    // when Save is clicked below.

    document.getElementById('op-save-btn')?.addEventListener('click', async () => {
        if (!guardPermission('settings:manage', "You don't have permission to change operating hours.")) return;
        const btn = document.getElementById('op-save-btn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
            const openDays = Array.from(document.querySelectorAll('#op-day-row .day-pill.on')).map(p => Number(p.dataset.day));
            const res = await fetch(`${API_BASE}/settings/operating-hours`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    openTime: document.getElementById('op-open-time').value,
                    closeTime: document.getElementById('op-close-time').value,
                    openDays,
                    maxAdvanceDays: Number(document.getElementById('op-max-advance').value),
                    bookingCutoffHours: Number(document.getElementById('op-cutoff-hours').value),
                }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to save.');
            btn.textContent = 'Saved ✓';
            setTimeout(() => { btn.textContent = originalText; }, 1500);
        } catch (err) {
            alert(err.message);
            btn.textContent = originalText;
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('add-holiday-btn')?.addEventListener('click', async () => {
        if (!guardPermission('settings:manage', "You don't have permission to add holidays.")) return;
        const name = prompt('Holiday / closure name (e.g. "Christmas Day"):');
        if (!name) return;
        const date = prompt('Date (YYYY-MM-DD):');
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('Please enter the date as YYYY-MM-DD.'); return; }
        try {
            const res = await fetch(`${API_BASE}/settings/holidays`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, date, fullDay: true }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to add holiday.');
            loadOperatingSettings();
        } catch (err) {
            alert(err.message);
        }
    });

    async function deleteHoliday(id) {
        if (!guardPermission('settings:manage', "You don't have permission to remove holidays.")) return;
        if (!confirm('Remove this holiday/closure date?')) return;
        try {
            const res = await fetch(`${API_BASE}/settings/holidays/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to remove holiday.');
            loadOperatingSettings();
        } catch (err) {
            alert(err.message);
        }
    }
    window.deleteHoliday = deleteHoliday;

    async function renderAnnouncementsList() {
        const list = document.getElementById('announcements-list');
        if (!list) return;
        const settings = await fetchAdminSettings();
        const items = settings?.announcements || [];

        if (!items.length) {
            list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:12px 0;">No announcements yet.</div>';
            return;
        }

        const canManage = hasAdminPermission('settings:manage');
        list.innerHTML = items.map(a => `
            <div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:12px;">
                <span style="font-size:1.2rem;">${escapeHtml(a.emoji || '📣')}</span>
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:.85rem;color:#fff;">${escapeHtml(a.title)}</div>
                    <div style="font-size:.78rem;color:var(--muted);">${escapeHtml(a.message)}</div>
                </div>
                <span class="pill ${a.isActive ? 'pill-active' : 'pill-pending'}">${a.isActive ? 'Active' : 'Inactive'}</span>
                ${canManage ? `
                    <button type="button" class="rm-btn" onclick="toggleAnnouncement('${a._id}', ${!a.isActive})">${a.isActive ? 'Disable' : 'Enable'}</button>
                    <button type="button" class="rm-btn danger" onclick="deleteAnnouncement('${a._id}')"><i class="ti ti-trash"></i></button>
                ` : ''}
            </div>
        `).join('');
    }

    document.getElementById('add-announcement-btn')?.addEventListener('click', async () => {
        if (!guardPermission('settings:manage', "You don't have permission to post announcements.")) return;
        const title = prompt('Announcement title (e.g. "Weekend Promo"):');
        if (!title) return;
        const message = prompt('Announcement message (shown to every visitor):');
        if (!message) return;
        try {
            const res = await fetch(`${API_BASE}/settings/announcements`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, message }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to post announcement.');
            renderAnnouncementsList();
        } catch (err) {
            alert(err.message);
        }
    });

    async function toggleAnnouncement(id, isActive) {
        if (!guardPermission('settings:manage', "You don't have permission to change announcements.")) return;
        try {
            const res = await fetch(`${API_BASE}/settings/announcements/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to update.');
            renderAnnouncementsList();
        } catch (err) {
            alert(err.message);
        }
    }
    window.toggleAnnouncement = toggleAnnouncement;

    async function deleteAnnouncement(id) {
        if (!guardPermission('settings:manage', "You don't have permission to delete announcements.")) return;
        if (!confirm('Delete this announcement?')) return;
        try {
            const res = await fetch(`${API_BASE}/settings/announcements/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to delete.');
            renderAnnouncementsList();
        } catch (err) {
            alert(err.message);
        }
    }
    window.deleteAnnouncement = deleteAnnouncement;

    /* ══════════════════════════════════════════
    ── SETTINGS: Payment Methods (GCash/Maya/etc buttons + QR shown on the
    booking page's down-payment step) ──
    Wires Settings > Payment Methods to GET /api/settings/admin (for the
    full list, active or not) and the POST/PUT/DELETE
    /api/settings/payment-methods* endpoints in settingsRoutes.js. Toggling
    "Available to guests" off just flips isActive — the button disappears
    from the public booking page (GET /api/settings only returns active
    ones) without losing the QR image or history, so it can be switched
    back on later.
    ══════════════════════════════════════════ */
    function resolvePaymentQrUrl(image) {
        if (!image) return '';
        // New uploads are absolute Cloudinary URLs. The two seeded defaults
        // (GCash/Maya) are paths relative to this FrontEnd folder itself
        // (e.g. "assets/pictures/gcash-qr.png"), NOT the backend — so, unlike
        // room images, these must never be prefixed with SERVER_ORIGIN.
        return image;
    }

    async function renderPaymentMethodsList() {
        const list = document.getElementById('payment-methods-list');
        if (!list) return;
        const settings = await fetchAdminSettings();
        const items = settings?.paymentMethods || [];

        if (!items.length) {
            list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:12px 0;grid-column:1/-1;">No payment methods yet — add one so guests can choose how to pay their down payment.</div>';
            return;
        }

        const canManage = hasAdminPermission('settings:manage');
        list.innerHTML = items.map(pm => `
            <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    ${pm.qrImage
                        ? `<img src="${resolvePaymentQrUrl(pm.qrImage)}" alt="${escapeHtml(pm.name)} QR" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--navy4);">`
                        : `<div style="width:44px;height:44px;border-radius:8px;background:var(--navy4);display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="ti ti-qrcode"></i></div>`
                    }
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:.88rem;color:#fff;">${escapeHtml(pm.name)}</div>
                        <span class="pill ${pm.isActive ? 'pill-active' : 'pill-pending'}">${pm.isActive ? 'Available to guests' : 'Unavailable'}</span>
                    </div>
                </div>
                ${canManage ? `
                    <div style="display:flex;gap:6px;">
                        <button type="button" class="rm-btn" style="flex:1;" onclick='openPaymentMethodModal(${JSON.stringify(pm).replace(/'/g, "&#39;")})'><i class="ti ti-edit"></i> Edit</button>
                        <button type="button" class="rm-btn" onclick="togglePaymentMethodActive('${pm._id}', ${!pm.isActive})">${pm.isActive ? 'Disable' : 'Enable'}</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    let currentPaymentMethodId = null;
    let selectedPaymentQrFile = null;

    function setPaymentQrPreview(url) {
        const preview = document.getElementById('pm-image-preview');
        const icon = document.getElementById('pm-upload-icon');
        const title = document.getElementById('pm-upload-title');
        if (url) {
            preview.src = url;
            preview.style.display = 'block';
            icon.style.display = 'none';
            title.textContent = 'Click to change QR code image';
        } else {
            preview.style.display = 'none';
            icon.style.display = '';
            title.textContent = 'Click to upload QR code image';
        }
    }

    function openPaymentMethodModal(data) {
        if (!guardPermission('settings:manage', "You don't have permission to manage payment methods.")) return;
        data = data || {};
        const isEdit = !!data._id;
        currentPaymentMethodId = isEdit ? data._id : null;
        selectedPaymentQrFile = null;

        document.getElementById('pm-title').textContent = isEdit ? 'Edit Payment Method' : 'Add Payment Method';
        document.getElementById('pm-name').value = data.name || '';
        document.getElementById('pm-image-input').value = '';
        setPaymentQrPreview(data.qrImage ? resolvePaymentQrUrl(data.qrImage) : '');
        const toggle = document.getElementById('pm-active-toggle');
        const isActive = isEdit ? !!data.isActive : true;
        toggle.classList.toggle('on', isActive);
        toggle.classList.toggle('off', !isActive);
        document.getElementById('pm-remove-btn').style.display = isEdit ? 'inline-block' : 'none';
        document.getElementById('pm-save-btn').textContent = isEdit ? 'Save Changes' : 'Add Payment Method';

        document.getElementById('payment-method-modal').classList.add('open');
    }
    window.openPaymentMethodModal = openPaymentMethodModal;

    function closePaymentMethodModal() {
        document.getElementById('payment-method-modal').classList.remove('open');
        currentPaymentMethodId = null;
        selectedPaymentQrFile = null;
    }
    document.getElementById('payment-method-modal')?.addEventListener('click', function(e) {
        if (e.target === this) closePaymentMethodModal();
    });

    document.getElementById('add-payment-method-btn')?.addEventListener('click', () => openPaymentMethodModal());

    document.getElementById('pm-image-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) { selectedPaymentQrFile = null; return; }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            alert('Please choose a PNG, JPG, or WEBP image.');
            e.target.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be under 5MB.');
            e.target.value = '';
            return;
        }
        selectedPaymentQrFile = file;
        setPaymentQrPreview(URL.createObjectURL(file));
    });

    async function savePaymentMethod() {
        if (!guardPermission('settings:manage', "You don't have permission to manage payment methods.")) return;
        const name = document.getElementById('pm-name').value.trim();
        if (!name) { alert('Please enter a name for this payment method (e.g. "GCash").'); return; }
        const isActive = document.getElementById('pm-active-toggle').classList.contains('on');

        const btn = document.getElementById('pm-save-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Saving…';
        btn.disabled = true;

        try {
            const url = currentPaymentMethodId
                ? `${API_BASE}/settings/payment-methods/${currentPaymentMethodId}`
                : `${API_BASE}/settings/payment-methods`;
            const method = currentPaymentMethodId ? 'PUT' : 'POST';

            const formData = new FormData();
            formData.append('name', name);
            formData.append('isActive', String(isActive));
            if (selectedPaymentQrFile) formData.append('qrImage', selectedPaymentQrFile);

            const res = await fetch(url, { method, credentials: 'include', body: formData });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to save payment method.');

            closePaymentMethodModal();
            renderPaymentMethodsList();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
    window.savePaymentMethod = savePaymentMethod;

    async function removePaymentMethod() {
        if (!currentPaymentMethodId) return closePaymentMethodModal();
        if (!guardPermission('settings:manage', "You don't have permission to manage payment methods.")) return;
        if (!confirm('Remove this payment method? Guests will no longer be able to choose it.')) return;
        try {
            const res = await fetch(`${API_BASE}/settings/payment-methods/${currentPaymentMethodId}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to remove payment method.');
            closePaymentMethodModal();
            renderPaymentMethodsList();
        } catch (err) {
            alert(err.message);
        }
    }
    window.removePaymentMethod = removePaymentMethod;

    async function togglePaymentMethodActive(id, isActive) {
        if (!guardPermission('settings:manage', "You don't have permission to manage payment methods.")) return;
        try {
            const formData = new FormData();
            formData.append('isActive', String(isActive));
            const res = await fetch(`${API_BASE}/settings/payment-methods/${id}`, { method: 'PUT', credentials: 'include', body: formData });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to update.');
            renderPaymentMethodsList();
        } catch (err) {
            alert(err.message);
        }
    }
    window.togglePaymentMethodActive = togglePaymentMethodActive;