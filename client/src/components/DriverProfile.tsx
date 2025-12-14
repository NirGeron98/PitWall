import React, { useEffect, useState } from 'react';
import type { Driver, DriverSeasonStats } from '../types/f1';
import { ArrowLeft } from 'lucide-react';
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
        <div className="flex-col animate-enter driver-profile" style={{ gap: '32px', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            {/* Back Button */}
            <button
                onClick={onBack}
                className="btn-reset flex-row items-center driver-back"
                style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}
            >
                <ArrowLeft size={18} style={{ marginRight: 8 }} /> Back to Drivers
            </button>

            {/* Driver Card Section */}
            <div
                className="driver-hero"
                style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '24px',
                    border: '1px solid var(--border)',
                    background: 'rgba(24, 24, 27, 0.5)',
                    padding: '48px',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    margin: '0 auto'
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

                <div className="driver-hero-inner" style={{ 
                    position: 'relative', 
                    zIndex: 10, 
                    display: 'flex', 
                    flexDirection: 'row', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start', 
                    flexWrap: 'wrap', 
                    gap: '32px',
                    width: '100%',
                    maxWidth: '100%',
                    margin: '0 auto'
                }}>

                    {/* Driver Identity */}
                    <div className="driver-identity" style={{ 
                        display: 'flex', 
                        gap: '32px', 
                        alignItems: 'center', 
                        flexWrap: 'wrap',
                        flex: '1 1 auto',
                        minWidth: 0
                    }}>
                        <div style={{ position: 'relative' }}>
                            <img
                                className="driver-headshot"
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

                        <div className="flex-col driver-identity-meta" style={{ 
                            gap: '8px',
                            flex: '1 1 auto',
                            minWidth: 0,
                            maxWidth: '100%'
                        }}>
                            <div className="flex-row items-center" style={{ 
                                gap: '12px',
                                flexWrap: 'wrap'
                            }}>
                                <span className="text-h3" style={{ 
                                    color: 'var(--text-tertiary)', 
                                    fontWeight: 300,
                                    whiteSpace: 'nowrap'
                                }}>
                                    #{driver.DriverNumber}
                                </span>
                                {stats?.standingPosition && (
                                    <span className="badge badge-gray" style={{ whiteSpace: 'nowrap' }}>
                                        P{stats.standingPosition} in Championship
                                    </span>
                                )}
                            </div>
                            <h1 className="text-h1 driver-name" style={{ 
                                textTransform: 'uppercase', 
                                lineHeight: 1,
                                wordBreak: 'break-word'
                            }}>
                                {driver.BroadcastName}
                            </h1>
                            <div className="driver-team" style={{ 
                                fontSize: '1.2rem', 
                                color: driver.TeamColor, 
                                fontWeight: 500,
                                wordBreak: 'break-word'
                            }}>
                                {driver.TeamName}
                            </div>
                        </div>
                    </div>

                    {/* Key Stats */}
                    {loading ? (
                        <div className="driver-stats">
                            <div className="driver-stat-item">
                                <div className="driver-stat-value">
                                    <Skeleton width="60px" height="36px" />
                                </div>
                                <div className="driver-stat-label">Points</div>
                            </div>
                            <div className="driver-stat-item">
                                <div className="driver-stat-value">
                                    <Skeleton width="40px" height="36px" />
                                </div>
                                <div className="driver-stat-label">Best Finish</div>
                            </div>
                        </div>
                    ) : (
                        <div className="driver-stats">
                            <div className="driver-stat-item">
                                <div className="text-h2 driver-stat-value">{totalPoints}</div>
                                <div className="driver-stat-label">Points</div>
                            </div>
                            <div className="driver-stat-item">
                                <div className="text-h2 driver-stat-value" style={{ color: 'var(--accent-red)' }}>{bestFinish}</div>
                                <div className="driver-stat-label">Best Finish</div>
                            </div>
                            {wins > 0 && (
                                <div className="driver-stat-item">
                                    <div className="text-h2 driver-stat-value" style={{ color: '#eab308' }}>{wins}</div>
                                    <div className="driver-stat-label">Wins</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Season Performance Section */}
            <div className="flex-col" style={{ gap: '16px', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <h2 className="text-h3">Season Performance</h2>

                <Card>
                    <div className="driver-table-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
                        <div className="table-container">
                        {loading ? (
                            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} height="50px" width="100%" />)}
                            </div>
                        ) : (
                            <>
                                <table className="table-compact table-desktop">
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

                                <div className="mobile-list driver-race-list">
                                    {stats?.results.map((race, idx) => {
                                        const finishPos = Number(race.position);
                                        const isWin = finishPos === 1;
                                        const podiumColor = isWin ? '#FFD700' : finishPos === 2 ? '#C0C0C0' : finishPos === 3 ? '#CD7F32' : 'var(--text-primary)';
                                        return (
                                            <div key={idx} className="mobile-row driver-race-card">
                                                <div className="race-card-row">
                                                    <div className="race-card-line">
                                                        <span className="race-card-round">Round {race.round}</span>
                                                        <span className="race-card-finish" style={{ color: podiumColor }}>P{race.position}</span>
                                                    </div>
                                                    <div className="race-card-name">{race.raceName}</div>
                                                    <div className="race-card-line">
                                                        <span className="text-muted">Start P{race.grid}</span>
                                                        <span className="text-muted">Finished</span>
                                                    </div>
                                                    <div className="race-card-line race-card-line-compact">
                                                        <span className="text-muted">Points</span>
                                                        <span className="race-card-points">{race.points > 0 ? `+${race.points}` : '-'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                        </div>
                    </div>
                </Card>
            </div>

            <style>{`
                /* Driver hero responsive grid */
                .driver-hero {
                    width: 100%;
                    max-width: 100%;
                    box-sizing: border-box;
                }

                .driver-hero-inner {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    align-items: flex-start;
                    gap: var(--space-4, 32px);
                    width: 100%;
                    max-width: 100%;
                }
                
                @media (min-width: 769px) {
                    .driver-identity {
                        grid-column: span 2;
                    }
                }

                .driver-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: var(--space-4, 32px);
                    text-align: left;
                    padding: 20px;
                    background: rgba(0,0,0,0.2);
                    backdrop-filter: blur(4px);
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.05);
                    width: 100%;
                    max-width: 100%;
                    box-sizing: border-box;
                }

                .driver-stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .driver-stat-value {
                    line-height: 1;
                }

                .driver-stat-label {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: var(--text-secondary);
                }

                .driver-race-list {
                    display: none;
                }

                .driver-race-card {
                    padding: 14px 12px;
                    background: rgba(30, 30, 36, 0.7);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    margin-bottom: 10px;
                    box-shadow: 0 6px 16px -12px rgba(0,0,0,0.7);
                }

                .race-card-row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .race-card-line {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.9rem;
                    flex-wrap: wrap;
                }

                .race-card-round {
                    font-family: ui-monospace, SFMono-Regular, monospace;
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }

                .race-card-name {
                    font-weight: 800;
                    font-size: 1rem;
                    line-height: 1.3;
                }

                .race-card-finish {
                    font-weight: 800;
                }

                .race-card-points {
                    font-weight: 800;
                }

                .race-card-line-compact span {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                /* Hide desktop table on small screens and show cards */
                @media (max-width: 768px) {
                    .table-container .table-compact { display: none; }
                    .table-container .mobile-list { display: block; }
                    .driver-race-list { display: block; }
                }

                @media (min-width: 769px) {
                    .driver-stats .driver-stat-item:not(:first-child) {
                        border-left: 1px solid rgba(255,255,255,0.08);
                        padding-left: var(--space-4, 32px);
                    }
                }

                @media (max-width: 768px) {
                    .driver-hero {
                        padding: 16px !important;
                        max-width: 100%;
                        box-sizing: border-box;
                    }

                    .driver-hero-inner {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 20px !important;
                        width: 100%;
                        max-width: 340px;
                        align-items: center;
                        margin: 0 auto;
                        padding: 0;
                    }

                    .driver-identity {
                        width: 100%;
                        max-width: 100%;
                        display: flex;
                        flex-direction: column !important;
                        justify-content: center !important;
                        align-items: center !important;
                        gap: 12px !important;
                        box-sizing: border-box;
                        text-align: center;
                        padding: 0;
                    }

                    .driver-identity-meta {
                        gap: 6px !important;
                        width: 100%;
                        max-width: 100%;
                        align-items: center !important;
                        text-align: center !important;
                        padding: 0;
                    }

                    .driver-identity-meta .flex-row {
                        justify-content: center !important;
                        flex-wrap: wrap;
                        gap: 8px;
                    }

                    .driver-headshot {
                        width: 100px !important;
                        height: 100px !important;
                        border-width: 3px !important;
                        flex-shrink: 0;
                    }

                    .driver-name {
                        font-size: clamp(1.5rem, 5.5vw, 1.9rem) !important;
                        word-break: break-word;
                    }

                    .driver-team {
                        font-size: 0.95rem !important;
                        word-break: break-word;
                    }

                    .driver-stats {
                        width: 100%;
                        max-width: 100%;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 16px 20px !important;
                        padding: 14px 12px !important;
                        text-align: center;
                        box-sizing: border-box;
                        margin: 0;
                    }

                    .driver-stats .driver-stat-item {
                        align-items: center;
                        min-width: 0;
                    }

                    .driver-stats .driver-stat-item:nth-child(3) {
                        grid-column: 1 / -1;
                        max-width: 120px;
                        margin: 0 auto;
                    }

                    .driver-stats .text-h2 {
                        font-size: 1.5rem !important;
                    }

                    .driver-stat-label {
                        font-size: 0.7rem !important;
                    }

                    .driver-table-wrapper {
                        overflow-x: auto;
                        padding-bottom: var(--space-2, 16px);
                        width: 100%;
                        max-width: 100%;
                    }

                    .driver-table-wrapper table {
                        min-width: 640px;
                    }
                }

                @media (max-width: 600px) {
                    .driver-hero {
                        padding: 14px !important;
                        border-radius: 18px !important;
                    }

                    .driver-hero-inner {
                        max-width: 320px;
                        gap: 16px !important;
                    }

                    .driver-identity {
                        flex-direction: column !important;
                        align-items: center !important;
                        text-align: center;
                        gap: 10px !important;
                    }

                    .driver-identity-meta {
                        align-items: center !important;
                        text-align: center !important;
                    }

                    .driver-identity-meta .flex-row {
                        justify-content: center !important;
                    }

                    .driver-headshot {
                        width: 90px !important;
                        height: 90px !important;
                    }

                    .driver-name {
                        font-size: clamp(1.3rem, 5vw, 1.7rem) !important;
                    }

                    .driver-team {
                        font-size: 0.9rem !important;
                    }

                    .driver-stats {
                        gap: 12px 16px !important;
                        padding: 12px 10px !important;
                    }

                    .driver-stats .text-h2 {
                        font-size: 1.35rem !important;
                    }

                    .driver-stats .driver-stat-label {
                        font-size: 0.65rem !important;
                    }

                    .driver-table-wrapper table {
                        min-width: 520px;
                    }
                }

                @media (max-width: 480px) {
                    .driver-hero {
                        padding: 12px !important;
                    }

                    .driver-hero-inner {
                        max-width: 300px;
                        gap: 14px !important;
                    }

                    .driver-headshot {
                        width: 85px !important;
                        height: 85px !important;
                    }

                    .driver-stats {
                        grid-template-columns: 1fr 1fr !important;
                        padding: 10px 8px !important;
                        gap: 10px 14px !important;
                    }

                    .driver-stats .text-h2 {
                        font-size: 1.25rem !important;
                    }

                    .driver-stats .driver-stat-label {
                        font-size: 0.6rem !important;
                    }
                }
            `}</style>
        </div>
    );
};
