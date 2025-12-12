// src/components/common/ChartCard.tsx

import React from 'react';
// import { type LucideIcon } from 'lucide-react'; // unused

interface ChartCardProps {
    title: string;
    subtitle: string;
    // Expects the Lucide Icon component itself
    Icon: React.FC<{ size: number; color: string; }>; 
    span: number;
    children: React.ReactNode;
}

/**
 * ChartCard - A generic wrapper component for analytic charts and elements.
 * Provides a consistent, elegant card design with title, subtitle, and an icon.
 */
export const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, Icon, span, children }) => (
    <div 
        style={{
            gridColumn: `span ${span}`,
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
        }}
    >
        {/* Card Header with Icon, styled for RTL */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', direction: 'rtl' }}>
            <Icon size={22} color="#3b82f6" />
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                {title}
            </h2>
        </div>
        {/* Subtitle */}
        <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '20px', direction: 'rtl' }}>
            {subtitle}
        </p>
        {/* Chart Content Area (forced LTR for Recharts data visualization) */}
        <div style={{ flexGrow: 1, minHeight: 320, direction: 'ltr' }}>
            {children}
        </div>
    </div>
);