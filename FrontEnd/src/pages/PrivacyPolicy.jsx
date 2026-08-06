import LegalDocument from '../components/LegalDocument';
import { PRIVACY_CONTENT, LAST_UPDATED } from '../data/legalContent';
import '../styles/legal-page.css';

function PrivacyPolicy() {
  return <LegalDocument title="Privacy Policy" content={PRIVACY_CONTENT} lastUpdated={LAST_UPDATED} />;
}

export default PrivacyPolicy;