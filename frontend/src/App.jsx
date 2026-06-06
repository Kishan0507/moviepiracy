import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Film, Shield, Video, Plus, UploadCloud, AlertCircle, CheckCircle2,
  Download, Clock, MapPin, Building2, ArrowRight, BarChart3,
  FileVideo, Calendar, AlertTriangle, Activity, Search, Share2, RefreshCw,
  Camera, Image, Pause, Play, Crosshair, Eye, Fingerprint, Map,
  Skull, Lock, ShieldAlert, Zap
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import ShareModal from './components/ShareModal';
import Analytics from './pages/Analytics';
import Cases from './pages/Cases';
import AuditLog from './pages/AuditLog';
import Notifications from './pages/Notifications';


// Vite dev server proxies /api and /media to Django backend (see vite.config.js)

/* ─── Dashboard ─── */
// Main dashboard view showing statistics and recent tasks
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [shareData, setShareData] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchData = useCallback(() => {
    Promise.all([axios.get('/api/tasks/stats/'), axios.get('/api/tasks/')])
      .then(([s, t]) => { setStats(s.data); setTasks(t.data); }).catch(console.error);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (!tasks.some(t => t.status === 'PROCESSING' || t.status === 'PENDING')) return;
    const i = setInterval(fetchData, 5000);
    return () => clearInterval(i);
  }, [tasks, fetchData]);

  const handleShare = async (id) => {
    try { const r = await axios.get(`/api/tasks/${id}/share/`); setShareData(r.data); }
    catch { setToast({ message: 'Video not ready for sharing', type: 'error' }); }
  };

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {shareData && <ShareModal shareData={shareData} onClose={() => setShareData(null)} />}
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Your anti-piracy command center — track, process, and protect.</p>
      <div className="stats-grid">
        <div className="stat-card purple"><div className="stat-icon"><Film size={22} /></div><div className="stat-value">{stats?.total_movies ?? '—'}</div><div className="stat-label">Movies</div></div>
        <div className="stat-card cyan"><div className="stat-icon"><Building2 size={22} /></div><div className="stat-value">{stats?.total_theatres ?? '—'}</div><div className="stat-label">Theatres</div></div>
        <div className="stat-card emerald"><div className="stat-icon"><Shield size={22} /></div><div className="stat-value">{stats?.total_cases ?? '—'}</div><div className="stat-label">Piracy Cases</div></div>
        <div className="stat-card amber"><div className="stat-icon"><Activity size={22} /></div><div className="stat-value">{stats?.completed ?? '—'}</div><div className="stat-label">Watermarks Done</div></div>
      </div>
      <div className="quick-actions">
        <Link to="/movies" className="quick-action-btn"><Plus size={24} />Upload Movie</Link>
        <Link to="/theatres" className="quick-action-btn"><Building2 size={24} />Register Theatre</Link>
        <Link to="/watermark" className="quick-action-btn"><Video size={24} />Process Video</Link>
        <Link to="/detect" className="quick-action-btn"><Shield size={24} />Detect Piracy</Link>
      </div>
      <div className="card">
        <div className="card-header"><h2>Recent Tasks</h2><Link to="/watermark" className="btn btn-sm btn-outline"><Plus size={14} /> New Task</Link></div>
        <div className="table-container"><table className="data-table"><thead><tr><th>ID</th><th>Movie</th><th>Theatre</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
          {tasks.map(t => (
            <tr key={t.id}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{t.id.substring(0, 8)}…</td>
              <td>{t.movie_title || t.movie}</td><td>{t.theatre_name || t.theatre}</td>
              <td><span className={`badge badge-${t.status.toLowerCase()}`}>{t.status === 'PROCESSING' && <RefreshCw size={12} style={{ marginRight: 4, animation: 'spin 1s linear infinite' }} />}{t.status}</span></td>
              <td>{new Date(t.created_at).toLocaleString()}</td>
              <td><div style={{ display: 'flex', gap: 6 }}>
                {t.watermarked_download_url && <a href={t.watermarked_download_url} className="btn btn-sm btn-download"><Download size={14} /></a>}
                {t.status === 'COMPLETED' && <button onClick={() => handleShare(t.id)} className="btn btn-sm btn-success"><Share2 size={14} /> Share</button>}
              </div></td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td colSpan="6"><div className="empty-state"><Video size={40} /><p>No tasks yet.</p><Link to="/watermark" className="btn btn-sm btn-primary" style={{ marginTop: 12 }}><Plus size={14} /> Process First Video</Link></div></td></tr>}
        </tbody></table></div>
      </div>
    </div>
  );
}

/* ─── Theatres ─── */
// Theatre management and registration view
function Theatres() {
  const [theatres, setTheatres] = useState([]);
  const [form, setForm] = useState({ name: '', location: '', contact_email: '' });
  const [toast, setToast] = useState(null);
  useEffect(() => { axios.get('/api/theatres/').then(r => setTheatres(r.data)); }, []);
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await axios.post('/api/theatres/', form); setTheatres([...theatres, r.data]); setForm({ name: '', location: '', contact_email: '' }); setToast({ message: `"${r.data.name}" registered!`, type: 'success' }); }
    catch { setToast({ message: 'Failed', type: 'error' }); }
  };
  const scoreColor = (s) => s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">Theatres</h1><p className="page-subtitle">Register and manage venues. Compliance scores update automatically.</p>
      <div className="grid-2"><div><div className="card"><div className="card-header"><h2>Venues</h2><span className="badge badge-processing">{theatres.length}</span></div>
        <table className="data-table"><thead><tr><th>Name</th><th>Location</th><th>Compliance</th><th>Status</th></tr></thead><tbody>
          {theatres.map(t => (<tr key={t.id}><td style={{ fontWeight: 500 }}>{t.name}</td><td><MapPin size={14} style={{ marginRight: 6, opacity: 0.5 }} />{t.location}</td>
            <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 6, overflow: 'hidden' }}><div style={{ width: `${t.compliance_score}%`, height: '100%', borderRadius: 99, background: scoreColor(t.compliance_score) }} /></div><span style={{ fontSize: '0.82rem', fontWeight: 600, color: scoreColor(t.compliance_score) }}>{t.compliance_score?.toFixed(0)}%</span></div></td>
            <td>{t.is_blacklisted ? <span className="badge badge-failed">BLOCKED</span> : <span className="badge badge-completed">ACTIVE</span>}</td></tr>))}
          {theatres.length === 0 && <tr><td colSpan="4" className="empty-state"><Building2 size={36} /><p>No theatres yet.</p></td></tr>}
        </tbody></table></div>
        {theatres.length > 0 && <Link to="/showtimes" className="flow-prompt"><Clock size={20} /><span>Schedule showtimes</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>}
      </div><div><div className="card"><h2 style={{ marginBottom: 20, fontWeight: 600 }}>Register New</h2>
        <form onSubmit={submit}><div className="form-group"><label className="form-label">Theatre Name</label><input required className="form-control" placeholder="e.g. Grand Cineplex" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Location</label><input required className="form-control" placeholder="e.g. Mumbai, India" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Contact Email</label><input required type="email" className="form-control" placeholder="admin@theatre.com" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
          <button className="btn btn-primary" style={{ width: '100%' }}><Plus size={18} /> Register</button></form></div></div></div></div>
  );
}

/* ─── Movies ─── */
// Movie library for uploading and managing source files
function Movies() {
  const [movies, setMovies] = useState([]);
  const [title, setTitle] = useState(''); const [file, setFile] = useState(null); const [loading, setLoading] = useState(false); const [toast, setToast] = useState(null);
  useEffect(() => { axios.get('/api/movies/').then(r => setMovies(r.data)); }, []);
  const submit = async (e) => {
    e.preventDefault(); if (!file || !title) return; setLoading(true);
    const fd = new FormData(); fd.append('original_file', file); fd.append('title', title);
    try { const r = await axios.post('/api/movies/', fd); setMovies([...movies, r.data]); setTitle(''); setFile(null); setToast({ message: `"${r.data.title}" uploaded!`, type: 'success' }); }
    catch { setToast({ message: 'Upload failed', type: 'error' }); } finally { setLoading(false); }
  };
  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">Movies Library</h1><p className="page-subtitle">Upload, manage, and download movie masters.</p>
      <div className="grid-2"><div><div className="card"><div className="card-header"><h2>All Movies</h2><span className="badge badge-processing">{movies.length}</span></div>
        <table className="data-table"><thead><tr><th>Title</th><th>Size</th><th>Added</th><th>Actions</th></tr></thead><tbody>
          {movies.map(m => (<tr key={m.id}><td style={{ fontWeight: 500 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileVideo size={16} style={{ opacity: 0.5 }} />{m.title}</div></td>
            <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{m.file_size || '—'}</td>
            <td style={{ fontSize: '0.9rem' }}>{new Date(m.created_at).toLocaleDateString()}</td>
            <td><div style={{ display: 'flex', gap: 8 }}>
              {m.download_url && <button className="btn btn-sm btn-download" onClick={() => window.open(m.download_url, '_blank')}><Download size={14} /> Download</button>}
              <Link to={`/watermark?movie=${m.id}`} className="btn btn-sm btn-success"><Shield size={14} /> Watermark</Link>
            </div></td></tr>))}
          {movies.length === 0 && <tr><td colSpan="4"><div className="empty-state"><Film size={40} /><p>No movies yet.</p></div></td></tr>}
        </tbody></table></div>
        {movies.length > 0 && <Link to="/watermark" className="flow-prompt"><Shield size={20} /><span>Process with watermark</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>}
      </div><div><div className="card"><h2 style={{ marginBottom: 20 }}>Upload Movie</h2>
        <form onSubmit={submit}><div className="form-group"><label className="form-label">Movie Title</label><input required className="form-control" placeholder="e.g. Avengers: Endgame" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Source File (MP4, MKV)</label><div className="upload-area"><input type="file" accept="video/*" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} id="movie-upload" /><label htmlFor="movie-upload" style={{ cursor: 'pointer' }}><UploadCloud size={44} className="upload-icon" /><div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{file ? file.name : 'Click to Browse'}</div></label></div></div>
          <button disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>{loading ? 'Uploading…' : <><Plus size={18} /> Upload</>}</button></form></div></div></div></div>
  );
}

/* ─── Showtimes ─── */
// Scheduler for movie showtimes across different theatres
function Showtimes() {
  const [timings, setTimings] = useState([]); const [theatres, setTheatres] = useState([]); const [movies, setMovies] = useState([]);
  const [form, setForm] = useState({ theatre: '', movie: '', time: '' }); const [toast, setToast] = useState(null);
  const fetchData = async () => { try { const [t, th, m] = await Promise.all([axios.get('/api/timings/'), axios.get('/api/theatres/'), axios.get('/api/movies/')]); setTimings(t.data); setTheatres(th.data); setMovies(m.data); } catch { } };
  useEffect(() => { fetchData(); }, []);
  const submit = async (e) => { e.preventDefault(); try { await axios.post('/api/timings/', form); fetchData(); setForm({ theatre: '', movie: '', time: '' }); setToast({ message: 'Showtime added!', type: 'success' }); } catch { setToast({ message: 'Failed', type: 'error' }); } };
  return (
    <div>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">Showtimes</h1><p className="page-subtitle">Schedule screenings across theatres.</p>
      <div className="grid-2"><div><div className="card"><div className="card-header"><h2>Scheduled</h2><span className="badge badge-processing">{timings.length}</span></div>
        <table className="data-table"><thead><tr><th>Movie</th><th>Theatre</th><th>Time</th></tr></thead><tbody>
          {timings.map(t => (<tr key={t.id}><td style={{ fontWeight: 500 }}>{t.movie_title || t.movie}</td><td>{t.theatre_name || t.theatre}</td><td><Calendar size={14} style={{ marginRight: 6, opacity: 0.5 }} />{new Date(t.time).toLocaleString()}</td></tr>))}
          {timings.length === 0 && <tr><td colSpan="3"><div className="empty-state"><Clock size={36} /><p>No showtimes yet.</p></div></td></tr>}
        </tbody></table></div>
        {timings.length > 0 && <Link to="/watermark" className="flow-prompt"><Video size={20} /><span>Generate watermarked copies</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>}
      </div><div><div className="card"><h2 style={{ marginBottom: 20 }}>Schedule New</h2>
        {theatres.length === 0 || movies.length === 0 ? <div className="empty-state" style={{ padding: '24px 0' }}><AlertTriangle size={32} style={{ color: 'var(--warning)' }} /><p>Need a theatre and movie first.</p><div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>{theatres.length === 0 && <Link to="/theatres" className="btn btn-sm btn-primary"><Building2 size={14} /> Add Theatre</Link>}{movies.length === 0 && <Link to="/movies" className="btn btn-sm btn-primary"><Film size={14} /> Add Movie</Link>}</div></div> : (
          <form onSubmit={submit}><div className="form-group"><label className="form-label">Theatre</label><select required className="form-control form-select" value={form.theatre} onChange={e => setForm({ ...form, theatre: e.target.value })}><option value="">— Select —</option>{theatres.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Movie</label><select required className="form-control form-select" value={form.movie} onChange={e => setForm({ ...form, movie: e.target.value })}><option value="">— Select —</option>{movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Date & Time</label><input required type="datetime-local" className="form-control" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }}><Plus size={18} /> Add Showtime</button></form>)}</div></div></div></div>
  );
}

/* ─── Watermark Process ─── */
// Interface for initiating the video watermark embedding process
function WatermarkProcess() {
  const [searchParams] = useSearchParams(); const navigate = useNavigate();
  const [theatres, setTheatres] = useState([]); const [movies, setMovies] = useState([]); const [timings, setTimings] = useState([]);
  const [movieId, setMovieId] = useState(searchParams.get('movie') || ''); const [theatreId, setTheatreId] = useState('');
  const [loading, setLoading] = useState(false); const [toast, setToast] = useState(null);
  
  useEffect(() => { Promise.all([axios.get('/api/theatres/'), axios.get('/api/movies/'), axios.get('/api/timings/')]).then(([t, m, times]) => { setTheatres(t.data); setMovies(m.data); setTimings(times.data); }); }, []);
  
  const selectedTiming = timings.find(t => (t.movie === parseInt(movieId) || t.movie === movieId) && (t.theatre === parseInt(theatreId) || t.theatre === theatreId));

  const onSubmit = async (e) => {
    e.preventDefault(); if (!movieId || !theatreId) return; setLoading(true);
    try { 
      await axios.post('/api/tasks/', { movie: movieId, theatre: theatreId, showtime_timestamp: selectedTiming ? selectedTiming.time : null }); 
      setToast({ message: 'Watermark task created! Processing in background.', type: 'success' }); setTimeout(() => navigate('/'), 2000); 
    }
    catch { setToast({ message: 'Failed to create task', type: 'error' }); } finally { setLoading(false); }
  };
  return (
    <div style={{ maxWidth: 650 }}>{toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <h1 className="page-title">Process Video</h1><p className="page-subtitle">Embed invisible watermark for theatre-specific tracking.</p>
      {movies.length === 0 || theatres.length === 0 ? <div className="card"><div className="empty-state"><AlertTriangle size={40} style={{ color: 'var(--warning)' }} /><p>Need a movie and theatre first.</p><div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>{movies.length === 0 && <Link to="/movies" className="btn btn-sm btn-primary"><Film size={14} /> Upload Movie</Link>}{theatres.length === 0 && <Link to="/theatres" className="btn btn-sm btn-primary"><Building2 size={14} /> Register Theatre</Link>}</div></div></div> : (
        <div className="card"><form onSubmit={onSubmit}><div className="form-group"><label className="form-label">Movie</label><select required className="form-control form-select" value={movieId} onChange={e => setMovieId(e.target.value)}><option value="">— Select —</option>{movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Theatre</label><select required className="form-control form-select" value={theatreId} onChange={e => setTheatreId(e.target.value)}><option value="">— Select —</option>{theatres.map(t => <option key={t.id} value={t.id}>{t.name} ({t.location})</option>)}</select></div>
          {selectedTiming && (
            <div className="alert alert-info" style={{marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8}}>
              <Clock size={16} /> Auto-linked to scheduled showtime: <strong>{new Date(selectedTiming.time).toLocaleString()}</strong>
            </div>
          )}
          <div style={{ background: 'rgba(99, 102, 241, 0.06)', borderRadius: 10, padding: 16, marginBottom: 20, fontSize: '0.9rem', color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Advanced Robust Watermark:</strong> The system embeds an invisible payload using a <strong>dynamic translucent QR overlay</strong>. It is invariant to camcorder recording (brightness/contrast shifts), noise, and H.264 compression. The pipeline uses advanced <strong>OpenCV Adaptive Thresholding</strong> and CLAHE to ensure flawless recovery even from faint smartphone recordings.</div>
          <button disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>{loading ? 'Creating…' : <><Shield size={18} /> Start Processing</>}</button></form></div>)}
      <Link to="/" className="flow-prompt" style={{ marginTop: 24 }}><BarChart3 size={20} /><span>View tasks on Dashboard</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link></div>
  );
}

/* ─── Piracy Detector (Dual Mode: Frame Snapshot + Full Video) ─── */
// Tool for analyzing images or videos to detect watermarks and find piracy sources
function Detector() {
  const [mode, setMode] = useState('snapshot');  // 'snapshot' | 'video'
  const [file, setFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // ── Frame Snapshot: Analyze uploaded image ──
  const onDetectFrame = async () => {
    if (!imageFile) return;
    setLoading(true); setResult(null);
    const fd = new FormData(); fd.append('file', imageFile);
    try {
      const r = await axios.post('/api/movies/detect_frame/', fd);
      setResult(r.data);
    } catch (e) {
      setResult(e.response?.data || { success: false, error: 'Frame detection failed' });
    } finally { setLoading(false); }
  };

  // ── Full Video: Analyze entire video ──
  const onDetectVideo = async () => {
    if (!file) return;
    setLoading(true); setResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await axios.post('/api/movies/detect/', fd);
      setResult(r.data);
    } catch (e) {
      setResult(e.response?.data || { success: false, error: 'Detection failed' });
    } finally { setLoading(false); }
  };

  // ── Capture frame from paused video ──
  const captureVideoFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const capturedFile = new File([blob], 'captured_frame.png', { type: 'image/png' });
        setImageFile(capturedFile);
        setImagePreview(URL.createObjectURL(blob));
        setMode('snapshot'); // Switch to snapshot mode to show the captured frame
      }
    }, 'image/png');
  };

  // ── Handle image file selection ──
  const handleImageSelect = (e) => {
    const f = e.target.files[0];
    if (f) {
      setImageFile(f);
      setImagePreview(URL.createObjectURL(f));
      setResult(null);
    }
  };

  // ── Handle video file selection ──
  const handleVideoSelect = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setResult(null);
    }
  };

  const riskClass = (l) => ({ HIGH: 'risk-high', MEDIUM: 'risk-medium', LOW: 'risk-low' }[l?.toUpperCase()] || 'risk-unknown');

  // ── Shared Results Panel ──
  const ResultsPanel = () => {
    if (!result) return null;

    // ── FORGED Detection ──
    if (result.forged) {
      return (
        <div className="detect-results">
          <div className="forged-banner">
            <div className="forged-icon"><Skull size={40} /></div>
            <div className="forged-content">
              <h2>🔴 CRYPTOGRAPHICALLY FORGED</h2>
              <p>The ECDSA digital signature on this watermark is <strong>INVALID</strong>.</p>
              <p>Someone may be attempting to frame a theatre with a fabricated watermark.</p>
              {result.case_number && (
                <span className="risk-badge risk-critical">
                  <AlertCircle size={14} /> Case {result.case_number} — CRITICAL
                </span>
              )}
            </div>
          </div>
          <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
            <h3 style={{ color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={18} /> Cryptographic Verification Failed
            </h3>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p>The QR watermark payload was decoded, but the <strong>ECDSA P-256 digital signature</strong> does not match the payload data.</p>
              <p style={{ marginTop: 8 }}>This means the watermark was <strong>not generated by this system's private key</strong> and is therefore a forgery attempt.</p>
            </div>
          </div>
          {result.recommendations?.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldAlert size={20} style={{ color: '#ef4444' }} /> Required Actions
              </h2>
              <ul className="recommendations-list forged">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
        </div>
      );
    }

    if (result.success) {
      const trace = result.source_trace;
      const scanStrategyLabel = {
        'smart_45s_primary': '⚡ Smart 45s Scan (Phase 1)',
        'smart_45s_offset': '⚡ Smart 45s Offset (Phase 2)',
        'dense_1fps_fallback': 'Dense 1fps Fallback (Phase 3)',
        'legacy_1fps': 'Legacy 1fps Scan',
      };
      return (
        <div className="detect-results">
          {/* Source Origin Banner */}
          <div className="source-origin-banner">
            <div className="source-origin-icon">
              <Fingerprint size={32} />
            </div>
            <div className="source-origin-content">
              <h2>🚨 Piracy Source Identified</h2>
              <p>Watermark decoded. Source traced. Case <strong>{result.case_number}</strong> opened.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <span className={`risk-badge ${riskClass(result.risk_level)}`}>
                  <AlertCircle size={14} />{result.risk_level} RISK
                </span>
                {result.signed && result.signature_valid && (
                  <span className="crypto-badge valid">
                    <Lock size={12} /> ECDSA Verified ✓
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Source Trace Card */}
          {trace && (
            <div className="source-trace-card">
              <div className="source-trace-header">
                <Map size={20} />
                <h3>Piracy Origin Trace</h3>
              </div>
              <div className="source-trace-origin">
                <div className="origin-pin"><MapPin size={24} /></div>
                <div className="origin-details">
                  <div className="origin-primary">{trace.piracy_origin}</div>
                  <div className="origin-secondary">
                    Movie: <strong>{trace.movie_title}</strong>
                    {trace.showtime && trace.showtime !== 'Not Available' && (
                      <> · Showtime: <strong>{trace.showtime}</strong></>
                    )}
                  </div>
                </div>
              </div>
              <div className="source-trace-timeline">
                <div className="timeline-step done"><div className="timeline-dot" /><div className="timeline-label">QR Detected</div></div>
                <div className="timeline-connector" />
                <div className="timeline-step done"><div className="timeline-dot" /><div className="timeline-label">Signature Verified</div></div>
                <div className="timeline-connector" />
                <div className="timeline-step done"><div className="timeline-dot" /><div className="timeline-label">Source Matched</div></div>
                <div className="timeline-connector" />
                <div className="timeline-step done"><div className="timeline-dot" /><div className="timeline-label">Case Opened</div></div>
              </div>
            </div>
          )}

          {/* Detail Cards Grid */}
          <div className="report-grid">
            <div className="report-card">
              <div className="report-icon">🎬</div>
              <h3>Movie</h3>
              <div className="detail-row"><span className="detail-label">Title</span><span className="detail-value">{result.movie?.title || '—'}</span></div>
              <div className="detail-row"><span className="detail-label">ID</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{result.movie_id?.substring(0, 12)}…</span></div>
            </div>
            <div className="report-card">
              <div className="report-icon">🏢</div>
              <h3>Theatre (Piracy Source)</h3>
              <div className="detail-row"><span className="detail-label">Name</span><span className="detail-value" style={{ color: 'var(--danger)', fontWeight: 600 }}>{result.theatre?.name || '—'}</span></div>
              <div className="detail-row"><span className="detail-label">Location</span><span className="detail-value"><MapPin size={12} style={{ marginRight: 4, opacity: 0.5 }} />{result.theatre?.location || '—'}</span></div>
              <div className="detail-row"><span className="detail-label">Contact</span><span className="detail-value">{result.theatre?.contact_email}</span></div>
              {result.theatre?.compliance_score !== undefined && (
                <div className="detail-row"><span className="detail-label">Compliance</span><span className="detail-value" style={{ color: result.theatre.compliance_score < 50 ? 'var(--danger)' : 'var(--warning)' }}>{result.theatre.compliance_score.toFixed(0)}%</span></div>
              )}
            </div>
            <div className="report-card">
              <div className="report-icon">📊</div>
              <h3>Confidence</h3>
              <div className="confidence-meter">
                <div className="confidence-bar-bg"><div className={`confidence-bar-fill ${result.confidence >= 80 ? 'high' : 'medium'}`} style={{ width: `${result.confidence}%` }} /></div>
                <div className="confidence-value"><span>{result.confidence}%</span><span>{result.confidence >= 80 ? 'Strong Match' : 'Moderate'}</span></div>
              </div>
            </div>
            <div className="report-card">
              <div className="report-icon">📋</div>
              <h3>Case</h3>
              <div className="detail-row"><span className="detail-label">Number</span><span className="detail-value" style={{ fontWeight: 700 }}>{result.case_number}</span></div>
              <div className="detail-row"><span className="detail-label">Detected</span><span className="detail-value">{new Date(result.detection_timestamp).toLocaleString()}</span></div>
              <div className="detail-row"><span className="detail-label">Method</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{result.detection_method === 'frame_snapshot' ? 'Frame Snapshot' : 'Full Video Scan'}</span></div>
            </div>
          </div>

          {/* Detection Metrics — Enhanced with Smart Scan info */}
          <div className="card" style={{ background: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
              <Activity size={18} style={{ color: 'var(--primary-color)' }} /> Detection Metrics
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: '0.9rem' }}>
              <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Processing Time:</span><strong style={{ fontFamily: 'monospace' }}>{result.elapsed?.toFixed(2)}s</strong></div>
              <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Method:</span><strong style={{ fontFamily: 'monospace' }}>{result.embed_type || 'QR Recovery'}</strong></div>
              {result.image_size && <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Image Size:</span><strong style={{ fontFamily: 'monospace' }}>{result.image_size}</strong></div>}
              {result.frames_checked > 0 && <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Frames Scanned:</span><strong style={{ fontFamily: 'monospace' }}>{result.frames_checked}</strong></div>}
              {result.scan_strategy && (
                <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Strategy:</span>
                  <strong style={{ fontFamily: 'monospace', color: result.scan_strategy.includes('smart') ? '#10b981' : '#f59e0b' }}>
                    {scanStrategyLabel[result.scan_strategy] || result.scan_strategy}
                  </strong>
                </div>
              )}
              {result.frames_skipped > 0 && (
                <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Frames Skipped:</span>
                  <strong style={{ fontFamily: 'monospace', color: '#10b981' }}>{result.frames_skipped.toLocaleString()}</strong>
                  <span style={{ color: '#10b981', fontSize: '0.8rem', marginLeft: 4 }}>⚡ optimized</span>
                </div>
              )}
              {result.total_video_duration && (
                <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Video Length:</span><strong style={{ fontFamily: 'monospace' }}>{Math.round(result.total_video_duration)}s</strong></div>
              )}
              {result.signed !== undefined && (
                <div><span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>Signature:</span>
                  <strong style={{ fontFamily: 'monospace', color: result.signature_valid ? '#10b981' : '#ef4444' }}>
                    {result.signed ? (result.signature_valid ? 'ECDSA Verified ✓' : 'INVALID ✗') : 'Unsigned (legacy)'}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />Recommended Actions
              </h2>
              <ul className="recommendations-list">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/cases" className="flow-prompt" style={{ flex: 1 }}><Shield size={20} /><span>View All Cases</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>
            <button onClick={() => window.open(`/api/cases/${result.case_id}/dmca/`, '_blank')} className="btn btn-primary"><Download size={16} /> Download DMCA Report</button>
          </div>
        </div>
      );
    }

    // Failed result
    return (
      <div className="card">
        <div className="alert alert-error"><AlertCircle size={24} /><div><strong>Detection Failed</strong><p style={{ marginTop: 4 }}>{result.error}</p></div></div>
        {result.elapsed > 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>Scanned in {result.elapsed?.toFixed(2)}s{result.scan_strategy && ` (${result.scan_strategy})`}{result.frames_checked > 0 && ` — ${result.frames_checked} frames checked`}</p>}
        {result.recommendations?.length > 0 && (
          <><h3 style={{ marginBottom: 12, fontSize: '0.95rem' }}>Suggestions</h3><ul className="recommendations-list">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul></>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 className="page-title">Piracy Detector</h1>
      <p className="page-subtitle">Detect watermark from a screenshot or video to trace the piracy source.</p>

      {/* ── Mode Tabs ── */}
      <div className="detector-tabs">
        <button
          className={`detector-tab ${mode === 'snapshot' ? 'active' : ''}`}
          onClick={() => { setMode('snapshot'); setResult(null); }}
        >
          <Camera size={18} /> Frame Snapshot
          <span className="tab-badge">Recommended</span>
        </button>
        <button
          className={`detector-tab ${mode === 'video' ? 'active' : ''}`}
          onClick={() => { setMode('video'); setResult(null); }}
        >
          <Video size={18} /> Full Video Scan
        </button>
      </div>

      {/* ── SNAPSHOT MODE ── */}
      {mode === 'snapshot' && (
        <div className="card detector-card">
          <div className="detector-info-bar">
            <Eye size={16} />
            <span>Pause the video where the QR overlay is visible, take a screenshot or photo, then upload it here.</span>
          </div>

          {!imagePreview ? (
            <div className="upload-area" style={{ marginBottom: 20 }}>
              <input type="file" accept="image/*" capture="environment" onChange={handleImageSelect} style={{ display: 'none' }} id="frame-upload" />
              <label htmlFor="frame-upload" style={{ cursor: 'pointer' }}>
                <Camera size={48} className="upload-icon" />
                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Upload Screenshot or Photo</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 8 }}>
                  Supports PNG, JPG, WEBP — works with phone camera photos too
                </div>
              </label>
            </div>
          ) : (
            <div className="frame-preview-container">
              <div className="frame-preview-header">
                <Image size={16} />
                <span>{imageFile?.name || 'Captured Frame'}</span>
                <button className="btn btn-sm btn-outline" onClick={() => { setImagePreview(null); setImageFile(null); setResult(null); }}>Change</button>
              </div>
              <div className="frame-preview">
                <img src={imagePreview} alt="Frame to analyze" />
                <div className="frame-preview-overlay">
                  <Crosshair size={32} />
                  <span>QR Detection Zone</span>
                </div>
              </div>
            </div>
          )}

          <button
            disabled={loading || !imageFile}
            onClick={onDetectFrame}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 16 }}
          >
            {loading ? (
              <><Activity size={18} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing Frame…</>
            ) : (
              <><Fingerprint size={18} /> Detect Watermark from Frame</>
            )}
          </button>
        </div>
      )}

      {/* ── VIDEO MODE ── */}
      {mode === 'video' && (
        <div className="card detector-card">
          <div className="detector-info-bar">
            <Video size={16} />
            <span>Upload the suspected pirated video for full scan, or pause and capture a frame.</span>
          </div>

          <div className="upload-area" style={{ marginBottom: 20 }}>
            <input type="file" accept="video/*" onChange={handleVideoSelect} style={{ display: 'none' }} id="detect-upload" />
            <label htmlFor="detect-upload" style={{ cursor: 'pointer' }}>
              <Shield size={48} className="upload-icon" />
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{file ? file.name : 'Select Suspicious Video'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 8 }}>
                Scans frame intervals for dynamic QR overlays using OpenCV enhancement
              </div>
            </label>
          </div>

          {/* Inline Video Player with Capture */}
          {file && (
            <div className="video-player-container">
              <video
                ref={videoRef}
                src={URL.createObjectURL(file)}
                controls
                className="video-player"
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="video-capture-bar">
                <button onClick={captureVideoFrame} className="btn btn-sm btn-capture">
                  <Camera size={16} /> Capture Current Frame & Detect
                </button>
                <span className="capture-hint">⏸ Pause the video on a frame with visible QR, then capture</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              disabled={loading || !file}
              onClick={onDetectVideo}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {loading ? (
                <><Activity size={18} style={{ animation: 'spin 1s linear infinite' }} /> Scanning Video…</>
              ) : (
                <><Search size={18} /> Full Video Scan</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      <ResultsPanel />

      {/* ── Navigation ── */}
      <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/movies" className="flow-prompt" style={{ flex: 1 }}><Film size={20} /><span>Browse movies</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>
        <Link to="/" className="flow-prompt" style={{ flex: 1 }}><BarChart3 size={20} /><span>Dashboard</span><ArrowRight size={18} style={{ marginLeft: 'auto' }} /></Link>
      </div>
    </div>
  );
}

/* ─── App Router ─── */
export default function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/theatres" element={<Theatres />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/showtimes" element={<Showtimes />} />
            <Route path="/watermark" element={<WatermarkProcess />} />

            <Route path="/detect" element={<Detector />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/notifications" element={<Notifications />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
