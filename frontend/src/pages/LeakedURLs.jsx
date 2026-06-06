import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link2, Plus, Film, AlertCircle, CheckCircle2, Send, ExternalLink, Download, Clock, ArrowRight, Shield } from 'lucide-react';
import Toast from '../components/Toast';

export default function LeakedURLs() {
  const [leaks, setLeaks] = useState([]);
  const [movies, setMovies] = useState([]);
  const [form, setForm] = useState({ url: '', platform_name: '', movie: '', confidence: 80 });
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(() => {
    Promise.all([
      axios.get('/api/leaked-urls/'),
      axios.get('/api/movies/')
    ]).then(([l, m]) => {
      setLeaks(l.data);
      setMovies(m.data);
    }).catch(console.error);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/leaked-urls/', form);
      fetchData();
      setForm({ url: '', platform_name: '', movie: '', confidence: 80 });
      setToast({ message: 'Leaked URL reported! Piracy case auto-created.', type: 'success' });
    } catch { setToast({ message: 'Failed to report URL', type: 'error' }); }
  };

  const doAction = async (id, action, successMsg) => {
    try {
      await axios.post(`/api/leaked-urls/${id}/${action}/`);
      fetchData();
      setToast({ message: successMsg, type: 'success' });
    } catch { setToast({ message: 'Action failed', type: 'error' }); }
  };

  const statusConfig = {
    DETECTED: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Detected', icon: '🔍' },
    VERIFIED: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Verified', icon: '✓' },
    TAKEDOWN_SENT: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'Takedown Sent', icon: '📨' },
    REMOVED: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Removed', icon: '✅' },
    PERSISTENT: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Persistent', icon: '⚠️' },
  };

  const filteredLeaks = leaks.filter(l => {
    if (filter === 'all') return true;
    return l.status === filter;
  });

  const stats = {
    total: leaks.length,
    detected: leaks.filter(l => l.status === 'DETECTED').length,
    pending: leaks.filter(l => ['DETECTED', 'VERIFIED', 'TAKEDOWN_SENT'].includes(l.status)).length,
    removed: leaks.filter(l => l.status === 'REMOVED').length,
    persistent: leaks.filter(l => l.status === 'PERSISTENT').length,
  };

  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">🔗 Leaked URLs</h1>
      <p className="page-subtitle">Track pirated content URLs, initiate DMCA takedowns, and monitor removal status.</p>

      // List of URLs
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card purple"><div className="stat-icon"><Link2 size={22} /></div><div className="stat-value">{stats.total}</div><div className="stat-label">Total Leaks</div></div>
        <div className="stat-card amber"><div className="stat-icon"><Clock size={22} /></div><div className="stat-value">{stats.pending}</div><div className="stat-label">Pending</div></div>
        <div className="stat-card emerald"><div className="stat-icon"><CheckCircle2 size={22} /></div><div className="stat-value">{stats.removed}</div><div className="stat-label">Removed</div></div>
        <div className="stat-card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}><div className="stat-icon" style={{ color: '#ef4444' }}><AlertCircle size={22} /></div><div className="stat-value">{stats.persistent}</div><div className="stat-label">Persistent</div></div>
      </div>

      <div className="grid-2"><div>
        // Map URLs
        <div className="detector-tabs" style={{ marginBottom: 16 }}>
          {[['all', 'All'], ['DETECTED', 'Detected'], ['VERIFIED', 'Verified'], ['TAKEDOWN_SENT', 'Takedown'], ['REMOVED', 'Removed'], ['PERSISTENT', 'Persistent']].map(([key, label]) => (
            <button key={key} className={`detector-tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)} style={{ fontSize: '0.82rem', padding: '6px 12px' }}>
              {label}
            </button>
          ))}
        </div>

        // Render table
        <div className="card">
          <div className="card-header"><h2>Tracked URLs</h2><span className="badge badge-processing">{filteredLeaks.length}</span></div>
          <div className="table-container"><table className="data-table"><thead><tr>
            <th>URL</th><th>Hosting</th><th>Movie</th><th>Status</th><th>Detected</th><th>Actions</th>
          </tr></thead><tbody>
            {filteredLeaks.map(l => {
              const sc = statusConfig[l.status] || statusConfig.DETECTED;
              return (
                <tr key={l.id}>
                  <td>
                    <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ExternalLink size={11} />{l.url.replace(/^https?:\/\//, '').substring(0, 40)}…
                      </a>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{l.platform_name}</td>
                  <td style={{ fontSize: '0.88rem' }}>{l.movie_title || '—'}</td>
                  <td>
                    <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}30` }}>
                      {sc.icon} {sc.label}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{new Date(l.detected_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {l.status === 'DETECTED' && (
                        <button onClick={() => doAction(l.id, 'verify', 'URL verified')} className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem' }}>Verify</button>
                      )}
                      {['DETECTED', 'VERIFIED'].includes(l.status) && (
                        <button onClick={() => doAction(l.id, 'takedown', 'Takedown notice sent!')} className="btn btn-sm" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem' }}><Send size={10} style={{ marginRight: 3 }} />Takedown</button>
                      )}
                      {l.status === 'TAKEDOWN_SENT' && (
                        <>
                          <button onClick={() => doAction(l.id, 'mark_removed', 'Content removed!')} className="btn btn-sm btn-success" style={{ padding: '3px 8px', fontSize: '0.75rem' }}>Removed</button>
                          <button onClick={() => doAction(l.id, 'mark_persistent', 'Marked as persistent')} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem' }}>Persistent</button>
                        </>
                      )}
                      {l.case_number && (
                        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '3px 6px' }}>{l.case_number}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredLeaks.length === 0 && <tr><td colSpan="6"><div className="empty-state"><Link2 size={36} /><p>No leaked URLs tracked.</p></div></td></tr>}
          </tbody></table></div>
        </div>
      </div><div>
        // Form to add URL
        <div className="card"><h2 style={{ marginBottom: 20, fontWeight: 600 }}>Report Leaked URL</h2>
          <form onSubmit={submit}>
            <div className="form-group"><label className="form-label">Pirated Content URL</label>
              <input required className="form-control" type="url" placeholder="https://pirate-site.com/movie-name" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
            </div>
            <div className="form-group"><label className="form-label">Hosting Platform</label>
              <input required className="form-control" placeholder="e.g. YouTube, Telegram, Torrent Site" value={form.platform_name} onChange={e => setForm({ ...form, platform_name: e.target.value })} />
            </div>
            <div className="form-group"><label className="form-label">Linked Movie (optional)</label>
              <select className="form-control form-select" value={form.movie} onChange={e => setForm({ ...form, movie: e.target.value })}>
                <option value="">— Unknown / Not Linked —</option>
                {movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Confidence (%)</label>
              <input type="number" min="0" max="100" className="form-control" value={form.confidence} onChange={e => setForm({ ...form, confidence: parseInt(e.target.value) })} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}><Plus size={18} /> Report URL</button>
          </form>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 14, marginTop: 16, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Auto-Case Creation:</strong> Reporting a leaked URL automatically creates a piracy case, logs the event, and sends a notification to investigators.
          </div>
        </div>
        <Link to="/cases" className="flow-prompt" style={{ marginTop: 16 }}><Shield size={20} /><span>View Piracy Cases</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>
      </div></div>
    </div>
  );
}
