import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function Toast({ message, type, onClose }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);
    return (
        <div className={`toast ${type}`} style={{ cursor: 'pointer' }} onClick={onClose}>
            {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {message}
        </div>
    );
}
