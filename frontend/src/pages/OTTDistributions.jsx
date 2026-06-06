import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Send, Plus, Film, Tv, Calendar, Shield, ArrowRight, Eye, Globe, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import Toast from '../components/Toast';

export default function OTTDistributions() {
  const [distributions, setDistributions] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [movies, setMovies] = useState([]);
  const [form, setForm] = useState({
    movie: '', platform: '', license_type: 'NON_EXCLUSIVE',
    license_start: '', license_end: '', regions: '',
    max_concurrent_streams: 3, watermark_enabled: true
  });
  const [toast, setToast] = useState(null);

  const fetchData = useCallback(() => {
    Promise.all([
      axios.get('/api/ott-distributions/'),
      axios.get('/api/ott-platforms/'),
      axios.get('/api/movies/')
    ]).then(([d, p, m]) => {
      setDistributions(d.data);
      setPlatforms(p.data);
      setMovies(m.data);
    }).catch(console.error);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        regions: form.regions ? form.regions.split(',').map(r => r.trim()) : [],
      };
      const r = await axios.post('/api/ott-distributions/', payload);
      setDistributions([r.data, ...distributions]);
      setForm({ movie: '', platform: '', license_type: 'NON_EXCLUSIVE', license_start: '', license_end: '', regions: '', max_concurrent_streams: 3, watermark_enabled: true });
      setToast({ message: 'Distribution license created!', type: 'success' });
    } catch { setToast({ message: 'Failed to create distribution', type: 'error' }); }
  };

  const generateSession = async (distId) => {
    const userId = prompt('Enter user identifier (email or hash):');
    if (!userId) return;
    try {
      await axios.post(`/api/ott-distributions/${distId}/generate_session/`, {
        user_identifier: userId,
        device_fingerprint: navigator.userAgent.substring(0, 80),
        geo_region: 'IN'
      });
      setToast({ message: 'Session created with unique watermark variant!', type: 'success' });
    } catch (e) {
      setToast({ message: e.response?.data?.error || 'Failed to create session', type: 'error' });
    }
  };

  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">📜 OTT Distributions</h1>
      <p className="page-subtitle">Manage movie licensing and distribution to OTT streaming platforms.</p>
      <div className="grid-2"><div><div className="card">
        <div className="card-header"><h2>Active Licenses</h2><span className="badge badge-processing">{distributions.length}</span></div>
        <table className="data-table"><thead><tr><th>Movie</th><th>Platform</th><th>License</th><th>Period</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {distributions.map(d => (
            <tr key={d.id}>
              <td style={{ fontWeight: 500 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Film size={14} style={{ opacity: 0.5 }} />{d.movie_title}</div></td>
              <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tv size={14} style={{ opacity: 0.5 }} />{d.platform_name}</div></td>
              <td><span className="badge badge-processing">{d.license_type}</span></td>
              <td style={{ fontSize: '0.85rem' }}>
                <div>{new Date(d.license_start).toLocaleDateString()} →</div>
                <div>{new Date(d.license_end).toLocaleDateString()}</div>
              </td>
              <td>
                {d.is_active
                  ? <span className="badge badge-completed"><CheckCircle2 size={10} style={{ marginRight: 4 }} />Active</span>
                  : <span className="badge badge-failed"><AlertCircle size={10} style={{ marginRight: 4 }} />Expired</span>
                }
                {d.watermark_enabled && <span className="badge" style={{ marginLeft: 4, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: '0.7rem' }}><Shield size={8} style={{ marginRight: 3 }} />WM</span>}
              </td>
              <td>
                <button onClick={() => generateSession(d.id)} className="btn btn-sm btn-success"><Eye size={14} /> Session</button>
              </td>
            </tr>
          ))}
          {distributions.length === 0 && <tr><td colSpan="6"><div className="empty-state"><Send size={36} /><p>No distributions yet.</p></div></td></tr>}
        </tbody></table>
      </div>
      {distributions.length > 0 && <Link to="/ott-sessions" className="flow-prompt"><Eye size={20} /><span>Monitor active sessions</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>}
      </div><div><div className="card"><h2 style={{ marginBottom: 20, fontWeight: 600 }}>Create Distribution</h2>
        {platforms.length === 0 || movies.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <AlertCircle size={32} style={{ color: 'var(--warning)' }} />
            <p>Need a movie and OTT platform first.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
              {platforms.length === 0 && <Link to="/ott-platforms" className="btn btn-sm btn-primary"><Tv size={14} /> Add Platform</Link>}
              {movies.length === 0 && <Link to="/movies" className="btn btn-sm btn-primary"><Film size={14} /> Add Movie</Link>}
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group"><label className="form-label">Movie</label>
              <select required className="form-control form-select" value={form.movie} onChange={e => setForm({ ...form, movie: e.target.value })}>
                <option value="">— Select Movie —</option>
                {movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">OTT Platform</label>
              <select required className="form-control form-select" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}>
                <option value="">— Select Platform —</option>
                {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">License Type</label>
              <select className="form-control form-select" value={form.license_type} onChange={e => setForm({ ...form, license_type: e.target.value })}>
                <option value="EXCLUSIVE">Exclusive</option>
                <option value="NON_EXCLUSIVE">Non-Exclusive</option>
                <option value="LIMITED">Limited Window</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="form-label">License Start</label><input required type="datetime-local" className="form-control" value={form.license_start} onChange={e => setForm({ ...form, license_start: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">License End</label><input required type="datetime-local" className="form-control" value={form.license_end} onChange={e => setForm({ ...form, license_end: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Regions (comma-separated)</label><input className="form-control" placeholder="IN, US, UK" value={form.regions} onChange={e => setForm({ ...form, regions: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Max Concurrent Streams</label><input type="number" min="1" max="10" className="form-control" value={form.max_concurrent_streams} onChange={e => setForm({ ...form, max_concurrent_streams: parseInt(e.target.value) })} /></div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="wm-toggle" checked={form.watermark_enabled} onChange={e => setForm({ ...form, watermark_enabled: e.target.checked })} />
              <label htmlFor="wm-toggle" className="form-label" style={{ margin: 0 }}>Enable session watermarking</label>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}><Plus size={18} /> Create Distribution</button>
          </form>
        )}
      </div></div></div>
    </div>
  );
}
