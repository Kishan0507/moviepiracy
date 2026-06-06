import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Tv, Plus, MapPin, Shield, ArrowRight, Send, Globe, Lock, AlertTriangle } from 'lucide-react';
import Toast from '../components/Toast';

export default function OTTPlatforms() {
  const [platforms, setPlatforms] = useState([]);
  const [form, setForm] = useState({
    name: '', platform_type: 'SVOD', base_url: '', contact_email: '', drm_provider: 'NONE'
  });
  const [toast, setToast] = useState(null);

  const fetchData = useCallback(() => {
    axios.get('/api/ott-platforms/').then(r => setPlatforms(r.data)).catch(console.error);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await axios.post('/api/ott-platforms/', form);
      setPlatforms([...platforms, r.data]);
      setForm({ name: '', platform_type: 'SVOD', base_url: '', contact_email: '', drm_provider: 'NONE' });
      setToast({ message: `"${r.data.name}" registered!`, type: 'success' });
    } catch { setToast({ message: 'Failed to register platform', type: 'error' }); }
  };

  const scoreColor = (s) => s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';
  const drmBadge = (drm) => {
    const colors = { WIDEVINE: '#4285f4', FAIRPLAY: '#999', PLAYREADY: '#00a2ed', MULTI: '#10b981', NONE: '#ef4444' };
    const labels = { WIDEVINE: 'Widevine', FAIRPLAY: 'FairPlay', PLAYREADY: 'PlayReady', MULTI: 'Multi-DRM', NONE: 'No DRM' };
    return <span className="badge" style={{ background: colors[drm] + '20', color: colors[drm], border: `1px solid ${colors[drm]}40` }}><Lock size={10} style={{ marginRight: 4 }} />{labels[drm]}</span>;
  };
  const typeBadge = (t) => {
    const labels = { SVOD: 'Subscription', AVOD: 'Ad-Supported', TVOD: 'Transactional', LIVE: 'Live' };
    return <span className="badge badge-processing">{labels[t]}</span>;
  };

  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">📺 OTT Platforms</h1>
      <p className="page-subtitle">Register and manage streaming platform partners for content distribution.</p>
      <div className="grid-2"><div><div className="card">
        <div className="card-header"><h2>Platforms</h2><span className="badge badge-processing">{platforms.length}</span></div>
        <table className="data-table"><thead><tr><th>Platform</th><th>Type</th><th>DRM</th><th>Compliance</th><th>Status</th></tr></thead><tbody>
          {platforms.map(p => (
            <tr key={p.id}>
              <td style={{ fontWeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tv size={16} style={{ opacity: 0.5 }} />{p.name}
                </div>
              </td>
              <td>{typeBadge(p.platform_type)}</td>
              <td>{drmBadge(p.drm_provider)}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${p.compliance_score}%`, height: '100%', borderRadius: 99, background: scoreColor(p.compliance_score) }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: scoreColor(p.compliance_score) }}>{p.compliance_score?.toFixed(0)}%</span>
                </div>
              </td>
              <td>{p.is_blacklisted ? <span className="badge badge-failed">BLOCKED</span> : <span className="badge badge-completed">ACTIVE</span>}</td>
            </tr>
          ))}
          {platforms.length === 0 && <tr><td colSpan="5"><div className="empty-state"><Tv size={36} /><p>No OTT platforms yet.</p></div></td></tr>}
        </tbody></table>
      </div>
      {platforms.length > 0 && <Link to="/ott-distributions" className="flow-prompt"><Send size={20} /><span>Create distribution license</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>}
      </div><div><div className="card"><h2 style={{ marginBottom: 20, fontWeight: 600 }}>Register New Platform</h2>
        <form onSubmit={submit}>
          <div className="form-group"><label className="form-label">Platform Name</label><input required className="form-control" placeholder="e.g. Netflix India" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Platform Type</label>
            <select className="form-control form-select" value={form.platform_type} onChange={e => setForm({ ...form, platform_type: e.target.value })}>
              <option value="SVOD">Subscription VOD (Netflix, Prime)</option>
              <option value="AVOD">Ad-Supported VOD (YouTube, Tubi)</option>
              <option value="TVOD">Transactional VOD (iTunes, Google Play)</option>
              <option value="LIVE">Live Streaming (Sports, Events)</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Base URL</label><input className="form-control" type="url" placeholder="https://platform.com" value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Contact Email</label><input className="form-control" type="email" placeholder="content@platform.com" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">DRM Provider</label>
            <select className="form-control form-select" value={form.drm_provider} onChange={e => setForm({ ...form, drm_provider: e.target.value })}>
              <option value="NONE">No DRM</option>
              <option value="WIDEVINE">Google Widevine</option>
              <option value="FAIRPLAY">Apple FairPlay</option>
              <option value="PLAYREADY">Microsoft PlayReady</option>
              <option value="MULTI">Multi-DRM</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }}><Plus size={18} /> Register Platform</button>
        </form>
      </div></div></div>
    </div>
  );
}
