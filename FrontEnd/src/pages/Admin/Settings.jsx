import '../../styles/admin/settings.css';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import PasswordInput from '../../components/PasswordInput';
import PasswordRequirementsList from '../../components/PasswordRequirementsList';
import LoginHistory from './LoginHistory';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settings';
import { usersService } from '../../services/users';
import { PASSWORD_REQUIREMENTS } from '../../utils/password';
import { BellRing, History, Settings2, UserRound } from 'lucide-react';


const SETTINGS_TABS = [
  { key: 'announcements', label: 'Venue & notices', description: 'Schedule, closures, announcements', icon: BellRing },
  { key: 'profile', label: 'Admin account', description: 'Profile and password', icon: UserRound },
  { key: 'login', label: 'Login history', description: 'Account access', icon: History },
];

const SETTINGS_MANAGE_PERMISSION = 'settings:manage';
const DEFAULT_OPEN_TIME = '07:00';
const DEFAULT_CLOSE_TIME = '00:00';
const DEFAULT_ANNOUNCEMENT_EMOJI = '📣';

function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = SETTINGS_TABS.some((tab) => tab.key === requestedTab) ? requestedTab : 'announcements';

  return (
    <div className="panel active" id="panel-settings">
      <div className="settings-intro"><div><h2>System settings</h2><p>Manage the customer-facing schedule, venue notices, and your administrative account.</p></div><Settings2 size={23} aria-hidden="true" /></div>
      <div className="set-layout">
        <div className="set-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`set-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setSearchParams(tab.key === 'announcements' ? {} : { tab: tab.key })}
            >
              <tab.icon size={17} aria-hidden="true" /><span><strong>{tab.label}</strong><small>{tab.description}</small></span>
            </button>
          ))}
        </div>

        <div className="set-content">
          <div className={`set-subpanel${activeTab === 'profile' ? ' active' : ''}`} id="set-profile">
            {activeTab === 'profile' && <ProfileTab />}
          </div>

          <div className={`set-subpanel${activeTab === 'announcements' ? ' active' : ''}`} id="set-announcements">
            {activeTab === 'announcements' && (
              <>
                <AnnouncementsTab />
                <OperatingScheduleAndHolidays />
              </>
            )}
          </div>

          <div className={`set-subpanel${activeTab === 'login' ? ' active' : ''}`} id="set-login-history">
            {activeTab === 'login' && <LoginHistory />}
          </div>
        </div>
      </div>
    </div>
  );
}


const DAY_PILLS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

const DEFAULT_OPEN_DAYS_BEFORE_LOAD = [0, 1, 2, 3, 4, 5, 6];
function ScheduleTimeField({ id, label, value, onChange }) {
  const hour24 = Number(value.slice(0, 2));
  const hour12 = hour24 % 12 || 12;
  const minutes = value.slice(3, 5) || '00';
  const period = hour24 < 12 ? 'AM' : 'PM';
  const [draftHour, setDraftHour] = useState(String(hour12));

  useEffect(() => { setDraftHour(String(hour12)); }, [value]);

  function applyTime(hourText, nextPeriod = period) {
    const hour = Number(hourText);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
      setDraftHour(String(hour12));
      return;
    }
    setDraftHour(String(hour));
    const nextHour = hour % 12 + (nextPeriod === 'PM' ? 12 : 0);
    onChange(`${String(nextHour).padStart(2, '0')}:${minutes}`);
  }

  return (
    <div className="sched-field">
      <label htmlFor={id}>{label}</label>
      <div className="sched-time-control">
        <i className="ti ti-clock" aria-hidden="true"></i>
        <input id={id} type="text" inputMode="numeric" maxLength={2} value={draftHour} aria-label={`${label} hour, 1 to 12`} onFocus={(event) => event.target.select()} onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) setDraftHour(event.target.value); }} onBlur={() => applyTime(draftHour)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <span className="sched-time-minutes">:{minutes}</span>
        <div className="sched-period" role="group" aria-label={`${label} period`}>
          {['AM', 'PM'].map((choice) => <button key={choice} type="button" aria-pressed={period === choice} className={period === choice ? 'active' : ''} onClick={() => applyTime(draftHour, choice)}>{choice}</button>)}
        </div>
      </div>
    </div>
  );
}

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
  const [openTime, setOpenTime] = useState(DEFAULT_OPEN_TIME);
  const [closeTime, setCloseTime] = useState(DEFAULT_CLOSE_TIME);
  const [openDays, setOpenDays] = useState(DEFAULT_OPEN_DAYS_BEFORE_LOAD);
  const [holidays, setHolidays] = useState([]);

  const [saveState, setSaveState] = useState('idle');
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayDraft, setHolidayDraft] = useState({ name: '', date: '' });
  const [holidayError, setHolidayError] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      const settings = await settingsService.getAdmin();
      const oh = settings.operatingHours || {};
      setOpenTime(oh.openTime || DEFAULT_OPEN_TIME);
      setCloseTime(oh.closeTime || DEFAULT_CLOSE_TIME);
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

  function toggleDay(day) {
    setOpenDays((days) => (days.includes(day) ? (days.length > 1 ? days.filter((d) => d !== day) : days) : [...days, day]));
  }

  async function handleSaveSchedule() {
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to change operating hours.")) return;
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

  function handleAddHoliday() {
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to add holidays.")) return;
    setHolidayDraft({ name: '', date: '' });
    setHolidayError('');
    setHolidayModalOpen(true);
  }

  async function saveHoliday(event) {
    event.preventDefault();
    const name = holidayDraft.name.trim();
    const date = holidayDraft.date;
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setHolidayError('Enter a closure name and date.');
      return;
    }
    setAddingHoliday(true);
    setHolidayError('');
    try {
      await settingsService.addHoliday({ name, date, fullDay: true });
      await fetchSettings();
      setHolidayModalOpen(false);
    } catch (err) {
      setHolidayError(err.message || 'Could not add this closure date.');
    } finally {
      setAddingHoliday(false);
    }
  }

  async function handleDeleteHoliday(id) {
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to remove holidays.")) return;
    if (!window.confirm('Remove this holiday/closure date?')) return;
    try {
      await settingsService.removeHoliday(id);
      await fetchSettings();
    } catch (err) {
      alert(err.message);
    }
  }

  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const closesNextDay = Number(closeTime.replace(':', '')) <= Number(openTime.replace(':', ''));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title">
            <i className="ti ti-clock" style={{ color: 'var(--teal)', marginRight: 6 }}></i>Operating Schedule
          </span>
        </div>
        <div className="sched-2col">
          <ScheduleTimeField id="schedule-open-time" label="Opens at" value={openTime} onChange={setOpenTime} />
          <ScheduleTimeField id="schedule-close-time" label="Closes at" value={closeTime} onChange={setCloseTime} />
        </div>
        <p className="sched-summary">Type an hour and choose AM or PM · Manila time{closesNextDay ? ' · Closes the next day' : ''}</p>
        <div className="sched-field" style={{ marginTop: 4 }}>
          <div className="sched-days-head"><label>Open days</label><div className="sched-day-presets"><button type="button" onClick={() => setOpenDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button><button type="button" onClick={() => setOpenDays([1, 2, 3, 4, 5])}>Weekdays</button></div></div>
          <div className="day-row" id="op-day-row">
            {DAY_PILLS.map((d) => (
              <button
                key={d.day}
                type="button"
                className={`day-pill${openDays.includes(d.day) ? ' on' : ''}`}
                aria-pressed={openDays.includes(d.day)}
                aria-label={`${d.label} ${openDays.includes(d.day) ? 'open' : 'closed'}`}
                disabled={openDays.includes(d.day) && openDays.length === 1}
                title={openDays.includes(d.day) && openDays.length === 1 ? 'Keep at least one open day' : undefined}
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
          Customers cannot reserve on these dates. The reservation calendar will automatically block them, and each
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

      <Modal open={holidayModalOpen} onClose={() => !addingHoliday && setHolidayModalOpen(false)} title="Add closure date">
        <form className="settings-modal-form" onSubmit={saveHoliday}>
          <p className="settings-modal-copy">This date will be blocked in the customer reservation calendar and shown as a venue closure.</p>
          <div className="mfield"><label htmlFor="holiday-name">Closure name</label><input id="holiday-name" type="text" maxLength="100" value={holidayDraft.name} onChange={(event) => setHolidayDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. Christmas Day" autoFocus /></div>
          <div className="mfield"><label htmlFor="holiday-date">Date</label><input id="holiday-date" type="date" value={holidayDraft.date} onChange={(event) => setHolidayDraft((draft) => ({ ...draft, date: event.target.value }))} /></div>
          {holidayError && <p className="settings-form-error" role="alert">{holidayError}</p>}
          <div className="modal-actions"><button type="button" className="btn-cancel" onClick={() => setHolidayModalOpen(false)} disabled={addingHoliday}>Cancel</button><button type="submit" className="btn-confirm" disabled={addingHoliday}>{addingHoliday ? 'Adding…' : 'Add closure'}</button></div>
        </form>
      </Modal>
    </>
  );
}


function AnnouncementsTab() {
  const { guardPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formEmoji, setFormEmoji] = useState('');

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

  function openAddModal() {
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to post announcements.")) return;
    setFormTitle('');
    setFormMessage('');
    setFormEmoji('');
    setShowAddModal(true);
  }

  function closeAddModal() {
    if (posting) return;
    setShowAddModal(false);
  }

  async function handleSubmitAnnouncement(e) {
    e.preventDefault();
    if (!formTitle.trim() || !formMessage.trim()) return;
    setPosting(true);
    try {
      await settingsService.addAnnouncement({
        title: formTitle.trim(),
        message: formMessage.trim(),
        emoji: formEmoji.trim() || undefined,
      });
      setShowAddModal(false);
      await fetchAnnouncements();
    } catch (err) {
      alert(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleToggle(id, nextIsActive) {
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to change announcements.")) return;
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
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to delete announcements.")) return;
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
        <button className="btn-teal" type="button" disabled={posting} onClick={openAddModal}>
          <i className="ti ti-plus"></i>New Announcement
        </button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '.78rem', color: 'var(--muted)' }}>
        Active announcements appear as the dismissible banner at the top of the public homepage. Inactive or expired
        ones stay here but won't show to guests.
      </p>
      <Modal
        open={showAddModal}
        onClose={closeAddModal}
        title="New Announcement"
        actions={
          <>
            <button type="button" className="announcement-btn" disabled={posting} onClick={closeAddModal}>
              Cancel
            </button>
            <button
              type="submit"
              form="announcement-form"
              className="save-btn"
              disabled={posting || !formTitle.trim() || !formMessage.trim()}
            >
              {posting ? 'Posting…' : 'Post announcement'}
            </button>
          </>
        }
      >
        <form id="announcement-form" onSubmit={handleSubmitAnnouncement}>
          <div className="pfield">
            <label>Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder='e.g. "Weekend Promo"'
              autoFocus
            />
          </div>
          <div className="pfield">
            <label>Message</label>
            <textarea
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
              placeholder="Shown to every visitor on the homepage banner"
              rows={3}
            />
          </div>
          <div className="pfield">
            <label>Icon (optional emoji)</label>
            <input
              type="text"
              value={formEmoji}
              onChange={(e) => setFormEmoji(e.target.value)}
              placeholder={DEFAULT_ANNOUNCEMENT_EMOJI}
              maxLength={2}
            />
          </div>
        </form>
      </Modal>
      <div className="announcement-list">
        {loading ? (
          <div className="announcement-empty">Loading…</div>
        ) : announcements.length === 0 ? (
          <div className="announcement-empty">No announcements yet.</div>
        ) : (
          announcements.map((a) => (
            <div className="announcement-row" key={a._id}>
              <span className="announcement-icon">{a.emoji || DEFAULT_ANNOUNCEMENT_EMOJI}</span>
              <div className="announcement-body">
                <div className="announcement-title">{a.title}</div>
                <div className="announcement-message">{a.message}</div>
              </div>
              <span className={`pill ${a.isActive ? 'pill-active' : 'pill-pending'}`}>
                {a.isActive ? 'Active' : 'Inactive'}
              </span>
              <div className="announcement-actions">
                <button
                  type="button"
                  className="announcement-btn"
                  disabled={busyId === a._id}
                  onClick={() => handleToggle(a._id, !a.isActive)}
                >
                  {a.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  className="announcement-btn danger"
                  disabled={busyId === a._id}
                  onClick={() => handleDelete(a._id)}
                >
                  <i className="ti ti-trash"></i>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function displayName(admin) {
  if (!admin) return 'Admin';
  const name = `${admin.firstName || ''} ${admin.lastName || ''}`.trim();
  return name || 'Admin';
}

function initialsOf(admin) {
  if (!admin) return 'A';
  return displayName(admin).charAt(0).toUpperCase();
}

function ProfileTab() {
  const { user: admin, updateUser } = useAuth();

  const [firstName, setFirstName] = useState(admin?.firstName || '');
  const [lastName, setLastName] = useState(admin?.lastName || '');
  const email = admin?.email || '';
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
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();
    setSavingDetails(true);
    try {
      await usersService.updateProfile(admin._id, { firstName: trimmedFirstName, lastName: trimmedLastName, phone: trimmedPhone });

      setFirstName(trimmedFirstName);
      setLastName(trimmedLastName);
      setPhone(trimmedPhone);

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

      <div className="admin-profile-settings">
        <div className="card">
          <div className="card-head"><span className="card-title">Personal information</span></div>
          <div className="admin-profile-fields">
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
              <input type="email" id="profile-email" value={email} readOnly disabled />
            </div>
            <div className="pfield">
              <label>Phone number</label>
              <input type="tel" id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
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
        <details className="card admin-settings-disclosure">
          <summary><span><strong>Change password</strong><small>Keep this closed unless you need new sign-in credentials.</small></span><i className="ti ti-chevron-down" aria-hidden="true"></i></summary>
          <div className="admin-settings-disclosure-body">
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
            <div className="admin-profile-fields">
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
            </div>
            <button
              className="save-btn"
              id="profile-save-password-btn"
              type="button"
              disabled={savingPassword}
              onClick={handleSavePassword}
            >
              {savingPassword ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </details>
      </div>
    </>
  );
}

export default Settings;
