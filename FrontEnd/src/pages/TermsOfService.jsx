import LegalDocument from '../components/LegalDocument';
import { TERMS_CONTENT, TERMS_LAST_UPDATED } from '../data/legalContent';
import { useSiteSettings } from '../hooks/useSiteSettings';

function customTerms(terms) {
  if (!terms?.en?.sections?.length) return null;
  return { en: terms.en, fil: terms.fil?.sections?.length ? terms.fil : terms.en };
}

function TermsOfService() {
  const { settings } = useSiteSettings();
  const custom = customTerms(settings?.terms);

  return (
    <LegalDocument
      title="Terms of Service"
      content={custom || TERMS_CONTENT}
      lastUpdated={settings?.terms?.lastUpdated || TERMS_LAST_UPDATED}
    />
  );
}

export default TermsOfService;
