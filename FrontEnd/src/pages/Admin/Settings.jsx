import { useCallback, useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import ImageUploadPreview from '../../components/ImageUploadPreview';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';
import { settingsService } from '../../services/settings';


const SETTINGS_TABS = [
  { key: 'facilities', label: 'Facilities' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'audit', label: 'Audit Log' },
];

function Settings() {
  const [activeTab, setActiveTab] = useState('facilities');

  return (
    <div className="panel active" id="panel-settings">
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

      <div className={`set-subpanel${activeTab === 'facilities' ? ' active' : ''}`} id="set-facilities">
        {activeTab === 'facilities' && (
          <>
            <FacilitiesTab />
            <OperatingScheduleAndHolidays />
          </>
        )}
      </div>

      <div className={`set-subpanel${activeTab === 'announcements' ? ' active' : ''}`} id="set-announcements">
        {activeTab === 'announcements' && <AnnouncementsTab />}
      </div>
      <div className={`set-subpanel${activeTab === 'audit' ? ' active' : ''}`} id="set-audit">
        {activeTab === 'audit' && <AuditLogTab />}
      </div>
    </div>
  );
}

const STATUS_CLASS_MAP = {
  Available: 'st-available',
  Occupied: 'st-occupied',
  'Under Maintenance': 'st-maintenance',
  Inactive: 'st-inactive',
};

function emptyFacilityForm() {
  return {
    name: '',
    roomNumber: '',
    description: '',
    price: '',
    status: 'Available',
    capacity: '',
    variants: [], // [{ label, price, pax }]
    features: [], // ['Air-conditioned', ...]
  };
}

// ─────────────────────────────────────────────────────────────────────────
// FacilitiesTab — its own component (not inlined in Settings()) since it
// owns a fair amount of local state (rooms list + the whole modal form).
// Stays in this file rather than moving to components/ since, like
// Bookings.jsx's modals, it's page-specific and single-use.
// ─────────────────────────────────────────────────────────────────────────
function FacilitiesTab() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = Add mode
  const [form, setForm] = useState(emptyFacilityForm());
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [featureInput, setFeatureInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomsService.list();
      // normalizeRooms() equivalent — tolerate features/variants arriving as
      // strings from an older backend, same defensive parsing as the original.
      const normalized = (Array.isArray(data) ? data : []).map((r) => ({
        ...r,
        capacity: r.capacity != null ? r.capacity : '',
        features: Array.isArray(r.features)
          ? r.features
          : typeof r.features === 'string' && r.features
          ? r.features.split(',').map((f) => f.trim()).filter(Boolean)
          : [],
        variants: Array.isArray(r.variants)
          ? r.variants
          : typeof r.variants === 'string' && r.variants
          ? safeParseJson(r.variants, [])
          : [],
      }));
      setRooms(normalized);
    } catch (err) {
      console.error('Could not load rooms from the API:', err);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  function openAddModal() {
    if (!guardPermission('room:manage')) return;
    setEditingId(null);
    setForm(emptyFacilityForm());
    setExistingImageUrl('');
    setSelectedImageFile(null);
    setFeatureInput('');
    setModalOpen(true);
  }

  function openEditModal(room) {
    if (!guardPermission('room:manage')) return;
    setEditingId(room._id);
    setForm({
      name: room.name || '',
      roomNumber: room.roomNumber || '',
      description: room.description || '',
      price: room.price || '',
      status: room.status || 'Available',
      capacity: room.capacity || '',
      variants: (room.variants || []).map((v) => ({ ...v })),
      features: [...(room.features || [])],
    });
    setExistingImageUrl(room.image ? resolveImageUrl(room.image) : '');
    setSelectedImageFile(null);
    setFeatureInput('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setSelectedImageFile(null);
  }

  /* ── pricing tiers ── */
  function addVariantRow() {
    setForm((f) => ({ ...f, variants: [...f.variants, { label: '', price: '', pax: '' }] }));
  }
  function updateVariant(i, field, value) {
    setForm((f) => {
      const variants = f.variants.map((v, idx) => (idx === i ? { ...v, [field]: value } : v));
      return { ...f, variants };
    });
  }
  function removeVariantRow(i) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
  }

  /* ── feature chips ── */
  function addFeatureChip() {
    const raw = featureInput.trim();
    if (!raw) return;
    // allow comma-separated paste, e.g. "Aircon, Free WiFi"
    setForm((f) => {
      const features = [...f.features];
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((val) => {
          if (!features.some((existing) => existing.toLowerCase() === val.toLowerCase())) {
            features.push(val);
          }
        });
      return { ...f, features };
    });
    setFeatureInput('');
  }
  function removeFeatureChip(i) {
    setForm((f) => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));
  }

  /* ── save / remove ── */
  async function handleSave() {
    if (!guardPermission('room:manage')) return;
    if (!form.name.trim() || !form.roomNumber.trim()) {
      alert('Please fill in category and room number.');
      return;
    }
    const cleanVariants = form.variants
      .filter((v) => v.label.trim() !== '' || v.price !== '')
      .map((v) => ({ label: v.label.trim(), price: Number(v.price) || 0, pax: (v.pax || '').trim() }));
    if (!form.price && cleanVariants.length === 0) {
      alert('Add a base price, or at least one pricing tier.');
      return;
    }

    setSaving(true);
    try {
      // FormData (not JSON) so the selected image file rides along in the
      // same request, same as the original's saveFacility().
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('roomNumber', form.roomNumber.trim());
      formData.append('description', form.description.trim());
      formData.append('price', Number(form.price) || 0);
      formData.append('status', form.status);
      formData.append('capacity', Number(form.capacity) || 0);
      formData.append('features', JSON.stringify(form.features));
      formData.append('variants', JSON.stringify(cleanVariants));
      if (selectedImageFile) formData.append('image', selectedImageFile);

      if (editingId) {
        await roomsService.update(editingId, formData);
      } else {
        await roomsService.create(formData);
      }
      closeModal();
      await fetchRooms();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Something went wrong saving the facility.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!guardPermission('room:manage')) return;
    if (!editingId) return closeModal();
    if (!window.confirm('Remove this facility? This cannot be undone.')) return;
    try {
      await roomsService.remove(editingId);
      closeModal();
      await fetchRooms();
    } catch (err) {
      console.error(err);
      alert('Could not delete this facility.');
    }
  }

  async function quickDelete(id) {
    if (!guardPermission('room:manage')) return;
    if (!window.confirm('Remove this facility? This cannot be undone.')) return;
    try {
      await roomsService.remove(id);
      await fetchRooms();
    } catch (err) {
      console.error(err);
      alert('Could not delete this facility.');
    }
  }

  async function duplicate(room) {
    if (!guardPermission('room:manage')) return;
    const payload = {
      name: room.name + ' (Copy)',
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      description: room.description,
      price: room.price,
      status: room.status,
      features: JSON.stringify(room.features || []),
      variants: JSON.stringify(room.variants || []),
    };
    try {
      // See rooms.js's header note: the original never surfaced a server
      // message here (fixed 'Failed to duplicate facility.' string, no
      // res.json() read at all) — preserved below since this catch's
      // alert() also ignores err.message, same as before.
      await roomsService.create(payload);
      await fetchRooms();
    } catch (err) {
      console.error(err);
      alert('Could not duplicate this facility.');
    }
  }

  return (
    <>
      <div className="card">
        <div className="fac-head">
          <div className="fac-head-left">
            <i className="ti ti-building"></i>
            <span className="fac-head-title">Manage your Facility</span>
          </div>
          <button className="btn-teal" onClick={openAddModal}>
            <i className="ti ti-plus"></i>Add Facility
          </button>
        </div>
      </div>

      <div className="fac-grid" id="fac-grid">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', gridColumn: '1/-1' }}>Loading facilities…</div>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', gridColumn: '1/-1' }}>
            No facilities yet. Click "Add Facility" to create one.
          </div>
        ) : (
          rooms.map((r) => {
            const hasVariants = r.variants && r.variants.length > 0;
            const topPrice = hasVariants
              ? `From ₱${Math.min(...r.variants.map((v) => Number(v.price) || 0))}/hr`
              : r.price
              ? `₱${r.price}/hr`
              : '—';
            return (
              <div className="fac-card" key={r._id}>
                <div className="fac-img">
                  {r.image ? (
                    <img src={resolveImageUrl(r.image)} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <>
                      <i className="ti ti-photo" style={{ fontSize: 22, marginRight: 6 }}></i>
                      {r.name} Image
                    </>
                  )}
                </div>
                <div className="fac-body">
                  <div className="fac-title-row">
                    <div>
                      <div className="fac-name">{r.name}</div>
                      <div className="fac-meta">{r.roomNumber}</div>
                    </div>
                    <div className="fac-price">{topPrice}</div>
                  </div>
                  {hasVariants && (
                    <div className="fac-variants">
                      {r.variants.map((v, i) => (
                        <div className="fac-variant-row" key={i}>
                          <span className="fv-label">
                            {v.label}
                            {v.pax ? ` · ${v.pax}` : ''}
                          </span>
                          <span className="fv-price">₱{v.price}/hr</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="fac-desc">{r.description || ''}</div>
                  <span className={`fac-status ${STATUS_CLASS_MAP[r.status] || 'st-available'}`}>{r.status}</span>
                  <div className="fac-tags">
                    {(r.features || []).map((f, i) => (
                      <span className="fac-tag" key={i}>{f}</span>
                    ))}
                  </div>
                  <div className="fac-actions">
                    {canManage ? (
                      <>
                        <button className="fac-edit-btn" onClick={() => openEditModal(r)}>
                          <i className="ti ti-edit"></i>Edit
                        </button>
                        <button className="fac-icon-btn" title="Duplicate" onClick={() => duplicate(r)}>
                          <i className="ti ti-copy"></i>
                        </button>
                        <button className="fac-icon-btn del" title="Remove" onClick={() => quickDelete(r._id)}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>View only</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Facility Add/Edit modal ── */}
      <Modal open={modalOpen} onClose={closeModal} size="lg">
        <div className="modal-lg-title">{editingId ? 'Edit Facility' : 'Add Facility'}</div>
        <div className="modal-lg-sub">
          {editingId ? 'Update facility information, pricing tiers, and features.' : 'Add a new facility to your listing.'}
        </div>

        <div className="frow">
          <div className="ffield">
            <label className="flabel">Category</label>
            <input type="text" placeholder="e.g. Billiards" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="ffield">
            <label className="flabel">Room Number</label>
            <input type="text" placeholder="e.g. Room 3" value={form.roomNumber} onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))} />
          </div>
        </div>

        <div className="ffield">
          <label className="flabel">Description</label>
          <textarea
            placeholder="Short description guests will see"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="ffield">
          <div className="flabel-row">
            <label className="flabel">Pricing Tiers</label>
            <span className="flabel-hint">Each tier needs a name, rate, and pax allowance — this is what guests pick from</span>
          </div>
          <div className="variant-list" id="fm-variant-list">
            {form.variants.length === 0 ? (
              <div className="variant-empty">No pricing tiers yet — add one for things like "Solo — Regular" or "Big Room".</div>
            ) : (
              form.variants.map((v, i) => (
                <div className="variant-row" key={i}>
                  <input
                    type="text" className="variant-label" placeholder="e.g. Big Room"
                    value={v.label} onChange={(e) => updateVariant(i, 'label', e.target.value)}
                  />
                  <div className="variant-price-wrap">
                    <span>₱</span>
                    <input type="number" min={0} placeholder="0" value={v.price} onChange={(e) => updateVariant(i, 'price', e.target.value)} />
                    <span>/hr</span>
                  </div>
                  <input
                    type="text" className="variant-pax" placeholder="e.g. 6 pax"
                    value={v.pax} onChange={(e) => updateVariant(i, 'pax', e.target.value)}
                  />
                  <button type="button" className="variant-remove-btn" title="Remove tier" onClick={() => removeVariantRow(i)}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))
            )}
          </div>
          <button type="button" className="add-row-btn" onClick={addVariantRow}>
            <i className="ti ti-plus"></i>Add pricing tier
          </button>
        </div>

        <div className="frow">
          <div className="ffield">
            <label className="flabel">Base Price (₱/hr)</label>
            <input type="number" placeholder="0" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </div>
          <div className="ffield">
            <label className="flabel">Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option>Available</option>
              <option>Occupied</option>
              <option>Under Maintenance</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>

        <div className="ffield">
          <label className="flabel">Max Capacity (Pax)</label>
          <span className="flabel-hint">Guests won't be able to book more pax than this. Leave 0/blank for no limit.</span>
          <input type="number" placeholder="e.g. 10" min={0} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
        </div>

        <div className="field-note">Base price is used only when no pricing tiers are set.</div>

        <div className="ffield">
          <label className="flabel">Facility Image</label>
          <ImageUploadPreview
            icon="ti-photo"
            title={existingImageUrl || selectedImageFile ? 'Click to change image' : 'Click to upload facility image'}
            subtitle="PNG, JPG up to 10MB"
            accept="image/png,image/jpeg"
            maxSizeMB={10}
            maxHeight={110}
            value={existingImageUrl}
            onFileSelect={setSelectedImageFile}
          />
        </div>

        <div className="ffield" style={{ marginBottom: 22 }}>
          <label className="flabel">Additional Features</label>
          <div className="chip-list" id="fm-feature-chips">
            {form.features.map((f, i) => (
              <span className="chip" key={i}>
                {f}
                <button type="button" title="Remove" onClick={() => removeFeatureChip(i)}>
                  <i className="ti ti-x" style={{ fontSize: 11 }}></i>
                </button>
              </span>
            ))}
          </div>
          <div className="chip-input-row">
            <input
              type="text"
              placeholder="e.g. Air-conditioned, Free WiFi — press Enter to add"
              value={featureInput}
              onChange={(e) => setFeatureInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFeatureChip();
                }
              }}
            />
            <button type="button" className="chip-add-btn" onClick={addFeatureChip}>
              <i className="ti ti-plus"></i>
            </button>
          </div>
        </div>

        <div className="modal-actions-split">
          <button className="btn-remove" onClick={handleRemove} style={{ display: editingId ? 'inline-block' : 'none' }}>
            Remove
          </button>
          <button className="btn-save" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Facility'}
          </button>
        </div>
      </Modal>
    </>
  );
}

function safeParseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// OperatingScheduleAndHolidays — PART 10b. Renders as a sibling of
// FacilitiesTab inside the same set-facilities subpanel, matching the
// original admin.html where the "Operating Schedule" and "Holiday &
// Closure Dates" cards sit directly underneath the facility grid.
//
// One component (not two) because the legacy loadOperatingSettings()
// fetches both from the single GET /api/settings/admin call and re-fetches
// both together after every save/add/delete — splitting them would just
// mean two components independently re-implementing the same fetch.
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
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('30');
  const [cutoffHours, setCutoffHours] = useState('2');
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
      setMaxAdvanceDays(String(oh.maxAdvanceDays || 30));
      setCutoffHours(String(oh.bookingCutoffHours ?? 2));
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
      await settingsService.updateOperatingHours({
        openTime,
        closeTime,
        openDays,
        maxAdvanceDays: Number(maxAdvanceDays),
        bookingCutoffHours: Number(cutoffHours),
      });
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
          <div className="sched-field">
            <label>Max Advance Reservation</label>
            <div className="sched-inline">
              <select value={maxAdvanceDays} onChange={(e) => setMaxAdvanceDays(e.target.value)}>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="60">60</option>
              </select>
              <span>days in advance</span>
            </div>
          </div>
          <div className="sched-field">
            <label>Booking Cutoff Time</label>
            <div className="sched-inline">
              <select value={cutoffHours} onChange={(e) => setCutoffHours(e.target.value)}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="4">4</option>
              </select>
              <span>hours before facility opens</span>
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

export default Settings;