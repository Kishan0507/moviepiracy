import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    BarChart3, TrendingUp, AlertTriangle, Shield, Building2,
    AlertCircle, CheckCircle2, XCircle, Eye, Skull, MapPin
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
    Legend, AreaChart, Area, RadialBarChart, RadialBar
} from 'recharts';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const STATUS_COLORS = { COMPLETED: '#10b981', PROCESSING: '#6366f1', FAILED: '#ef4444', PENDING: '#f59e0b' };
const SEVERITY_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#10b981' };
const RISK_COLORS = { BLACKLISTED: '#ef4444', CRITICAL: '#dc2626', HIGH: '#f97316', WARNING: '#f59e0b', LOW: '#10b981' };
const CASE_STATUS_COLORS = { OPEN: '#ef4444', INVESTIGATING: '#6366f1', RESOLVED: '#10b981', CLOSED: '#64748b' };

function AnimatedCounter({ value, suffix = '' }) {
    const [display, setDisplay] = useState(0);
    const ref = useRef(null);
    useEffect(() => {
        if (value === undefined || value === null) return;
        const target = typeof value === 'number' ? value : parseFloat(value) || 0;
        const duration = 1200;
        const start = performance.now();
        const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(target * eased * 10) / 10);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [value]);
    return <span>{Number.isInteger(value) ? Math.round(display) : display.toFixed(1)}{suffix}</span>;
}

export default function Analytics() {
    const [data, setData] = useState(null);
    useEffect(() => { axios.get('/api/analytics/').then(r => setData(r.data)).catch(console.error); }, []);

    if (!data) return (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
            Loading analytics...
        </div>
    );

    const taskPieData = Object.entries(data.task_statuses).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
    const severityPieData = Object.entries(data.severity_distribution).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
    const caseStatusData = Object.entries(data.case_status_distribution || {}).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
    const resolutionData = [{ name: 'Resolution Rate', value: data.resolution_rate || 0, fill: '#10b981' }];

    const riskBadge = (level) => {
        const colors = {
            BLACKLISTED: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', icon: <Skull size={12} /> },
            CRITICAL: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626', icon: <AlertCircle size={12} /> },
            HIGH: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', icon: <AlertTriangle size={12} /> },
            WARNING: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', icon: <Eye size={12} /> },
            LOW: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', icon: <CheckCircle2 size={12} /> },
        };
        const c = colors[level] || colors.LOW;
        return (
            <span className="analytics-risk-badge" style={{ background: c.bg, color: c.color }}>
                {c.icon} {level}
            </span>
        );
    };

    return (
        <div>
            <h1 className="page-title">Analytics & Compliance</h1>
            <p className="page-subtitle">Real-time intelligence dashboard — threats, compliance, and resolution metrics.</p>

            {/* ── Summary Stat Cards ── */}
            <div className="analytics-summary-grid">
                <div className="analytics-summary-card gradient-purple">
                    <div className="summary-icon"><Shield size={24} /></div>
                    <div className="summary-value"><AnimatedCounter value={data.total_cases} /></div>
                    <div className="summary-label">Total Cases</div>
                </div>
                <div className="analytics-summary-card gradient-emerald">
                    <div className="summary-icon"><CheckCircle2 size={24} /></div>
                    <div className="summary-value"><AnimatedCounter value={data.resolution_rate} suffix="%" /></div>
                    <div className="summary-label">Resolution Rate</div>
                </div>
                <div className="analytics-summary-card gradient-amber">
                    <div className="summary-icon"><Building2 size={24} /></div>
                    <div className="summary-value"><AnimatedCounter value={data.total_theatres} /></div>
                    <div className="summary-label">Theatres</div>
                </div>
                <div className="analytics-summary-card gradient-danger">
                    <div className="summary-icon"><AlertTriangle size={24} /></div>
                    <div className="summary-value"><AnimatedCounter value={(data.risk_summary?.blacklisted || 0) + (data.risk_summary?.critical || 0)} /></div>
                    <div className="summary-label">High Risk Theatres</div>
                </div>
            </div>

            {/* ── Row 1: Piracy Trend + Risk Distribution ── */}
            <div className="grid-2">
                <div className="card analytics-card">
                    <h2 className="analytics-card-title"><TrendingUp size={18} /> Piracy Incidents Over Time</h2>
                    {(data.cases_by_severity_month || data.cases_by_month)?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            {data.cases_by_severity_month?.length > 0 ? (
                                <AreaChart data={data.cases_by_severity_month}>
                                    <defs>
                                        <linearGradient id="gradCritical" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradMedium" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="month" stroke="#8b95b0" fontSize={12} />
                                    <YAxis stroke="#8b95b0" fontSize={12} />
                                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                                    <Legend />
                                    <Area type="monotone" dataKey="CRITICAL" stackId="1" stroke="#ef4444" fill="url(#gradCritical)" />
                                    <Area type="monotone" dataKey="HIGH" stackId="1" stroke="#f97316" fill="url(#gradHigh)" />
                                    <Area type="monotone" dataKey="MEDIUM" stackId="1" stroke="#f59e0b" fill="url(#gradMedium)" />
                                    <Area type="monotone" dataKey="LOW" stackId="1" stroke="#10b981" fill="rgba(16,185,129,0.1)" />
                                </AreaChart>
                            ) : (
                                <LineChart data={data.cases_by_month}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="month" stroke="#8b95b0" fontSize={12} />
                                    <YAxis stroke="#8b95b0" fontSize={12} />
                                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 5 }} name="Incidents" />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    ) : <div className="empty-state"><p>No incident data yet. Detect pirated videos to populate this chart.</p></div>}
                </div>

                {/* Risk Distribution */}
                <div className="card analytics-card">
                    <h2 className="analytics-card-title"><AlertTriangle size={18} /> Theatre Risk Distribution</h2>
                    {data.risk_summary ? (
                        <div className="risk-distribution">
                            {[
                                { label: 'Blacklisted', count: data.risk_summary.blacklisted, color: '#ef4444', icon: <Skull size={16} /> },
                                { label: 'Critical', count: data.risk_summary.critical, color: '#dc2626', icon: <AlertCircle size={16} /> },
                                { label: 'High Risk', count: data.risk_summary.high_risk, color: '#f97316', icon: <AlertTriangle size={16} /> },
                                { label: 'Warning', count: data.risk_summary.warning, color: '#f59e0b', icon: <Eye size={16} /> },
                                { label: 'Compliant', count: data.risk_summary.compliant, color: '#10b981', icon: <CheckCircle2 size={16} /> },
                            ].map((r, i) => (
                                <div key={i} className="risk-dist-row">
                                    <div className="risk-dist-label" style={{ color: r.color }}>
                                        {r.icon} {r.label}
                                    </div>
                                    <div className="risk-dist-bar-bg">
                                        <div className="risk-dist-bar-fill" style={{
                                            width: `${data.total_theatres > 0 ? (r.count / data.total_theatres) * 100 : 0}%`,
                                            background: r.color
                                        }} />
                                    </div>
                                    <div className="risk-dist-count" style={{ color: r.color }}>{r.count}</div>
                                </div>
                            ))}
                            <div className="risk-dist-total">
                                <span>Total Theatres</span>
                                <span style={{ fontWeight: 700 }}>{data.total_theatres}</span>
                            </div>
                        </div>
                    ) : <div className="empty-state"><p>No theatres registered yet.</p></div>}
                </div>
            </div>

            {/* ── Row 2: Naughty List ── */}
            <div className="card analytics-card naughty-list-card">
                <div className="naughty-list-header">
                    <h2 className="analytics-card-title" style={{ margin: 0 }}>
                        <Skull size={20} /> Theatre Naughty List
                    </h2>
                    <span className="naughty-list-subtitle">
                        Ranked by compliance score — lowest first
                    </span>
                </div>
                {data.theatre_risks.length > 0 ? (
                    <div className="naughty-list-table-wrap">
                        <table className="data-table naughty-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}>Rank</th>
                                    <th>Theatre</th>
                                    <th>Location</th>
                                    <th>Incidents</th>
                                    <th>Compliance</th>
                                    <th>Risk Level</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.theatre_risks.map((t, i) => (
                                    <tr key={t.id || i} className={`naughty-row ${t.risk_level?.toLowerCase()}`}>
                                        <td>
                                            <span className={`naughty-rank ${i < 3 ? 'top-3' : ''}`}>
                                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{t.name}</td>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MapPin size={13} style={{ opacity: 0.5 }} /> {t.location}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="incident-count" style={{
                                                color: t.total_incidents > 3 ? '#ef4444' : t.total_incidents > 0 ? '#f59e0b' : '#10b981'
                                            }}>
                                                {t.total_incidents}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="compliance-cell">
                                                <div className="compliance-bar-bg">
                                                    <div className="compliance-bar-fill" style={{
                                                        width: `${t.compliance_score}%`,
                                                        background: t.compliance_score >= 80 ? '#10b981' :
                                                            t.compliance_score >= 50 ? '#f59e0b' : '#ef4444'
                                                    }} />
                                                </div>
                                                <span className="compliance-score" style={{
                                                    color: t.compliance_score >= 80 ? '#10b981' :
                                                        t.compliance_score >= 50 ? '#f59e0b' : '#ef4444'
                                                }}>
                                                    {t.compliance_score.toFixed(0)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td>{riskBadge(t.risk_level)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="empty-state"><p>No theatres registered yet.</p></div>}
            </div>

            {/* ── Row 3: Charts Grid ── */}
            <div className="grid-2">
                {/* Most Pirated Movies */}
                <div className="card analytics-card">
                    <h2 className="analytics-card-title"><BarChart3 size={18} /> Most Pirated Movies</h2>
                    {data.top_pirated_movies.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={data.top_pirated_movies} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis type="number" stroke="#8b95b0" fontSize={12} />
                                <YAxis dataKey="movie__title" type="category" stroke="#8b95b0" fontSize={11} width={100} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                                <Bar dataKey="incidents" fill="#ef4444" radius={[0, 6, 6, 0]} name="Incidents" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="empty-state"><p>No piracy data yet.</p></div>}
                </div>

                {/* Case Resolution Donut */}
                <div className="card analytics-card">
                    <h2 className="analytics-card-title"><CheckCircle2 size={18} /> Case Resolution Status</h2>
                    {caseStatusData.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                            <ResponsiveContainer width="55%" height={250}>
                                <PieChart>
                                    <Pie data={caseStatusData} cx="50%" cy="50%" outerRadius={90} innerRadius={55} dataKey="value"
                                        label={({ name, value }) => `${name}: ${value}`}>
                                        {caseStatusData.map((entry, i) => <Cell key={i} fill={CASE_STATUS_COLORS[entry.name] || COLORS[i]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="resolution-legend">
                                {caseStatusData.map((entry, i) => (
                                    <div key={i} className="resolution-legend-item">
                                        <span className="resolution-dot" style={{ background: CASE_STATUS_COLORS[entry.name] || COLORS[i] }} />
                                        <span className="resolution-label">{entry.name}</span>
                                        <span className="resolution-value">{entry.value}</span>
                                    </div>
                                ))}
                                <div className="resolution-rate-display">
                                    <span className="resolution-rate-value">{data.resolution_rate}%</span>
                                    <span className="resolution-rate-label">resolved</span>
                                </div>
                            </div>
                        </div>
                    ) : <div className="empty-state"><p>No cases yet.</p></div>}
                </div>

                {/* Task Status Pie */}
                <div className="card analytics-card">
                    <h2 className="analytics-card-title">Watermark Task Status</h2>
                    {taskPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie data={taskPieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                                    {taskPieData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name] || COLORS[i]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="empty-state"><p>No tasks created yet.</p></div>}
                </div>

                {/* Severity Distribution */}
                <div className="card analytics-card">
                    <h2 className="analytics-card-title"><AlertCircle size={18} /> Case Severity Breakdown</h2>
                    {severityPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie data={severityPieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value"
                                    label={({ name, value }) => `${name}: ${value}`}>
                                    {severityPieData.map((entry, i) => <Cell key={i} fill={SEVERITY_COLORS[entry.name] || COLORS[i]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="empty-state"><p>No severity data yet.</p></div>}
                </div>
            </div>
        </div>
    );
}
