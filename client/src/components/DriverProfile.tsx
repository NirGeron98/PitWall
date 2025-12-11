import React, { useEffect, useState } from 'react';
import type { Driver, DriverSeasonStats } from '../types/f1';
import { ArrowLeft, Trophy, Crown } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { Card } from './ui/Card';
import { Skeleton } from './ui/Skeleton';

interface Props {
    driver: Driver;
    onBack: () => void;
}

export const DriverProfile: React.FC<Props> = ({ driver, onBack }) => {
    const { year, fetchDriverStatsWithCache } = useData();
    const [stats, setStats] = useState<DriverSeasonStats | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetchDriverStatsWithCache(driver.DriverNumber, false)
            .then(setStats)
            .catch(err => {
                console.error('Failed to fetch driver stats:', err);
                setStats(null);
            })
            .finally(() => setLoading(false));
    }, [year, driver, fetchDriverStatsWithCache]);

    // Calculate totals locally
    const totalPoints = stats?.results.reduce((sum, race) => sum + (Number(race.points) || 0), 0) || 0;
    const bestFinish = stats && stats.results.length > 0
        ? Math.min(...stats.results.map(r => Number(r.position)))
        : '-';

    const wins = stats?.results.filter(r => Number(r.position) === 1).length || 0;

    return (
        <div className="flex-col animate-enter" style={{ gap: '32px' }}>
            {/* Back Button */}
            <button
                onClick={onBack}
                className="btn-reset flex-row items-center"
                style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}
            >
                <ArrowLeft size={18} style={{ marginRight: 8 }} /> Back to Drivers
            </button>

            {/* Hero Section */}
            <div
                style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '24px',
                    border: '1px solid var(--border)',
                    background: 'rgba(24, 24, 27, 0.5)',
                    padding: '48px',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: 0.2,
                        pointerEvents: 'none',
                        background: `radial-gradient(circle at 80% 20%, ${driver.TeamColor}, transparent 60%)`,
                        filter: 'blur(60px)'
                    }}
                />

                <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '32px' }}>

                    {/* Identity */}
                    <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                            <img
                                src={driver.HeadshotUrl || 'https://via.placeholder.com/150'}
                                alt={driver.BroadcastName}
                                style={{
                                    width: '160px',
                                    height: '160px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: `4px solid ${driver.TeamColor}`,
                                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                                }}
                            />
                        </div>

                        <div className="flex-col" style={{ gap: '8px' }}>
                            <div className="flex-row items-center">
                                <span className="text-h3" style={{ color: 'var(--text-tertiary)', fontWeight: 300 }}>#{driver.DriverNumber}</span>
                                {stats?.standingPosition && (
                                    <span className="badge badge-gray">P{stats.standingPosition} in Championship</span>
                                )}
                            </div>
                            <h1 className="text-h1" style={{ textTransform: 'uppercase', lineHeight: 1 }}>
                                {driver.BroadcastName}
                            </h1>
                            <div style={{ fontSize: '1.2rem', color: driver.TeamColor, fontWeight: 500 }}>
                                {driver.TeamName}
                            </div>
                        </div>
                    </div>

                    {/* Key Stats */}
                    <div style={{
                        display: 'flex',
                        gap: '48px',
                        textAlign: 'right',
                        padding: '24px',
                        background: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(4px)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        <div>
                            <div className="text-h2" style={{ lineHeight: 1 }}>{loading ? <Skeleton width="2ch" /> : totalPoints}</div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '8px', color: 'var(--text-secondary)' }}>Points</div>
                        </div>
                        <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                        <div>
                            <div className="text-h2" style={{ lineHeight: 1, color: 'var(--accent-red)' }}>{loading ? <Skeleton width="1ch" /> : bestFinish}</div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '8px', color: 'var(--text-secondary)' }}>Best Finish</div>
                        </div>
                        {wins > 0 && (
                            <>
                                <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                <div>
                                    <div className="text-h2" style={{ lineHeight: 1, color: '#eab308' }}>{wins}</div>
                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '8px', color: 'var(--text-secondary)' }}>Wins</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Season History Section */}
            <div className="flex-col" style={{ gap: '16px' }}>
                <h2 className="text-h3">Season Performance</h2>

                <Card>
                    <div className="table-container">
                        {loading ? (
                            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} height="50px" width="100%" />)}
                            </div>
                        ) : (
                            <table className="table-compact">
                                <thead>
                                    <tr>
                                        <th>ROUND</th>
                                        <th>GRAND PRIX</th>
                                        <th>START</th>
                                        <th>FINISH</th>
                                        <th>STATUS</th>
                                        <th className="text-right">POINTS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats?.results.map((race, idx) => {
                                        const finishPos = Number(race.position);
                                        const isPodium = finishPos <= 3;
                                        const isWin = finishPos === 1;
                                        const podiumColor = isWin ? '#FFD700' : finishPos === 2 ? '#C0C0C0' : finishPos === 3 ? '#CD7F32' : undefined;
                                        return (
                                            <tr key={idx} className="table-row-hover">
                                                <td className="text-muted" style={{ fontFamily: 'monospace' }}>{String(race.round).padStart(2, '0')}</td>
                                                <td style={{ fontWeight: 600 }}>{race.raceName}</td>
                                                <td className="text-muted">P{race.grid}</td>
                                                <td>
                                                    <div style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontWeight: 700,
                                                        color: podiumColor || 'inherit'
                                                    }}>
                                                        {isWin && <Crown size={14} color={podiumColor} />}
                                                        {isPodium && !isWin && <Trophy size={14} color={podiumColor} />}
                                                        <span style={{ color: podiumColor || 'inherit' }}>P{race.position}</span>
                                                    </div>
                                                </td>
                                                <td className="text-muted text-xs">{race.status}</td>
                                                <td className="text-right" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{race.points > 0 ? race.points : <span style={{ color: 'var(--text-tertiary)' }}>-</span>}</td>
                                            </tr>
                                        );
                                    })}
                                    {stats?.results.length === 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
                                                No race data available for this season yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};
