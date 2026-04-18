import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, Home, Film, Building2, Clock, Video, BarChart3, FileText, ScrollText, Bell, Package } from 'lucide-react';
import axios from 'axios';

export default function Sidebar() {
    const [unread, setUnread] = useState(0);
    useEffect(() => {
        const fetchNotifs = () => axios.get('/api/notifications/').then(r => setUnread(r.data.filter(n => !n.is_read).length)).catch(() => { });
        fetchNotifs();
        const i = setInterval(fetchNotifs, 10000);
        return () => clearInterval(i);
    }, []);

    return (
        <div className="sidebar">
            <div className="sidebar-header"><Shield size={26} /><span>CineMark</span></div>
            <ul className="nav-links">
                <li className="nav-section-label">Overview</li>
                <li className="nav-item"><NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end><Home size={19} /> Dashboard</NavLink></li>
                <li className="nav-item"><NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><BarChart3 size={19} /> Analytics</NavLink></li>

                <li className="nav-section-label">Management</li>
                <li className="nav-item"><NavLink to="/movies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Film size={19} /> Movies</NavLink></li>
                <li className="nav-item"><NavLink to="/theatres" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Building2 size={19} /> Theatres</NavLink></li>
                <li className="nav-item"><NavLink to="/showtimes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Clock size={19} /> Showtimes</NavLink></li>

                <li className="nav-section-label">Security</li>
                <li className="nav-item"><NavLink to="/watermark" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Video size={19} /> Process Video</NavLink></li>

                <li className="nav-item"><NavLink to="/detect" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Shield size={19} /> Piracy Detector</NavLink></li>
                <li className="nav-item"><NavLink to="/cases" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><FileText size={19} /> Piracy Cases</NavLink></li>

                <li className="nav-section-label">System</li>
                <li className="nav-item"><NavLink to="/audit" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><ScrollText size={19} /> Activity Log</NavLink></li>
                <li className="nav-item">
                    <NavLink to="/notifications" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <Bell size={19} />
                        Notifications
                        {unread > 0 && <span className="notif-badge">{unread}</span>}
                    </NavLink>
                </li>
            </ul>
        </div>
    );
}
