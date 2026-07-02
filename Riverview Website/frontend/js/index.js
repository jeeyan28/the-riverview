const API_BASE = 'http://localhost:3000/api';
const SERVER_ORIGIN = API_BASE.replace(/\/api$/, '');

function resolveImageUrl(image) {
    if (!image) return '';
    if (image.startsWith('http://') || image.startsWith('https://')) return image;
    return `${SERVER_ORIGIN}${image}`;
}

const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobile-nav');
const navClose = document.getElementById('nav-close');

function openMobileNav() {
    mobileNav.classList.add('open');
    document.body.style.overflow = 'hidden';
    hamburger.classList.add('active');
}
function closeMobileNav() {
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
    hamburger.classList.remove('active');
}

hamburger.addEventListener('click', openMobileNav);
navClose.addEventListener('click', closeMobileNav);

// Header scroll shrink
const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
});

// Active nav link
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('nav a');
window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
        if (window.scrollY >= s.offsetTop - 120) current = s.id;
    });
    navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
});

document.getElementById('login-button').addEventListener('click', function() {
    window.location.href = 'login.html'; // change to your actual login page URL
});

/* =================== ROOM CARDS (live from database) =================== */
// Static per-category display config — image, icon, badge. Add a mapping here
// whenever you introduce a brand-new category in the admin Facilities panel.
const CATEGORY_META = {
    'Billiards':         { image: 'assets/pictures/Billiard.jpg',   icon: 'fa-solid fa-circle-dot', badge: 'Popular' },
    'KTV':               { image: 'assets/pictures/KTV.jpg',        icon: 'fa-solid fa-music',      badge: null },
    'Basketball Court':  { image: 'assets/pictures/basketball.jpg', icon: 'fa-solid fa-basketball',  badge: null },
    'VIP Package':       { image: 'assets/pictures/VIP.jpg',        icon: 'fa-solid fa-crown',       badge: 'Promo' }
};

// Populated by loadRooms(), grouped by category: { "Billiards": [roomDoc, roomDoc, ...], ... }
let ROOMS_BY_CATEGORY = {};

async function loadRooms() {
    const grid = document.getElementById('room-grid');
    try {
        const res = await fetch(`${API_BASE}/rooms`, { });
        if (!res.ok) throw new Error('Failed to load rooms');
        const rooms = (await res.json()).filter(r => r.status !== 'Inactive');

        ROOMS_BY_CATEGORY = {};
        rooms.forEach(r => {
            if (!ROOMS_BY_CATEGORY[r.category]) ROOMS_BY_CATEGORY[r.category] = [];
            ROOMS_BY_CATEGORY[r.category].push(r);
        });

        renderRoomCards();
    } catch (err) {
        console.error(err);
        grid.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;grid-column:1/-1;">Could not load rooms right now. Please try again later.</div>';
    }
}

function renderRoomCards() {
    const grid = document.getElementById('room-grid');
    const categories = Object.keys(ROOMS_BY_CATEGORY);

    if (!categories.length) {
        grid.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;grid-column:1/-1;">No rooms available yet — check back soon.</div>';
        return;
    }

    grid.innerHTML = categories.map(category => {
        const rooms = ROOMS_BY_CATEGORY[category];
        const meta = CATEGORY_META[category] || { image: 'assets/pictures/Billiard.jpg', icon: 'fa-solid fa-circle-dot', badge: null };

        // Prefer the actual uploaded image of the first room in this category;
        // fall back to the static category placeholder only if none was uploaded.
        const roomWithImage = rooms.find(r => r.image);
        const cardImage = roomWithImage ? resolveImageUrl(roomWithImage.image) : meta.image;

        return `
            <div class="room-card">
                <div class="room-card-img">
                    <img src="${cardImage}" alt="${category}">
                    ${meta.badge ? `<span class="room-card-badge">${meta.badge}</span>` : ''}
                </div>
                <div class="room-card-body">
                    <h3>${category}</h3>
                    <ul class="price-list">
                        ${rooms.map(r => `<li><span>${escapeHtml(r.name)}</span> <span class="price-amt">₱${r.price}/hr</span></li>`).join('')}
                    </ul>
                    <a href="#" class="btn-select" onclick="openBooking(event, '${category}')">Select Room</a>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =================== BOOKING MODAL =================== */
const OPEN_HOUR = 7;
const CLOSE_HOUR = 24;

// ---- Reserved-slots lookup, built from real bookings fetched from the API ----
// Keyed by "roomId|YYYY-MM-DD": [hour, hour, ...]
let RESERVED = {};

async function loadAvailability(roomId, dateStr) {
    const key = `${roomId}|${dateStr}`;
    if (RESERVED[key]) return RESERVED[key];

    try {
        const res = await fetch(`${API_BASE}/bookings`);
        if (!res.ok) throw new Error('Failed to load availability');
        const bookings = await res.json();

        RESERVED = {};
        bookings.forEach(b => {
            if (b.status === 'Cancelled') return;
            const k = `${b.room}|${b.date}`;
            const startHour = parseInt(b.timeIn.split(':')[0], 10);
            if (!RESERVED[k]) RESERVED[k] = [];
            for (let h = startHour; h < startHour + b.duration; h++) RESERVED[k].push(h);
        });
    } catch (err) {
        console.error(err);
    }
    return RESERVED[key] || [];
}

let bkState = { category: null, room: null, viewDate: new Date(), selectedDate: null, selectedOption: null, selectedHour: null };

function openBooking(e, category) {
    if (e) e.preventDefault();
    bkState.category = category;
    bkState.room = null;
    bkState.selectedDate = null;
    bkState.selectedOption = null;
    bkState.selectedHour = null;
    bkState.viewDate = new Date();

    const meta = CATEGORY_META[category] || { icon: 'fa-solid fa-circle-dot' };
    document.getElementById('bkRoomName').textContent = category;
    document.getElementById('bkRoomIcon').innerHTML = `<i class="${meta.icon}"></i>`;

    showStep('bkStepPrice');
    renderPriceOptions();
    document.getElementById('booking-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeBooking() {
    document.getElementById('booking-modal').classList.remove('open');
    document.body.style.overflow = '';
}

function showStep(id) {
    ['bkStepCalendar', 'bkStepPrice', 'bkStepSlots', 'bkStepConfirm'].forEach(s => {
        document.getElementById(s).classList.toggle('bk-step--hidden', s !== id);
    });
}

function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderPriceOptions() {
    const rooms = ROOMS_BY_CATEGORY[bkState.category] || [];
    const list = document.getElementById('bkPriceList');
    list.innerHTML = '';

    rooms.forEach(room => {
        const el = document.createElement('div');
        el.className = 'bk-price-card';
        el.innerHTML = `
            <div>
                <p class="bk-price-name">${escapeHtml(room.name)}</p>
                <p class="bk-price-sub">${escapeHtml(room.roomNumber)}${room.description ? ' — ' + escapeHtml(room.description) : ''}</p>
            </div>
            <span class="bk-price-amt">\u20b1${room.price}/hr</span>
        `;
        el.addEventListener('click', () => selectOption(room));
        list.appendChild(el);
    });
}

function selectOption(room) {
    bkState.room = room;
    bkState.selectedOption = { id: room._id, name: room.name, price: room.price };
    document.getElementById('bkCalSelectedOption').textContent = `${room.name} \u00b7 \u20b1${room.price}/hr`;
    bkState.viewDate = new Date();
    renderCalendar();
    showStep('bkStepCalendar');
}

function renderCalendar() {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const y = bkState.viewDate.getFullYear();
    const m = bkState.viewDate.getMonth();
    document.getElementById('bkMonthLabel').textContent = `${months[m]} ${y}`;

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    const grid = document.getElementById('bkCalGrid');
    grid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'bk-day bk-day--empty';
        grid.appendChild(el);
    }

    const totalHours = CLOSE_HOUR - OPEN_HOUR;

    for (let d = 1; d <= daysInMonth; d++) {
        const thisDate = new Date(y, m, d);
        const el = document.createElement('div');
        el.className = 'bk-day';
        el.textContent = d;

        if (thisDate < today) {
            el.classList.add('bk-day--disabled');
        } else {
            el.classList.add('bk-day--open'); // exact availability resolved when a date is clicked
            if (thisDate.getTime() === today.getTime()) el.classList.add('bk-day--today');
            el.addEventListener('click', () => selectDate(y, m, d));
        }
        grid.appendChild(el);
    }
}

async function selectDate(y, m, d) {
    bkState.selectedDate = { y, m, d };
    bkState.selectedHour = null;

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dateObj = new Date(y, m, d);
    const label = `${days[dateObj.getDay()]}, ${months[m]} ${d}`;
    document.getElementById('bkSelectedDate').textContent = label;
    const opt = bkState.selectedOption;
    document.getElementById('bkSelectedOption').textContent = `${opt.name} \u00b7 \u20b1${opt.price}/hr`;

    await renderSlots();
    showStep('bkStepSlots');
}

async function renderSlots() {
    const { y, m, d } = bkState.selectedDate;
    const key = dateKey(y, m, d);
    const reserved = await loadAvailability(bkState.room._id, key);

    const grid = document.getElementById('bkSlotsGrid');
    grid.innerHTML = '';

    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
        const isReserved = reserved.includes(h);
        const label = formatHour(h);
        const el = document.createElement('div');
        el.className = 'bk-slot' + (isReserved ? ' bk-slot--reserved' : '');
        el.textContent = label;
        if (!isReserved) {
            el.addEventListener('click', () => selectHour(h, el));
        }
        grid.appendChild(el);
    }

    document.getElementById('bkGuestName').value = '';
    document.getElementById('bkGuestContact').value = '';
    document.getElementById('bkSummaryText').textContent = 'No time selected yet';
    document.getElementById('bkConfirm').disabled = true;
    document.getElementById('bkConfirm').textContent = 'Confirm \u20b10';
}

function selectHour(h, el) {
    document.querySelectorAll('.bk-slot').forEach(s => s.classList.remove('bk-slot--selected'));
    el.classList.add('bk-slot--selected');
    bkState.selectedHour = h;
    const price = bkState.selectedOption.price;
    document.getElementById('bkSummaryText').textContent = formatHour(h) + ' \u2013 ' + formatHour(h + 1);
    document.getElementById('bkConfirm').disabled = false;
    document.getElementById('bkConfirm').textContent = `Confirm \u20b1${price}`;
}

function formatHour(h) {
    const hh = h % 24;
    const period = hh >= 12 ? 'PM' : 'AM';
    let display = hh % 12;
    if (display === 0) display = 12;
    return `${display}:00 ${period}`;
}

async function confirmBooking() {
    const guestName = document.getElementById('bkGuestName').value.trim();
    const guestContact = document.getElementById('bkGuestContact').value.trim();

    if (!guestName || !guestContact) {
        alert('Please enter your name and a phone number or email so we can confirm your booking.');
        return;
    }

    const { y, m, d } = bkState.selectedDate;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const room = bkState.room;
    const opt = bkState.selectedOption;
    const dateStr = dateKey(y, m, d);
    const timeStr = `${String(bkState.selectedHour).padStart(2, '0')}:00`;

    const confirmBtn = document.getElementById('bkConfirm');
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = 'Booking…';
    confirmBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guestName,
                guestContact,
                roomId: room._id,
                date: dateStr,
                timeIn: timeStr,
                duration: 1,
                paymentMethod: 'Cash',
                status: 'Pending'
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Could not complete your booking.');
        }

        const text = `${room.name} (${opt.name}) \u2014 ${months[m]} ${d}, ${y} at ${formatHour(bkState.selectedHour)} \u00b7 \u20b1${opt.price}`;
        document.getElementById('bkConfirmDetails').textContent = text;
        showStep('bkStepConfirm');

        // Clear the cached availability for this room/date so the next lookup is fresh
        delete RESERVED[`${room._id}|${dateStr}`];
    } catch (err) {
        console.error(err);
        alert(err.message || 'Something went wrong submitting your booking. Please try again.');
    } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
    }
}

// ---- wire up events ----
document.getElementById('bkClose').addEventListener('click', closeBooking);
document.getElementById('booking-modal').addEventListener('click', (e) => {
    if (e.target.id === 'booking-modal') closeBooking();
});
document.getElementById('bkPrevMonth').addEventListener('click', () => {
    bkState.viewDate.setMonth(bkState.viewDate.getMonth() - 1);
    renderCalendar();
});
document.getElementById('bkNextMonth').addEventListener('click', () => {
    bkState.viewDate.setMonth(bkState.viewDate.getMonth() + 1);
    renderCalendar();
});
document.getElementById('bkBackToPriceFromCal').addEventListener('click', () => showStep('bkStepPrice'));
document.getElementById('bkBackToCal').addEventListener('click', () => showStep('bkStepCalendar'));
document.getElementById('bkConfirm').addEventListener('click', confirmBooking);
document.getElementById('bkDone').addEventListener('click', closeBooking);

/* ── Initial load ── */
loadRooms();