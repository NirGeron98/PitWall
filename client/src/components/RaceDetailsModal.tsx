import React, { useEffect, useRef, useState } from 'react';
import { X, Trophy, Flag, RefreshCw, Clock } from 'lucide-react';
import type { RaceEvent, RaceResult } from '../types/f1';
import { useData } from '../contexts/DataContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    race: RaceEvent | null;
    onDriverClick: (driverName: string) => void;
}

type SessionCode = 'P1' | 'P2' | 'P3' | 'Q' | 'R';

export const RaceDetailsModal: React.FC<Props> = ({ isOpen, onClose, race, onDriverClick }) => {
    const { year, fetchSessionResultsWithCache, drivers } = useData();
    const [results, setResults] = useState<RaceResult[]>([]);
    const [sessionStore, setSessionStore] = useState<Record<string, RaceResult[]>>({});
    const [loading, setLoading] = useState(false);
    const [activeSession, setActiveSession] = useState<SessionCode>('R');
    const prevRaceRound = useRef<number | null>(null);

    // Live Polling State
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Helper to format time strings (truncate to 3-4 decimal places)
    const formatTime = (timeStr: string) => {
        if (!timeStr) return '';
        let cleanTime = timeStr.replace('0 days ', '');
        if (cleanTime.includes('.')) {
            const parts = cleanTime.split('.');
            if (parts[1].length > 3) {
                return `${parts[0]}.${parts[1].substring(0, 3)}`;
            }
        }
        return cleanTime;
    };

    const timeToMs = (timeStr: string | undefined | null) => {
        if (!timeStr) return Number.MAX_SAFE_INTEGER;
        const clean = timeStr.replace('0 days ', '');
        // support mm:ss.mmm or ss.mmm
        const parts = clean.split(':');
        try {
            if (parts.length === 2) {
                const minutes = Number(parts[0]);
                const [seconds, ms = '0'] = parts[1].split('.');
                return minutes * 60000 + Number(seconds) * 1000 + Number(ms.padEnd(3, '0'));
            }
            if (parts.length === 1) {
                const [seconds, ms = '0'] = parts[0].split('.');
                return Number(seconds) * 1000 + Number(ms.padEnd(3, '0'));
            }
        } catch {
            return Number.MAX_SAFE_INTEGER;
        }
        return Number.MAX_SAFE_INTEGER;
    };

    const sortResults = (data: RaceResult[]) => {
        const copy = [...data];
        copy.sort((a, b) => {
            const aPos = Number(a.Position);
            const bPos = Number(b.Position);
            const aPosValid = !Number.isNaN(aPos) && aPos > 0;
            const bPosValid = !Number.isNaN(bPos) && bPos > 0;
            if (aPosValid && bPosValid) return aPos - bPos;
            const aTime = timeToMs(a.Time);
            const bTime = timeToMs(b.Time);
            return aTime - bTime;
        });
        return copy;
    };

    const loadSession = async (sessionCode: SessionCode, forceRefresh = false) => {
        if (!race) return [];
        const cacheKey = `${race.RoundNumber}-${sessionCode}`;
        if (!forceRefresh && sessionStore[cacheKey]) {
            return sessionStore[cacheKey];
        }
        let data: RaceResult[] = [];
        if (sessionCode === 'R') {
            data = await (await fetch(`http://localhost:8000/api/race-results?year=${year}&round=${race.RoundNumber}`)).json();
        } else {
            data = await fetchSessionResultsWithCache(race.RoundNumber, sessionCode, forceRefresh);
        }
        const sorted = sortResults(data.map((d: any) => ({ ...d, SessionType: sessionCode })));
        setSessionStore(prev => ({ ...prev, [cacheKey]: sorted }));
        return sorted;
    };

    const fetchData = async (sessionCode: SessionCode, forceRefresh = false) => {
        if (!race) return;
        const cacheKey = `${race.RoundNumber}-${sessionCode}`;
        const cachedResults = sessionStore[cacheKey];
        setLoading(forceRefresh || !cachedResults);
        try {
            // Instant switch if cached locally
            if (!forceRefresh && cachedResults) {
                setResults(cachedResults);
            }
            const sorted = await loadSession(sessionCode, forceRefresh);
            setResults(sorted);
            setLastUpdated(new Date());
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Initial load when modal opens
    useEffect(() => {
        if (isOpen && race) {
            if (prevRaceRound.current !== race.RoundNumber) {
                setSessionStore({});
                setResults([]);
                prevRaceRound.current = race.RoundNumber;
            }
            // Only reset if it's a new race we are looking at
            // Note: We don't verify if race.RoundNumber changed here easily without a ref or prev props, 
            // but assuming isOpen handles visibility, we can rely on `race` prop behavior.
            setActiveSession('R');
            setAutoRefresh(false);

            // 1. Load Active Session (Race) Immediately
            (async () => {
                setLoading(true);
                try {
                    const raceData = await loadSession('R', false);
                    setResults(raceData);
                    setLastUpdated(new Date());
                } catch (e) {
                    console.error("Failed to load initial race data", e);
                } finally {
                    setLoading(false);
                }
            })();
        }
        return () => stopPolling();
    }, [isOpen, race]);

    // Handle auto-refresh toggling
    useEffect(() => {
        if (autoRefresh) {
            pollingInterval.current = setInterval(() => {
                console.log("Live Update: Refreshing results...");
                // Pass true to force DB update from FastF1
                fetchData(activeSession, true);
            }, 15000);
        } else {
            stopPolling();
        }
        return () => stopPolling();
    }, [autoRefresh, activeSession]);

    const stopPolling = () => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
    };

    if (!isOpen || !race) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '900px' }}>

                {/* Header */}
                <div className="modal-header flex-row justify-between items-center" style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div className="flex-col" style={{ gap: '5px' }}>
                        <div className="flex-row items-center" style={{ gap: '10px' }}>
                            <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: '0.9rem', letterSpacing: '0.1em' }}>
                                ROUND {race.RoundNumber}
                            </span>
                            {autoRefresh && (
                                <span className="pill" style={{
                                    backgroundColor: 'var(--accent-red)', color: 'white',
                                    fontSize: '0.7rem',
                                    animation: 'pulse 2s infinite'
                                }}>LIVE</span>
                            )}
                        </div>
                        <h2 style={{ margin: 0, fontSize: '2rem' }}>{race.EventName}</h2>
                        <span className="text-muted">{race.Location}, {race.Country}</span>
                    </div>

                    <div className="flex-row items-center" style={{ gap: '15px' }}>
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`btn-tab ${autoRefresh ? 'active' : ''}`}
                            style={{ fontSize: '0.85rem' }}
                        >
                            <RefreshCw size={16} className={autoRefresh ? "animate-spin-slow" : ""} style={{ marginRight: 8 }} />
                            <span>{autoRefresh ? 'Auto-Refresh ON' : 'Enable Live Updates'}</span>
                        </button>
                        <button onClick={onClose} className="btn-reset p-2 text-muted hover:text-white"><X size={24} /></button>
                    </div>
                </div>

                <div style={{ padding: '0 1.5rem', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={12} />
                    <span>Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString('en-GB') : 'Never'}</span>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', padding: '24px' }}>
                    {/* Session Tabs */}
                    <div className="flex-row" style={{ gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        {['P1', 'P2', 'P3', 'Q', 'R'].map(code => (
                            <button
                                key={code}
                                className={`btn-tab ${activeSession === code ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveSession(code as SessionCode);
                                    // Only force refresh if auto-refresh is enabled (otherwise use cache)
                                    fetchData(code as SessionCode, autoRefresh);
                                }}
                            >
                                {code === 'R' ? 'Race' : code === 'Q' ? 'Qualifying' : code}
                            </button>
                        ))}
                    </div>

                    {loading && results.length === 0 ? (
                        <div className="loader-box" style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                            <Flag className="animate-pulse" size={48} color="var(--accent-red)" />
                            <p className="text-secondary">Loading Official Results...</p>
                        </div>
                    ) : (
                        <table className="table-compact" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>POS</th>
                                    <th>DRIVER</th>
                                    <th>TEAM</th>
                                    <th>TIME / GAP</th>
                                    <th style={{ textAlign: 'right' }}>PTS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((res) => {
                                    const driverMeta = drivers.find(d => d.DriverNumber === res.DriverNumber);
                                    const teamColor = driverMeta?.TeamColor || 'var(--border)';

                                    const posColor = res.Position === 1 ? '#FFD700' :
                                        res.Position === 2 ? '#C0C0C0' :
                                            res.Position === 3 ? '#CD7F32' : 'white';

                                    return (
                                        <tr
                                            key={`${race.RoundNumber}-${res.DriverNumber}-${res.SessionType || ''}`}
                                            className="table-row-hover clickable-row"
                                            onClick={() => onDriverClick(res.DriverNumber)}
                                        >
                                            <td style={{ fontWeight: 'bold', color: posColor, fontSize: '1.1rem' }}>
                                                {res.Position}
                                            </td>
                                            <td>
                                                <div className="flex-row items-center" style={{ gap: '12px' }}>
                                                    {/* Driver Face */}
                                                    <div style={{ position: 'relative', width: '36px', height: '36px' }}>
                                                        {driverMeta?.HeadshotUrl ? (
                                                            <img
                                                                src={driverMeta.HeadshotUrl}
                                                                alt={res.BroadcastName}
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    borderRadius: '50%',
                                                                    objectFit: 'cover',
                                                                    border: `1px solid ${teamColor}`
                                                                }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                borderRadius: '50%',
                                                                background: '#333',
                                                                border: `1px solid ${teamColor}`
                                                            }} />
                                                        )}
                                                        {res.Position === 1 && <div style={{ position: 'absolute', bottom: -2, right: -2 }}><Trophy size={12} color="#FFD700" fill="#FFD700" /></div>}
                                                    </div>

                                                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                                        {res.BroadcastName}
                                                        <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '6px' }}>#{res.DriverNumber}</span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex-row items-center" style={{ gap: '8px' }}>
                                                    <div style={{ width: '3px', height: '14px', background: teamColor, borderRadius: '2px' }} />
                                                    <span className="text-secondary">{res.TeamName}</span>
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                                {res.Status === 'Finished' ? formatTime(res.Time) : res.Status || res.Time}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                {res.Points > 0 ? `+${res.Points}` : ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
