import { formatPeso } from '../utils/currency';

export const REVENUE_BASIS = 'Recorded payments less manual refunds, grouped by service date in Asia/Manila. Reservations linked to a session are counted once.';

export default function RevenueSummary({ summary, loading, analytics = false }) {
  const metrics = analytics ? [
    ['Payments received', 'collected', 'Money received, after refunds'],
    ['Balance to collect', 'outstanding', 'Unpaid amount on open reservations'],
    ['Total charges', 'charged', 'Reservations and room sessions'],
  ] : [
    ['Payments received', 'collected', 'Payments after recorded refunds'],
    ['Balance to collect', 'outstanding', 'Unpaid balance on open reservations'],
    ['Reservation total', 'charged', 'Total charges before payments'],
    ['Refunds and rebates', 'refunded', 'Returns recorded by staff'],
  ];
  return (
    <div className="metric-row finance-metrics" aria-busy={loading}>
      {metrics.map(([label, key, description]) => (
        <div className="mc" key={key}>
          <div className="mc-label">{label}</div>
          <div className="mc-val">{summary ? formatPeso(summary[key]) : '—'}</div>
          <div className="mc-sub">{description}</div>
        </div>
      ))}
    </div>
  );
}
