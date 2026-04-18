import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, CheckCircle2, AlertTriangle, Shield, Info } from 'lucide-react';

const TYPE_ICONS = { SUCCESS: CheckCircle2, WARNING: AlertTriangle, DANGER: Shield, INFO: Info };
const TYPE_COLORS = { SUCCESS: '#10b981', WARNING: '#f59e0b', DANGER: '#ef4444', INFO: '#6366f1' };

export default function Notifications() {
    const [notifs, setNotifs] = useState([]);

    useEffect(() => { axios.get('/api/notifications/').then(r => setNotifs(r.data)).catch(console.error); }, []);

    const markRead = async (id) => {
        await axios.post(`/api/notifications/${id}/mark_read/`);
        setNotifs(notifs.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const markAllRead = async () => {
        await axios.post('/api/notifications/mark_all_read/');
        setNotifs(notifs.map(n => ({ ...n, is_read: true })));
    };

    const unreadCount = notifs.filter(n => !n.is_read).length;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
                <div>
                    <h1 className="page-title">Notifications</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
                </div>
                {unreadCount > 0 && (
                    <button onClick={markAllRead} className="btn btn-sm btn-outline"><CheckCircle2 size={14} /> Mark All Read</button>
                )}
            </div>

            <div className="card">
                {notifs.length > 0 ? notifs.map(n => {
                    const Icon = TYPE_ICONS[n.type] || Info;
                    const color = TYPE_COLORS[n.type] || '#6366f1';
                    return (
                        <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
                            style={{
                                display: 'flex', gap: 14, padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                cursor: n.is_read ? 'default' : 'pointer', opacity: n.is_read ? 0.6 : 1, transition: 'opacity 0.2s'
                            }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', background: `${color}18`, flexShrink: 0
                            }}>
                                <Icon size={20} style={{ color }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {n.title}
                                    {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{n.message}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(n.created_at).toLocaleString()}</div>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="empty-state"><Bell size={40} /><p>No notifications. They will appear as events occur in the system.</p></div>
                )}
            </div>
        </div>
    );
}
