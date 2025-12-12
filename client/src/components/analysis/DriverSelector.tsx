// src/components/analysis/DriverSelector.tsx

import React from 'react';
import { LineChart as LineChartIcon } from "lucide-react";
// import type { Driver } from "../../types/f1"; // unused
import { formatLapTimeShort } from '../../utils/formatters'; 

// Data structure for top driver statistics displayed in the selector
interface TopDriverData {
    driver: string;
    driverNumber: string;
    best: number;
    consistency: number;
    color: string;
    avg: number;
    median: number;
    laps: number;
    improvementRate: number | null;
}

interface DriverSelectorProps {
    topDrivers: TopDriverData[];
    selectedDrivers: string[];
    toggleDriver: (driverNum: string) => void;
}

/**
 * DriverSelector - Component for displaying the top performing drivers based on fastest lap 
 * and managing the selection state for comparison charts (max 4 drivers). All UI is in English.
 */
export const DriverSelector: React.FC<DriverSelectorProps> = ({ 
    topDrivers, 
    selectedDrivers, 
    toggleDriver 
}) => {
    // UI strings in English (User Messages)
    const UI_TITLE = "Click to Select for Drivers";
    const UI_RANK = "P";
    const UI_CONSISTENCY = "Consistency (σ):";
    const UI_MAX_ALERT = "⚠️ Maximum 4 drivers selected. Deselect one to choose another.";

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            marginBottom: '32px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            direction: 'ltr',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <LineChartIcon size={24} color="#3b82f6" />
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#fff', margin: 0 }}>
                    {UI_TITLE}
                </h2>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {topDrivers.map((driverData, index) => {
                    const isSelected = selectedDrivers.includes(driverData.driverNumber);
                    return (
                        <button
                            key={driverData.driverNumber}
                            onClick={() => toggleDriver(driverData.driverNumber)}
                            style={{
                                background: isSelected 
                                    ? `linear-gradient(135deg, ${driverData.color} 0%, ${driverData.color}dd 100%)`
                                    : 'rgba(255, 255, 255, 0.03)',
                                border: `2px solid ${isSelected ? driverData.color : 'rgba(255, 255, 255, 0.1)'}`,
                                borderRadius: '12px',
                                padding: '14px 18px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                color: isSelected ? '#000' : '#fff',
                                fontWeight: isSelected ? '700' : '500',
                                fontSize: '14px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '4px',
                                minWidth: '140px',
                                boxShadow: isSelected ? `0 4px 20px ${driverData.color}40` : 'none',
                                textAlign: 'left', 
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
                                <span style={{ flex: 1, textAlign: 'left' }}>{driverData.driver}</span>
                                <span style={{ fontSize: '11px', opacity: 0.7, fontWeight: '800' }}>
                                    {UI_RANK}{index + 1}
                                </span>
                            </div>
                            <div style={{ fontSize: '13px', opacity: 0.8, fontWeight: '600' }}>
                                {formatLapTimeShort(driverData.best)}
                            </div>
                            <div style={{ fontSize: '11px', opacity: 0.6 }}>
                                {UI_CONSISTENCY} {(driverData.consistency / 1000).toFixed(2)}s
                            </div>
                        </button>
                    );
                })}
            </div>
            {selectedDrivers.length >= 4 && (
                <p style={{ 
                    fontSize: '13px', 
                    color: '#f59e0b', 
                    marginTop: '16px',
                    padding: '12px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    borderRadius: '8px',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                    {UI_MAX_ALERT}
                </p>
            )}
        </div>
    );
};