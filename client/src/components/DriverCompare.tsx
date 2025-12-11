import React, { useMemo } from 'react';
import type { Driver, DriverSeasonStats } from '../types/f1';
import { X, Trophy, AlertCircle, BarChart2 } from 'lucide-react';

interface Props {
    drivers: Driver[];
    statsMap: Record<string, DriverSeasonStats | null>;
    loading: boolean;
    onClear: () => void;
}

export const DriverCompare: React.FC<Props> = ({ drivers, statsMap, loading, onClear }) => {
    const statsData = useMemo(() => {
        return drivers.map(d => {
            const stats = statsMap[d.DriverNumber];
            if (!stats) return null;

            const totalPoints = stats.results.reduce((sum, r) => sum + r.points, 0);
            const bestFinish = Math.min(...stats.results.map(r => r.position));
            const wins = stats.results.filter(r => r.position === 1).length;
            const dnfs = stats.results.filter(r => r.status !== 'Finished' && !r.status.includes('Lap')).length;

            const gridPositions = stats.results.map(r => r.grid).filter(g => g > 0);
            const avgGrid = gridPositions.length > 0
                ? (gridPositions.reduce((a, b) => a + b, 0) / gridPositions.length).toFixed(1)
                : '-';

            const finishPositions = stats.results.map(r => r.position);
            const avgFinish = finishPositions.length > 0
                ? (finishPositions.reduce((a, b) => a + b, 0) / finishPositions.length).toFixed(1)
                : '-';

            return {
                ...d,
                stats: {
                    totalPoints,
                    bestFinish,
                    wins,
                    dnfs,
                    avgGrid,
                    avgFinish,
                    standing: stats.standingPosition || '-'
                }
            };
        });
    }, [drivers, statsMap]);

    if (drivers.length === 0) {
        return (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <BarChart2 size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <h3>No Drivers Selected</h3>
                <p>Select drivers from the Drivers tab to compare their stats side-by-side.</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="flex-row justify-between" style={{ marginBottom: '20px', alignItems: 'center' }}>
                <h2>Driver Comparison</h2>
                <button className="btn-tab" onClick={onClear} style={{ color: 'var(--accent-red)' }}>
                    <X size={16} style={{ marginRight: 6 }} /> Clear Selection
                </button>
            </div>

            {loading ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div className="loader"><AlertCircle className="animate-spin" size={32} style={{ marginBottom: 10 }} /> Analyzing Telemetry...</div>
                </div>
            ) : (
                <div className="compare-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${drivers.length}, 1fr)`,
                    gap: '1rem',
                    overflowX: 'auto'
                }}>
                    {statsData.map((data, idx) => (
                        <div key={idx} className="card compare-card" style={{
                            borderTop: `4px solid ${data?.TeamColor || 'transparent'}`,
                            background: data ? `linear-gradient(180deg, ${data.TeamColor}11 0%, var(--bg-card) 100%)` : 'var(--bg-card)'
                        }}>
                            {!data ? (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>No Data</div>
                            ) : (
                                <>
                                    <div className="card-header" style={{ textAlign: 'center', flexDirection: 'column', gap: 10, display: 'flex', alignItems: 'center' }}>
                                        <img
                                            src={data.HeadshotUrl || ''}
                                            alt={data.BroadcastName}
                                            style={{
                                                width: '80px',
                                                height: '80px',
                                                borderRadius: '50%',
                                                objectFit: 'cover',
                                                border: `2px solid ${data.TeamColor}`
                                            }}
                                        />
                                        <div>
                                            <h3 style={{ margin: 0 }}>{data.BroadcastName}</h3>
                                            <div style={{ color: data.TeamColor || 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>{data.TeamName}</div>
                                        </div>
                                    </div>

                                    <div className="card-body">
                                        <div className="stat-row" style={{ marginTop: 0, paddingTop: 10, borderTop: 'none' }}>
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>Champ Pos</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>P{data.stats.standing}</div>
                                        </div>

                                        <div className="stat-row">
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>Points</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--accent-red)' }}>{data.stats.totalPoints}</div>
                                        </div>

                                        <div className="stat-row">
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>Wins</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold' }}>
                                                {data.stats.wins > 0 && <Trophy size={14} color="#FFD700" style={{ marginRight: 4 }} />}
                                                {data.stats.wins}
                                            </div>
                                        </div>

                                        <div className="stat-row">
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>Best Finish</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold' }}>P{data.stats.bestFinish}</div>
                                        </div>

                                        <div className="stat-row">
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>Avg Finish</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold' }}>{data.stats.avgFinish}</div>
                                        </div>

                                        <div className="stat-row">
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>Avg Grid</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold' }}>{data.stats.avgGrid}</div>
                                        </div>

                                        <div className="stat-row">
                                            <div className="compare-stat-label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>DNFs</div>
                                            <div className="compare-stat-value" style={{ fontWeight: 'bold' }}>{data.stats.dnfs}</div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
