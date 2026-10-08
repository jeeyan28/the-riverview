export default function DemoNotice() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null;
  return <div className="session-notice" role="status"><strong>Synthetic reviewer demo</strong><span>Reservations, payments, receipt emails and chart history use synthetic data. No real payment is collected.</span></div>;
}
