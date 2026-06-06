import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Eye, AlertTriangle, Fingerprint, Globe, Monitor, Wifi, Shield, RefreshCw, Activity } from 'lucide-react';
import Toast from '../components/Toast';

export default function OTTSessions() {
  const [sessions, setSessions] = useState([]);
  const [concurrent, setConcurrent] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'suspicious'

  const fetchData = useCallback(() => {
    Promise.all([
      axios.get('/api/ott-sessions/'),
      axios.get('/api/ott-sessions/concurrent/')
    ]).then(([s, c]) => {
      setSessions(s.data);
      setConcurrent(c.data);
    }).catch(console.error);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const i = setInterval(fetchData, 10000);
    return () => clearInterval(i);
  }, [fetchData]);

  const flagSession = async (id) => {
    const reason = prompt('Enter reason for flagging:');
    if (!reason) return;
    try {
      await axios.post(`/api/ott-sessions/${id}/flag/`, { reason });
      fetchData();
      setToast({ message: 'Session flagged as suspicious', type: 'success' });
    } catch { setToast({ message: 'Failed to flag session', type: 'error' }); }
  };

  const endSession = async (id) => {
    try {
      await axios.post(`/api/ott-sessions/${id}/end/`);
      fetchData();
      setToast({ message: 'Session ended', type: 'success' });
    } catch { setToast({ message: 'Failed to end session', type: 'error' }); }
  };

  const filteredSessions = sessions.filter(s => {
    if (filter === 'active') return !s.ended_at;
    if (filter === 'suspicious') return s.is_suspicious;
    return true;
  });

  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">👁️ OTT Sessions</h1>
      <p className="page-subtitle">Monitor active streaming sessions, detect credential abuse, and flag suspicious activity.</p>

      // Header and search
      {concurrent && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card cyan"><div className="stat-icon"><Activity size={22} /></div><div className="stat-value">{concurrent.total_active_sessions}</div><div className="stat-label">Active Sessions</div></div>
          <div className="stat-card amber"><div className="stat-icon"><AlertTriangle size={22} /></div><div className="stat-value">{concurrent.suspicious_concurrent?.length || 0}</div><div className="stat-label">Concurrent Abuse</div></div>
          <div className="stat-card purple"><div className="stat-icon"><Shield size={22} /></div><div className="stat-value">{concurrent.flagged_sessions}</div><div className="stat-label">Flagged</div></div>
          <div className="stat-card emerald"><div className="stat-icon"><Fingerprint size={22} /></div><div className="stat-value">{sessions.length}</div><div className="stat-label">Total Sessions</div></div>
        </div>
      )}

      // Tabs
      {concurrent?.suspicious_concurrent?.length > 0 && (
        <div className="card" style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)', marginBottom: 20 }}>
          <h3 style={{ color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} /> Concurrent Session Alerts
          </h3>
          <table className="data-table"><thead><tr><th>User</th><th>Platform</th><th>Active Streams</th></tr></thead><tbody>
            {concurrent.suspicious_concurrent.map((s, i) => (
              <tr key={i} style={{ background: 'rgba(245,158,11,0.05)' }}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{s.user_identifier}</td>
                <td>{s.distribution__platform__name}</td>
                <td><span className="badge badge-failed" style={{ fontWeight: 700 }}>{s.active_count} streams</span></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      // Statistics
      <div className="detector-tabs" style={{ marginBottom: 20 }}>
        <button className={`detector-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <Eye size={16} /> All ({sessions.length})
        </button>
        <button className={`detector-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
          <Activity size={16} /> Active ({sessions.filter(s => !s.ended_at).length})
        </button>
        <button className={`detector-tab ${filter === 'suspicious' ? 'active' : ''}`} onClick={() => setFilter('suspicious')}>
          <AlertTriangle size={16} /> Suspicious ({sessions.filter(s => s.is_suspicious).length})
        </button>
      </div>

      // Table data
      <div className="card">
        <div className="card-header">
          <h2>Sessions</h2>
          <button onClick={fetchData} className="btn btn-sm btn-outline"><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="table-container"><table className="data-table"><thead><tr>
          <th>Variant</th><th>User</th><th>Platform</th><th>Movie</th><th>IP / Region</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody>
          {filteredSessions.map(s => (
            <tr key={s.id} style={s.is_suspicious ? { background: 'rgba(239,68,68,0.06)' } : {}}>
              <td><span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#818cf8', fontWeight: 600 }}>{s.watermark_variant}</span></td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.user_identifier?.substring(0, 20)}…</td>
              <td>{s.platform_name}</td>
              <td style={{ fontWeight: 500 }}>{s.movie_title}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                  <Wifi size={12} style={{ opacity: 0.5 }} />{s.ip_address || '—'}
                  {s.geo_region && <span className="badge" style={{ fontSize: '0.7rem', padding: '1px 6px' }}><Globe size={9} style={{ marginRight: 3 }} />{s.geo_region}</span>}
                </div>
              </td>
              <td>
                {s.is_suspicious
                  ? <span className="badge badge-failed"><AlertTriangle size={10} style={{ marginRight: 3 }} />Flagged</span>
                  : s.ended_at
                    ? <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>Ended</span>
                    : <span className="badge badge-completed"><Activity size={10} style={{ marginRight: 3 }} />Active</span>
                }
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!s.is_suspicious && !s.ended_at && <button onClick={() => flagSession(s.id)} className="btn btn-sm" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontSize: '0.78rem' }}><AlertTriangle size={12} /></button>}
                  {!s.ended_at && <button onClick={() => endSession(s.id)} className="btn btn-sm btn-outline" style={{ padding: '4px 8px', fontSize: '0.78rem' }}>End</button>}
                </div>
              </td>
            </tr>
          ))}
          {filteredSessions.length === 0 && <tr><td colSpan="7"><div className="empty-state"><Eye size={36} /><p>No sessions found.</p></div></td></tr>}
        </tbody></table></div>
      </div>
    </div>
  );
}
