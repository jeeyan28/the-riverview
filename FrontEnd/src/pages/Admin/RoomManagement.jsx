import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import ImageUploadPreview from '../../components/ImageUploadPreview';
import RoomOptionCard from '../../components/RoomOptionCard';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { priceOptionsFor } from '../../utils/rooms';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';

// Edit-modal flow — mirrors the same step-by-step feel as BookingModal's
// stepper (Room -> Pricing -> ... ), reordered for editing content rather
// than transacting: Room identity, then Pricing, then Images, then Amenities.
const FORM_STEPS = [
  { key: 'room', label: 'Room' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'images', label: 'Images' },
  { key: 'amenities', label: 'Amenities' },
];

function emptyFacilityForm() {
  return {
    name: '',
    roomNumber: '',
    description: '',
    price: '',
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
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = Add mode
  const [formStep, setFormStep] = useState('room');
  const [form, setForm] = useState(emptyFacilityForm());
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [variantImageFiles, setVariantImageFiles] = useState({}); // { [variantIndex]: File }
  const [variantImagePreviews, setVariantImagePreviews] = useState({}); // { [variantIndex]: blobUrl }
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
    setFormStep('room');
    setForm(emptyFacilityForm());
    setExistingImageUrl('');
    setSelectedImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
    setFeatureInput('');
    setModalOpen(true);
  }

  function openEditModal(room) {
    if (!guardPermission('room:manage')) return;
    setEditingId(room._id);
    setFormStep('room');
    setForm({
      name: room.name || '',
      roomNumber: room.roomNumber || '',
      description: room.description || '',
      price: room.price || '',
      capacity: room.capacity || '',
      variants: (room.variants || []).map((v) => ({ ...v, roomCount: v.roomCount ?? 1, status: v.status || 'Available' })),
      features: [...(room.features || [])],
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

  /* ── pricing tiers ── */
  function addVariantRow() {
    setForm((f) => ({
      ...f,
      variants: [...f.variants, { label: '', price: '', pax: '', roomCount: 1, status: 'Available', image: '' }],
    }));
  }

  function updateVariant(i, field, value) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)),
    }));
  }

  // Shifts map keys down by one past the removed index, dropping the
  // removed entry — keeps variantImageFiles/variantImagePreviews aligned
  // with form.variants after a row is deleted.
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
    const cleanVariantEntries = form.variants
      .map((v, originalIndex) => ({ v, originalIndex }))
      .filter(({ v }) => v.label.trim() !== '' || v.price !== '');
    const cleanVariants = cleanVariantEntries.map(({ v }) => ({
      label: v.label.trim(),
      price: Number(v.price) || 0,
      pax: (v.pax || '').trim(),
      roomCount: Math.max(1, Number(v.roomCount) || 1),
      status: v.status || 'Available',
      image: v.image || '',
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
      formData.append('capacity', Number(form.capacity) || 0);
      formData.append('features', JSON.stringify(form.features));
      formData.append('variants', JSON.stringify(cleanVariants));
      if (selectedImageFile) formData.append('image', selectedImageFile);

      // Map each pending variant image file to its position in the final
      // cleanVariants array (filtering above may have shifted indices).
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
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      description: room.description,
      price: room.price,
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

  const categories = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.name).filter(Boolean))).sort(),
    [rooms]
  );
  const visibleRooms = selectedCategory === 'all' ? rooms : rooms.filter((r) => r.name === selectedCategory);
  const facilityImagePreviewUrl = useMemo(
    () => (selectedImageFile ? URL.createObjectURL(selectedImageFile) : existingImageUrl),
    [selectedImageFile, existingImageUrl]
  );

  const previewOptions = useMemo(() => {
    const formForPreview = {
      ...form,
      image: facilityImagePreviewUrl,
      variants: form.variants.map((v, i) => ({ ...v, image: variantImagePreviews[i] || v.image })),
    };
    return priceOptionsFor(formForPreview);
  }, [form, facilityImagePreviewUrl, variantImagePreviews]);

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

      <div className="set-layout">
        <div className="set-tabs">
          <button
            type="button"
            className={`set-tab${selectedCategory === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`set-tab${selectedCategory === cat ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="set-content">
          <div className="fac-grid" id="fac-grid">
            {loading ? (
              <div className="room-grid-empty">Loading facilities…</div>
            ) : visibleRooms.length === 0 ? (
              <div className="room-grid-empty">
                {rooms.length === 0 ? 'No facilities yet. Click "Add Facility" to create one.' : 'No facilities in this category yet.'}
              </div>
            ) : (
              visibleRooms.map((r) => {
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
        </div>
      </div>

      {/* ── Facility Add/Edit modal ── */}
      <Modal open={modalOpen} onClose={closeModal} size="2xl">
        <div className="modal-lg-title">{editingId ? 'Edit Facility' : 'Add Facility'}</div>
        <div className="modal-lg-sub">
          {editingId ? 'Update facility information, pricing tiers, and features.' : 'Add a new facility to your listing.'}
        </div>

        <div className="fm-stepper">
          {FORM_STEPS.map((s, i) => {
            const activeIndex = FORM_STEPS.findIndex((x) => x.key === formStep);
            const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming';
            return (
              <button
                type="button"
                key={s.key}
                className={`fm-step-dot fm-step-dot--${state}`}
                onClick={() => setFormStep(s.key)}
              >
                <span className="fm-step-dot-num">{state === 'done' ? <i className="ti ti-check"></i> : i + 1}</span>
                <span className="fm-step-dot-label">{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="fm-layout">
          <div className="fm-form-col">
            {formStep === 'room' && (
            <>
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
          <label className="flabel">Max Capacity (Pax)</label>
          <span className="flabel-hint">Guests won't be able to book more pax than this. Leave 0/blank for no limit.</span>
          <input type="number" placeholder="e.g. 10" min={0} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
        </div>
            </>
            )}

            {formStep === 'pricing' && (
            <>
        <div className="ffield">
          <div className="flabel-row">
            <label className="flabel">Pricing Tiers</label>
            <span className="flabel-hint">Each tier needs a name, rate, and pax allowance — this is what guests pick from.</span>
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

        <div className="ffield">
          <label className="flabel">Base Price (₱/hr)</label>
          <input type="number" placeholder="0" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </div>

        <div className="field-note">Base price is used only when no pricing tiers are set.</div>
            </>
            )}

            {formStep === 'images' && (
            <>
        <div className="ffield">
          <label className="flabel">Facility Image</label>
          <span className="flabel-hint">Shown on the category card in the main catalogue grid.</span>
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

        {form.variants.length > 0 && (
          <div className="ffield">
            <div className="flabel-row">
              <label className="flabel">Pricing Tier Images</label>
              <span className="flabel-hint">Shown when guests pick a room — falls back to a default photo if left blank.</span>
            </div>
            <div className="fm-tier-image-grid">
              {form.variants.map((v, i) => (
                <div className="fm-tier-image-item" key={i}>
                  <div className="fm-tier-image-label">{v.label || `Tier ${i + 1}`}</div>
                  <ImageUploadPreview
                    icon="ti-photo"
                    title={variantThumbSrc(i, v) ? 'Click to change image' : 'Click to upload image'}
                    subtitle="PNG, JPG up to 10MB"
                    accept="image/png,image/jpeg"
                    maxSizeMB={10}
                    maxHeight={90}
                    value={variantThumbSrc(i, v) || ''}
                    onFileSelect={(file) => handleVariantImageSelect(i, file)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
            </>
            )}

            {formStep === 'amenities' && (
            <>
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
            </>
            )}

            <div className="fm-step-nav">
              <button
                type="button"
                className="btn-cancel"
                disabled={FORM_STEPS.findIndex((s) => s.key === formStep) === 0}
                onClick={() => setFormStep(FORM_STEPS[FORM_STEPS.findIndex((s) => s.key === formStep) - 1].key)}
              >
                <i className="ti ti-arrow-left"></i> Back
              </button>
              <button
                type="button"
                className="btn-cancel"
                disabled={FORM_STEPS.findIndex((s) => s.key === formStep) === FORM_STEPS.length - 1}
                onClick={() => setFormStep(FORM_STEPS[FORM_STEPS.findIndex((s) => s.key === formStep) + 1].key)}
              >
                Next <i className="ti ti-arrow-right"></i>
              </button>
            </div>
          </div>

          <div className="fm-preview-col">
            <div className="fm-preview-label">Live Preview — what guests will see</div>
            <div className="fm-preview-cards">
              {previewOptions.map((opt, i) => (
                <RoomOptionCard key={i} option={opt} room={{ ...form, image: facilityImagePreviewUrl }} />
              ))}
            </div>
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