import { useCallback, useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import PasswordInput from '../../components/PasswordInput';
import PasswordRequirementsList from '../../components/PasswordRequirementsList';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settings';
import { usersService } from '../../services/users';
import { PASSWORD_REQUIREMENTS } from '../../utils/password';


const SETTINGS_TABS = [
  { key: 'announcements', label: 'Announcements' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'profile', label: 'Profile' },
];

function Settings() {
  const [activeTab, setActiveTab] = useState('announcements');

  return (
    <div className="panel active" id="panel-settings">
      <div className="set-layout">
        <div className="set-tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`set-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="set-content">
          <div className={`set-subpanel${activeTab === 'announcements' ? ' active' : ''}`} id="set-announcements">
            {activeTab === 'announcements' && (
              <>
                <AnnouncementsTab />
                <OperatingScheduleAndHolidays />
              </>
            )}
          </div>
          <div className={`set-subpanel${activeTab === 'audit' ? ' active' : ''}`} id="set-audit">
            {activeTab === 'audit' && <AuditLogTab />}
          </div>
          <div className={`set-subpanel${activeTab === 'profile' ? ' active' : ''}`} id="set-profile">
            {activeTab === 'profile' && <ProfileTab />}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────
// OperatingScheduleAndHolidays — renders as a sibling of AnnouncementsTab
// inside the set-announcements subpanel (moved here in Phase 2, since the
// old set-facilities subpanel was removed once Facility CRUD moved to
// /admin/room-management).
//
// One component (not two) because it fetches both operating hours and
// holidays from the single GET /api/settings/admin call and re-fetches
// both together after every save/add/delete.
// ─────────────────────────────────────────────────────────────────────────
const DAY_PILLS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

// Matches admin.html's static pre-load markup (Mon–Sat "on", Sun off) so
// the pills don't visibly flash before the fetch resolves. Once settings
// load, loadOperatingSettings()'s own fallback — all 7 days on — takes
// over if the server has no openDays saved yet (see fetchSettings below).
const DEFAULT_OPEN_DAYS_BEFORE_LOAD = [1, 2, 3, 4, 5, 6];

function formatHolidayDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function OperatingScheduleAndHolidays() {
  const { guardPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [openTime, setOpenTime] = useState('06:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [openDays, setOpenDays] = useState(DEFAULT_OPEN_DAYS_BEFORE_LOAD);
  const [holidays, setHolidays] = useState([]);

  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [addingHoliday, setAddingHoliday] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const settings = await settingsService.getAdmin();
      const oh = settings.operatingHours || {};
      setOpenTime(oh.openTime || '06:00');
      setCloseTime(oh.closeTime || '22:00');
      // Same fallback as the original loadOperatingSettings(): all 7 days
      // on if the server document has no openDays array yet.
      setOpenDays(Array.isArray(oh.openDays) ? oh.openDays : [0, 1, 2, 3, 4, 5, 6]);
      setHolidays(settings.holidays || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Reimplements the original's generic delegated ".day-pill click toggles
  // .on" listener as a per-pill state toggle — same visual result.
  function toggleDay(day) {
    setOpenDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  async function handleSaveSchedule() {
    if (!guardPermission('settings:manage', "You don't have permission to change operating hours.")) return;
    setSaveState('saving');
    try {
      await settingsService.updateOperatingHours({ openTime, closeTime, openDays });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      alert(err.message);
      setSaveState('idle');
    }
  }

  // Faithful port of the original's plain prompt()-based flow — see the
  // file header note on why this isn't a new form/modal.
  async function handleAddHoliday() {
    if (!guardPermission('settings:manage', "You don't have permission to add holidays.")) return;
    const name = window.prompt('Holiday / closure name (e.g. "Christmas Day"):');
    if (!name) return;
    const date = window.prompt('Date (YYYY-MM-DD):');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      alert('Please enter the date as YYYY-MM-DD.');
      return;
    }
    setAddingHoliday(true);
    try {
      await settingsService.addHoliday({ name, date, fullDay: true });
      await fetchSettings();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingHoliday(false);
    }
  }

  async function handleDeleteHoliday(id) {
    if (!guardPermission('settings:manage', "You don't have permission to remove holidays.")) return;
    if (!window.confirm('Remove this holiday/closure date?')) return;
    try {
      await settingsService.removeHoliday(id);
      await fetchSettings();
    } catch (err) {
      alert(err.message);
    }
  }

  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title">
            <i className="ti ti-clock" style={{ color: 'var(--teal)', marginRight: 6 }}></i>Operating Schedule
          </span>
        </div>
        <div className="sched-2col">
          <div className="sched-field">
            <label>Opening Hour</label>
            <div className="sched-input-wrap">
              <i className="ti ti-clock"></i>
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </div>
          </div>
          <div className="sched-field">
            <label>Closing Hour</label>
            <div className="sched-input-wrap">
              <i className="ti ti-clock"></i>
              <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="sched-field" style={{ marginTop: 4 }}>
          <label>Open Days</label>
          <div className="day-row" id="op-day-row">
            {DAY_PILLS.map((d) => (
              <button
                key={d.day}
                type="button"
                className={`day-pill${openDays.includes(d.day) ? ' on' : ''}`}
                onClick={() => toggleDay(d.day)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <button
          id="op-save-btn"
          className="save-btn"
          style={{ marginTop: 10 }}
          type="button"
          disabled={loading || saveState === 'saving'}
          onClick={handleSaveSchedule}
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save operating schedule'}
        </button>
      </div>

      <div className="card">
        <div className="fac-head">
          <div className="fac-head-left">
            <i className="ti ti-calendar-x"></i>
            <span className="fac-head-title">Holiday & Closure Dates</span>
          </div>
          <button className="btn-teal-outline" type="button" disabled={addingHoliday} onClick={handleAddHoliday}>
            <i className="ti ti-plus"></i>Add Date
          </button>
        </div>
        <div className="holiday-note">
          Customers cannot book on these dates. The reservation calendar will automatically block them, and each
          upcoming date also appears in the announcement banner at the top of the homepage.
        </div>
        <div className="holiday-list" style={{ marginTop: 10 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px 0' }}>Loading…</div>
          ) : sortedHolidays.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px 0' }}>
              No holidays or closures added yet.
            </div>
          ) : (
            sortedHolidays.map((h) => (
              <div className="holiday-item" key={h._id}>
                <i className="ti ti-calendar-off ico"></i>
                <div>
                  <div className="holiday-name">{h.name}</div>
                  <div className="holiday-date">
                    {formatHolidayDate(h.date)} — {h.fullDay ? 'Full Day Closure' : 'Partial'}
                  </div>
                </div>
                <button className="holiday-del" type="button" onClick={() => handleDeleteHoliday(h._id)}>
                  <i className="ti ti-trash"></i>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AnnouncementsTab — PART 10c. Migrated from renderAnnouncementsList/
// #add-announcement-btn/toggleAnnouncement/deleteAnnouncement in admin.js,
// plus the #set-announcements markup in admin.html.
//
// Uses its own GET /api/settings/admin fetch rather than sharing state with
// OperatingScheduleAndHolidays — the original also re-fetches the whole
// settings document independently here (renderAnnouncementsList has its
// own fetchAdminSettings() call), and this tab mounts/unmounts on its own
// as the user switches set-tabs, so there's no shared lifecycle to hook into.
// ─────────────────────────────────────────────────────────────────────────
function AnnouncementsTab() {
  const { guardPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState(null); // announcement currently being toggled/deleted

  const fetchAnnouncements = useCallback(async () => {
    try {
      const settings = await settingsService.getAdmin();
      setAnnouncements(settings?.announcements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Faithful port of the original's plain prompt()-based flow, same
  // rationale as holiday entry in Part 10b.
  async function handleAddAnnouncement() {
    if (!guardPermission('settings:manage', "You don't have permission to post announcements.")) return;
    const title = window.prompt('Announcement title (e.g. "Weekend Promo"):');
    if (!title) return;
    const message = window.prompt('Announcement message (shown to every visitor):');
    if (!message) return;
    setPosting(true);
    try {
      await settingsService.addAnnouncement({ title, message });
      await fetchAnnouncements();
    } catch (err) {
      alert(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleToggle(id, nextIsActive) {
    if (!guardPermission('settings:manage', "You don't have permission to change announcements.")) return;
    setBusyId(id);
    try {
      await settingsService.updateAnnouncement(id, { isActive: nextIsActive });
      await fetchAnnouncements();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (!guardPermission('settings:manage', "You don't have permission to delete announcements.")) return;
    if (!window.confirm('Delete this announcement?')) return;
    setBusyId(id);
    try {
      await settingsService.removeAnnouncement(id);
      await fetchAnnouncements();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="fac-head">
        <div className="fac-head-left">
          <i className="ti ti-speakerphone"></i>
          <span className="fac-head-title">Homepage Announcements</span>
        </div>
        <button className="btn-teal" type="button" disabled={posting} onClick={handleAddAnnouncement}>
          <i className="ti ti-plus"></i>New Announcement
        </button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '.78rem', color: 'var(--muted)' }}>
        Active announcements appear as the dismissible banner at the top of the public homepage. Inactive or expired
        ones stay here but won't show to guests.
      </p>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px 0' }}>Loading…</div>
        ) : announcements.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px 0' }}>No announcements yet.</div>
        ) : (
          announcements.map((a) => (
            <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }} key={a._id}>
              <span style={{ fontSize: '1.2rem' }}>{a.emoji || '📣'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '.85rem', color: 'var(--text)' }}>{a.title}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{a.message}</div>
              </div>
              <span className={`pill ${a.isActive ? 'pill-active' : 'pill-pending'}`}>
                {a.isActive ? 'Active' : 'Inactive'}
              </span>
              <button
                type="button"
                className="rm-btn"
                disabled={busyId === a._id}
                onClick={() => handleToggle(a._id, !a.isActive)}
              >
                {a.isActive ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                className="rm-btn danger"
                disabled={busyId === a._id}
                onClick={() => handleDelete(a._id)}
              >
                <i className="ti ti-trash"></i>
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AUDIT LOG tab — straight port of the #set-audit markup in admin.html.
// Static/decorative, same as Reports.jsx: entries, actor name, and
// timestamps are exactly the hardcoded strings admin.html shipped with —
// no audit-log endpoint exists anywhere in Backend/routes.
// ─────────────────────────────────────────────────────────────────────────
const AUDIT_LOG_ENTRIES = [
  { dotClass: '', text: <><b>Rivera Admin</b> updated KTV Private Room rate to ₱300/hr</>, time: 'Jun 25, 2026 · 9:12 AM' },
  { dotClass: 'warn', text: <><b>Rivera Admin</b> changed closing hour from 12:00 AM to 10:00 PM</>, time: 'Jun 24, 2026 · 4:30 PM' },
  { dotClass: '', text: <><b>Rivera Admin</b> added holiday closure — Christmas Day</>, time: 'Jun 23, 2026 · 11:05 AM' },
  { dotClass: 'del', text: <><b>Rivera Admin</b> removed promo code WELCOME5</>, time: 'Jun 21, 2026 · 2:47 PM' },
  { dotClass: '', text: <><b>Rivera Admin</b> added new facility — Family KTV Room</>, time: 'Jun 19, 2026 · 10:20 AM' },
];

function AuditLogTab() {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Settings change history</span>
        <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Last 30 days</span>
      </div>
      <div>
        {AUDIT_LOG_ENTRIES.map((entry, i) => (
          <div className="audit-item" key={i}>
            <div className={`audit-dot${entry.dotClass ? ` ${entry.dotClass}` : ''}`}></div>
            <div>
              <div className="audit-text">{entry.text}</div>
              <div className="audit-time">{entry.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PROFILE tab — moved here from the standalone Admin/Profile.jsx page,
// now reached via Settings > Profile instead of its own /admin/profile
// route. Logic/markup unchanged; only the outer page-level wrapper
// (`.panel#panel-profile`) was dropped since it now nests inside this
// page's own `.set-subpanel`.
// ─────────────────────────────────────────────────────────────────────────
function displayName(admin) {
  if (!admin) return 'Admin';
  const name = `${admin.firstName || ''} ${admin.lastName || ''}`.trim();
  return name || 'Admin';
}

function initialsOf(admin) {
  if (!admin) return 'A';
  return displayName(admin).charAt(0).toUpperCase();
}

const PROFILE_METRICS = [
  { label: 'Total Logins', value: '142' },
  { label: 'Bookings Managed', value: '388' },
  { label: 'Reports Generated', value: '27' },
  { label: 'Account Created', value: 'Jan 2026' },
];

function ProfileTab() {
  const { user: admin, updateUser } = useAuth();

  const [firstName, setFirstName] = useState(admin?.firstName || '');
  const [lastName, setLastName] = useState(admin?.lastName || '');
  const [email, setEmail] = useState(admin?.email || '');
  const [phone, setPhone] = useState(admin?.phone || '');
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const passwordChecks = PASSWORD_REQUIREMENTS.map((req) => ({ ...req, met: req.test(newPassword) }));
  const passwordValid = passwordChecks.every((c) => c.met);

  async function handleSaveDetails() {
    if (!admin?._id) return;
    // Trims each field before sending and reflects the trimmed values back
    // into local state after a successful save, so the inputs match what
    // was actually saved.
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();
    setSavingDetails(true);
    try {
      // email intentionally omitted.
      await usersService.updateProfile(admin._id, { firstName: trimmedFirstName, lastName: trimmedLastName, phone: trimmedPhone });

      setFirstName(trimmedFirstName);
      setLastName(trimmedLastName);
      setPhone(trimmedPhone);

      // Updates the shared AuthContext `user` (so AdminSidebar's name
      // reflects this immediately) and writes the merged object back to
      // storage.
      updateUser({ firstName: trimmedFirstName, lastName: trimmedLastName, phone: trimmedPhone });
      alert('Profile updated.');
    } catch (err) {
      alert(err.message || 'Could not reach the server. Is it running?');
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleSavePassword() {
    if (!admin?._id) return;
    if (!currentPassword) return alert('Enter your current password.');
    if (!passwordValid) return alert('New password does not meet all requirements.');
    if (newPassword !== confirmPassword) return alert("New password and confirmation don't match.");

    setSavingPassword(true);
    try {
      await usersService.updatePassword(admin._id, { currentPassword, newPassword });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Password updated.');
    } catch (err) {
      alert(err.message || 'Could not reach the server. Is it running?');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <div className="profile-hero">
        <div className="profile-av" id="profile-av">{initialsOf(admin)}</div>
        <div>
          <div className="profile-name" id="profile-fullname">{displayName(admin)}</div>
          <div className="profile-role" id="profile-role">{admin?.roleLabel || 'Admin'} · The Riverview</div>
          <div className="profile-meta">
            <span className="pmeta"><i className="ti ti-mail"></i><span id="profile-meta-email">{admin?.email || ''}</span></span>
            <span className="pmeta"><i className="ti ti-phone"></i><span id="profile-meta-phone">{admin?.phone || ''}</span></span>
            <span className="pmeta"><i className="ti ti-map-pin"></i>San Rafael, Bulacan</span>
          </div>
        </div>
      </div>

      <div className="p2col">
        <div className="card">
          <div className="card-head"><span className="card-title">Personal information</span></div>
          <div className="pfield">
            <label>First name</label>
            <input type="text" id="profile-firstname-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Last name</label>
            <input type="text" id="profile-lastname-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Email address</label>
            <input type="email" id="profile-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Phone number</label>
            <input type="tel" id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button
            className="save-btn"
            id="profile-save-details-btn"
            style={{ marginTop: 6 }}
            type="button"
            disabled={savingDetails}
            onClick={handleSaveDetails}
          >
            {savingDetails ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Change password</span></div>
          <div className="pfield">
            <label>Current password</label>
            <PasswordInput
              id="profile-current-password"
              name="currentPassword"
              placeholder="Enter current password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="pfield">
            <label>New password</label>
            <PasswordInput
              id="profile-new-password"
              name="newPassword"
              placeholder="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            >
              <PasswordRequirementsList password={newPassword} />
            </PasswordInput>
          </div>
          <div className="pfield">
            <label>Confirm new password</label>
            <PasswordInput
              id="profile-confirm-password"
              name="confirmPassword"
              placeholder="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button
            className="save-btn"
            id="profile-save-password-btn"
            style={{ marginTop: 6 }}
            type="button"
            disabled={savingPassword}
            onClick={handleSavePassword}
          >
            {savingPassword ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>

      <div className="metric-row">
        {PROFILE_METRICS.map((m) => (
          <div className="mc" key={m.label}>
            <div className="mc-label">{m.label}</div>
            <div className="mc-val" style={m.label === 'Account Created' ? { fontSize: '1rem' } : undefined}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default Settings;