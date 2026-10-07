import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Flame, HeartPulse, LifeBuoy, Pencil, PhoneCall, Plus, Shield, Siren, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settings';
import { useConfirm } from '../../hooks/useConfirm';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/admin/emergency-contacts.css';

const CATEGORIES = [
  { key: 'fire', label: 'Fire station', icon: Flame },
  { key: 'police', label: 'Police', icon: Shield },
  { key: 'hospital', label: 'Hospital', icon: HeartPulse },
  { key: 'ambulance', label: 'Ambulance & rescue', icon: LifeBuoy },
  { key: 'disaster', label: 'Disaster response', icon: Siren },
  { key: 'other', label: 'Other contacts', icon: Building2 },
];

const EMPTY_FORM = { category: 'fire', name: '', phone: '', details: '' };

function dialHref(phone) {
  return `tel:${String(phone).replace(/(?!^)\+|[^\d+]/g, '')}`;
}

function EmergencyContacts() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings:manage');
  const { confirm, confirmProps } = useConfirm();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [formError, setFormError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const formRef = useRef(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await settingsService.getEmergencyContacts();
      setContacts(Array.isArray(result.contacts) ? result.contacts : []);
    } catch (error) {
      setLoadError(error.message || 'Could not load emergency contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  function openForm(contact = null) {
    setEditingId(contact?._id || null);
    setForm(contact ? {
      category: contact.category,
      name: contact.name,
      phone: contact.phone,
      details: contact.details || '',
    } : EMPTY_FORM);
    setFormError('');
    setActionError('');
    setFormOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
  }

  async function saveContact(event) {
    event.preventDefault();
    const payload = {
      category: form.category,
      name: form.name.trim(),
      phone: form.phone.trim(),
      details: form.details.trim(),
    };
    if (payload.name.length < 2) return setFormError('Enter the service or contact name.');
    if (!/^\+?[0-9() .-]{3,30}$/.test(payload.phone) || payload.phone.replace(/\D/g, '').length < 3) {
      return setFormError('Enter a callable phone number with at least three digits.');
    }

    setSaving(true);
    setFormError('');
    try {
      const saved = editingId
        ? await settingsService.updateEmergencyContact(editingId, payload)
        : await settingsService.addEmergencyContact(payload);
      setContacts((current) => editingId
        ? current.map((item) => item._id === editingId ? saved : item)
        : [...current, saved]);
      setFormOpen(false);
      setEditingId(null);
      setActionError('');
    } catch (error) {
      setFormError(error.message || 'Could not save this contact. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(contact) {
    const approved = await confirm(`Remove ${contact.name} from the emergency directory?`, {
      title: 'Remove emergency contact', danger: true, confirmText: 'Remove contact',
    });
    if (!approved) return;
    setDeletingId(contact._id);
    setActionError('');
    try {
      await settingsService.removeEmergencyContact(contact._id);
      setContacts((current) => current.filter((item) => item._id !== contact._id));
      if (editingId === contact._id) {
        setFormOpen(false);
        setEditingId(null);
      }
    } catch (error) {
      setActionError(error.message || 'Could not remove this contact. Try again.');
    } finally {
      setDeletingId(null);
    }
  }

  const visibleCategories = CATEGORIES.filter((category) =>
    ['fire', 'police', 'hospital'].includes(category.key) || contacts.some((contact) => contact.category === category.key));

  return (
    <div className="emergency-page" id="panel-emergency-contacts">
      <div className="emergency-intro">
        <div>
          <h1>Emergency contacts</h1>
          <p>Call the national hotline or find the local service you need.</p>
        </div>
        {canManage && <button type="button" className="emergency-add" onClick={() => openForm()}><Plus size={18} aria-hidden="true" /> Add contact</button>}
      </div>

      <section className="emergency-national" aria-labelledby="emergency-national-title">
        <div className="emergency-national-copy">
          <span className="emergency-national-icon"><Siren size={22} aria-hidden="true" /></span>
          <div>
            <h2 id="emergency-national-title">National emergency hotline</h2>
            <p>Police, fire, medical, and rescue emergencies across the Philippines.</p>
          </div>
        </div>
        <a className="emergency-national-call" href="tel:911"><PhoneCall size={18} aria-hidden="true" /><strong>911</strong><span>Call now</span></a>
      </section>

      {formOpen && canManage && (
        <section className="emergency-editor" aria-labelledby="emergency-editor-title" ref={formRef}>
          <div className="emergency-editor-head">
            <h2 id="emergency-editor-title">{editingId ? 'Edit contact' : 'Add a local contact'}</h2>
            <button type="button" onClick={closeForm} disabled={saving} aria-label="Close contact form"><X size={18} aria-hidden="true" /></button>
          </div>
          <form onSubmit={saveContact}>
            <div className="emergency-form-grid">
              <label>Service type
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} disabled={saving}>
                  {CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                </select>
              </label>
              <label>Service or contact name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} placeholder="e.g. San Rafael Fire Station" autoFocus required disabled={saving} />
              </label>
              <label>Phone number
                <input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} autoComplete="off" placeholder="e.g. (044) 123 4567" required disabled={saving} />
              </label>
              <label>Location or helpful note <span>(optional)</span>
                <input value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} maxLength={180} placeholder="Address, hours, or who to ask for" disabled={saving} />
              </label>
            </div>
            {formError && <p className="emergency-error" role="alert">{formError}</p>}
            <div className="emergency-form-actions">
              <button type="button" className="emergency-secondary" onClick={closeForm} disabled={saving}>Cancel</button>
              <button type="submit" className="emergency-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add contact'}</button>
            </div>
          </form>
        </section>
      )}

      <div className="emergency-directory-head">
        <div><h2>Local contacts</h2><p>Numbers saved by your venue team.</p></div>
        {!canManage && <span>Supervisors and Owners can update this list.</span>}
      </div>
      {actionError && <p className="emergency-error" role="alert">{actionError}</p>}
      {loadError && <div className="emergency-load-error" role="alert"><p>{loadError}</p><button type="button" onClick={loadContacts}>Try again</button></div>}
      {loading && <p className="emergency-loading" role="status">Loading local contacts…</p>}
      {!loading && !loadError && (
        <div className="emergency-groups">
          {visibleCategories.map((category) => {
            const Icon = category.icon;
            const entries = contacts.filter((contact) => contact.category === category.key).sort((a, b) => a.name.localeCompare(b.name));
            return (
              <section className="emergency-group" key={category.key} aria-labelledby={`emergency-${category.key}`}>
                <div className="emergency-group-head"><Icon size={19} aria-hidden="true" /><h3 id={`emergency-${category.key}`}>{category.label}</h3><span>{entries.length}</span></div>
                {entries.length === 0 ? <p className="emergency-empty">No local number saved yet.</p> : (
                  <div className="emergency-rows">
                    {entries.map((contact) => (
                      <div className="emergency-row" key={contact._id}>
                        <div className="emergency-row-details"><strong>{contact.name}</strong>{contact.details && <span>{contact.details}</span>}</div>
                        <a className="emergency-number" href={dialHref(contact.phone)} aria-label={`Call ${contact.name} at ${contact.phone}`}><PhoneCall size={17} aria-hidden="true" />{contact.phone}</a>
                        {canManage && <div className="emergency-row-actions">
                          <button type="button" onClick={() => openForm(contact)} aria-label={`Edit ${contact.name}`} title="Edit"><Pencil size={17} aria-hidden="true" /></button>
                          <button type="button" onClick={() => removeContact(contact)} disabled={deletingId === contact._id} aria-label={`Remove ${contact.name}`} title="Remove"><Trash2 size={17} aria-hidden="true" /></button>
                        </div>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

export default EmergencyContacts;
