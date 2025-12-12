// src/components/common/StatCard.tsx

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string;
    subtitle: string;
    Icon: LucideIcon;
    color: string;
}

/**
 * StatCard - A card component displaying a key metric with an icon, value, and subtitle.
 * Used in dashboard-style layouts to highlight important statistics.
 */
export const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, Icon, color }) => (
    <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease',
        cursor: 'default',
        direction: 'ltr',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Icon size={24} color={color} />
            <h3 style={{ fontSize: '13px', fontWeight: '700', color: color, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                {title}
            </h3>
        </div>
        <div style={{ fontSize: '32px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>
            {value}
        </div>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
            {subtitle}
        </p>
    </div>
);