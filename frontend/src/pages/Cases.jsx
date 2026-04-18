import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { FileText, AlertTriangle, CheckCircle2, Clock, Download, Plus, Search } from 'lucide-react';

const STATUS_COLORS = { OPEN: 'badge-failed', INVESTIGATING: 'badge-processing', RESOLVED: 'badge-completed', CLOSED: 'badge-pending' };
const SEV_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#10b981' };

export default function Cases() {
    const [cases, setCases] = useState([]);
    const [filter, setFilter] = useState('ALL');
    const [toast, setToast] = useState(null);

    useEffect(() => { axios.get('/api/cases/').then(r => setCases(r.data)).catch(console.error); }, []);

    const filtered = filter === 'ALL' ? cases : cases.filter(c => c.status === filter);

    const updateStatus = async (id, newStatus) => {
        try {
            await axios.patch(`/api/cases/${id}/`, { status: newStatus });
            setCases(cases.map(c => c.id === id ? { ...c, status: newStatus } : c));
            setToast({ message: `Case updated to ${newStatus}`, type: 'success' });
        } catch { setToast({ message: 'Update failed', type: 'error' }); }
    };

    const downloadDmca = (id, caseNum) => {
        window.open(`/api/cases/${id}/dmca/`, '_blank');
        setToast({ message: `DMCA report for ${caseNum} downloading...`, type: 'success' });
    };

    return (
        <div>
            {toast && <Toast {...toast} onClose={() => setToast(null)} />}
            <h1 className="page-title">Piracy Cases</h1>
            <p className="page-subtitle">Track and manage all piracy incidents with formal case reports.</p>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                {['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'].map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`}>
                        {s} {s !== 'ALL' && `(${cases.filter(c => c.status === s).length})`}
                    </button>
                ))}
            </div>

            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr><th>Case #</th><th>Movie</th><th>Theatre</th><th>Severity</th><th>Status</th><th>Date</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {filtered.map(c => (
                            <tr key={c.id}>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.case_number}</td>
                                <td>{c.movie_title || '—'}</td>
                                <td>{c.theatre_name || '—'}</td>
                                <td><span style={{ color: SEV_COLORS[c.severity], fontWeight: 600 }}>{c.severity}</span></td>
                                <td><span className={`badge ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                                <td style={{ fontSize: '0.9rem' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {c.status === 'OPEN' && (
                                            <button onClick={() => updateStatus(c.id, 'INVESTIGATING')} className="btn btn-sm btn-outline">
                                                <Search size={12} /> Investigate
                                            </button>
                                        )}
                                        {c.status === 'INVESTIGATING' && (
                                            <button onClick={() => updateStatus(c.id, 'RESOLVED')} className="btn btn-sm btn-success">
                                                <CheckCircle2 size={12} /> Resolve
                                            </button>
                                        )}
                                        {c.status === 'RESOLVED' && (
                                            <button onClick={() => updateStatus(c.id, 'CLOSED')} className="btn btn-sm btn-outline">Close</button>
                                        )}
                                        <button onClick={() => downloadDmca(c.id, c.case_number)} className="btn btn-sm btn-download">
                                            <Download size={12} /> DMCA
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan="7">
                                <div className="empty-state">
                                    <FileText size={40} />
                                    <p>No piracy cases {filter !== 'ALL' ? `with status "${filter}"` : 'yet'}.</p>
                                    <Link to="/detect" className="btn btn-sm btn-primary" style={{ marginTop: 12 }}><Search size={14} /> Run Piracy Detection</Link>
                                </div>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
