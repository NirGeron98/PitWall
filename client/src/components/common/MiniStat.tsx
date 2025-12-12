// src/components/common/MiniStat.tsx

import React from 'react';

interface MiniStatProps { 
    label: string; 
    value: string; 
    color: string; 
}

/**
 * MiniStat - A compact component designed to display a small, highlighted metric,
 * with a color-coded border, used within larger detail sections like Telemetry.
 */
export const MiniStat: React.FC<MiniStatProps> = ({ label, value, color }) => (
    <div style={{
        background: `linear-gradient(135deg, ${color}15 0%, #1f2937 100%)`,
        borderRight: `3px solid ${color}`, // Border on right for RTL language flow
        borderRadius: '8px',
        padding: '12px 16px',
        direction: 'rtl',
        textAlign: 'right',
    }}>
        <p style={{ fontSize: '11px', color: color, fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</p>
        <div style={{ fontSize: '20px', fontWeight: '600', color: '#fff' }}>{value}</div>
    </div>
);