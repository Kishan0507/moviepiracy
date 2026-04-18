import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ScrollText, Film, Building2, Shield, FileText, Video, Download, User, Bell } from 'lucide-react';

const ACTION_ICONS = {
    MOVIE_UPLOADED: Film, THEATRE_REGISTERED: Building2, SHOWTIME_CREATED: Video,
    WATERMARK_STARTED: Video, WATERMARK_COMPLETED: Video, WATERMARK_FAILED: Video,
    PIRACY_DETECTED: Shield, CASE_CREATED: FileText, CASE_UPDATED: FileText,
    VIDEO_DOWNLOADED: Download, VIDEO_SHARED: Download, DMCA_GENERATED: FileText,
    USER_LOGIN: User, USER_LOGOUT: User,
};
const ACTION_COLORS = {
    PIRACY_DETECTED: '#ef4444', WATERMARK_COMPLETED: '#10b981', WATERMARK_FAILED: '#ef4444',
    MOVIE_UPLOADED: '#6366f1', THEATRE_REGISTERED: '#06b6d4',
};

export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('');
    useEffect(() => { axios.get('/api/audit/').then(r => setLogs(r.data)).catch(console.error); }, []);

    const filtered = filter ? logs.filter(l => l.action === filter) : logs;
    const actions = [...new Set(logs.map(l => l.action))];

    return (
        <div>
            <h1 className="page-title">Activity Log</h1>
            <p className="page-subtitle">Complete audit trail of all system actions.</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                <button onClick={() => setFilter('')} className={`btn btn-sm ${!filter ? 'btn-primary' : 'btn-outline'}`}>All ({logs.length})</button>
                {actions.map(a => (
                    <button key={a} onClick={() => setFilter(a)} className={`btn btn-sm ${filter === a ? 'btn-primary' : 'btn-outline'}`}>
                        {a.replace(/_/g, ' ')} ({logs.filter(l => l.action === a).length})
                    </button>
                ))}
            </div>

            <div className="card">
                {filtered.length > 0 ? (
                    <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                        {filtered.map(log => {
                            const Icon = ACTION_ICONS[log.action] || Bell;
                            const color = ACTION_COLORS[log.action] || 'var(--text-secondary)';
                            return (
                                <div key={log.id} style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}20`, flexShrink: 0 }}>
                                        <Icon size={18} style={{ color }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 500, marginBottom: 2 }}>{log.description}</div>
                                        <div style={{ display: 'flex', gap: 16, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                                            {log.username && <span>by {log.username}</span>}
                                            <span className="badge badge-processing" style={{ fontSize: '0.7rem' }}>{log.action.replace(/_/g, ' ')}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state"><ScrollText size={40} /><p>No activity recorded yet. Actions will appear here as you use the system.</p></div>
                )}
            </div>
        </div>
    );
}
