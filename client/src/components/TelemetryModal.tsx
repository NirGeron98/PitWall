import React, { useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { getTelemetry, type TelemetrySeries } from '../services/api';
import type { Driver } from '../types/f1';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    driver: Driver | null;
    year: number;
}

export const TelemetryModal: React.FC<Props> = ({ isOpen, onClose, driver, year }) => {
    const [telemetry, setTelemetry] = useState<TelemetrySeries | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && driver) {
            setLoading(true);
            getTelemetry(year, 1, driver.DriverNumber)
                .then(setTelemetry)
                .catch(err => console.error("Failed to load telemetry", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen, driver, year]);

    if (!isOpen || !driver) return null;

    const chartData = (() => {
        if (!telemetry) return [];
        const len = Math.min(
            telemetry.distance?.length ?? 0,
            telemetry.speed?.length ?? 0,
        );
        return Array.from({ length: len }, (_, i) => ({
            distance: telemetry.distance[i],
            speed: telemetry.speed[i],
            throttle: telemetry.throttle?.[i],
            brake: telemetry.brake?.[i],
            gear: telemetry.gear?.[i],
        }));
    })();

    const topSpeed = chartData.length ? Math.max(...chartData.map(d => d.speed ?? 0)) : 0;
    const avgSpeed = chartData.length
        ? Math.round(chartData.reduce((sum, d) => sum + (d.speed ?? 0), 0) / chartData.length)
        : 0;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '1000px' }}>
                {/* Modal Header */}
                <div className="modal-header flex-row justify-between items-center" style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-subtle)' }}>
                    <div className="flex-row items-center" style={{ gap: '20px' }}>
                        {driver.HeadshotUrl && (
                            <img
                                src={driver.HeadshotUrl}
                                alt="Driver"
                                className="driver-avatar"
                                style={{ width: 64, height: 64, border: `3px solid ${driver.TeamColor}` }}
                            />
                        )}
                        <div>
                            <div className="flex-row items-center" style={{ gap: '8px' }}>
                                <h2 style={{ fontSize: '1.75rem', lineHeight: 1 }}>{driver.BroadcastName}</h2>
                                <span className="pill ghost">#{driver.DriverNumber}</span>
                            </div>
                            <span className="text-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <Activity size={14} /> Live Telemetry Analysis • Bahrain GP (Sample)
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="btn-reset"
                        style={{ padding: '8px', borderRadius: '50%', background: 'var(--bg-highlight)' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '32px' }}>
                    {loading ? (
                        <div className="loader-box" style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                            <Activity className="animate-spin" size={48} color="var(--accent-red)" />
                            <p className="text-secondary" style={{ letterSpacing: '0.05em' }}>DECODING TELEMETRY PACKETS...</p>
                        </div>
                    ) : (
                        <div className="flex-col" style={{ gap: '32px' }}>
                            {/* Stats Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                <div className="card" style={{ padding: '16px', borderLeft: `4px solid ${driver.TeamColor}` }}>
                                    <div className="text-muted text-xs uppercase font-bold mb-2">Top Speed</div>
                                    <div className="text-h2 flex-row items-end" style={{ gap: '4px' }}>
                                        {topSpeed} <span className="text-sm text-muted" style={{ marginBottom: '6px' }}>km/h</span>
                                    </div>
                                </div>
                                <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--accent-blue)' }}>
                                    <div className="text-muted text-xs uppercase font-bold mb-2">Avg Speed</div>
                                    <div className="text-h2 flex-row items-end" style={{ gap: '4px' }}>
                                        {avgSpeed.toLocaleString()} <span className="text-sm text-muted" style={{ marginBottom: '6px' }}>km/h</span>
                                    </div>
                                </div>
                                <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--accent-orange)' }}>
                                    <div className="text-muted text-xs uppercase font-bold mb-2">Telemetry Points</div>
                                    <div className="text-h2 flex-row items-end" style={{ gap: '4px' }}>
                                        {chartData.length}
                                    </div>
                                </div>
                            </div>

                            {/* Main Chart */}
                            <div className="card" style={{ padding: '24px', height: '400px' }}>
                                <h3 style={{ marginBottom: '16px', fontSize: '1rem', color: 'var(--text-secondary)' }}>Speed Trace</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={driver.TeamColor} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={driver.TeamColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                                        <XAxis
                                            dataKey="distance"
                                            label={{ value: 'Distance (m)', position: 'insideBottom', offset: -5, fill: 'var(--text-secondary)' }}
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            label={{ value: 'Speed (km/h)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }}
                                            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                                            domain={[0, 360]}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(24, 24, 27, 0.95)',
                                                borderColor: 'var(--border)',
                                                color: 'var(--text-primary)',
                                                borderRadius: '8px',
                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                                            }}
                                            itemStyle={{ color: 'var(--text-primary)' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="speed"
                                            stroke={driver.TeamColor}
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorSpeed)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};