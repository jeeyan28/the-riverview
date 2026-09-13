import '../../styles/admin/room-management.css';
import '../../styles/admin/room-management-v2.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  DoorOpen,
  Eye,
  FileText,
  Hash,
  ImageIcon,
  Info,
  Loader2,
  Mic2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Tags,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import Modal from '../../components/Modal';
import ImageUploadPreview from '../../components/ImageUploadPreview';
import FacilityBookingCard from '../../components/FacilityBookingCard';
import RoomOptionCard from '../../components/RoomOptionCard';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';
import { variantRateLabel } from '../../utils/roomPricing';

const SERVICE_CATEGORIES = ['Billiards', 'KTV', 'Court'];

const SERVICE_DEFAULTS = {
  Billiards: {
    description: 'Choose from shared, solo, and VIP billiards rooms.',
    variants: [
      { label: 'Shared Room', price: 150, pax: '', features: ['Shared billiards space'] },
      { label: 'Solo Regular', price: 200, pax: '', features: ['Private billiards table'] },
      { label: 'Solo Big Room', price: 250, pax: '', features: ['Larger private billiards room'] },
      { label: 'VIP', price: 400, pax: 'Max 10 pax', extraGuestFee: 50, includedGuests: 0, features: ['KTV + Pool', 'Maximum 10 guests'] },
    ],
  },
  KTV: {
    description: 'Private KTV rooms for groups and celebrations.',
    variants: [
      { label: 'Standard Room', price: 300, pax: '', features: ['Private KTV room'] },
    ],
  },
  Court: {
    description: 'Court rentals for casual play and official games.',
    variants: [
      { label: 'Standard', price: 350, pricingMode: 'time-based', eveningPrice: 400, eveningStartTime: '17:00', pax: '', features: ['₱350/hr from 7 AM–5 PM', '₱400/hr from 5 PM–12 AM'] },
      { label: 'Official Games', price: 500, pax: '', features: ['Scoreboard', 'Timer', 'Sound system'] },
    ],
  },
};

const FORM_STEPS = [
  { key: 'facility', label: 'Facility' },
  { key: 'rooms', label: 'Rooms' },
];

const ROOM_STATUS_PILL_CLASS = { Available: 'pill-active', Maintenance: 'pill-pending', Unavailable: 'pill-overdue' };

const SERVICE_ICON = {
  Billiards: CircleDot,
  KTV: Mic2,
  Court: Trophy,
};

function FacilityIcon({ name, size = 20 }) {
  const Icon = SERVICE_ICON[name] || Building2;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}

function emptyVariant() {
  return {
    label: '', price: '', pax: '', startingRoomNumber: '', roomCount: 1,
    status: 'Available', image: '', features: [], pricingMode: 'flat',
    eveningPrice: '', eveningStartTime: '17:00', includedGuests: 0, extraGuestFee: 0,
  };
}

function emptyFacilityForm(name = '') {
  const preset = SERVICE_DEFAULTS[name];
  return {
    name,
    description: preset?.description || '',
    variants: (preset?.variants || []).map((variant, index) => ({
      ...emptyVariant(),
      ...variant,
      startingRoomNumber: index + 1,
      roomCount: 1,
      features: [...(variant.features || [])],
    })),
  };
}

function lowestRoomPrice(variants) {
  if (!variants || !variants.length) return 0;
  return Math.min(...variants.flatMap((variant) => [
    Number(variant.price) || 0,
    ...(variant.pricingMode === 'time-based' && variant.eveningPrice !== '' && variant.eveningPrice !== null && variant.eveningPrice !== undefined ? [Number(variant.eveningPrice) || 0] : []),
  ]));
}

function roomNumberRangeLabel(v) {
  const start = Math.max(1, Number(v.startingRoomNumber) || 1);
  const count = Math.max(1, Number(v.roomCount) || 1);
  return count > 1 ? `Rooms ${start}–${start + count - 1}` : `Room ${start}`;
}

function statusCounts(variants) {
  const list = variants || [];
  return {
    available: list.filter((v) => v.status === 'Available').reduce((sum, variant) => sum + Math.max(1, Number(variant.roomCount) || 1), 0),
    maintenance: list.filter((v) => v.status === 'Maintenance').reduce((sum, variant) => sum + Math.max(1, Number(variant.roomCount) || 1), 0),
    unavailable: list.filter((v) => v.status === 'Unavailable').reduce((sum, variant) => sum + Math.max(1, Number(variant.roomCount) || 1), 0),
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
  const [catalogActionOpen, setCatalogActionOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formStep, setFormStep] = useState('facility');
  const [activeRoomIndex, setActiveRoomIndex] = useState(null);
  const [form, setForm] = useState(emptyFacilityForm());
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [variantImageFiles, setVariantImageFiles] = useState({});
  const [variantImagePreviews, setVariantImagePreviews] = useState({});
  const [featureInput, setFeatureInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomsService.adminList();
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
    setCatalogActionOpen(true);
  }

  function startNewFacility(name) {
    setEditingId(null);
    setFormStep('facility');
    setActiveRoomIndex(null);
    setForm(emptyFacilityForm(name));
    resetImageState();
    setFeatureInput('');
    setFormError('');
    setCatalogActionOpen(false);
    setModalOpen(true);
  }

  function openEditModal(room, { addRoom = false } = {}) {
    if (!guardPermission('room:manage')) return;
    const variants = (room.variants || []).map((v) => ({
      ...v,
      startingRoomNumber: v.startingRoomNumber ?? '',
      roomCount: v.roomCount ?? 1,
      status: v.status || 'Available',
      pricingMode: v.pricingMode || 'flat',
      eveningPrice: v.eveningPrice ?? '',
      eveningStartTime: v.eveningStartTime || '17:00',
      includedGuests: v.includedGuests ?? 0,
      extraGuestFee: v.extraGuestFee ?? 0,
      features: Array.isArray(v.features) ? v.features : [],
    }));
    if (addRoom) variants.push(emptyVariant());

    setEditingId(room._id);
    setFormStep(addRoom ? 'rooms' : 'facility');
    setActiveRoomIndex(addRoom ? variants.length - 1 : null);
    setForm({
      name: room.name || '',
      description: room.description || '',
      variants,
    });
    setExistingImageUrl(room.image ? resolveImageUrl(room.image) : '');
    setSelectedImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews((prev) => {
      Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
    setFeatureInput('');
    setFormError('');
    setCatalogActionOpen(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setSelectedImageFile(null);
    setFormError('');
  }

  function addRoom() {
    const newIndex = form.variants.length;
    setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }));
    setFeatureInput('');
    setFormError('');
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
    setFormError('');
    if (!form.name.trim()) {
      setFormStep('facility');
      setFormError('Choose a facility category before continuing.');
      return;
    }
    if (!SERVICE_CATEGORIES.includes(form.name.trim())) {
      setFormStep('facility');
      setFormError('Choose Billiards, KTV, or Court. These are the reservable facilities configured for Riverview.');
      return;
    }
    const normalized = form.name.trim().toLowerCase();
    const clash = rooms.find((r) => r.name.trim().toLowerCase() === normalized && r._id !== editingId);
    if (clash) {
      setFormStep('facility');
      setFormError(`${clash.name} is already set up. Use “Add room” on its card to expand its inventory.`);
      return;
    }
    const cleanVariantEntries = form.variants.map((v, originalIndex) => ({ v, originalIndex }));
    const invalidRoomNumber = cleanVariantEntries.find(({ v }) => {
      if (v.startingRoomNumber === '' || v.startingRoomNumber === null || v.startingRoomNumber === undefined) return false;
      const parsed = Number(v.startingRoomNumber);
      return !Number.isFinite(parsed) || parsed <= 0;
    });
    if (invalidRoomNumber) {
      setFormStep('rooms');
      setActiveRoomIndex(invalidRoomNumber.originalIndex);
      setFormError(`Starting room number for “${invalidRoomNumber.v.label || 'Untitled room'}” must be greater than 0.`);
      return;
    }
    const invalidVariant = cleanVariantEntries.find(({ v }) => {
      const price = Number(v.price);
      const eveningPrice = Number(v.eveningPrice);
      return !v.label.trim() || v.price === '' || !Number.isFinite(price) || price < 0 ||
        (v.pricingMode === 'time-based' && (v.eveningPrice === '' || !Number.isFinite(eveningPrice) || eveningPrice < 0));
    });
    if (invalidVariant) {
      setFormStep('rooms');
      setActiveRoomIndex(invalidVariant.originalIndex);
      setFormError('Give this room a name and a valid hourly rate. Scheduled pricing also needs an evening rate.');
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
      pricingMode: v.pricingMode || 'flat',
      eveningPrice: v.pricingMode === 'time-based' ? Number(v.eveningPrice) : null,
      eveningStartTime: v.eveningStartTime || '17:00',
      includedGuests: Math.max(0, Number(v.includedGuests) || 0),
      extraGuestFee: Math.max(0, Number(v.extraGuestFee) || 0),
    }));
    if (cleanVariants.length === 0) {
      setFormStep('rooms');
      setActiveRoomIndex(null);
      setFormError('Add at least one reservable room before saving the facility.');
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
      setFormError(err.message || 'The facility could not be saved. Check the fields and try again.');
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

  const categories = useMemo(
    () => [...SERVICE_CATEGORIES.filter((name) => rooms.some((room) => room.name === name)), ...Array.from(new Set(rooms.map((room) => room.name).filter((name) => name && !SERVICE_CATEGORIES.includes(name)))).sort()],
    [rooms]
  );

  const visibleRooms = useMemo(() => {
    let list = selectedCategory === 'all' ? rooms : rooms.filter((r) => r.name === selectedCategory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.variants || []).some((variant) => (variant.label || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [rooms, selectedCategory, search]);

  const stats = useMemo(() => {
    const allVariants = rooms.flatMap((r) => r.variants || []);
    return {
      facilities: rooms.length,
      totalRooms: allVariants.reduce((sum, variant) => sum + Math.max(1, Number(variant.roomCount) || 1), 0),
      available: allVariants.filter((v) => v.status === 'Available').reduce((sum, variant) => sum + Math.max(1, Number(variant.roomCount) || 1), 0),
      maintenance: allVariants.filter((v) => v.status === 'Maintenance').reduce((sum, variant) => sum + Math.max(1, Number(variant.roomCount) || 1), 0),
    };
  }, [rooms]);

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

  const stepIndex = FORM_STEPS.findIndex((s) => s.key === formStep);

  return (
    <div className="panel active" id="panel-room-management">
      <header className="facility-command-bar">
        <div className="facility-heading-lockup">
          <span className="facility-heading-icon"><Building2 size={24} aria-hidden="true" /></span>
          <div>
            <span className="facility-kicker">FACILITIES &amp; INVENTORY</span>
            <h2>Manage your spaces</h2>
            <p>Keep guest-facing details, room inventory, hourly rates, and availability in one place.</p>
          </div>
        </div>
        <div className="facility-command-stats" aria-label="Facility inventory summary">
          <div><strong>{rooms.length.toLocaleString()}</strong><span>Facilities</span></div>
          <div><strong>{stats.totalRooms.toLocaleString()}</strong><span>Total units</span></div>
          <div><strong>{stats.available.toLocaleString()}</strong><span>Ready</span></div>
          {stats.maintenance > 0 && <div className="needs-attention"><strong>{stats.maintenance.toLocaleString()}</strong><span>Maintenance</span></div>}
        </div>
      </header>

      <section className="facility-catalog-shell" aria-labelledby="facility-catalog-list-title">
        <div className="facility-catalog-tools">
          <label className="facility-search">
            <span className="visually-hidden">Search facilities</span>
            <Search size={17} aria-hidden="true" />
            <input type="search" placeholder="Search a facility or room type" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="facility-filter-tabs" role="tablist" aria-label="Facility category">
            <button type="button" role="tab" aria-selected={selectedCategory === 'all'} className={selectedCategory === 'all' ? 'active' : ''} onClick={() => setSelectedCategory('all')}>All <span>{rooms.length}</span></button>
            {categories.map((category) => (
              <button type="button" role="tab" key={category} aria-selected={selectedCategory === category} className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory(category)}>
                {category} <span>{rooms.filter((room) => room.name === category).length}</span>
              </button>
            ))}
          </div>
          <div className="facility-results">
            <span id="facility-catalog-list-title">{loading ? 'Loading…' : `${visibleRooms.length} shown`}</span>
            {(search || selectedCategory !== 'all') && <button type="button" onClick={clearFilters}><X size={13} aria-hidden="true" />Reset</button>}
          </div>
          {canManage && (
            <button type="button" className="facility-add-button" onClick={openAddModal}>
              <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
              Add facility
            </button>
          )}
        </div>

        <div className="facility-catalog-list">
          {loading ? (
            <div className="facility-empty-state"><span className="facility-loading-mark" /><strong>Loading facilities</strong><span>Getting the latest room inventory…</span></div>
          ) : visibleRooms.length === 0 ? (
            <div className="facility-empty-state">
              <span className="facility-empty-icon"><Building2 size={28} aria-hidden="true" /></span>
              <strong>{rooms.length === 0 ? 'Your catalog is empty' : 'No matching facilities'}</strong>
              <span>{rooms.length === 0 ? 'Create your first facility and add its reservable rooms.' : 'Try another search or clear the active filter.'}</span>
              {canManage && rooms.length === 0 && <button type="button" className="facility-add-button" onClick={openAddModal}><Plus size={18} />Add first facility</button>}
            </div>
          ) : visibleRooms.map((facility) => {
            const variants = Array.isArray(facility.variants) ? facility.variants : [];
            const counts = statusCounts(variants);
            const totalUnits = counts.available + counts.maintenance + counts.unavailable;
            return (
              <article className="facility-catalog-row" key={facility._id}>
                <div className="facility-catalog-media">
                  {facility.image ? <img src={resolveImageUrl(facility.image)} alt={`${facility.name} facility`} /> : <div className="facility-media-placeholder"><FacilityIcon name={facility.name} size={38} /><span>Add a cover photo</span></div>}
                  <span className="facility-category-mark"><FacilityIcon name={facility.name} size={18} />{facility.name}</span>
                  <span className="facility-price-mark">{variants.length ? `From ₱${lowestRoomPrice(variants).toLocaleString()}/hr` : 'Add pricing'}</span>
                </div>

                <div className="facility-catalog-main">
                  <div className="facility-catalog-title">
                    <div><h3>{facility.name}</h3><span>Visible in the customer booking catalog</span></div>
                    <span className={`facility-health ${counts.maintenance || counts.unavailable ? 'facility-health--attention' : ''}`}>
                      {counts.maintenance || counts.unavailable ? `${counts.maintenance + counts.unavailable} need attention` : `${counts.available} ready`}
                    </span>
                  </div>
                  <p className={facility.description ? '' : 'facility-copy-missing'}>{facility.description || 'Add a short description so guests know what makes this facility useful.'}</p>

                  <div className="facility-card-facts" aria-label={`${facility.name} summary`}>
                    <span><DoorOpen size={16} /><strong>{variants.length}</strong> room type{variants.length === 1 ? '' : 's'}</span>
                    <span><CheckCircle2 size={16} /><strong>{counts.available}</strong> ready</span>
                    <span><Building2 size={16} /><strong>{totalUnits}</strong> total unit{totalUnits === 1 ? '' : 's'}</span>
                  </div>

                  <div className="facility-room-section-head"><span>Rooms &amp; hourly rates</span><span>{variants.length} type{variants.length === 1 ? '' : 's'}</span></div>
                  <div className="facility-room-type-list" aria-label={`${facility.name} room types`}>
                    {variants.length ? variants.map((variant, index) => (
                      <div className="facility-room-type-row" key={`${variant.label}-${index}`}>
                        <span className={`facility-room-status-dot facility-room-status-dot--${(variant.status || 'Available').toLowerCase().replace(' ', '-')}`} aria-hidden="true" />
                        <span className="facility-room-name"><strong>{variant.label || `Room type ${index + 1}`}</strong><small>{roomNumberRangeLabel(variant)}{variant.pax ? ` · ${variant.pax}` : ''}</small></span>
                        <span className={`facility-room-status ${ROOM_STATUS_PILL_CLASS[variant.status] || 'pill-active'}`}>{variant.status || 'Available'}</span>
                        <strong className="facility-room-rate">{variantRateLabel(variant)}</strong>
                      </div>
                    )) : <div className="facility-room-type-empty">Add at least one room type and hourly price.</div>}
                  </div>
                </div>

                <div className="facility-catalog-actions">
                  {canManage ? <>
                    <button type="button" className="facility-add-room-button" onClick={() => openEditModal(facility, { addRoom: true })}><Plus size={17} aria-hidden="true" />Add room</button>
                    <button type="button" className="facility-edit-button" onClick={() => openEditModal(facility)}><Pencil size={16} aria-hidden="true" />Manage</button>
                    <button type="button" className="facility-remove-button" aria-label={`Remove ${facility.name}`} title={`Remove ${facility.name}`} onClick={() => quickDelete(facility._id)}><Trash2 size={16} aria-hidden="true" /></button>
                  </> : <span>View only</span>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Modal open={catalogActionOpen} onClose={() => setCatalogActionOpen(false)} ariaLabel="Add to facility catalog" size="lg" className="facility-action-modal">
        <div className="facility-action-header">
          <div className="facility-action-icon"><Plus size={22} aria-hidden="true" /></div>
          <div>
            <span className="facility-kicker">ADD TO CATALOG</span>
            <h2>What would you like to add?</h2>
            <p>Choose a facility below. New services get a ready-to-edit template; configured services open a blank room form.</p>
          </div>
          <button type="button" className="fm-close-btn" aria-label="Close" onClick={() => setCatalogActionOpen(false)}><X size={18} /></button>
        </div>
        <div className="facility-action-options">
          {SERVICE_CATEGORIES.map((name) => {
            const existing = rooms.find((room) => room.name === name);
            return (
              <button key={name} type="button" className="facility-action-option" onClick={() => existing ? openEditModal(existing, { addRoom: true }) : startNewFacility(name)}>
                <span className="facility-action-option-icon"><FacilityIcon name={name} size={24} /></span>
                <span className="facility-action-option-copy">
                  <span className={`facility-action-state ${existing ? 'is-configured' : 'is-new'}`}>{existing ? 'Facility configured' : 'Not set up yet'}</span>
                  <strong>{name}</strong>
                  <small>{existing ? `Add another room type to ${name}.` : `Create the ${name} facility with suggested rooms and rates.`}</small>
                </span>
                <span className="facility-action-option-cta"><Plus size={16} />{existing ? 'Add room' : 'Create'}</span>
              </button>
            );
          })}
        </div>
        <div className="facility-action-note"><CheckCircle2 size={17} /><span>Billiards, KTV, and Court are the guest booking categories defined for Riverview.</span></div>
      </Modal>

      <Modal open={modalOpen} onClose={closeModal} ariaLabel={editingId ? `Edit ${form.name || 'facility'}` : 'Add facility'} size="2xl" className="fm-editor-modal">
        <div className="fm-modal-header">
          <div>
            <span className="fm-modal-kicker">FACILITY EDITOR</span>
            <div className="modal-lg-title">{editingId ? `Edit ${form.name || 'facility'}` : 'Add a facility'}</div>
            <div className="modal-lg-sub">
              Set what guests see, then configure each reservable room and hourly rate.
            </div>
          </div>
          <button type="button" className="fm-close-btn" aria-label="Close facility editor" onClick={closeModal}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="fm-editor-body">
        <div className="fm-stepper" role="tablist" aria-label="Facility editor sections">
          {FORM_STEPS.map((s, i) => {
            const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'upcoming';
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={state === 'active'}
                className={`fm-step-dot fm-step-dot--${state}`}
                onClick={() => {
                  setFormStep(s.key);
                  if (s.key !== 'rooms') setActiveRoomIndex(null);
                }}
              >
                <span className="fm-step-dot-num">{state === 'done' ? <CheckCircle2 size={15} aria-hidden="true" /> : i + 1}</span>
                <span className="fm-step-copy">
                  <strong>{s.label}{s.key === 'rooms' && form.variants.length > 0 ? ` (${form.variants.length})` : ''}</strong>
                  <small>{s.key === 'facility' ? 'Guest-facing basics' : 'Inventory and pricing'}</small>
                </span>
              </button>
            );
          })}
        </div>

        {formError && (
          <div className="fm-form-alert" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <span>{formError}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setFormError('')}><X size={15} aria-hidden="true" /></button>
          </div>
        )}

        <div className="fm-layout">
          <div className="fm-form-col">
            {formStep === 'facility' && (
              <>
                <div className="fm-section">
                <div className="ffield">
                  <label className="flabel"><Tags size={15} aria-hidden="true" /> Facility category</label>
                  <span className="flabel-hint">This controls where the facility appears in the guest booking catalog.</span>
                  <select
                    value={SERVICE_CATEGORIES.includes(form.name) ? form.name : ''}
                    onChange={(event) => {
                      const name = event.target.value;
                      setForm((current) => editingId ? { ...current, name } : emptyFacilityForm(name));
                    }}
                  >
                    {!SERVICE_CATEGORIES.includes(form.name) && <option value="">Choose a supported service…</option>}
                    {SERVICE_CATEGORIES.map((name) => {
                      const usedByAnother = rooms.some((room) => room.name === name && room._id !== editingId);
                      return <option key={name} value={name} disabled={usedByAnother}>{name}{usedByAnother ? ' — already configured' : ''}</option>;
                    })}
                  </select>
                  {!SERVICE_CATEGORIES.includes(form.name) && editingId && (
                    <div className="fm-field-warning">This legacy category is outside project scope. Choose Billiards, KTV, or Court, or remove it.</div>
                  )}
                </div>
                </div>

                <div className="fm-section">
                <div className="ffield">
                  <label className="flabel"><FileText size={15} aria-hidden="true" /> Guest description</label>
                  <textarea
                    placeholder="Short description guests will see"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                </div>

                <div className="fm-section">
                <div className="ffield">
                  <label className="flabel"><ImageIcon size={15} aria-hidden="true" /> Cover photo</label>
                  <span className="flabel-hint">Use a bright landscape photo that helps guests recognize the space.</span>
                  <div className="fm-upload-zone">
                  <ImageUploadPreview
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
                  <label className="flabel"><DoorOpen size={15} aria-hidden="true" /> Rooms</label>
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
                        {variantThumbSrc(i, v) ? <img src={variantThumbSrc(i, v)} alt="" /> : <ImageIcon size={22} aria-hidden="true" />}
                        <span className={`pill ${ROOM_STATUS_PILL_CLASS[v.status] || 'pill-done'}`}>{v.status || 'Available'}</span>
                      </div>
                      <div className="fm-room-card-body">
                        <div className="fm-room-card-name">{v.label || 'Untitled Room'}</div>
                        <div className="fm-room-card-meta">
                          {variantRateLabel(v)}{v.pax ? ` · ${v.pax}` : ''} · {roomNumberRangeLabel(v)}
                        </div>
                      </div>
                      <div className="fm-room-card-actions">
                        <button
                          type="button" title="Edit room"
                          onClick={(e) => { e.stopPropagation(); setFeatureInput(''); setActiveRoomIndex(i); }}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button" className="del" title="Remove room"
                          onClick={(e) => { e.stopPropagation(); removeVariantRow(i); }}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="fm-room-add-card" onClick={addRoom}>
                    <Plus size={17} aria-hidden="true" />Add Room
                  </button>
                </div>
              </div>
            )}

            {formStep === 'rooms' && activeRoom !== null && (
              <div className="fm-room-detail">
                <button type="button" className="fm-room-back" onClick={() => setActiveRoomIndex(null)}>
                  <ArrowLeft size={16} aria-hidden="true" /> Back to Rooms
                </button>

                <div className="fm-section">
                  <div className="fm-section-title"><Info size={16} aria-hidden="true" /> Basic Details</div>
                  <div className="ffield">
                    <label className="flabel">Room Name</label>
                    <input
                      type="text" placeholder="e.g. Big Room"
                      value={activeRoom.label} onChange={(e) => updateVariant(activeRoomIndex, 'label', e.target.value)}
                    />
                  </div>

                  <div className="frow">
                    <div className="ffield">
                      <label className="flabel">{activeRoom.pricingMode === 'time-based' ? 'Daytime Rate (₱/hr)' : 'Rate (₱/hr)'}</label>
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

                  <div className="ffield">
                    <label className="flabel">Pricing schedule</label>
                    <select
                      value={activeRoom.pricingMode || 'flat'}
                      onChange={(event) => updateVariant(activeRoomIndex, 'pricingMode', event.target.value)}
                    >
                      <option value="flat">Same rate all day</option>
                      <option value="time-based">Daytime and evening rates</option>
                    </select>
                  </div>

                  {activeRoom.pricingMode === 'time-based' && (
                    <div className="frow">
                      <div className="ffield">
                        <label className="flabel">Evening Rate (₱/hr)</label>
                        <input
                          type="number" min={0} placeholder="400"
                          value={activeRoom.eveningPrice}
                          onChange={(event) => updateVariant(activeRoomIndex, 'eveningPrice', event.target.value)}
                        />
                      </div>
                      <div className="ffield">
                        <label className="flabel">Evening starts</label>
                        <input
                          type="time" step="3600"
                          value={activeRoom.eveningStartTime || '17:00'}
                          onChange={(event) => updateVariant(activeRoomIndex, 'eveningStartTime', event.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="frow">
                    <div className="ffield">
                      <label className="flabel">Included Guests</label>
                      <span className="flabel-hint">Use 0 when the per-guest fee applies to everyone.</span>
                      <input
                        type="number" min={0}
                        value={activeRoom.includedGuests ?? 0}
                        onChange={(event) => updateVariant(activeRoomIndex, 'includedGuests', event.target.value)}
                      />
                    </div>
                    <div className="ffield">
                      <label className="flabel">Extra Guest Fee (₱/guest/hr)</label>
                      <span className="flabel-hint">Set 0 when no guest surcharge applies.</span>
                      <input
                        type="number" min={0}
                        value={activeRoom.extraGuestFee ?? 0}
                        onChange={(event) => updateVariant(activeRoomIndex, 'extraGuestFee', event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="fm-section">
                  <div className="fm-section-title"><DoorOpen size={16} aria-hidden="true" /> Availability &amp; Status</div>
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
                    <Hash size={15} aria-hidden="true" /> Generates: {roomNumberRangeLabel(activeRoom)}
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
                  <div className="fm-section-title"><ImageIcon size={16} aria-hidden="true" /> Room Image</div>
                  <div className="ffield">
                    <div className="fm-upload-zone">
                    <ImageUploadPreview
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
                  <div className="fm-section-title"><Sparkles size={16} aria-hidden="true" /> Amenities</div>
                  <div className="ffield">
                    <div className="chip-list">
                      {(activeRoom.features || []).map((f, fi) => (
                        <span className="chip" key={fi}>
                          {f}
                          <button type="button" title="Remove" onClick={() => removeVariantFeature(activeRoomIndex, fi)}>
                            <X size={12} aria-hidden="true" />
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
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="variant-remove-btn-full"
                  onClick={() => { removeVariantRow(activeRoomIndex); setActiveRoomIndex(null); }}
                >
                  <Trash2 size={16} aria-hidden="true" /> Remove this room
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
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
              <button
                type="button"
                className="btn-cancel"
                disabled={stepIndex === FORM_STEPS.length - 1}
                onClick={() => setFormStep(FORM_STEPS[stepIndex + 1].key)}
              >
                Next <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <details className="fm-preview-col" open>
            <summary><Eye size={17} aria-hidden="true" /><span>Customer preview</span><small>See the result while you edit</small><ChevronDown size={16} aria-hidden="true" /></summary>
            <div className="fm-preview-content">
            {formStep === 'rooms' && activeRoomIndex !== null ? (
              <>
                <div className="fm-preview-label">Selected room card</div>
                <div className="fm-preview-cards">
                  <RoomOptionCard
                    option={{ ...previewFacility.variants[activeRoomIndex] }}
                    room={previewFacility}
                  />
                </div>
              </>
            ) : formStep === 'rooms' ? (
              <>
                <div className="fm-preview-label">Reservable room choices</div>
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
                <div className="fm-preview-label">Facility card</div>
                <div className="fm-preview-cards">
                  <FacilityBookingCard room={previewFacility} />
                </div>
              </>
            )}
            </div>
          </details>
        </div>
        </div>

        <div className="modal-actions-split">
          <div>{editingId && <button className="btn-remove" onClick={handleRemove}><Trash2 size={16} aria-hidden="true" />Remove facility</button>}</div>
          <div className="fm-primary-actions">
            <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
            <button className="btn-save" disabled={saving || !SERVICE_CATEGORIES.includes(form.name)} onClick={handleSave}>
              {saving ? <><Loader2 size={16} className="spin" aria-hidden="true" />Saving…</> : <><Save size={16} aria-hidden="true" />{editingId ? 'Save changes' : 'Add facility'}</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default RoomManagement;
