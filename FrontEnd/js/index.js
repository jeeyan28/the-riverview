const API_BASE = 'http://localhost:3000/api';
const SERVER_ORIGIN = API_BASE.replace(/\/api$/, '');

function resolveImageUrl(image) {
    if (!image) return '';
    if (image.startsWith('http://') || image.startsWith('https://')) return image;
    return `${SERVER_ORIGIN}${image}`;
}

/* =================== THEME TOGGLE =================== */
const THEME_KEY = 'riverview-theme';

function updateThemeIcons(theme) {
    const iconClass = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    const icon = document.getElementById('themeIcon');
    const iconMobile = document.getElementById('themeIconMobile');
    if (icon) icon.className = iconClass;
    if (iconMobile) iconMobile.className = iconClass;
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeIcons(theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
document.getElementById('theme-toggle-mobile')?.addEventListener('click', toggleTheme);

// sync icon on load (theme itself is already set by the inline head script)
updateThemeIcons(document.documentElement.getAttribute('data-theme') || 'light');

/* =================== PROMO ANNOUNCEMENT BANNER =================== */
const PROMO_DISMISS_KEY = 'riverview-promo-dismissed';

function setBannerHeightVar() {
    const banner = document.getElementById('promo-banner');
    if (!banner) return;
    const hidden = banner.classList.contains('is-hidden');
    const height = hidden ? 0 : banner.offsetHeight;
    document.documentElement.style.setProperty('--banner-h', `${height}px`);
}

function initPromoBanner() {
    const banner = document.getElementById('promo-banner');
    const closeBtn = document.getElementById('promoClose');
    if (!banner) return;

    if (sessionStorage.getItem(PROMO_DISMISS_KEY) === '1') {
        banner.classList.add('is-hidden');
    }
    setBannerHeightVar();

    closeBtn?.addEventListener('click', () => {
        banner.classList.add('is-hidden');
        sessionStorage.setItem(PROMO_DISMISS_KEY, '1');
        setBannerHeightVar();
    });

    window.addEventListener('resize', setBannerHeightVar);
}

initPromoBanner();

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

const header = document.getElementById('site-header');
window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
});

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
    window.location.href = 'login.html';
});

/* =================== AUTH HEADER (logged-in vs logged-out) =================== */
const USER_KEY = 'riverview_user';

function getStoredUser() {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function logoutUser() {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = 'index.html';
}

function initAuthHeader() {
    const user = getStoredUser();

    const loginBtn = document.getElementById('login-button');
    const chip = document.getElementById('user-chip');
    const chipAvatar = document.getElementById('user-chip-avatar');
    const chipName = document.getElementById('user-chip-name');
    const mobileProfileLink = document.getElementById('mobile-profile-link');
    const mobileLogoutBtn = document.getElementById('mobile-logout-button');

    const loggedIn = !!user;

    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : '';
    if (chip) chip.style.display = loggedIn ? 'flex' : 'none';
    if (mobileProfileLink) mobileProfileLink.style.display = loggedIn ? 'block' : 'none';
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = loggedIn ? 'inline-block' : 'none';

    if (loggedIn) {
        const initial = (user.firstname || user.name || user.email || 'U').trim().charAt(0).toUpperCase();
        if (chipAvatar) chipAvatar.textContent = initial || 'U';
        if (chipName) chipName.textContent = user.firstname || user.name || 'Account';
    }
}

document.getElementById('user-chip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-chip-menu')?.classList.toggle('open');
});
document.addEventListener('click', () => {
    document.getElementById('user-chip-menu')?.classList.remove('open');
});

document.getElementById('logout-button')?.addEventListener('click', logoutUser);
document.getElementById('mobile-logout-button')?.addEventListener('click', logoutUser);

initAuthHeader();

/* =================== HERO IMAGE CAROUSEL =================== */
const HERO_CAROUSEL_INTERVAL_MS = 4000; // change slide every 4 seconds

function initHeroCarousel() {
    const carousel = document.getElementById('heroCarousel');
    const track = document.getElementById('heroCarouselTrack');
    const dotsWrap = document.getElementById('heroCarouselDots');
    if (!carousel || !track || !dotsWrap) return;

    const slides = Array.from(track.querySelectorAll('.hero-carousel-slide'));
    if (!slides.length) return;

    let current = Math.max(0, slides.findIndex(s => s.classList.contains('is-active')));
    if (current === -1) current = 0;
    let timer = null;

    // build dots
    const dots = slides.map((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'hero-carousel-dot' + (i === current ? ' is-active' : '');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.addEventListener('click', () => {
            goTo(i);
            restart();
        });
        dotsWrap.appendChild(dot);
        return dot;
    });

    function goTo(index) {
        slides[current].classList.remove('is-active');
        dots[current].classList.remove('is-active');
        current = (index + slides.length) % slides.length;
        slides[current].classList.add('is-active');
        dots[current].classList.add('is-active');
    }

    function next() { goTo(current + 1); }

    function start() {
        timer = setInterval(next, HERO_CAROUSEL_INTERVAL_MS);
    }
    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
    }
    function restart() { stop(); start(); }

    // pause on hover/focus so people can actually look at a photo, resume after
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);

    start();
}

initHeroCarousel();

/* =================== ROOM CARDS (live from database) =================== */
const statusPillClass = {
    Available: 'room-status-available', Occupied: 'room-status-occupied',
    'Under Maintenance': 'room-status-maintenance', Inactive: 'room-status-inactive'
};

// Flat list of facility docs — no more category grouping
let ROOMS = [];

async function loadRooms() {
    const grid = document.getElementById('room-grid');
    try {
        const res = await fetch(`${API_BASE}/rooms`);
        if (!res.ok) throw new Error('Failed to load rooms');
        ROOMS = (await res.json()).filter(r => r.status !== 'Inactive');
        renderRoomCards();
    } catch (err) {
        console.error(err);
        grid.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;grid-column:1/-1;">Could not load rooms right now. Please try again later.</div>';
    }
}


function renderRoomCards() {
    const grid = document.getElementById('room-grid');

    if (!ROOMS.length) {
        grid.innerHTML = '<div style="text-align:center;color:#888;padding:32px 0;grid-column:1/-1;">No rooms available yet — check back soon.</div>';
        return;
    }

    grid.innerHTML = ROOMS.map(room => {
        const hasVariants = room.variants && room.variants.length > 0;
        const cardImage = room.image ? resolveImageUrl(room.image) : 'assets/pictures/Billiard.jpg';

        const featuresHtml = (room.features && room.features.length)
        ? `<div class="room-card-features">${room.features.map(f => `<span class="room-feature-chip">${escapeHtml(f)}</span>`).join('')}</div>`
        : '';
        
        const priceListHtml = hasVariants
            ? room.variants.map(v => `<li><span>${escapeHtml(v.label)}${v.pax ? ' · ' + escapeHtml(v.pax) : ''}</span> <span class="price-amt">₱${v.price}/hr</span></li>`).join('')
            : `<li><span>Standard</span> <span class="price-amt">₱${room.price || 0}/hr</span></li>`;

        return `
            <div class="room-card">
                <div class="room-card-img">
                    <img src="${cardImage}" alt="${escapeHtml(room.name)}">
                </div>
                <div class="room-card-body">
                    <h3>${escapeHtml(room.name)}</h3>
                    <ul class="price-list">${priceListHtml}</ul>
                    <p class="room-card-desc">${escapeHtml(room.description || '')}</p>
                    ${featuresHtml}
                    <span class="room-card-status ${statusPillClass[room.status] || 'room-status-available'}">${escapeHtml(room.status)}</span>
                    <a href="#" class="btn-select" onclick="openBooking(event, '${room._id}')">Select Room</a>
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

let bkState = { room: null, viewDate: new Date(), selectedDate: null, selectedVariant: null, selectedHour: null, selectedDuration: 1 };

function openBooking(e, roomId) {
    if (e) e.preventDefault();
    const room = ROOMS.find(r => r._id === roomId);
    if (!room) return;

    bkState.room = room;
    bkState.selectedDate = null;
    bkState.selectedVariant = null;
    bkState.selectedHour = null;
    bkState.viewDate = new Date();

    document.getElementById('bkRoomName').textContent = room.name;
    document.getElementById('bkRoomIcon').innerHTML = `<i class="fa-solid fa-circle-dot"></i>`;

    showStep('bkStepPrice');
    renderPriceOptions();
    document.getElementById('booking-modal').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Pre-fill guest details if the person is logged in
    const user = getStoredUser();
    if (user) {
        const nameField = document.getElementById('bkGuestName');
        const contactField = document.getElementById('bkGuestContact');
        if (nameField && !nameField.value) {
            nameField.value = [user.firstname, user.lastname].filter(Boolean).join(' ') || user.name || '';
        }
        if (contactField && !contactField.value) {
            contactField.value = user.phone || user.email || '';
        }
    }
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
    const room = bkState.room;
    const options = (room.variants && room.variants.length)
        ? room.variants
        : [{ label: 'Standard', price: room.price || 0, pax: '' }];

    const list = document.getElementById('bkPriceList');
    list.innerHTML = '';

    options.forEach(opt => {
        const el = document.createElement('div');
        el.className = 'bk-price-card';
        el.innerHTML = `
            <div>
                <p class="bk-price-name">${escapeHtml(opt.label)}</p>
                <p class="bk-price-sub">${opt.pax ? escapeHtml(opt.pax) : ''}</p>
            </div>
            <span class="bk-price-amt">\u20b1${opt.price}/hr</span>
        `;
        el.addEventListener('click', () => selectOption(opt));
        list.appendChild(el);
    });
}

function selectOption(opt) {
    bkState.selectedVariant = opt;
    document.getElementById('bkCalSelectedOption').textContent = `${opt.label} \u00b7 \u20b1${opt.price}/hr`;
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

    for (let d = 1; d <= daysInMonth; d++) {
        const thisDate = new Date(y, m, d);
        const el = document.createElement('div');
        el.className = 'bk-day';
        el.textContent = d;

        if (thisDate < today) {
            el.classList.add('bk-day--disabled');
        } else {
            el.classList.add('bk-day--open');
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
    const opt = bkState.selectedVariant;
    document.getElementById('bkSelectedOption').textContent = `${opt.label} \u00b7 \u20b1${opt.price}/hr`;

    await renderSlots();
    showStep('bkStepSlots');
}

async function renderSlots() {
    const { y, m, d } = bkState.selectedDate;
    const key = dateKey(y, m, d);
    const reserved = await loadAvailability(bkState.room._id, key);

    bkState.selectedHour = null;
    bkState.selectedDuration = 1;

    renderDurationOptions();
    renderSlotGrid(reserved);

    const nameField = document.getElementById('bkGuestName');
    const contactField = document.getElementById('bkGuestContact');
    const user = getStoredUser();
    if (user) {
        nameField.value = [user.firstname, user.lastname].filter(Boolean).join(' ') || user.name || '';
        contactField.value = user.phone || user.email || '';
    } else {
        nameField.value = '';
        contactField.value = '';
    }
    document.getElementById('bkSummaryText').textContent = 'No time selected yet';
    document.getElementById('bkConfirm').disabled = true;
    document.getElementById('bkConfirm').textContent = 'Confirm ₱0';
}

function maxDurationFrom(h, reserved) {
    let max = 0;
    for (let t = h; t < CLOSE_HOUR; t++) {
        if (reserved.includes(t)) break;
        max++;
    }
    return max;
}

function renderDurationOptions() {
    const wrap = document.getElementById('bkDurationOptions');
    wrap.innerHTML = '';
    const MAX_DURATION = 5;
    for (let dur = 1; dur <= MAX_DURATION; dur++) {
        const btn = document.createElement('div');
        btn.className = 'bk-duration-btn' + (dur === bkState.selectedDuration ? ' bk-duration-btn--selected' : '');
        btn.textContent = `${dur}h`;
        btn.addEventListener('click', () => {
            bkState.selectedDuration = dur;
            bkState.selectedHour = null;
            renderDurationOptions();
            loadAvailability(bkState.room._id, dateKey(bkState.selectedDate.y, bkState.selectedDate.m, bkState.selectedDate.d))
                .then(renderSlotGrid);
            resetSummary();
        });
        wrap.appendChild(btn);
    }
}

function renderSlotGrid(reserved) {
    const grid = document.getElementById('bkSlotsGrid');
    grid.innerHTML = '';
    const duration = bkState.selectedDuration;

    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
        const fits = maxDurationFrom(h, reserved) >= duration;
        const el = document.createElement('div');
        el.className = 'bk-slot' + (!fits ? ' bk-slot--reserved' : '');
        el.textContent = formatHour(h);
        if (fits) {
            el.addEventListener('click', () => selectHour(h, duration));
        }
        grid.appendChild(el);
    }
}

function resetSummary() {
    document.querySelectorAll('.bk-slot').forEach(s => s.classList.remove('bk-slot--selected'));
    document.getElementById('bkSummaryText').textContent = 'No time selected yet';
    document.getElementById('bkConfirm').disabled = true;
    document.getElementById('bkConfirm').textContent = 'Confirm ₱0';
}

function selectHour(h, duration) {
    bkState.selectedHour = h;
    bkState.selectedDuration = duration;

    document.querySelectorAll('.bk-slot').forEach((el, idx) => {
        const slotHour = OPEN_HOUR + idx;
        el.classList.toggle('bk-slot--selected', slotHour >= h && slotHour < h + duration);
    });

    const price = bkState.selectedVariant.price * duration;
    document.getElementById('bkSummaryText').textContent =
        `${formatHour(h)} – ${formatHour(h + duration)} (${duration}h)`;
    document.getElementById('bkConfirm').disabled = false;
    document.getElementById('bkConfirm').textContent = `Confirm ₱${price}`;
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
    const opt = bkState.selectedVariant;
    const dateStr = dateKey(y, m, d);
    const timeStr = `${String(bkState.selectedHour).padStart(2, '0')}:00`;
    const duration = bkState.selectedDuration;

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
                variantLabel: opt.label,
                date: dateStr,
                timeIn: timeStr,
                duration: duration,
                paymentMethod: 'Cash',
                status: 'Pending'
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Could not complete your booking.');
        }

        const text = `${room.name} (${opt.label}) — ${months[m]} ${d}, ${y} at ${formatHour(bkState.selectedHour)}–${formatHour(bkState.selectedHour + duration)} · ₱${opt.price * duration}`;
        document.getElementById('bkConfirmDetails').textContent = text;
        showStep('bkStepConfirm');

        delete RESERVED[`${room._id}|${dateStr}`];
    } catch (err) {
        console.error(err);
        alert(err.message || 'Something went wrong submitting your booking. Please try again.');
    } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
    }
}

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

loadRooms();

/* =================== PROFILE MODAL =================== */
/* Append to main.js — it reuses API_BASE, USER_KEY, getStoredUser(),
   logoutUser() and initAuthHeader() that already exist in that file. */

function getStorageArea() {
    return localStorage.getItem(USER_KEY) ? localStorage : sessionStorage;
}
function saveStoredUser(user) {
    getStorageArea().setItem(USER_KEY, JSON.stringify(user));
}

let pfToastTimer;
function pfShowToast(msg, type = 'success') {
    const toast = document.getElementById('pfToast');
    document.getElementById('pfToastMsg').textContent = msg;
    document.getElementById('pfToastIcon').textContent = type === 'success' ? '✅' : '⚠️';
    toast.className = 'pf-toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(pfToastTimer);
    pfToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function pfSetError(fieldId, show) {
    document.getElementById(fieldId)?.classList.toggle('has-error', show);
}

function pfRenderUser(user) {
    const initial = (user.firstname || user.name || user.email || 'U').trim().charAt(0).toUpperCase();
    document.getElementById('pfAvatar').textContent = initial || 'U';
    document.getElementById('pfGreeting').textContent = `Hi, ${user.firstname || 'there'}`;
    document.getElementById('pfEmail').textContent = user.email || '';
    document.getElementById('pfFirstname').value = user.firstname || '';
    document.getElementById('pfLastname').value = user.lastname || '';
    document.getElementById('pfPhone').value = user.phone || '';
    document.getElementById('pfEmailReadonly').value = user.email || '';
}

function openProfileModal() {
    const user = getStoredUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    pfRenderUser(user);
    pfSwitchTab('details');
    document.getElementById('profileModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('open');
    document.body.style.overflow = '';
}

function pfSwitchTab(tab) {
    document.querySelectorAll('.pf-tab').forEach(t => t.classList.toggle('active', t.dataset.pftab === tab));
    document.getElementById('pfDetailsForm').classList.toggle('active', tab === 'details');
    document.getElementById('pfPasswordForm').classList.toggle('active', tab === 'password');
}

function initProfileModal() {
    document.getElementById('pfClose')?.addEventListener('click', closeProfileModal);
    document.getElementById('profileModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'profileModal') closeProfileModal();
    });
    document.querySelectorAll('.pf-tab').forEach(tab => {
        tab.addEventListener('click', () => pfSwitchTab(tab.dataset.pftab));
    });
    document.getElementById('pfLogoutBtn')?.addEventListener('click', logoutUser);

    ['pfCurrentPassword', 'pfNewPassword', 'pfConfirmPassword'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            pfSetError('pfFieldCurrent', false);
            pfSetError('pfFieldNew', false);
            pfSetError('pfFieldConfirm', false);
        });
    });

    document.getElementById('pfDetailsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = getStoredUser();
        if (!user) return;

        const firstname = document.getElementById('pfFirstname').value.trim();
        const lastname = document.getElementById('pfLastname').value.trim();
        const phone = document.getElementById('pfPhone').value.trim();
        const btn = document.getElementById('pfSaveDetailsBtn');
        btn.classList.add('loading');
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/users/${user._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstname, lastname, phone })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Could not update your profile.');

            const updated = { ...user, firstname, lastname, phone };
            saveStoredUser(updated);
            pfRenderUser(updated);
            initAuthHeader();
            pfShowToast('Profile updated.');
        } catch (err) {
            pfShowToast(err.message || 'Could not reach the server.', 'error');
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    });

    document.getElementById('pfPasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = getStoredUser();
        if (!user) return;

        const currentPassword = document.getElementById('pfCurrentPassword').value;
        const newPassword = document.getElementById('pfNewPassword').value;
        const confirmPassword = document.getElementById('pfConfirmPassword').value;

        const currentOk = currentPassword.length > 0;
        const newOk = newPassword.length >= 8;
        const matchOk = newPassword === confirmPassword && confirmPassword.length > 0;

        pfSetError('pfFieldCurrent', !currentOk);
        pfSetError('pfFieldNew', !newOk);
        pfSetError('pfFieldConfirm', !matchOk);
        if (!currentOk || !newOk || !matchOk) return;

        const btn = document.getElementById('pfSavePasswordBtn');
        btn.classList.add('loading');
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/users/${user._id}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Could not update your password.');

            document.getElementById('pfPasswordForm').reset();
            pfShowToast('Password updated.');
        } catch (err) {
            pfShowToast(err.message || 'Could not reach the server.', 'error');
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    });
}

initProfileModal();