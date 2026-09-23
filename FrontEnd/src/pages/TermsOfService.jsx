import LegalDocument from '../components/LegalDocument';
import { TERMS_CONTENT, TERMS_LAST_UPDATED } from '../data/legalContent';

function TermsOfService() {
  return <LegalDocument title="Terms of Service" content={TERMS_CONTENT} lastUpdated={TERMS_LAST_UPDATED} />;
}

export default TermsOfService;
