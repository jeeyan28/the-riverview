import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { settingsService } from '../../services/settings';
import { useSiteSettings } from '../../hooks/useSiteSettings';
import { useConfirm } from '../../hooks/useConfirm';
import { TERMS_CONTENT } from '../../data/legalContent';

const SETTINGS_MANAGE_PERMISSION = 'settings:manage';
const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'fil', label: 'Filipino' },
];

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toDraft(terms) {
  const source = terms?.en?.sections?.length ? terms : TERMS_CONTENT;
  const langDraft = (key) => {
    const doc = source[key] || source.en;
    return {
      intro: doc?.intro || '',
      sections: (doc?.sections || []).map((section) => ({
        heading: section.heading || '',
        paragraphs: (section.paragraphs || []).join('\n'),
        list: (section.list || []).join('\n'),
      })),
    };
  };
  return { en: langDraft('en'), fil: langDraft('fil') };
}

function payloadFromDraft(draft) {
  const langPayload = (key) => ({
    intro: draft[key].intro.trim(),
    sections: draft[key].sections
      .map((section) => ({
        heading: section.heading.trim(),
        paragraphs: section.paragraphs.split('\n').map((line) => line.trim()).filter(Boolean),
        list: section.list.split('\n').map((line) => line.trim()).filter(Boolean),
      }))
      .filter((section) => section.heading && (section.paragraphs.length || section.list.length)),
  });
  return { lastUpdated: todayLabel(), en: langPayload('en'), fil: langPayload('fil') };
}

function TermsTab() {
  const { guardPermission } = useAuth();
  const { refetch: refreshSiteSettings } = useSiteSettings();
  const { confirm, confirmProps } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('en');
  const [draft, setDraft] = useState(() => toDraft(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchTerms = useCallback(async () => {
    try {
      const settings = await settingsService.getAdmin();
      setDraft(toDraft(settings?.terms));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load the current terms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  const active = draft[lang];

  function updateActive(updater) {
    setDraft((previous) => ({ ...previous, [lang]: updater(previous[lang]) }));
    setNotice('');
    setError('');
  }

  function updateSection(index, field, value) {
    updateActive((doc) => ({
      ...doc,
      sections: doc.sections.map((section, position) => (position === index ? { ...section, [field]: value } : section)),
    }));
  }

  function addSection() {
    updateActive((doc) => ({ ...doc, sections: [...doc.sections, { heading: '', paragraphs: '', list: '' }] }));
  }

  async function removeSection(index) {
    const section = active.sections[index];
    const approved = await confirm(`Remove "${section.heading.trim() || 'this section'}"?`, {
      title: 'Remove section',
      danger: true,
      confirmText: 'Remove',
    });
    if (!approved) return;
    updateActive((doc) => ({ ...doc, sections: doc.sections.filter((_, position) => position !== index) }));
  }

  async function handleReset() {
    const approved = await confirm('Replace both languages with the original default Terms of Service? Nothing changes for customers until you save.', {
      title: 'Reset to default',
      danger: true,
      confirmText: 'Reset',
    });
    if (!approved) return;
    setDraft(toDraft(null));
    setError('');
    setNotice('Default text loaded. Save changes to publish it.');
  }

  async function handleSave() {
    if (!guardPermission(SETTINGS_MANAGE_PERMISSION, "You don't have permission to change the terms of service.")) return;
    const payload = payloadFromDraft(draft);
    if (!payload.en.sections.length || !payload.fil.sections.length) {
      setError('Each language needs at least one section with a heading and some content.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await settingsService.updateTerms(payload);
      await fetchTerms();
      try { await refreshSiteSettings(); } catch { /* the public page reloads on its own */ }
      setNotice('Saved. The Terms of Service page now shows this text.');
    } catch (err) {
      setError(err.message || 'Could not save the terms of service.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fac-head">
        <div className="fac-head-left">
          <i className="ti ti-file-text"></i>
          <span className="fac-head-title">Terms &amp; Services</span>
        </div>
        <div className="terms-head-actions">
          <Link className="announcement-btn" to="/terms" target="_blank" rel="noopener noreferrer">Preview</Link>
          <button className="announcement-btn" type="button" disabled={loading || saving} onClick={handleReset}>Reset to default</button>
          <button className="save-btn" type="button" disabled={loading || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <p className="terms-note">
        This text is shown on the public Terms of Service page and inside the sign-up agreement.
        Each line in the boxes below becomes its own paragraph or bullet, so write one sentence per line.
        Saving stamps the “Last updated” date automatically.
      </p>

      {error && <p className="settings-form-error" role="alert">{error}</p>}
      {notice && <p className="terms-saved" role="status">{notice}</p>}

      <div className="terms-lang-switch" role="group" aria-label="Terms language">
        {LANGUAGES.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`day-pill${lang === option.key ? ' on' : ''}`}
            aria-pressed={lang === option.key}
            onClick={() => setLang(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="announcement-empty">Loading terms…</div>
      ) : (
        <>
          <div className="pfield">
            <label htmlFor="terms-intro">Introduction</label>
            <textarea
              id="terms-intro"
              rows={3}
              value={active.intro}
              onChange={(event) => updateActive((doc) => ({ ...doc, intro: event.target.value }))}
              placeholder="Opening paragraph shown before the first section"
            />
          </div>

          <div className="terms-sections">
            {active.sections.map((section, index) => (
              <div className="terms-section-card" key={`${lang}-${index}`}>
                <div className="terms-section-head">
                  <span className="terms-section-num">{index + 1}</span>
                  <input
                    type="text"
                    value={section.heading}
                    aria-label={`Section ${index + 1} heading`}
                    placeholder='Section heading, e.g. "3. Payment"'
                    onChange={(event) => updateSection(index, 'heading', event.target.value)}
                  />
                  <button
                    className="announcement-btn danger"
                    type="button"
                    title="Remove section"
                    aria-label={`Remove section ${section.heading || index + 1}`}
                    onClick={() => removeSection(index)}
                  >
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
                <div className="pfield">
                  <label>Paragraphs (one per line)</label>
                  <textarea
                    rows={4}
                    value={section.paragraphs}
                    placeholder="Leave empty if this section only uses bullet points"
                    onChange={(event) => updateSection(index, 'paragraphs', event.target.value)}
                  />
                </div>
                <div className="pfield" style={{ marginBottom: 0 }}>
                  <label>Bullet points (one per line)</label>
                  <textarea
                    rows={4}
                    value={section.list}
                    placeholder="Leave empty if this section only uses paragraphs"
                    onChange={(event) => updateSection(index, 'list', event.target.value)}
                  />
                </div>
              </div>
            ))}
            {active.sections.length === 0 && (
              <div className="announcement-empty">No sections yet. Add one to start writing this language.</div>
            )}
          </div>

          <button className="btn-teal-outline" type="button" onClick={addSection}>
            <i className="ti ti-plus"></i>Add section
          </button>
        </>
      )}

      <ConfirmDialog {...confirmProps} />
    </>
  );
}

export default TermsTab;
