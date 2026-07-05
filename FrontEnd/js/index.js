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

        // Public-facing status is simplified to exactly three states per the
        // room card: "Available", "Fully Booked" (today's slots are all
        // taken — computed live in refreshLiveRoomStatuses()), or
        // "Unavailable" (admin marked it Occupied/Under Maintenance/Inactive).
        // Starts on the admin-set status and is upgraded to "Fully Booked"
        // asynchronously once today's bookings are checked.
        const initiallyAvailable = room.status === 'Available';
        const initialLabel = initiallyAvailable ? 'Available' : 'Unavailable';
        const initialClass = initiallyAvailable ? 'room-status-available' : 'room-status-unavailable';
        const capacity = getRoomCapacity(room);

        return `
            <div class="room-card" data-room-id="${room._id}">
                <div class="room-card-img">
                    <img src="${cardImage}" alt="${escapeHtml(room.name)}">
                </div>
                <div class="room-card-body">
                    <h3>${escapeHtml(room.name)}</h3>
                    ${capacity ? `<p class="room-card-capacity"><i class="fa-solid fa-users"></i> Up to ${capacity} guests</p>` : ''}
                    <ul class="price-list">${priceListHtml}</ul>
                    <p class="room-card-desc">${escapeHtml(room.description || '')}</p>
                    ${featuresHtml}
                    <span class="room-card-status ${initialClass}" id="room-status-badge-${room._id}">${initialLabel}</span>
                    <a href="#" class="btn-select" onclick="openBooking(event, '${room._id}')">Select Room</a>
                </div>
            </div>
        `;
    }).join('');

    refreshLiveRoomStatuses();
}

// Upgrades any "Available" badge to "Fully Booked" if every remaining
// operating hour today is already reserved for that specific room — each
// room's bookings are looked up independently (GET /api/bookings/availability
// filters by roomId), so one room filling up never affects another's badge.
async function refreshLiveRoomStatuses() {
    const now = new Date();
    const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    const currentHour = Math.max(OPEN_HOUR, now.getHours());

    await Promise.all(ROOMS.filter(r => r.status === 'Available').map(async (room) => {
        const badge = document.getElementById(`room-status-badge-${room._id}`);
        if (!badge) return;
        try {
            const reserved = await loadAvailability(room._id, todayStr);
            let fullyBooked = currentHour < CLOSE_HOUR; // only meaningful if there's time left today
            for (let h = currentHour; h < CLOSE_HOUR && fullyBooked; h++) {
                if (!reserved.includes(h)) fullyBooked = false;
            }
            if (fullyBooked) {
                badge.textContent = 'Fully Booked';
                badge.className = 'room-card-status room-status-fullybooked';
            }
        } catch (err) {
            console.error(err);
        }
    }));
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

    // Reset the Pax field to 1 and apply this room's capacity limit fresh
    // each time the modal opens for a (possibly different) room.
    const guestCountField = document.getElementById('bkGuestCount');
    if (guestCountField) guestCountField.value = 1;
    document.getElementById('bkGuestCountError').style.display = 'none';
    applyPaxLimit();
}

function closeBooking() {
    document.getElementById('booking-modal').classList.remove('open');
    document.body.style.overflow = '';
}

function showStep(id) {
    ['bkStepCalendar', 'bkStepPrice', 'bkStepSlots', 'bkStepPayment', 'bkStepPaymongoReturn'].forEach(s => {
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
    applyPaxLimit();
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
    applyPaxLimit();
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

// Mirrors the server-side calculation in utils/bookingHelper.js
// (computeDownPayment) so the amount shown here matches what the backend
// will actually require. The down payment equals the room/variant's FIRST
// HOUR rate — not a percentage of the total — regardless of how many hours
// are booked. The server always recomputes and enforces this itself; this
// is display-only.
function computeDownPayment(unitPrice) {
    return Math.max(0, Math.round(Number(unitPrice) || 0));
}

/* =================== PAX / ROOM CAPACITY =================== */
// A room's capacity comes from its own `capacity` field (set by an admin
// under Room Management). 0/unset means "no limit enforced" so rooms
// created before this field existed keep working exactly as before.
function getRoomCapacity(room) {
    const cap = Number(room?.capacity);
    return Number.isFinite(cap) && cap > 0 ? cap : null;
}

// Keeps the Pax input's max attribute + helper hint in sync with whichever
// room is currently open in the modal. Called whenever a room/option is
// selected (openBooking, selectOption) and whenever slots are (re)rendered.
function applyPaxLimit() {
    const room = bkState.room;
    const input = document.getElementById('bkGuestCount');
    const hint = document.getElementById('bkGuestCountHint');
    if (!room || !input) return;

    const cap = getRoomCapacity(room);
    if (cap) {
        input.max = String(cap);
        if (hint) hint.textContent = `Max ${cap} pax`;
        if (Number(input.value) > cap) input.value = String(cap);
    } else {
        input.removeAttribute('max');
        if (hint) hint.textContent = '';
    }
    validatePaxInput();
}

// Inline validation only (doesn't block typing) — the Confirm button is
// gated by validatePaxInput()'s return value inside confirmBooking().
function validatePaxInput() {
    const room = bkState.room;
    const input = document.getElementById('bkGuestCount');
    const errEl = document.getElementById('bkGuestCountError');
    if (!room || !input) return true;

    const cap = getRoomCapacity(room);
    const val = parseInt(input.value, 10);
    let message = '';
    if (!Number.isFinite(val) || val < 1) {
        message = 'Please enter at least 1 guest.';
    } else if (cap && val > cap) {
        message = `This room accommodates up to ${cap} guest(s). Please reduce your pax or choose a bigger room.`;
    }

    if (errEl) {
        errEl.textContent = message;
        errEl.style.display = message ? 'block' : 'none';
    }
    input.classList.toggle('bk-field-input--error', !!message);
    return !message;
}

document.getElementById('bkGuestCount')?.addEventListener('input', validatePaxInput);
document.getElementById('bkPaxMinus')?.addEventListener('click', () => {
    const input = document.getElementById('bkGuestCount');
    const val = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
    input.value = String(val);
    validatePaxInput();
});
document.getElementById('bkPaxPlus')?.addEventListener('click', () => {
    const input = document.getElementById('bkGuestCount');
    const cap = getRoomCapacity(bkState.room);
    let val = (parseInt(input.value, 10) || 1) + 1;
    if (cap) val = Math.min(val, cap);
    input.value = String(val);
    validatePaxInput();
});

// STEP 1 of confirming: validate guest details + pax capacity, then move to
// the down-payment step (the only remaining path is the automatic PayMongo
// checkout — see payOnlineAutomatically()).
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
    if (!validatePaxInput()) {
        return; // inline error is already shown next to the Pax field
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

    // Down payment = first hour's rate (opt.price), not the total amount.
    document.getElementById('bkDownPaymentAmount').textContent = `₱${computeDownPayment(opt.price).toLocaleString()}`;

    showStep('bkStepPayment');
}

// Manual/screenshot payment has been removed completely — Proceed to Secure
// Checkout (payOnlineAutomatically, below) is now the only way a customer
// pays and books. See routes/bookingRoutes.js's POST / for the matching
// backend change.

// Automatic online payment (PayMongo) — no screenshot needed. Creates the
// booking server-side (same validation/pricing as the manual path) and
// redirects the browser to PayMongo's hosted checkout page. The booking
// only ever becomes "Confirmed"/"Paid" automatically once PayMongo's
// webhook confirms payment (see handlePaymongoReturn() below for what
// happens when the customer comes back).
async function payOnlineAutomatically() {
    const { y, m, d } = bkState.selectedDate;
    const room = bkState.room;
    const opt = bkState.selectedVariant;
    const dateStr = dateKey(y, m, d);
    const timeStr = `${String(bkState.selectedHour).padStart(2, '0')}:00`;
    const duration = bkState.selectedDuration;

    const btn = document.getElementById('bkPayOnlineBtn');
    const errEl = document.getElementById('bkPayOnlineError');
    errEl.style.display = 'none';
    const originalText = btn.textContent;
    btn.textContent = 'Redirecting…';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/payments/paymongo/checkout`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guestName: bkState.guestName,
                guestContact: bkState.guestContact,
                guestCount: bkState.guestCount || 1,
                specialRequests: bkState.specialRequests || '',
                roomId: room._id,
                variantLabel: opt.label,
                date: dateStr,
                timeIn: timeStr,
                duration,
            }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem(USER_KEY);
                sessionStorage.removeItem(USER_KEY);
                alert('Your session has expired. Please log in again to complete your booking.');
                window.location.href = 'login.html';
                return;
            }
            throw new Error(data.message || 'Could not start online payment.');
        }

        // Remember which room/date we were booking so, if the user hits the
        // browser back button instead of using PayMongo's own cancel link,
        // the slot still shows correctly next time availability is refreshed.
        delete RESERVED[`${room._id}|${dateStr}`];

        window.location.href = data.checkoutUrl;
    } catch (err) {
        console.error(err);
        errEl.textContent = err.message || 'Something went wrong starting checkout. Please try again.';
        errEl.style.display = 'block';
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Builds the professional booking-summary card (room, date, time, duration,
// pax, payment status, reference number) shown once a booking's payment is
// confirmed — see handlePaymongoReturn() below.
function renderBookingSummary(containerId, booking) {
    const container = document.getElementById(containerId);
    if (!container || !booking) return;

    const dateLabel = booking.date
        ? new Date(`${booking.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '—';
    const startHour = parseInt(String(booking.timeIn || '0').split(':')[0], 10) || 0;
    const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + (booking.duration || 0))}`;

    const paymentPillClass = booking.paymentStatus === 'Paid' ? 'bk-status-pill--paid'
        : (booking.paymentStatus === 'Pending Verification' || booking.paymentStatus === 'Unpaid') ? 'bk-status-pill--pending'
        : 'bk-status-pill--unpaid';

    const reference = booking.paymongoPaymentId || booking._id || '—';

    container.innerHTML = `
        <p class="bk-summary-card-title">Booking summary</p>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-door-open"></i> Room</span>
            <span class="bk-sr-value">${escapeHtml(booking.roomLabel || '—')}${booking.variantLabel ? ` · ${escapeHtml(booking.variantLabel)}` : ''}</span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-calendar-days"></i> Date</span>
            <span class="bk-sr-value">${escapeHtml(dateLabel)}</span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-clock"></i> Time</span>
            <span class="bk-sr-value">${timeLabel}</span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-hourglass-half"></i> Duration</span>
            <span class="bk-sr-value">${booking.duration || 0}h</span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-users"></i> Pax</span>
            <span class="bk-sr-value">${booking.guestCount || 1} guest${(booking.guestCount || 1) > 1 ? 's' : ''}</span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-peso-sign"></i> Down payment</span>
            <span class="bk-sr-value">₱${Number(booking.downPayment || 0).toLocaleString()}</span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-circle-check"></i> Payment status</span>
            <span class="bk-sr-value"><span class="bk-status-pill ${paymentPillClass}">${escapeHtml(booking.paymentStatus || 'Unpaid')}</span></span>
        </div>
        <div class="bk-summary-row">
            <span class="bk-sr-label"><i class="fa-solid fa-hashtag"></i> Reference no.</span>
            <span class="bk-sr-value bk-ref-value">${escapeHtml(String(reference))}</span>
        </div>
    `;
    container.style.display = 'block';
}


// checkout (either ?paymongo=success or ?paymongo=cancel, with &bookingId=...).
// Runs on every page load — a full navigation happens on the way back from
// PayMongo, so none of the in-memory bkState from before checkout survives;
// this only needs the bookingId from the URL.
async function handlePaymongoReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('paymongo');
    const bookingId = params.get('bookingId');
    if (!result || !bookingId) return;

    // Clean the URL so refreshing/sharing it doesn't re-trigger this.
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    document.getElementById('bkRoomName').textContent = 'Online Payment';
    document.getElementById('bkRoomIcon').innerHTML = `<i class="fa-solid fa-credit-card"></i>`;
    showStep('bkStepPaymongoReturn');
    document.getElementById('booking-modal').classList.add('open');
    document.body.style.overflow = 'hidden';

    const iconEl = document.getElementById('bkPmReturnIcon');
    const titleEl = document.getElementById('bkPmReturnTitle');
    const detailsEl = document.getElementById('bkPmReturnDetails');
    const doneBtn = document.getElementById('bkPmReturnDone');

    if (result === 'cancel') {
        // Best-effort: release the held slot. Safe to call even if the
        // booking was actually paid a moment earlier (server no-ops that case).
        try {
            await fetch(`${API_BASE}/payments/paymongo/cancel/${encodeURIComponent(bookingId)}`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch (err) {
            console.error(err);
        }
        iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        titleEl.textContent = 'Payment cancelled';
        detailsEl.textContent = "No worries — your slot wasn't charged and hasn't been held. Feel free to book again whenever you're ready.";
        doneBtn.style.display = 'inline-block';
        return;
    }

    // result === 'success' — poll briefly in case the webhook hasn't landed yet.
    const user = await verifySession();
    if (!user) {
        iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        titleEl.textContent = 'Please log in to confirm';
        detailsEl.textContent = 'Log in with the same account you booked with to see your payment status.';
        doneBtn.style.display = 'inline-block';
        return;
    }

    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/payments/paymongo/status/${encodeURIComponent(bookingId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.paymentStatus === 'Paid') {
                iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
                titleEl.textContent = 'Payment confirmed — booking Confirmed!';
                detailsEl.textContent = 'Your down payment went through and your slot is secured. See you then!';

                // Fetch the full booking so we can show a proper summary
                // (room, date, time, duration, pax, payment status, reference).
                try {
                    const bookingRes = await fetch(`${API_BASE}/bookings/${encodeURIComponent(bookingId)}`, { credentials: 'include' });
                    if (bookingRes.ok) {
                        renderBookingSummary('bkPmSummaryCard', await bookingRes.json());
                    }
                } catch (err) {
                    console.error(err);
                }

                doneBtn.style.display = 'inline-block';
                return;
            }
        } catch (err) {
            console.error(err);
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    iconEl.innerHTML = '<i class="fa-solid fa-clock"></i>';
    titleEl.textContent = "Still confirming your payment…";
    detailsEl.textContent = "This can take a little longer than usual. You'll see your booking move to \"Confirmed\" in your profile shortly — no need to pay again.";
    doneBtn.style.display = 'inline-block';
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
document.getElementById('bkPayOnlineBtn').addEventListener('click', payOnlineAutomatically);
document.getElementById('bkPmReturnDone').addEventListener('click', closeBooking);

loadRooms();
handlePaymongoReturn();

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