import LegalDocument from '../components/LegalDocument';
import { TERMS_CONTENT, LAST_UPDATED } from '../data/legalContent';
import '../styles/legal-page.css';

function TermsOfService() {
  return <LegalDocument title="Terms of Service" content={TERMS_CONTENT} lastUpdated={LAST_UPDATED} />;
}

export default TermsOfService;