import '../../styles/admin/settings.css';
import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { auditLogService } from '../../services/auditLog';

function formatAuditTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function auditDotClass(action) {
  if (action === 'deleted') return 'del';
  if (action === 'updated' || action === 'recovered') return 'warn';
  return '';
}

function AuditTrail() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    auditLogService.list(page)
      .then((data) => {
        if (!active) return;
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      })
      .catch((err) => {
        console.error(err);
        if (active) setLoadError(err.message || 'Could not load audit trail.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  return (
    <div className="panel active" id="panel-audit-trail">
      <div className="settings-intro"><div><h2>Audit trail</h2><p>Review recorded administrative changes across the venue.</p></div><ScrollText size={23} aria-hidden="true" /></div>
      <div className="card">
        <div className="card-head"><span className="card-title">Recent activity</span><span className="audit-summary">{total ? `${total} recorded changes` : 'Announcements · Rooms · Users'}</span></div>
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px 0' }}>Loading…</div>
          ) : loadError ? (
            <div className="settings-form-error" role="alert">{loadError}</div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '12px 0' }}>No changes recorded yet.</div>
          ) : (
            logs.map((entry) => (
              <div className="audit-item" key={entry._id}>
                <div className={`audit-dot${auditDotClass(entry.action) ? ` ${auditDotClass(entry.action)}` : ''}`}></div>
                <div><div className="audit-text"><b>{entry.performedByName}</b> {entry.description}</div><div className="audit-time">{formatAuditTime(entry.createdAt)}</div></div>
              </div>
            ))
          )}
        </div>
        {!loading && !loadError && totalPages > 1 && (
          <div className="audit-pagination" aria-label="Audit trail pages">
            <button type="button" className="card-action" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><i className="ti ti-chevron-left" aria-hidden="true"></i> Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="card-action" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next <i className="ti ti-chevron-right" aria-hidden="true"></i></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditTrail;
