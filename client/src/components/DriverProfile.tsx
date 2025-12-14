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

    // Points: prefer official standings points (includes sprints/bonuses), fallback to summing race results.
    const pointsFromStandings = Number(stats?.standingPoints);
    const pointsFromRaces = stats?.results.reduce((sum, race) => sum + (Number(race.points) || 0), 0) || 0;
    const totalPoints = Number.isFinite(pointsFromStandings) ? pointsFromStandings : pointsFromRaces;
    const bestFinish = stats && stats.results.length > 0
        ? Math.min(...stats.results.map(r => Number(r.position)))
        : '-';

    const wins = stats?.results.filter(r => Number(r.position) === 1).length || 0;

    const teamColorStyle = { '--team-color': driver.TeamColor } as React.CSSProperties;

    const getPodiumClass = (finishPos: number) => {
        if (finishPos === 1) return 'driver-pos driver-pos--p1';
        if (finishPos === 2) return 'driver-pos driver-pos--p2';
        if (finishPos === 3) return 'driver-pos driver-pos--p3';
        return 'driver-pos';
    };

    return (
        <div className="animate-enter driver-profile">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="btn-reset driver-back"
            >
                <span className="driver-back__icon">
                    <ArrowLeft size={18} />
                </span>
                Back to Drivers
            </button>

            {/* Driver Card Section */}
            <div
                className="driver-hero"
                style={teamColorStyle}
            >
                <div className="driver-hero-glow" aria-hidden="true" />

                <div className="driver-hero-inner">

                    {/* Driver Identity */}
                    <div className="driver-identity">
                        <div className="driver-headshot-wrap">
                            <img
                                className="driver-headshot"
                                src={driver.HeadshotUrl || 'https://via.placeholder.com/150'}
                                alt={driver.BroadcastName}
                            />
                        </div>

                        <div className="driver-identity-meta">
                            <div className="driver-top-row">
                                <span className="driver-number">
                                    #{driver.DriverNumber}
                                </span>
                                {stats?.standingPosition && (
                                    <span className="badge badge-gray driver-standing-badge">
                                        P{stats.standingPosition} in Championship
                                    </span>
                                )}
                            </div>
                            <h1 className="text-h1 driver-name">
                                {driver.BroadcastName}
                            </h1>
                            <div className="driver-team">
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
                                <div className="text-h2 driver-stat-value driver-stat-best">{bestFinish}</div>
                                <div className="driver-stat-label">Best Finish</div>
                            </div>
                            {wins > 0 && (
                                <div className="driver-stat-item">
                                    <div className="text-h2 driver-stat-value driver-stat-wins">{wins}</div>
                                    <div className="driver-stat-label">Wins</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Season Performance Section */}
            <div className="driver-season">
                <h2 className="text-h3">Season Performance</h2>

                <Card>
                    <div className="driver-table-wrapper">
                        <div className="table-container">
                        {loading ? (
                            <div className="driver-table-skeleton">
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
                                            const podiumClass = getPodiumClass(finishPos);
                                            return (
                                                <tr key={idx} className="table-row-hover">
                                                    <td className="text-muted driver-round-cell">{String(race.round).padStart(2, '0')}</td>
                                                    <td className="driver-race-name-cell">{race.raceName}</td>
                                                    <td className="text-muted">P{race.grid}</td>
                                                    <td>
                                                        <div className="driver-finish">
                                                            <span className={podiumClass}>P{race.position}</span>
                                                        </div>
                                                    </td>
                                                    <td className="text-muted text-xs">{race.status}</td>
                                                    <td className="text-right driver-points-cell">{race.points > 0 ? race.points : <span className="driver-points-empty">-</span>}</td>
                                                </tr>
                                            );
                                        })}
                                        {stats?.results.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="driver-empty-row">
                                                    No race data available for this season yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                <div className="mobile-list driver-race-list">
                                    {stats?.results.map((race, idx) => {
                                        const finishPos = Number(race.position);
                                        const podiumClass = getPodiumClass(finishPos);
                                        return (
                                            <div key={idx} className="mobile-row driver-race-card">
                                                <div className="race-card-row">
                                                    <div className="race-card-line">
                                                        <span className="race-card-round">Round {race.round}</span>
                                                        <span className={`race-card-finish ${podiumClass}`}>P{race.position}</span>
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
        </div>
    );
};
