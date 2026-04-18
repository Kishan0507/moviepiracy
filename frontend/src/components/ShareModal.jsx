import React, { useState } from 'react';
import { Share2, X, Copy, CheckCircle2, Download } from 'lucide-react';

export default function ShareModal({ shareData, onClose }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(shareData.download_url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Share2 size={20} /> Share Watermarked Video
                    </h2>
                    <button onClick={onClose} className="btn btn-sm btn-outline" style={{ padding: 6 }}><X size={16} /></button>
                </div>
                <div style={{ marginBottom: 20 }}>
                    <div className="report-card" style={{ marginBottom: 16 }}>
                        <div className="detail-row"><span className="detail-label">Movie</span><span className="detail-value">{shareData.movie_title}</span></div>
                        <div className="detail-row"><span className="detail-label">Theatre</span><span className="detail-value">{shareData.theatre_name}</span></div>
                        <div className="detail-row"><span className="detail-label">Status</span><span className="detail-value" style={{ color: 'var(--success)' }}>{shareData.status}</span></div>
                    </div>
                    <label className="form-label">Shareable Download Link</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input className="form-control" value={shareData.download_url} readOnly style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                        <button onClick={handleCopy} className="btn btn-sm btn-primary" style={{ whiteSpace: 'nowrap' }}>
                            {copied ? <><CheckCircle2 size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <a href={shareData.download_url} target="_blank" rel="noreferrer" className="btn btn-download" style={{ flex: 1, textAlign: 'center' }}><Download size={16} /> Download</a>
                    <button onClick={onClose} className="btn btn-outline" style={{ flex: 1 }}>Close</button>
                </div>
            </div>
        </div>
    );
}
