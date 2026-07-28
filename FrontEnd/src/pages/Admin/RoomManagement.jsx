import { useCallback, useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import ImageUploadPreview from '../../components/ImageUploadPreview';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';

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
    variants: [], // [{ label, price, pax, roomCount, status }]
    features: [],
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
      // Tolerate features/variants arriving as strings from an older backend.
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
      variants: (room.variants || []).map((v) => ({ ...v, roomCount: v.roomCount ?? 1, status: v.status || 'Available' })),
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
    setForm((f) => ({
      ...f,
      variants: [...f.variants, { label: '', price: '', pax: '', roomCount: 1, status: 'Available' }],
    }));
  }

  function updateVariant(i, field, value) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)),
    }));
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
      .map((v) => ({
        label: v.label.trim(),
        price: Number(v.price) || 0,
        pax: (v.pax || '').trim(),
        roomCount: Math.max(1, Number(v.roomCount) || 1),
        status: v.status || 'Available',
      }));
    if (!form.price && cleanVariants.length === 0) {
      alert('Add a base price, or at least one pricing tier.');
      return;
    }

    setSaving(true);
    try {
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
      await roomsService.create(payload);
      await fetchRooms();
    } catch (err) {
      console.error(err);
      alert('Could not duplicate this facility.');
    }
  }

  return (
    <div className="panel active" id="panel-room-management">
      <div className="card">
        <div className="fac-head">
          <div className="fac-head-left">
            <i className="ti ti-building"></i>
            <span className="fac-head-title">Manage your Facility</span>
          </div>
          {canManage && (
            <button className="btn-teal" onClick={openAddModal}>
              <i className="ti ti-plus"></i>Add Facility
            </button>
          )}
        </div>
      </div>

      <div className="fac-grid" id="fac-grid">
        {loading ? (
          <div className="room-grid-empty">Loading facilities…</div>
        ) : rooms.length === 0 ? (
          <div className="room-grid-empty">No facilities yet. Click "Add Facility" to create one.</div>
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
      <Modal open={modalOpen} onClose={closeModal} size="xl">
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
                  <input
                    type="number"
                    min="1"
                    className="variant-room-count"
                    placeholder="Rooms"
                    value={v.roomCount ?? 1}
                    onChange={(e) => updateVariant(i, 'roomCount', Math.max(1, Number(e.target.value) || 1))}
                  />
                  <select
                    className="variant-status"
                    value={v.status || 'Available'}
                    onChange={(e) => updateVariant(i, 'status', e.target.value)}
                  >
                    <option value="Available">Available</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Unavailable">Unavailable</option>
                  </select>
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
    </div>
  );
}

export default RoomManagement;