import '../../styles/admin/room-management.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import ImageUploadPreview from '../../components/ImageUploadPreview';
import FacilityBookingCard from '../../components/FacilityBookingCard';
import RoomOptionCard from '../../components/RoomOptionCard';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';

const FORM_STEPS = [
  { key: 'facility', label: 'Facility' },
  { key: 'rooms', label: 'Rooms' },
];

const ROOM_STATUS_PILL_CLASS = { Available: 'pill-active', Maintenance: 'pill-pending', Unavailable: 'pill-overdue' };

function emptyVariant() {
  return { label: '', price: '', pax: '', startingRoomNumber: '', roomCount: 1, status: 'Available', image: '', features: [] };
}

function emptyFacilityForm() {
  return {
    name: '',
    description: '',
    variants: [],
  };
}

function lowestRoomPrice(variants) {
  if (!variants || !variants.length) return 0;
  return Math.min(...variants.map((v) => Number(v.price) || 0));
}

function roomNumberRangeLabel(v) {
  const start = Math.max(1, Number(v.startingRoomNumber) || 1);
  const count = Math.max(1, Number(v.roomCount) || 1);
  return count > 1 ? `Rooms ${start}–${start + count - 1}` : `Room ${start}`;
}

function statusCounts(variants) {
  const list = variants || [];
  return {
    available: list.filter((v) => v.status === 'Available').length,
    maintenance: list.filter((v) => v.status === 'Maintenance').length,
    unavailable: list.filter((v) => v.status === 'Unavailable').length,
  };
}

function safeParseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function RoomManagement() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formStep, setFormStep] = useState('facility');
  const [activeRoomIndex, setActiveRoomIndex] = useState(null);
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  const [form, setForm] = useState(emptyFacilityForm());
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [variantImageFiles, setVariantImageFiles] = useState({});
  const [variantImagePreviews, setVariantImagePreviews] = useState({});
  const [featureInput, setFeatureInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomsService.list();
      const normalized = (Array.isArray(data) ? data : []).map((r) => ({
        ...r,
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

  function resetImageState() {
    setExistingImageUrl('');
    setSelectedImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
  }

  function openAddModal() {
    if (!guardPermission('room:manage')) return;
    setEditingId(null);
    setFormStep('facility');
    setActiveRoomIndex(null);
    setAddingNewCategory(false);
    setForm(emptyFacilityForm());
    resetImageState();
    setFeatureInput('');
    setModalOpen(true);
  }

  function openEditModal(room) {
    if (!guardPermission('room:manage')) return;
    setEditingId(room._id);
    setFormStep('facility');
    setActiveRoomIndex(null);
    setAddingNewCategory(false);
    setForm({
      name: room.name || '',
      description: room.description || '',
      variants: (room.variants || []).map((v) => ({
        ...v,
        startingRoomNumber: v.startingRoomNumber ?? '',
        roomCount: v.roomCount ?? 1,
        status: v.status || 'Available',
        features: Array.isArray(v.features) ? v.features : [],
      })),
    });
    setExistingImageUrl(room.image ? resolveImageUrl(room.image) : '');
    setSelectedImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
    setFeatureInput('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setSelectedImageFile(null);
  }

  function addRoom() {
    const newIndex = form.variants.length;
    setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }));
    setFeatureInput('');
    setActiveRoomIndex(newIndex);
  }

  function updateVariant(i, field, value) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)),
    }));
  }

  function reindexAfterRemove(map, removedIndex) {
    const next = {};
    Object.keys(map).forEach((key) => {
      const idx = Number(key);
      if (idx < removedIndex) next[idx] = map[idx];
      else if (idx > removedIndex) next[idx - 1] = map[idx];
    });
    return next;
  }

  function removeVariantRow(i) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
    setVariantImageFiles((m) => reindexAfterRemove(m, i));
    setVariantImagePreviews((m) => {
      if (m[i]) URL.revokeObjectURL(m[i]);
      return reindexAfterRemove(m, i);
    });
  }

  function handleVariantImageSelect(i, file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be smaller than 10MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image.');
      return;
    }
    setVariantImageFiles((m) => ({ ...m, [i]: file }));
    setVariantImagePreviews((m) => {
      if (m[i]) URL.revokeObjectURL(m[i]);
      return { ...m, [i]: URL.createObjectURL(file) };
    });
  }

  function variantThumbSrc(i, v) {
    if (variantImagePreviews[i]) return variantImagePreviews[i];
    if (v.image) return resolveImageUrl(v.image);
    return null;
  }

  function addVariantFeature(i) {
    const raw = featureInput.trim();
    if (!raw) return;
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) => {
        if (idx !== i) return v;
        const features = [...(v.features || [])];
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((val) => {
            if (!features.some((existing) => existing.toLowerCase() === val.toLowerCase())) {
              features.push(val);
            }
          });
        return { ...v, features };
      }),
    }));
    setFeatureInput('');
  }

  function removeVariantFeature(i, featureIdx) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) =>
        idx === i ? { ...v, features: (v.features || []).filter((_, fi) => fi !== featureIdx) } : v
      ),
    }));
  }

  async function handleSave() {
    if (!guardPermission('room:manage')) return;
    if (!form.name.trim()) {
      alert('Please fill in the facility category name.');
      return;
    }
    const normalized = form.name.trim().toLowerCase();
    const clash = rooms.find((r) => r.name.trim().toLowerCase() === normalized && r._id !== editingId);
    if (clash) {
      alert(`A facility named "${clash.name}" already exists. Edit that one to add rooms to it instead.`);
      return;
    }
    const cleanVariantEntries = form.variants
      .map((v, originalIndex) => ({ v, originalIndex }))
      .filter(({ v }) => v.label.trim() !== '' || v.price !== '');
    const invalidRoomNumber = cleanVariantEntries.find(({ v }) => {
      if (v.startingRoomNumber === '' || v.startingRoomNumber === null || v.startingRoomNumber === undefined) return false;
      const parsed = Number(v.startingRoomNumber);
      return !Number.isFinite(parsed) || parsed <= 0;
    });
    if (invalidRoomNumber) {
      alert(`Starting Room No. for "${invalidRoomNumber.v.label || 'Untitled Room'}" must be greater than 0, or left blank to default to 1.`);
      return;
    }
    const cleanVariants = cleanVariantEntries.map(({ v }) => ({
      label: v.label.trim(),
      price: Number(v.price) || 0,
      pax: (v.pax || '').trim(),
      startingRoomNumber: Math.max(1, Number(v.startingRoomNumber) || 1),
      roomCount: Math.max(1, Number(v.roomCount) || 1),
      status: v.status || 'Available',
      image: v.image || '',
      features: v.features || [],
    }));
    if (cleanVariants.length === 0) {
      alert('Add at least one room before saving this facility.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('description', form.description.trim());
      formData.append('price', lowestRoomPrice(cleanVariants));
      formData.append('variants', JSON.stringify(cleanVariants));
      if (selectedImageFile) formData.append('image', selectedImageFile);

      const variantImageIndexes = [];
      cleanVariantEntries.forEach(({ originalIndex }, newIndex) => {
        const file = variantImageFiles[originalIndex];
        if (file) {
          variantImageIndexes.push(newIndex);
          formData.append('variantImages', file);
        }
      });
      if (variantImageIndexes.length) {
        formData.append('variantImageIndexes', JSON.stringify(variantImageIndexes));
      }

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
      description: room.description,
      price: room.price,
      variants: JSON.stringify(room.variants || []),
    };
    try {
      await roomsService.create(payload);
      await fetchRooms();
    } catch (err) {
      console.error(err);
      alert('Could not duplicate this facility.');
    }
  }

  const categories = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.name).filter(Boolean))).sort(),
    [rooms]
  );

  const visibleRooms = useMemo(() => {
    let list = selectedCategory === 'all' ? rooms : rooms.filter((r) => r.name === selectedCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rooms, selectedCategory, search]);

  const stats = useMemo(() => {
    const allVariants = visibleRooms.flatMap((r) => r.variants || []);
    return {
      facilities: visibleRooms.length,
      totalRooms: allVariants.length,
      available: allVariants.filter((v) => v.status === 'Available').length,
      maintenance: allVariants.filter((v) => v.status === 'Maintenance').length,
    };
  }, [visibleRooms]);

  function clearFilters() {
    setSearch('');
    setSelectedCategory('all');
  }

  const facilityImagePreviewUrl = useMemo(
    () => (selectedImageFile ? URL.createObjectURL(selectedImageFile) : existingImageUrl),
    [selectedImageFile, existingImageUrl]
  );

  const previewFacility = useMemo(
    () => ({
      ...form,
      price: lowestRoomPrice(form.variants),
      image: facilityImagePreviewUrl,
      variants: form.variants.map((v, i) => ({ ...v, image: variantImagePreviews[i] || v.image })),
    }),
    [form, facilityImagePreviewUrl, variantImagePreviews]
  );

  const activeRoom = activeRoomIndex !== null ? form.variants[activeRoomIndex] : null;

  const normalizedName = form.name.trim().toLowerCase();
  const duplicateCategoryRoom =
    normalizedName === ''
      ? null
      : rooms.find((r) => r.name.trim().toLowerCase() === normalizedName && r._id !== editingId);
  const stepIndex = FORM_STEPS.findIndex((s) => s.key === formStep);

  return (
    <div className="panel active" id="panel-room-management">
      <div className="metric-row">
        <div className="mc">
          <div className="mc-icon"><i className="ti ti-building"></i></div>
          <div className="mc-info">
            <div className="mc-label">Total Facilities</div>
            <div className="mc-val">{stats.facilities.toLocaleString()}</div>
          </div>
        </div>
        <div className="mc">
          <div className="mc-icon"><i className="ti ti-door"></i></div>
          <div className="mc-info">
            <div className="mc-label">Total Rooms</div>
            <div className="mc-val">{stats.totalRooms.toLocaleString()}</div>
          </div>
        </div>
        <div className="mc">
          <div className="mc-icon"><i className="ti ti-circle-check"></i></div>
          <div className="mc-info">
            <div className="mc-label">Available</div>
            <div className="mc-val">{stats.available.toLocaleString()}</div>
          </div>
        </div>
        <div className="mc">
          <div className="mc-icon"><i className="ti ti-tool"></i></div>
          <div className="mc-info">
            <div className="mc-label">Under Maintenance</div>
            <div className="mc-val">{stats.maintenance.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="fac-head">
          <div className="fac-head-left">
            <i className="ti ti-building"></i>
            <div>
              <div className="fac-head-title">Manage your Facility</div>
              <div className="fac-head-sub">Add facilities, then define the rooms guests can reserve.</div>
            </div>
          </div>
          {canManage && (
            <button className="btn-teal" onClick={openAddModal}>
              <i className="ti ti-plus"></i>Add Facility
            </button>
          )}
        </div>
      </div>

      <div className="card fac-toolbar-card">
        <div className="fac-toolbar">
          <div className="fac-search-wrap">
            <i className="ti ti-search fac-search-icon"></i>
            <input
              type="text"
              placeholder="Search facility name or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="fac-filter-input fac-search-input"
            />
          </div>
          {(search || selectedCategory !== 'all') && (
            <button type="button" className="fac-clear-btn" onClick={clearFilters}>
              <i className="ti ti-x"></i> Clear
            </button>
          )}
        </div>
        <div className="fac-results-row">
          {loading ? 'Loading facilities…' : `${visibleRooms.length.toLocaleString()} facilit${visibleRooms.length === 1 ? 'y' : 'ies'} found`}
        </div>
      </div>

      <div className="set-layout">
        <div className="set-tabs fac-cat-tabs">
          <button
            type="button"
            className={`set-tab${selectedCategory === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            <span>All Categories</span>
            <span className="fac-cat-count">{rooms.length}</span>
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat}
              className={`set-tab${selectedCategory === cat ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              <span>{cat}</span>
              <span className="fac-cat-count">{rooms.filter((r) => r.name === cat).length}</span>
            </button>
          ))}
        </div>

        <div className="set-content">
          <div className="fac-grid" id="fac-grid">
            {loading ? (
              <div className="room-grid-empty">Loading facilities…</div>
            ) : visibleRooms.length === 0 ? (
              <div className="room-grid-empty">
                <i className="ti ti-building"></i>
                {rooms.length === 0 ? 'No facilities yet. Click "Add Facility" to create one.' : 'No facilities match your filters.'}
              </div>
            ) : (
              visibleRooms.map((r) => {
                const hasVariants = r.variants && r.variants.length > 0;
                const topPrice = hasVariants ? `From ₱${lowestRoomPrice(r.variants)}/hr` : 'No rooms yet';
                const counts = statusCounts(r.variants);
                const shownVariants = r.variants ? r.variants.slice(0, 3) : [];
                const extraVariants = hasVariants ? r.variants.length - shownVariants.length : 0;
                return (
                  <div className="fac-card" key={r._id}>
                    <div className="fac-card-media">
                      {r.image ? (
                        <img src={resolveImageUrl(r.image)} alt={r.name} />
                      ) : (
                        <div className="fac-card-noimg">
                          <i className="ti ti-photo"></i>
                          No image
                        </div>
                      )}
                      <span className="fac-card-badge">{topPrice}</span>
                    </div>
                    <div className="fac-body">
                      <div className="fac-title-row">
                        <div className="fac-name">{r.name}</div>
                        <div className="fac-meta">{hasVariants ? `${r.variants.length} room type${r.variants.length > 1 ? 's' : ''}` : 'No rooms yet'}</div>
                      </div>

                      {hasVariants && (
                        <div className="fac-status-row">
                          {counts.available > 0 && <span className="pill pill-active">{counts.available} Available</span>}
                          {counts.maintenance > 0 && <span className="pill pill-pending">{counts.maintenance} Maintenance</span>}
                          {counts.unavailable > 0 && <span className="pill pill-overdue">{counts.unavailable} Unavailable</span>}
                        </div>
                      )}

                      {r.description && <div className="fac-desc">{r.description}</div>}

                      {hasVariants && (
                        <div className="fac-variants">
                          {shownVariants.map((v, i) => (
                            <span className="fac-variant-chip" key={i}>
                              {v.label} <span className="fv-price">₱{v.price}</span>
                              <span className="fv-room-range">{roomNumberRangeLabel(v)}</span>
                            </span>
                          ))}
                          {extraVariants > 0 && <span className="fac-variant-more">+{extraVariants} more</span>}
                        </div>
                      )}

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
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} size="2xl">
        <div className="fm-modal-header">
          <div>
            <div className="modal-lg-title">{editingId ? 'Edit Facility' : 'Add Facility'}</div>
            <div className="modal-lg-sub">
              {editingId ? 'Update this facility and the rooms that belong to it.' : 'Add a new facility to your listing.'}
            </div>
          </div>
          <button type="button" className="fm-close-btn" title="Close" onClick={closeModal}>
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div className="fm-stepper">
          {FORM_STEPS.map((s, i) => {
            const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'upcoming';
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <span className="fm-step-connector"></span>}
                <button
                  type="button"
                  className={`fm-step-dot fm-step-dot--${state}`}
                  onClick={() => {
                    setFormStep(s.key);
                    if (s.key !== 'rooms') setActiveRoomIndex(null);
                  }}
                >
                  <span className="fm-step-dot-num">{state === 'done' ? <i className="ti ti-check"></i> : i + 1}</span>
                  <span className="fm-step-dot-label">
                    {s.label}{s.key === 'rooms' && form.variants.length > 0 ? ` (${form.variants.length})` : ''}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="fm-layout">
          <div className="fm-form-col">
            {formStep === 'facility' && (
              <>
                <div className="fm-section">
                <div className="ffield">
                  <label className="flabel"><i className="ti ti-category"></i> Category</label>
                  <span className="flabel-hint">Pick an existing category, or add a new one.</span>

                  {addingNewCategory ? (
                    <div className="fm-category-new-row">
                      <input
                        type="text" autoFocus placeholder="New category name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                      <button
                        type="button" className="fm-inline-link"
                        onClick={() => { setAddingNewCategory(false); setForm((f) => ({ ...f, name: '' })); }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <select
                      value={categories.includes(form.name) ? form.name : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__new__') {
                          setForm((f) => ({ ...f, name: '' }));
                          setAddingNewCategory(true);
                          return;
                        }
                        const existingRoom = rooms.find((r) => r.name === val && r._id !== editingId);
                        if (existingRoom) {
                          openEditModal(existingRoom);
                          return;
                        }
                        setForm((f) => ({ ...f, name: val }));
                      }}
                    >
                      <option value="" disabled>Select a category…</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="__new__">+ Add New Category</option>
                    </select>
                  )}

                  {addingNewCategory && duplicateCategoryRoom && (
                    <div className="fm-field-warning">
                      A facility named "{duplicateCategoryRoom.name}" already exists.
                      {' '}
                      <button type="button" className="fm-inline-link" onClick={() => openEditModal(duplicateCategoryRoom)}>
                        Edit it instead
                      </button>
                      {' '}to add rooms to it, rather than creating a duplicate.
                    </div>
                  )}
                </div>
                </div>

                <div className="fm-section">
                <div className="ffield">
                  <label className="flabel"><i className="ti ti-file-text"></i> Description</label>
                  <textarea
                    placeholder="Short description guests will see"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                </div>

                <div className="fm-section">
                <div className="ffield">
                  <label className="flabel"><i className="ti ti-photo"></i> Facility Image</label>
                  <span className="flabel-hint">Shown on the category card in the main catalogue grid.</span>
                  <div className="fm-upload-zone">
                  <ImageUploadPreview
                    icon="ti-photo"
                    title={existingImageUrl || selectedImageFile ? 'Click to change image' : 'Click to upload facility image'}
                    subtitle="PNG, JPG up to 10MB"
                    accept="image/png,image/jpeg"
                    maxSizeMB={10}
                    maxHeight={140}
                    value={existingImageUrl}
                    onFileSelect={setSelectedImageFile}
                  />
                  </div>
                </div>
                </div>
              </>
            )}

            {formStep === 'rooms' && activeRoom === null && (
              <div className="ffield">
                <div className="flabel-row">
                  <label className="flabel"><i className="ti ti-door"></i> Rooms</label>
                  <span className="flabel-hint">Each room is what guests actually pick and reserve — its own name, rate, pax, and photo.</span>
                </div>

                {form.variants.length === 0 ? (
                  <div className="variant-empty">No rooms yet — add one to get started.</div>
                ) : null}

                <div className="fm-room-grid">
                  {form.variants.map((v, i) => (
                    <div
                      className="fm-room-card" key={i}
                      onClick={() => { setFeatureInput(''); setActiveRoomIndex(i); }}
                    >
                      <div className="fm-room-card-media">
                        {variantThumbSrc(i, v) ? <img src={variantThumbSrc(i, v)} alt="" /> : <i className="ti ti-photo"></i>}
                        <span className={`pill ${ROOM_STATUS_PILL_CLASS[v.status] || 'pill-done'}`}>{v.status || 'Available'}</span>
                      </div>
                      <div className="fm-room-card-body">
                        <div className="fm-room-card-name">{v.label || 'Untitled Room'}</div>
                        <div className="fm-room-card-meta">
                          ₱{v.price || 0}/hr{v.pax ? ` · ${v.pax}` : ''} · {roomNumberRangeLabel(v)}
                        </div>
                      </div>
                      <div className="fm-room-card-actions">
                        <button
                          type="button" title="Edit room"
                          onClick={(e) => { e.stopPropagation(); setFeatureInput(''); setActiveRoomIndex(i); }}
                        >
                          <i className="ti ti-edit"></i>
                        </button>
                        <button
                          type="button" className="del" title="Remove room"
                          onClick={(e) => { e.stopPropagation(); removeVariantRow(i); }}
                        >
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="fm-room-add-card" onClick={addRoom}>
                    <i className="ti ti-plus"></i>Add Room
                  </button>
                </div>
              </div>
            )}

            {formStep === 'rooms' && activeRoom !== null && (
              <div className="fm-room-detail">
                <button type="button" className="fm-room-back" onClick={() => setActiveRoomIndex(null)}>
                  <i className="ti ti-arrow-left"></i> Back to Rooms
                </button>

                <div className="fm-section">
                  <div className="fm-section-title"><i className="ti ti-info-circle"></i> Basic Details</div>
                  <div className="ffield">
                    <label className="flabel">Room Name</label>
                    <input
                      type="text" placeholder="e.g. Big Room"
                      value={activeRoom.label} onChange={(e) => updateVariant(activeRoomIndex, 'label', e.target.value)}
                    />
                  </div>

                  <div className="frow">
                    <div className="ffield">
                      <label className="flabel">Rate (₱/hr)</label>
                      <input
                        type="number" min={0} placeholder="0"
                        value={activeRoom.price} onChange={(e) => updateVariant(activeRoomIndex, 'price', e.target.value)}
                      />
                    </div>
                    <div className="ffield">
                      <label className="flabel">Max Pax</label>
                      <input
                        type="text" placeholder="e.g. 6 pax"
                        value={activeRoom.pax} onChange={(e) => updateVariant(activeRoomIndex, 'pax', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="fm-section">
                  <div className="fm-section-title"><i className="ti ti-door"></i> Availability &amp; Status</div>
                  <div className="ffield">
                    <label className="flabel">Starting Room No.</label>
                    <span className="flabel-hint">Combined with Available Units, defines the range of table/room numbers used in Room Monitoring (e.g. start 101 + 3 units = 101, 102, 103).</span>
                    <input
                      type="number" min="1" placeholder="e.g. 101"
                      value={activeRoom.startingRoomNumber} onChange={(e) => updateVariant(activeRoomIndex, 'startingRoomNumber', e.target.value)}
                    />
                  </div>

                  <div className="ffield">
                    <label className="flabel">Available Units</label>
                    <span className="flabel-hint">How many identical rooms of this type exist, for reservation availability.</span>
                    <input
                      type="number" min="1"
                      value={activeRoom.roomCount ?? 1}
                      onChange={(e) => updateVariant(activeRoomIndex, 'roomCount', Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>

                  <div className="fm-room-number-preview">
                    <i className="ti ti-hash"></i> Generates: {roomNumberRangeLabel(activeRoom)}
                  </div>

                  <div className="ffield">
                    <label className="flabel">Status</label>
                    <div className="fm-status-toggle">
                      {['Available', 'Maintenance', 'Unavailable'].map((s) => (
                        <button
                          type="button"
                          key={s}
                          className={`fm-status-btn${(activeRoom.status || 'Available') === s ? ` fm-status-btn--active-${s}` : ''}`}
                          onClick={() => updateVariant(activeRoomIndex, 'status', s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="fm-section">
                  <div className="fm-section-title"><i className="ti ti-photo"></i> Room Image</div>
                  <div className="ffield">
                    <div className="fm-upload-zone">
                    <ImageUploadPreview
                      icon="ti-photo"
                      title={variantThumbSrc(activeRoomIndex, activeRoom) ? 'Click to change image' : 'Click to upload image'}
                      subtitle="PNG, JPG up to 10MB"
                      accept="image/png,image/jpeg"
                      maxSizeMB={10}
                      maxHeight={130}
                      value={variantThumbSrc(activeRoomIndex, activeRoom) || ''}
                      onFileSelect={(file) => handleVariantImageSelect(activeRoomIndex, file)}
                    />
                    </div>
                  </div>
                </div>

                <div className="fm-section">
                  <div className="fm-section-title"><i className="ti ti-sparkles"></i> Amenities</div>
                  <div className="ffield">
                    <div className="chip-list">
                      {(activeRoom.features || []).map((f, fi) => (
                        <span className="chip" key={fi}>
                          {f}
                          <button type="button" title="Remove" onClick={() => removeVariantFeature(activeRoomIndex, fi)}>
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
                            addVariantFeature(activeRoomIndex);
                          }
                        }}
                      />
                      <button type="button" className="chip-add-btn" onClick={() => addVariantFeature(activeRoomIndex)}>
                        <i className="ti ti-plus"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="variant-remove-btn-full"
                  onClick={() => { removeVariantRow(activeRoomIndex); setActiveRoomIndex(null); }}
                >
                  <i className="ti ti-trash"></i> Remove this room
                </button>
              </div>
            )}

            <div className="fm-step-nav">
              <button
                type="button"
                className="btn-cancel"
                disabled={stepIndex === 0}
                onClick={() => setFormStep(FORM_STEPS[stepIndex - 1].key)}
              >
                <i className="ti ti-arrow-left"></i> Back
              </button>
              <button
                type="button"
                className="btn-cancel"
                disabled={stepIndex === FORM_STEPS.length - 1}
                onClick={() => setFormStep(FORM_STEPS[stepIndex + 1].key)}
              >
                Next <i className="ti ti-arrow-right"></i>
              </button>
            </div>
          </div>

          <div className="fm-preview-col">
            {formStep === 'rooms' && activeRoomIndex !== null ? (
              <>
                <div className="fm-preview-label"><i className="ti ti-eye"></i>Live Preview — what guests see when picking a room</div>
                <div className="fm-preview-cards">
                  <RoomOptionCard
                    option={{ ...previewFacility.variants[activeRoomIndex] }}
                    room={previewFacility}
                  />
                </div>
              </>
            ) : formStep === 'rooms' ? (
              <>
                <div className="fm-preview-label"><i className="ti ti-eye"></i>Live Preview — the rooms guests will choose from</div>
                <div className="fm-preview-cards">
                  {previewFacility.variants.filter((v) => v.label?.trim()).length === 0 ? (
                    <div className="fm-preview-empty">Add a room to see how it looks to guests.</div>
                  ) : (
                    previewFacility.variants
                      .filter((v) => v.label?.trim())
                      .map((v, i) => <RoomOptionCard key={i} option={v} room={previewFacility} />)
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="fm-preview-label"><i className="ti ti-eye"></i>Live Preview — what guests see before Reserve Now</div>
                <div className="fm-preview-cards">
                  <FacilityBookingCard room={previewFacility} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="modal-actions-split">
          <button className="btn-remove" onClick={handleRemove} style={{ display: editingId ? 'inline-flex' : 'none' }}>
            <i className="ti ti-trash"></i> Remove
          </button>
          <button className="btn-save" disabled={saving || !!duplicateCategoryRoom} onClick={handleSave}>
            {saving ? (
              <><i className="ti ti-loader-2 spin"></i> Saving…</>
            ) : (
              <><i className="ti ti-device-floppy"></i> {editingId ? 'Save Changes' : 'Add Facility'}</>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default RoomManagement;