import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import '../styles/legal-page.css';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
];

function LegalDocument({ title, content, lastUpdated, embedded = false, onClose }) {
  const [lang, setLang] = useState('en');
  const doc = content[lang] || content.en;

  return (
    <section className={`legal-page${embedded ? ' legal-page--embedded' : ''}`}>
      <div className="legal-inner">
        {!embedded && (
          <Link to="/" className="legal-back">
            <ArrowLeft size={16} />
            Back to home
          </Link>
        )}

        <div className="legal-header">
          <div>
            {!embedded && <h1>{title}</h1>}
            <span className="legal-updated">Last updated: {lastUpdated}</span>
          </div>

          <div className="legal-lang-switch" role="group" aria-label="Choose language">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`legal-lang-btn${lang === l.code ? ' active' : ''}`}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {lang !== 'en' && (
          <p className="legal-translation-note">
            This translation is provided for convenience. The English version is the
            authoritative text in case of any discrepancy.
          </p>
        )}

        <p className="legal-intro">{doc.intro}</p>

        {doc.sections.map((section) => (
          <div className="legal-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {section.list && (
              <ul>
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {embedded && (
          <button type="button" className="legal-return" onClick={onClose}>
            <ArrowLeft size={16} /> Back to sign up
          </button>
        )}
      </div>
    </section>
  );
}

export default LegalDocument;
