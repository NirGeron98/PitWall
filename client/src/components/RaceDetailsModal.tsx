import React, { useEffect, useRef, useState } from 'react';
import { X, Flag, Clock } from 'lucide-react';
import type { RaceEvent, RaceResult } from '../types/f1';
import { useData } from '../contexts/DataContext';
import { getRaceResults } from '../services/api';
import { DriverAvatar } from './common/DriverAvatar';

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

    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
            data = await getRaceResults(year, race.RoundNumber);
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
        return;
    }, [isOpen, race]);

    if (!isOpen || !race) return null;

    return (
        <>
            <style>{`
                /* Hide scrollbar on mobile while keeping functionality */
                @media (max-width: 768px) {
                    .modal-body::-webkit-scrollbar {
                        display: none;
                    }
                    .modal-body {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                }
            `}</style>
            <div className="modal-overlay">
                <div className="modal-content" style={{ maxWidth: '900px' }}>

                    {/* Header */}
                    <div className="modal-header" style={{ 
                        padding: '20px', 
                        borderBottom: '1px solid var(--glass-border)',
                        position: 'relative'
                    }}>
                        {/* Close button - absolute positioned in corner */}
                        <button 
                            onClick={onClose} 
                            className="btn-reset" 
                            style={{
                                position: 'absolute',
                                top: '12px',
                                right: '12px',
                                padding: '8px',
                                color: 'var(--text-secondary)',
                                transition: 'color 0.2s',
                                zIndex: 10
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                        >
                            <X size={24} />
                        </button>

                        <div className="flex-col" style={{ gap: '8px', paddingRight: '40px' }}>
                            <div className="flex-row items-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ 
                                    color: 'var(--accent-red)', 
                                    fontWeight: 'bold', 
                                    fontSize: '0.85rem', 
                                    letterSpacing: '0.1em' 
                                }}>
                                    ROUND {race.RoundNumber}
                                </span>
                            </div>
                            <h2 style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2rem)', lineHeight: 1.2 }}>
                                {race.EventName}
                            </h2>
                            <span className="text-muted" style={{ fontSize: '0.9rem' }}>
                                {race.Location}, {race.Country}
                            </span>
                        </div>
                    </div>

                    <div style={{ 
                        padding: '12px 20px', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        <Clock size={12} />
                        <span>Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString('en-GB') : 'Never'}</span>
                    </div>

                    {/* Body */}
                    <div className="modal-body" style={{ 
                        maxHeight: '65vh', 
                        overflowY: 'auto', 
                        padding: '20px',
                        /* Hide scrollbar on mobile for cleaner look */
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'rgba(255,255,255,0.2) transparent'
                    }}>
                        {/* Session Tabs */}
                        <div className="flex-row" style={{ gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                            {['P1', 'P2', 'P3', 'Q', 'R'].map(code => (
                                <button
                                key={code}
                                className={`btn-tab ${activeSession === code ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveSession(code as SessionCode);
                                    fetchData(code as SessionCode, false);
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
                            <div className="race-results-stack">
                                {results.map((res) => {
                        const driverMeta = drivers.find(d => d.DriverNumber === res.DriverNumber);
                        const teamColor = driverMeta?.TeamColor || 'var(--border)';

                                const posNum = Number(res.Position);
                                const posClass =
                                    activeSession === 'R'
                                        ? posNum === 1
                                            ? 'medal-gold'
                                            : posNum === 2
                                            ? 'medal-silver'
                                            : posNum === 3
                                            ? 'medal-bronze'
                                            : 'medal-default'
                                        : 'medal-default';

                                    const statusLabel =
                                        res.Status === 'Finished'
                                            ? 'Finished'
                                            : res.Status || (res.Time ? formatTime(res.Time) : '—');

                        const statusTone =
                            res.Status && res.Status.toLowerCase().includes('dnf')
                                ? 'status-bad'
                                : res.Status === 'Finished'
                                ? 'status-good'
                                : 'status-neutral';

                        const positionNumber = (() => {
                            // 1. Convert to string safely
                            const posStr = String(res.Position || '');                        
                            // 2. Check if the result is empty or just a number
                            if (posStr === '' || !isNaN(Number(posStr))) {
                                return posStr || '—';
                            }
                            // 3. For strings like 'R' or 'NC' (non-numeric, non-empty), return the original value
                            if (/[^\d]/.test(posStr)) {
                                // If it contains non-digits, try to extract the number first
                                const numericPart = posStr.replace(/[^\d]/g, '');
                                return numericPart || posStr; // Return number if found, otherwise the full string
                            }

                            return posStr || '—';
                        })();
                        const positionLabel = (activeSession === 'Q' || activeSession === 'R')
                          ? `P${positionNumber}`
                          : `${positionNumber}`;

                        return (
                            <button
                                key={`${race.RoundNumber}-${res.DriverNumber}-${res.SessionType || ''}`}
                                className="race-result-card"
                                onClick={() => {
                                    onClose();
                                    onDriverClick(res.DriverNumber);
                                }}
                                style={{ borderLeftColor: teamColor }}
                            >
                                <div className="race-card-left">
                                    <div className={`race-pos ${posClass}`}>{positionLabel}</div>
                                    <DriverAvatar
                                        name={res.BroadcastName}
                                        url={driverMeta?.HeadshotUrl}
                                        teamColor={teamColor}
                                        className="race-driver-avatar"
                                    />
                                    <div className="race-driver-meta">
                                        <div className="race-driver-name">
                                            {res.BroadcastName}
                                                        <span className="race-driver-number">#{res.DriverNumber}</span>
                                                    </div>
                                                    <div className="race-team-name">{res.TeamName}</div>
                                                </div>
                                            </div>
                                            <div className="race-card-right">
                                                <div className={`race-status ${statusTone}`}>{statusLabel}</div>
                                                <div className="race-time">
                                                    {res.Status === 'Finished' ? formatTime(res.Time) : res.Time || '--'}
                                                </div>
                                                <div className="race-points">
                                                    {res.Points > 0 ? `+${res.Points} pts` : '0 pts'}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
