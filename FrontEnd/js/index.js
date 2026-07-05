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

/* =================== ANNOUNCEMENT BANNER =================== */
const PROMO_DISMISS_KEY = 'riverview-promo-dismissed';

// Only one banner now (promo + holiday notices merged into it), so this is
// just its own height — kept as a CSS var so the header/body offset stays in sync.
function setBannerHeightVar() {
    const promoBanner = document.getElementById('promo-banner');
    const promoH = (promoBanner && !promoBanner.classList.contains('is-hidden')) ? promoBanner.offsetHeight : 0;
    document.documentElement.style.setProperty('--banner-h', `${promoH}px`);
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

/* =================== LIVE SITE SETTINGS (operating hours / holidays / announcements) ===================
   Populated from GET /api/settings, which is public and requires no login.
   Falls back to "always open, no holidays, static banner text already in
   index.html" if the request fails, so the homepage never breaks because
   this endpoint is briefly unreachable. */
let SITE_SETTINGS = { operatingHours: null, holidays: [], announcements: [], paymentMethods: [] };

async function loadSiteSettings() {
    try {
        const res = await fetch(`${API_BASE}/settings`);
        if (!res.ok) return;
        SITE_SETTINGS = await res.json();
        applyOperatingHours();
        renderAnnouncementBanner();
        if (bkState.room) renderCalendar(); // refresh an already-open calendar with holiday blocks
    } catch (err) {
        console.error(err);
    }
}

function isHolidayDate(dateStr) {
    return (SITE_SETTINGS.holidays || []).some(h => h.date === dateStr && h.fullDay);
}

function isOperatingDay(dateObj) {
    const oh = SITE_SETTINGS.operatingHours;
    if (!oh || !Array.isArray(oh.openDays) || !oh.openDays.length) return true;
    return oh.openDays.includes(dateObj.getDay());
}

// Builds the single top banner line out of TWO sources:
//   1. Upcoming/today holiday & closure dates (from Settings > Operating
//      Schedule > Holiday & Closure Dates)
//   2. Admin-managed promo announcements (Settings > Announcements)
// Combined into ONE line (never stacked banners) — if there is more than one
// item, they're joined with " II " as requested, so it still reads as a
// single strip. Falls back to leaving the existing static markup alone when
// there is nothing to show, rather than leaving a blank bar.
function renderAnnouncementBanner() {
    const banner = document.getElementById('promo-banner');
    const textEl = document.getElementById('promo-text-line');
    if (!banner || !textEl) return;

    const now = new Date();
    const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

    // Holiday/closure items — every upcoming (or today's) full-day closure,
    // soonest first.
    const holidayItems = (SITE_SETTINGS.holidays || [])
        .filter(h => h.fullDay && h.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(h => {
            const isToday = h.date === todayStr;
            const dateLabel = new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            return `<span class="promo-emoji">📅</span> ${isToday ? 'Closed today' : 'Upcoming closure'} — ${escapeHtml(h.name)} (${dateLabel})${h.note ? ': ' + escapeHtml(h.note) : ''}`;
        });

    // Admin promo/announcement items.
    const announcementItems = (SITE_SETTINGS.announcements || [])
        .map(a => `<span class="promo-emoji">${escapeHtml(a.emoji || '📣')}</span> ${escapeHtml(a.title)}: ${escapeHtml(a.message)}`);

    const items = [...holidayItems, ...announcementItems];
    if (!items.length) {
        banner.classList.add('is-hidden');
        setBannerHeightVar();
        return;
    }

    textEl.innerHTML = items.join(' <span class="promo-sep">II</span> ');
    // Full text (no markup) as a tooltip, since the line itself is clipped to one row.
    textEl.title = items.map(i => i.replace(/<[^>]+>/g, '')).join('  II  ');

    // A fresh batch should be visible again even if the visitor dismissed an
    // earlier banner earlier this session.
    if (sessionStorage.getItem(PROMO_DISMISS_KEY) !== '1') {
        banner.classList.remove('is-hidden');
    }
    setBannerHeightVar();
}

loadSiteSettings();

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

async function logoutUser() {
    try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
        // Network hiccup — still clear local state below so the UI reflects
        // logged-out immediately; the session cookie will simply expire later.
        console.error('Logout request failed:', err);
    }
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = 'index.html';
}

// Confirms with the server whether the session cookie is still valid, and
// keeps whichever storage area currently holds the user in sync with the
// answer. Returns the fresh user object, or null if not actually logged in.
async function verifySession() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (!res.ok) {
            localStorage.removeItem(USER_KEY);
            sessionStorage.removeItem(USER_KEY);
            return null;
        }
        const data = await res.json();
        const area = localStorage.getItem(USER_KEY) ? localStorage : sessionStorage;
        area.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
    } catch (err) {
        // Network hiccup — fall back to whatever we last had locally rather
        // than forcing a logout the user didn't ask for.
        return getStoredUser();
    }
}

function initAuthHeader() {
    const user = getStoredUser();

    const loginBtn = document.getElementById('login-button');
    const chip = document.getElementById('user-chip');
    const chipAvatar = document.getElementById('user-chip-avatar');
    const chipName = document.getElementById('user-chip-name');
    const mobileProfileLink = document.getElementById('mobile-profile-link');
    const mobileLogoutBtn = document.getElementById('mobile-logout-button');
    const adminDashboardLink = document.getElementById('admin-dashboard-link');

    const loggedIn = !!user;
    const isAdmin = loggedIn && ['staff', 'manager', 'super_admin'].includes(user.role);

    if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : '';
    if (chip) chip.style.display = loggedIn ? 'flex' : 'none';
    if (mobileProfileLink) mobileProfileLink.style.display = loggedIn ? 'block' : 'none';
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
    // Same session cookie works on admin.html too — no separate admin login needed.
    if (adminDashboardLink) adminDashboardLink.style.display = isAdmin ? 'flex' : 'none';

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

// Render instantly from whatever's cached locally (above), then quietly
// reconcile with the server in the background. This is what keeps the header
// from showing "logged in" for hours after the actual session has expired —
// see the BUGFIX note above confirmBooking() for the full story.
(function reconcileAuthHeader() {
    const before = getStoredUser();
    verifySession().then((user) => {
        if (JSON.stringify(user) !== JSON.stringify(before)) {
            initAuthHeader();
        }
    });
})();

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
        const res = await fetch(`${API_BASE}/rooms`, { credentials: 'include' });
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
// These used to be hardcoded and never looked at the admin's Operating
// Schedule settings at all. They're now kept in sync with SITE_SETTINGS
// (see applyOperatingHours(), called once on load and again whenever
// loadSiteSettings() refreshes) so the booking grid always reflects
// whatever the admin last saved under Settings > Operating Schedule.
let OPEN_HOUR = 7;
let CLOSE_HOUR = 24;

function parseHourFromTimeStr(str, fallback) {
    if (!str || typeof str !== 'string') return fallback;
    const h = parseInt(str.split(':')[0], 10);
    return Number.isFinite(h) ? h : fallback;
}

function applyOperatingHours() {
    const oh = SITE_SETTINGS.operatingHours;
    if (!oh) return;
    OPEN_HOUR = parseHourFromTimeStr(oh.openTime, 7);
    let close = parseHourFromTimeStr(oh.closeTime, 24);
    // "00:00" closing means midnight — treat as end-of-day (24) so the loops
    // below (`for (h = OPEN_HOUR; h < CLOSE_HOUR; h++)`) still work correctly.
    if (close <= OPEN_HOUR) close += 24;
    CLOSE_HOUR = close;
}

let RESERVED = {};

async function loadAvailability(roomId, dateStr) {
    const key = `${roomId}|${dateStr}`;
    if (RESERVED[key]) return RESERVED[key];

    try {
        const res = await fetch(`${API_BASE}/bookings/availability?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(dateStr)}`, {
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Failed to load availability');
        const bookings = await res.json();

        const hours = [];
        bookings.forEach(b => {
            const startHour = parseInt(b.timeIn.split(':')[0], 10);
            for (let h = startHour; h < startHour + b.duration; h++) hours.push(h);
        });
        RESERVED[key] = hours;
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
    ['bkStepCalendar', 'bkStepPrice', 'bkStepSlots', 'bkStepPayment', 'bkStepConfirm'].forEach(s => {
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

    // Operating Schedule settings, applied to the calendar:
    // - maxAdvanceDays caps how far ahead guests can book.
    // - bookingCutoffHours blocks booking TODAY once we're within that many
    //   hours of opening time (e.g. cutoff=2, opens 6AM -> today locks at 4AM).
    const oh = SITE_SETTINGS.operatingHours || {};
    const maxAdvanceDays = Number(oh.maxAdvanceDays) || 30;
    const latestBookable = new Date(today); latestBookable.setDate(latestBookable.getDate() + maxAdvanceDays);

    const now = new Date();
    const cutoffHours = Number(oh.bookingCutoffHours) || 0;
    const todaysOpenTime = new Date(today);
    todaysOpenTime.setHours(OPEN_HOUR, 0, 0, 0);
    const todayCutoffLocked = now < todaysOpenTime && (todaysOpenTime - now) < cutoffHours * 3600000;

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

        const dStr = dateKey(y, m, d);
        const isToday = thisDate.getTime() === today.getTime();
        const beyondWindow = thisDate > latestBookable;
        const cutoffBlocked = isToday && todayCutoffLocked;
        const blocked = isHolidayDate(dStr) || !isOperatingDay(thisDate) || beyondWindow || cutoffBlocked;

        if (thisDate < today || blocked) {
            el.classList.add('bk-day--disabled');
            if (blocked && thisDate >= today) {
                el.title = isHolidayDate(dStr) ? 'Closed for a holiday/closure'
                    : beyondWindow ? `Bookings only open ${maxAdvanceDays} days in advance`
                    : cutoffBlocked ? `Booking cutoff — must book at least ${cutoffHours}h before opening`
                    : 'Closed on this day of the week';
                el.classList.add('bk-day--holiday');
            }
        } else {
            el.classList.add('bk-day--open');
            if (isToday) el.classList.add('bk-day--today');
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
    const guestCountField = document.getElementById('bkGuestCount');
    const guestNoteField = document.getElementById('bkGuestNote');
    if (guestCountField) guestCountField.value = 1;
    if (guestNoteField) guestNoteField.value = '';
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

    const { y, m, d } = bkState.selectedDate;
    const now = new Date();
    const isToday = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
    const currentHour = now.getHours();

    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
        const isPast = isToday && h <= currentHour;
        const fits = !isPast && maxDurationFrom(h, reserved) >= duration;
        const el = document.createElement('div');
        el.className = 'bk-slot' + (!fits ? ' bk-slot--reserved' : '');
        el.textContent = formatHour(h);
        if (isPast) el.title = 'This time has already passed today';
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

// Mirrors the server-side calculation in bookingRoutes.js (computeDownPayment) so
// the amount shown here matches what the backend will actually require. The
// server always recomputes and enforces this itself — this is display-only.
const DOWN_PAYMENT_PERCENT = 0.3;
const MIN_DOWN_PAYMENT = 100;
function computeDownPayment(amount) {
    return Math.max(MIN_DOWN_PAYMENT, Math.round(amount * DOWN_PAYMENT_PERCENT));
}

// Payment method buttons + QR codes for the down-payment step are now
// admin-managed (Settings > Payment Methods in admin.html) instead of
// hardcoded here. They're fetched along with the rest of the public site
// settings in loadSiteSettings() and land in SITE_SETTINGS.paymentMethods —
// see renderPayMethodButtons() below, which builds the buttons dynamically
// so admins can offer two, one, or several methods, and disable/re-enable
// any of them at any time without a code change.

// STEP 1 of confirming: validate guest details, then move to the down-payment step.
// (Actual booking submission now happens in submitPaymentAndBook, once a payment
// screenshot has been attached.)
//
// BUGFIX: this used to gate on getStoredUser() alone, which only reflects what
// THIS tab last wrote to storage — not whether the server still considers the
// visitor logged in. That caused genuinely logged-in users to either get
// wrongly bounced to the login page (e.g. new tab, sessionStorage doesn't
// carry over when "Remember me" wasn't checked) or to pass this check yet
// still get rejected by the server a step later once their 8-hour session
// had actually expired while stale localStorage kept showing them as logged
// in. We now confirm with the server (the source of truth) before continuing.
async function confirmBooking() {
    const guestName = document.getElementById('bkGuestName').value.trim();
    const guestContact = document.getElementById('bkGuestContact').value.trim();
    const guestCount = Math.max(1, parseInt(document.getElementById('bkGuestCount')?.value, 10) || 1);
    const specialRequests = (document.getElementById('bkGuestNote')?.value || '').trim();

    if (!guestName || !guestContact) {
        alert('Please enter your name and a phone number or email so we can confirm your booking.');
        return;
    }

    const confirmBtn = document.getElementById('bkConfirm');
    if (confirmBtn) confirmBtn.disabled = true;
    const user = await verifySession();
    if (confirmBtn) confirmBtn.disabled = false;

    if (!user) {
        alert('Your session has expired. Please log in again to complete your booking.');
        window.location.href = 'login.html';
        return;
    }

    const opt = bkState.selectedVariant;
    const duration = bkState.selectedDuration;
    const amount = opt.price * duration;

    bkState.guestName = guestName;
    bkState.guestContact = guestContact;
    bkState.guestCount = guestCount;
    bkState.specialRequests = specialRequests;
    bkState.amount = amount;
    bkState.screenshotFile = null;

    document.getElementById('bkDownPaymentAmount').textContent = `₱${computeDownPayment(amount).toLocaleString()}`;
    renderPayMethodButtons();
    document.getElementById('bkScreenshotPreview').style.display = 'none';
    document.getElementById('bkScreenshotInput').value = '';
    document.getElementById('bkSubmitPayment').disabled = true;

    showStep('bkStepPayment');
}

// Builds the payment method buttons + wires their click handlers from
// whatever is currently active in admin (SITE_SETTINGS.paymentMethods).
// Re-run every time the down-payment step opens so a method an admin just
// disabled/enabled/added is always reflected, without needing a page reload.
function renderPayMethodButtons() {
    const methods = SITE_SETTINGS.paymentMethods || [];
    const wrap = document.getElementById('bkPayMethods');
    const qrImg = document.getElementById('bkQrImage');
    if (!wrap) return;

    if (!methods.length) {
        wrap.innerHTML = '<p style="font-size:.8rem;color:#b33;">No payment methods are available right now. Please contact us to complete your booking.</p>';
        bkState.selectedPaymentMethod = null;
        qrImg.style.display = 'none';
        return;
    }

    wrap.innerHTML = methods.map((m, i) => `
        <button type="button" class="bk-duration-btn bk-pay-method-btn${i === 0 ? ' bk-duration-btn--selected' : ''}" data-method="${escapeAttr(m.name)}" data-qr="${escapeAttr(m.qrImage || '')}">${escapeAttr(m.name)}</button>
    `).join('');

    bkState.selectedPaymentMethod = methods[0].name;
    qrImg.style.display = 'block';
    qrImg.src = methods[0].qrImage || '';

    wrap.querySelectorAll('.bk-pay-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            bkState.selectedPaymentMethod = btn.dataset.method;
            wrap.querySelectorAll('.bk-pay-method-btn').forEach(b => b.classList.toggle('bk-duration-btn--selected', b === btn));
            qrImg.src = btn.dataset.qr || '';
        });
    });
}

// Minimal HTML-attribute escaper for the template strings above (method
// names are admin-entered free text, so this avoids broken markup if one
// ever contains a quote or angle bracket).
function escapeAttr(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('bkScreenshotInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById('bkScreenshotPreview');
    const submitBtn = document.getElementById('bkSubmitPayment');

    if (!file) {
        bkState.screenshotFile = null;
        preview.style.display = 'none';
        submitBtn.disabled = true;
        return;
    }

    bkState.screenshotFile = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    submitBtn.disabled = false;
});

// STEP 2 of confirming: actually submit the booking, now with the payment screenshot attached.
async function submitPaymentAndBook() {
    const { y, m, d } = bkState.selectedDate;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const room = bkState.room;
    const opt = bkState.selectedVariant;
    const dateStr = dateKey(y, m, d);
    const timeStr = `${String(bkState.selectedHour).padStart(2, '0')}:00`;
    const duration = bkState.selectedDuration;

    if (!bkState.selectedPaymentMethod) {
        alert('No payment method is available right now. Please contact us to complete your booking.');
        return;
    }
    if (!bkState.screenshotFile) {
        alert('Please upload your payment screenshot before submitting.');
        return;
    }

    const submitBtn = document.getElementById('bkSubmitPayment');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';
    submitBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('guestName', bkState.guestName);
        formData.append('guestContact', bkState.guestContact);
        formData.append('guestCount', String(bkState.guestCount || 1));
        formData.append('specialRequests', bkState.specialRequests || '');
        formData.append('roomId', room._id);
        formData.append('variantLabel', opt.label);
        formData.append('date', dateStr);
        formData.append('timeIn', timeStr);
        formData.append('duration', String(duration));
        formData.append('paymentMethod', bkState.selectedPaymentMethod);
        formData.append('paymentScreenshot', bkState.screenshotFile);

        // credentials: 'include' is required here — without it the browser never
        // sends the session cookie cross-origin, and the server (correctly) rejects
        // the request as "not logged in" even though the user is signed in.
        const res = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            credentials: 'include',
            body: formData, // no Content-Type header — the browser sets the multipart boundary
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            // Session died between the confirmBooking() check and this submit
            // (e.g. the 8-hour session expired while the user was picking a
            // payment method) — send them to log in instead of a dead-end alert.
            if (res.status === 401) {
                localStorage.removeItem(USER_KEY);
                sessionStorage.removeItem(USER_KEY);
                alert('Your session has expired. Please log in again to complete your booking.');
                window.location.href = 'login.html';
                return;
            }
            throw new Error(err.message || 'Could not complete your booking.');
        }

        const text = `${room.name} (${opt.label}) — ${months[m]} ${d}, ${y} at ${formatHour(bkState.selectedHour)}–${formatHour(bkState.selectedHour + duration)} · Down payment ₱${computeDownPayment(bkState.amount)}`;
        document.getElementById('bkConfirmDetails').textContent = text;
        showStep('bkStepConfirm');

        delete RESERVED[`${room._id}|${dateStr}`];
    } catch (err) {
        console.error(err);
        alert(err.message || 'Something went wrong submitting your booking. Please try again.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
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
document.getElementById('bkBackToSlots').addEventListener('click', () => showStep('bkStepSlots'));
document.getElementById('bkSubmitPayment').addEventListener('click', submitPaymentAndBook);
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
                credentials: 'include',
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
                credentials: 'include',
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