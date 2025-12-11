import React, { useState } from 'react';
import { Trophy, Shield, Medal } from 'lucide-react';
import type { DriverStanding, TeamStanding } from '../types/f1';
import { useData } from '../contexts/DataContext';
import { Card } from './ui/Card';

interface Props {
    onDriverSelect?: (driverNumber: string) => void;
}

export const StandingsView: React.FC<Props> = ({ onDriverSelect }) => {
    const [view, setView] = useState<'drivers' | 'teams'>('drivers');
    const { driverStandings, teamStandings } = useData();

    const data: (DriverStanding | TeamStanding)[] = view === 'drivers' ? driverStandings : teamStandings;

    return (
        <div className="flex-col" style={{ gap: '24px' }}>
            {/* Toggle Switcher */}
            <div className="flex-row justify-center">
                <div style={{
                    background: 'var(--bg-subtle)',
                    padding: '4px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    gap: '4px'
                }}>
                    <button
                        className="btn-reset"
                        onClick={() => setView('drivers')}
                        style={{
                            padding: '8px 24px',
                            background: view === 'drivers' ? 'var(--bg-surface)' : 'transparent',
                            color: view === 'drivers' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            boxShadow: view === 'drivers' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                        }}
                    >
                        <Trophy size={16} />
                        Drivers
                    </button>
                    <button
                        className="btn-reset"
                        onClick={() => setView('teams')}
                        style={{
                            padding: '8px 24px',
                            background: view === 'teams' ? 'var(--bg-surface)' : 'transparent',
                            color: view === 'teams' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            boxShadow: view === 'teams' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                        }}
                    >
                        <Shield size={16} />
                        Constructors
                    </button>
                </div>
            </div>

            {/* Standings Card */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-container wide" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="table-compact">
                        <thead>
                            <tr>
                                <th style={{ width: '60px', paddingLeft: '24px' }}>POS</th>
                                <th>{view === 'drivers' ? 'DRIVER' : 'TEAM'}</th>
                                {view === 'drivers' && <th className="hidden-mobile">TEAM</th>}
                                <th className="hidden-mobile">WINS</th>
                                <th className="text-right" style={{ paddingRight: '24px' }}>POINTS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item: any) => (
                                <tr
                                    key={item.position}
                                    className={`table-row-hover ${view === 'drivers' ? 'clickable' : ''}`}
                                    onClick={() => {
                                        if (view === 'drivers' && onDriverSelect && item.driverNumber) {
                                            onDriverSelect(item.driverNumber);
                                        }
                                    }}
                                    style={{ transition: 'background 0.1s' }}
                                >
                                    <td style={{ paddingLeft: '24px' }}>
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            background: item.position === 1 ? '#FFD700' :
                                                item.position === 2 ? '#C0C0C0' :
                                                    item.position === 3 ? '#CD7F32' : 'var(--bg-highlight)',
                                            color: item.position <= 3 ? '#000' : 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.8rem',
                                            fontWeight: 700
                                        }}>
                                            {item.position}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex-row items-center" style={{ gap: '16px' }}>
                                            {view === 'drivers' && (
                                                <div style={{ position: 'relative' }}>
                                                    <img
                                                        src={item.headshotUrl || 'https://via.placeholder.com/40'}
                                                        alt={item.familyName}
                                                        className="driver-avatar"
                                                        style={{ width: '42px', height: '42px', border: `2px solid ${item.teamColor || '#333'}` }}
                                                    />
                                                    {item.position === 1 && <Medal size={16} color="#fbbf24" style={{ position: 'absolute', top: -5, right: -5, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }} />}
                                                </div>
                                            )}
                                            <div className="flex-col" style={{ gap: '2px' }}>
                                                <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                                                    {view === 'drivers' ? item.broadcastName : item.constructorName}
                                                </span>
                                                {view === 'drivers' && (
                                                    <span className="text-muted mobile-only" style={{ fontSize: '0.8rem' }}>
                                                        {item.teamName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    {view === 'drivers' && (
                                        <td className="text-muted hidden-mobile" style={{ fontWeight: 500 }}>
                                            {item.constructorName || item.teamName}
                                        </td>
                                    )}
                                    <td className="hidden-mobile">
                                        {item.wins > 0 ? (
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.wins}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                                        )}
                                    </td>
                                    <td className="text-right" style={{ paddingRight: '24px' }}>
                                        <span style={{
                                            fontWeight: 800,
                                            fontSize: '1.1rem',
                                            color: item.position <= 3 ? 'var(--accent-red)' : 'var(--text-primary)'
                                        }}>
                                            {item.points}
                                        </span>
                                        <span className="text-muted text-xs hidden-desktop" style={{ marginLeft: '4px' }}>pts</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
            <style>{`
                @media (max-width: 768px) {
                    .hidden-mobile { display: none; }
                    .mobile-only { display: block; }
                    .hidden-desktop { display: inline; }
                }
                @media (min-width: 769px) {
                    .mobile-only { display: none; }
                    .hidden-desktop { display: none; }
                }
            `}</style>
        </div>
    );
};
