// src/pages/AnalysisPage.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    BarChart,
    Bar,
    AreaChart,
    Area,
    Legend,
    Cell,
    ComposedChart,
    ReferenceLine
} from "recharts";
import { useData } from "../contexts/DataContext";
import {
    getLapAnalysis,
    getTelemetryAnalysis,
} from "../services/api";
import type {
    DriverMeta,
    LapAnalysisResponse,
    LapPoint,
    TelemetrySeries,
} from "../services/api";
import type { Driver, RaceEvent, RaceResult } from "../types/f1";
import { Loading } from "../components/Loading";
import { ChartCard } from '../components/common/ChartCard';
import { StatCard } from '../components/common/StatCard';
import { MiniStat } from '../components/common/MiniStat';
import { DriverSelector } from '../components/analysis/DriverSelector';
import {
    formatLapTime, 
    formatLapTimeShort 
} from '../utils/formatters'; 
import {
    Trophy,
    Zap,
    TrendingUp,
    Activity,
    Gauge,
    Timer,
    BarChart3,
    Target,
    Maximize2,
    Settings,
    Feather,
} from "lucide-react";

interface Props {}

export const AnalysisPage: React.FC<Props> = () => {
    // UI strings in English
    const UI_HEADER = "Advanced Race Analytics";
    const UI_SUBHEADER = "Deep telemetry analysis, lap comparisons, and performance insights.";
    const UI_LOADING = "Analyzing race data...";
    const UI_NO_DATA = "No data available for this race";
    const UI_SELECT_RACE = "Select Grand Prix";
    const UI_ROUND = "Round";
    
    // Stats Card Labels
    const UI_FASTEST_LAP = "FASTEST LAP";
    const UI_AVG_LAP = "AVERAGE LAP";
    const UI_AVG_LAP_SUB = "across all drivers";
    const UI_FASTEST_S1 = "FASTEST SECTOR 1";
    const UI_FASTEST_S1_SUB = "best opening sector";
    const UI_FASTEST_S2 = "FASTEST SECTOR 2";
    const UI_FASTEST_S2_SUB = "best middle sector";
    const UI_FASTEST_S3 = "FASTEST SECTOR 3";
    const UI_FASTEST_S3_SUB = "best final sector";

    // Chart Titles
    const UI_LAP_EVOLUTION_TITLE = "Lap Time Evolution";
    const UI_LAP_EVOLUTION_SUB = "Performance throughout the race";
    const UI_LAP_EVOLUTION_X = "Lap Number";
    const UI_LAP_EVOLUTION_Y = "Lap Time";

    const UI_DISTRIBUTION_TITLE = "Lap Time Distribution";
    const UI_DISTRIBUTION_SUB = "Consistency analysis";
    const UI_DISTRIBUTION_X = "Lap Time (seconds)";
    const UI_DISTRIBUTION_Y = "Frequency";
    const UI_DISTRIBUTION_TOOLTIP_COUNT = "Laps";
    const UI_DISTRIBUTION_TOOLTIP_RANGE = "Second Range:";

    const UI_PACE_DELTA_TITLE = "Pace Delta (vs fastest)";
    const UI_PACE_DELTA_SUB = "Gap to session-best lap, lower is better";

    // Telemetry Titles & Labels
    const UI_TELEMETRY_TITLE = "Driver Performance Details";
    const UI_TELEMETRY_SUB = "How the driver performed around the circuit on their fastest lap";
    const UI_SLOW_ZONES = "Slow Corners";
    const UI_SLOW_ZONES_SUB = "tight turns and hairpins";
    const UI_MEDIUM_ZONES = "Technical Sections";
    const UI_MEDIUM_ZONES_SUB = "medium-speed corners";
    const UI_FAST_ZONES = "High-Speed Zones";
    const UI_FAST_ZONES_SUB = "straights and fast corners";
    const UI_IMPROVEMENT_RATE = "Pace Improvement";
    const UI_IMPROVEMENT_RATE_SUB = "first 5 laps vs last 5 laps";

    const UI_SPEED_BRAKE_TITLE = "Speed Profile Around The Track";
    const UI_SPEED_BRAKE_SUB = "Where the driver speeds up and slows down";
    const UI_DISTANCE_X = "Track Position";
    const UI_SPEED_Y = 'Speed (km/h)';
    const UI_CONTROLS_Y = 'Input (%)';
    const UI_SPEED_NAME = "Speed";
    const UI_BRAKE_NAME = "Braking";
    const UI_THROTTLE_NAME = "Throttle";

    const UI_GEAR_TITLE = "Gear Usage Distribution";
    const UI_GEAR_SUB = "How much time spent in each gear";
    const UI_GEAR_X = "Gear";
    const UI_GEAR_Y = "Time (%)";

    const UI_EMPTY_COMPARISON_TITLE = "Select Drivers to Compare";
    const UI_EMPTY_COMPARISON_P = "Click on one or more drivers above to see lap-by-lap comparison.";
    const UI_TELEMETRY_ALERT_TITLE = "Telemetry Analysis Available for Single Driver Only";
    const UI_TELEMETRY_ALERT_P = "Deselect other drivers to view the speed, throttle, and brake data for one driver.";
    
    // State and Context initialization
    const { year, races, drivers, loading, fetchSessionResultsWithCache } = useData();
    const [selectedRound, setSelectedRound] = useState<number | null>(null);
    const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
    const [lapData, setLapData] = useState<LapPoint[]>([]);
    const [sessionDrivers, setSessionDrivers] = useState<DriverMeta[]>([]);
    const [telemetry, setTelemetry] = useState<TelemetrySeries | null>(null);
    const [busy, setBusy] = useState(false);
    const [telemetryLoading, setTelemetryLoading] = useState(false);
    const [raceResults, setRaceResults] = useState<RaceResult[]>([]);

    // Initialize defaults (first race)
    useEffect(() => {
        if (races.length && selectedRound === null) {
            setSelectedRound(races[0].RoundNumber);
        }
    }, [races, selectedRound]);

    // Fetch race results (classification) to backfill missing drivers
    useEffect(() => {
        const loadResults = async () => {
            if (!selectedRound) return;
            // Guard: server may not have 2025 session-results yet; avoid noisy 400s
            if (!year || year > 2024) {
                setRaceResults([]);
                return;
            }
            try {
                const results = await fetchSessionResultsWithCache(selectedRound, 'race');
                setRaceResults(results || []);
            } catch (err) {
                console.error('Race results fetch failed', err);
                setRaceResults([]);
            }
        };
        loadResults();
    }, [year, selectedRound, fetchSessionResultsWithCache]);

    // Load lap data (fast operation)
    useEffect(() => {
        const loadData = async () => {
            if (!selectedRound) return;
            setBusy(true);
            try {
                // Fetch all lap data for this race (no filtering so we capture mid-season replacements)
                const lapsResp: LapAnalysisResponse = await getLapAnalysis(year, selectedRound);
                setLapData(lapsResp.laps);
                setSessionDrivers(lapsResp.drivers || []);
            } catch (err) {
                console.error("Lap analysis fetch failed", err);
                setLapData([]);
            } finally {
                setBusy(false);
            }
        };
        loadData();
    }, [year, selectedRound, drivers]);

    // Load telemetry separately (deferred, slow operation)
    useEffect(() => {
        if (selectedDrivers.length === 1 && selectedRound !== null) {
            const loadTelemetry = async () => {
                setTelemetryLoading(true);
                try {
                    const telem = await getTelemetryAnalysis(year, selectedRound, selectedDrivers[0]);
                    setTelemetry(telem);
                } catch (err) {
                    console.error("Telemetry fetch failed", err);
                    setTelemetry(null);
                } finally {
                    setTelemetryLoading(false);
                }
            };
            loadTelemetry();
        } else {
            setTelemetry(null);
            setTelemetryLoading(false);
        }
    }, [year, selectedRound, selectedDrivers]);

    const raceOptions = races.sort((a, b) => a.RoundNumber - b.RoundNumber);
    
    const driverByNumber: Record<string, Driver | DriverMeta> = useMemo(() => {
        const map: Record<string, Driver | DriverMeta> = {};
        drivers.forEach((d) => (map[d.DriverNumber] = d));
        sessionDrivers.forEach((d) => {
            if (!map[d.driverNumber]) {
                map[d.driverNumber] = {
                    DriverNumber: d.driverNumber,
                    BroadcastName: d.broadcastName,
                    FullName: d.fullName,
                    TeamName: d.teamName,
                    TeamColor: d.teamColor || "#888",
                    HeadshotUrl: d.headshotUrl || undefined,
                } as unknown as Driver;
            }
        });
        return map;
    }, [drivers, sessionDrivers]);

    // Enhanced statistics calculation
    const stats = useMemo(() => {
        const driverStats: Record<string, { 
            best: number | null; avg: number | null; median: number | null;
            laps: number; consistency: number | null; improvementRate: number | null;
        }> = {};
        
        let overallBest = Number.POSITIVE_INFINITY;
        let overallBestDriver: string | null = null;
        let totalValidLaps = 0;

        lapData.forEach((lp) => {
            if (!lp.driverNumber) return;
            if (!driverStats[lp.driverNumber]) {
                driverStats[lp.driverNumber] = { 
                    best: null, avg: null, median: null, laps: 0, consistency: null, improvementRate: null,
                };
            }
            
            if (lp.lapTimeMs) {
                driverStats[lp.driverNumber].laps++;
                totalValidLaps++;
                if (!driverStats[lp.driverNumber].best || lp.lapTimeMs < driverStats[lp.driverNumber].best!) {
                    driverStats[lp.driverNumber].best = lp.lapTimeMs;
                }
                if (lp.lapTimeMs < overallBest) {
                    overallBest = lp.lapTimeMs;
                    overallBestDriver = lp.driverNumber;
                }
            }
        });

        Object.keys(driverStats).forEach((drv) => {
            const driverLaps = lapData
                .filter((l) => l.driverNumber === drv && l.lapTimeMs)
                .sort((a, b) => (a.lapNumber || 0) - (b.lapNumber || 0));
            
            if (driverLaps.length > 0) {
                const times = driverLaps.map(l => l.lapTimeMs!);
                const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
                driverStats[drv].avg = Math.round(avg);
                
                // Median calculation
                const sorted = [...times].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                driverStats[drv].median = sorted.length % 2 === 0 
                    ? (sorted[mid - 1] + sorted[mid]) / 2 
                    : sorted[mid];
                
                // Consistency (Standard Deviation)
                const variance = times.reduce((sum, t) => {
                    const diff = t - avg;
                    return sum + diff * diff;
                }, 0) / times.length;
                driverStats[drv].consistency = Math.sqrt(variance);

                // Improvement rate calculation
                if (driverLaps.length >= 10) {
                    const first5 = driverLaps.slice(0, 5).map(l => l.lapTimeMs!);
                    const last5 = driverLaps.slice(-5).map(l => l.lapTimeMs!);
                    const firstAvg = first5.reduce((a, b) => a + b, 0) / 5;
                    const lastAvg = last5.reduce((a, b) => a + b, 0) / 5;
                    // Positive value means improvement (first avg > last avg)
                    driverStats[drv].improvementRate = ((firstAvg - lastAvg) / firstAvg) * 100;
                }
            }
        });

        // Calculate overall average and median
        const allValidTimes = lapData.filter(l => l.lapTimeMs).map(l => l.lapTimeMs!);
        const overallAvg = allValidTimes.length > 0 
            ? allValidTimes.reduce((sum, t) => sum + t, 0) / allValidTimes.length 
            : null;
        
        // Find fastest sectors
        let fastestS1 = Number.POSITIVE_INFINITY;
        let fastestS1Driver: string | null = null;
        let fastestS2 = Number.POSITIVE_INFINITY;
        let fastestS2Driver: string | null = null;
        let fastestS3 = Number.POSITIVE_INFINITY;
        let fastestS3Driver: string | null = null;
        
        lapData.forEach(lp => {
            if (lp.s1Ms && lp.s1Ms < fastestS1) {
                fastestS1 = lp.s1Ms;
                fastestS1Driver = lp.driverNumber;
            }
            if (lp.s2Ms && lp.s2Ms < fastestS2) {
                fastestS2 = lp.s2Ms;
                fastestS2Driver = lp.driverNumber;
            }
            if (lp.s3Ms && lp.s3Ms < fastestS3) {
                fastestS3 = lp.s3Ms;
                fastestS3Driver = lp.driverNumber;
            }
        });

        return {
            driverStats,
            overallBest: overallBest !== Number.POSITIVE_INFINITY ? overallBest : null,
            overallBestDriver,
            overallAvg,
            fastestS1: fastestS1 === Number.POSITIVE_INFINITY ? null : fastestS1,
            fastestS1Driver,
            fastestS2: fastestS2 === Number.POSITIVE_INFINITY ? null : fastestS2,
            fastestS2Driver,
            fastestS3: fastestS3 === Number.POSITIVE_INFINITY ? null : fastestS3,
            fastestS3Driver,
            totalLaps: lapData.length,
            totalValidLaps,
            driversCount: Object.keys(driverStats).length,
        };
    }, [lapData]);

    // Lap comparison data
    const comparisonData = useMemo(() => {
        if (selectedDrivers.length === 0) return [];
        
        const byLap: Record<number, any> = {};
        lapData
            .filter((lp) => selectedDrivers.includes(lp.driverNumber))
            .forEach((lp) => {
                if (!lp.lapNumber) return;
                if (!byLap[lp.lapNumber]) byLap[lp.lapNumber] = { lap: lp.lapNumber };
                byLap[lp.lapNumber][lp.driverNumber] = lp.lapTimeMs;
            });
        
        return Object.values(byLap).sort((a, b) => a.lap - b.lap);
    }, [lapData, selectedDrivers]);

    // Position changes data - show ALL drivers by default
    const positionData = useMemo(() => {
        const byLap: Record<number, any> = {};
        lapData
            .filter((lp) => lp.position)
            .forEach((lp) => {
                if (!lp.lapNumber) return;
                if (!byLap[lp.lapNumber]) byLap[lp.lapNumber] = { lap: lp.lapNumber };
                byLap[lp.lapNumber][lp.driverNumber] = lp.position;
            });

        // Determine max lap observed
        const lapNumbers = Object.keys(byLap).map(Number).sort((a, b) => a - b);
        const lapMaxFromData = lapData.reduce((m, lp) => lp.lapNumber && lp.lapNumber > m ? lp.lapNumber : m, 0);
        let maxLap = lapNumbers.length ? lapNumbers[lapNumbers.length - 1] : lapMaxFromData;
        if (!maxLap) maxLap = 1;

        // Ensure every lap row exists up to maxLap
        for (let lap = 1; lap <= maxLap; lap++) {
            if (!byLap[lap]) byLap[lap] = { lap };
        }

        // If some drivers are missing in lap data, backfill with flat line at final classification
        if (raceResults.length) {
            const driverSet = new Set<string>();
            Object.values(byLap).forEach((row) => {
                Object.keys(row).forEach((k) => { if (k !== 'lap') driverSet.add(k); });
            });
            const missing = raceResults.filter(r => !driverSet.has(r.DriverNumber));
            if (missing.length) {
                for (let lap = 1; lap <= maxLap; lap++) {
                    missing.forEach((mr) => {
                        const pos = Number(mr.Position);
                        const positionValue = Number.isFinite(pos) ? pos : 20;
                        byLap[lap][mr.DriverNumber] = positionValue;
                    });
                }
            }
        }

        return Object.values(byLap).sort((a, b) => a.lap - b.lap);
    }, [lapData, raceResults]);

    // Tooltip renderer sorted by position ascending
    const renderPositionTooltip = useCallback((props: any) => {
        const { active, payload, label } = props;
        if (!active || !payload || !payload.length) return null;
        const sorted = [...payload].sort((a, b) => (a?.value ?? 0) - (b?.value ?? 0));
        return (
            <div style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: 12 }}>
                <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Lap {label}</div>
                {sorted.map((entry: any) => (
                    <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 12 }}>
                        <span style={{ width: 10, height: 2, background: entry.color, borderTop: entry?.strokeDasharray ? '2px dashed ' + entry.color : undefined }} />
                        <span style={{ flex: 1 }}>{entry.name}</span>
                        <span style={{ color: '#9ca3af' }}>P{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }, []);


    // Top performers data
    const allDrivers = useMemo(() => {
        // Build driver list enriched with final classification position when available
        const positionByDriver: Record<string, number> = {};
        raceResults.forEach((r) => {
            const pos = Number(r.Position);
            if (Number.isFinite(pos)) positionByDriver[r.DriverNumber] = pos;
        });

        const entries = Object.entries(stats.driverStats)
            .filter(([_, data]) => data.best)
            .map(([drv, data]) => ({
                driver: driverByNumber[drv]?.BroadcastName || drv,
                driverNumber: drv,
                best: data.best!,
                avg: data.avg!,
                median: data.median!,
                laps: data.laps,
                consistency: data.consistency!,
                improvementRate: data.improvementRate,
                color: driverByNumber[drv]?.TeamColor || "#888",
                finalPosition: positionByDriver[drv] ?? null,
            }));

        // Sort for visual symmetry: by final race position asc when available, else by best lap
        entries.sort((a, b) => {
            if (a.finalPosition !== null && b.finalPosition !== null) {
                return a.finalPosition - b.finalPosition;
            }
            if (a.finalPosition !== null) return -1;
            if (b.finalPosition !== null) return 1;
            return a.best - b.best;
        });

        return entries;
    }, [stats, driverByNumber, raceResults]);

    // Get all drivers who have position data for the position chart (derive from positionData keys)
    // Group by team and assign solid/dashed lines
    const driversWithPositions = useMemo(() => {
        const driverSet = new Set<string>();
        positionData.forEach((row: any) => {
            Object.keys(row).forEach((key) => {
                if (key !== 'lap') driverSet.add(key);
            });
        });

        const driversList = Array.from(driverSet);

        // Group drivers by team color to identify teammates
        const teamGroups: Record<string, string[]> = {};
        driversList.forEach(driverNum => {
            const teamColor = driverByNumber[driverNum]?.TeamColor || '#888';
            if (!teamGroups[teamColor]) {
                teamGroups[teamColor] = [];
            }
            teamGroups[teamColor].push(driverNum);
        });

        // Sort drivers within each team by driver number for consistency
        Object.keys(teamGroups).forEach(color => {
            teamGroups[color].sort((a, b) => Number(a) - Number(b));
        });

        // Assign solid line to first driver, dashed to second driver of each team
        const driversWithStyle: Array<{ driverNumber: string; isDashed: boolean; driver: string; color: string }> = [];
        Object.values(teamGroups).forEach(teammates => {
            teammates.forEach((driverNum, index) => {
                const driverData = allDrivers.find(d => d.driverNumber === driverNum);
                driversWithStyle.push({
                    driverNumber: driverNum,
                    isDashed: index > 0, // First driver solid, others dashed
                    driver: driverData?.driver || driverNum,
                    color: driverData?.color || '#888',
                });
            });
        });

        // Sort by team color for better visual grouping in legend
        driversWithStyle.sort((a, b) => a.color.localeCompare(b.color));

        return driversWithStyle;
    }, [positionData, driverByNumber, allDrivers]);

    // Legend payload for position chart
    const positionLegendPayload = useMemo(() => {
        return driversWithPositions.map((d) => ({
            value: d.driver,
            id: d.driverNumber,
            color: d.color,
            type: 'line' as const,
            strokeDasharray: d.isDashed ? '5 5' : undefined,
        }));
    }, [driversWithPositions]);

    // Custom legend to display dashed/solid indicators
    const renderPositionLegend = useCallback(() => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 30, fontSize: 12, maxHeight: 550, overflowY: 'auto' }}>
                {positionLegendPayload.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                        <span style={{ width: 18, height: 2, background: item.strokeDasharray ? undefined : item.color, borderTop: item.strokeDasharray ? `2px dashed ${item.color}` : undefined }} />
                        <span style={{ color: item.color, fontWeight: 600 }}>{item.value}</span>
                    </div>
                ))}
            </div>
        );
    }, [positionLegendPayload]);

    // Enhanced telemetry data
    const telemetryData = useMemo(() => {
        if (!telemetry) return [];
        
        return telemetry.distance.map((d, idx) => {
            const speed = telemetry.speed[idx];
            const throttle = telemetry.throttle[idx] * 100;
            const brake = telemetry.brake[idx];
            
            // Calculate approximate acceleration (m/s²)
            let acceleration = 0;
            if (idx > 0) {
                const dSpeed = (speed - telemetry.speed[idx - 1]) * (1000 / 3600); // Convert km/h to m/s
                const dTime = 0.24; // Assuming ~240ms sample rate
                acceleration = dSpeed / dTime;
            }

            return {
                distance: Math.round(d),
                speed,
                throttle,
                brake: brake > 0 ? 100 : 0,
                brakeRaw: brake,
                acceleration: Math.max(-15, Math.min(15, acceleration)), // Clamp for visualization
            };
        });
    }, [telemetry]);

    // Gear analysis
    const gearAnalysis = useMemo(() => {
        if (!telemetry) return [];
        
        const gearTime: Record<number, number> = {};
        telemetry.speed.forEach((_, idx) => {
            // Mock gear data based on speed (Replace with actual gear data when available)
            const speed = telemetry.speed[idx];
            const gear = speed < 80 ? 1 : speed < 120 ? 2 : speed < 160 ? 3 : 
                            speed < 200 ? 4 : speed < 250 ? 5 : speed < 300 ? 6 : 7;
            gearTime[gear] = (gearTime[gear] || 0) + 1;
        });

        return Object.entries(gearTime)
            .map(([gear, samples]) => ({
                gear: parseInt(gear),
                percentage: (samples / telemetry.speed.length) * 100,
            }))
            .sort((a, b) => a.gear - b.gear);
    }, [telemetry]);

    // Speed zones
    const speedZones = useMemo(() => {
        if (!telemetry) return { slow: 0, medium: 0, fast: 0 };
        
        let slow = 0, medium = 0, fast = 0;
        telemetry.speed.forEach(speed => {
            if (speed < 150) slow++;
            else if (speed < 250) medium++;
            else fast++;
        });
        
        const total = telemetry.speed.length;
        return {
            slow: (slow / total) * 100,
            medium: (medium / total) * 100,
            fast: (fast / total) * 100,
        };
    }, [telemetry]);

    const toggleDriver = (driverNum: string) => {
        setSelectedDrivers((prev) => {
            if (prev.includes(driverNum)) {
                return prev.filter((d) => d !== driverNum);
            }
            if (prev.length >= 12) return prev; // allow more lines for full grid view
            return [...prev, driverNum];
        });
    };
    
    if (loading) return <Loading message={UI_LOADING} />;

    return (
        <div style={{ 
            padding: '32px 24px',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            direction: 'ltr',
        }}>
            {/* Header */}
            <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                <h1 style={{ 
                    fontSize: '36px', 
                    fontWeight: '800', 
                    color: '#fff',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                }}>
                    {UI_HEADER}
                </h1>
                <p style={{ fontSize: '16px', color: '#9ca3af' }}>
                    {UI_SUBHEADER}
                </p>
            </div>

            {/* Race Selector */}
            <div style={{ 
                marginBottom: '32px',
                display: 'flex',
                justifyContent: 'center',
                gap: '12px',
                alignItems: 'center',
            }}>
                <label style={{ fontSize: '14px', color: '#9ca3af', fontWeight: '600' }}>
                    {UI_SELECT_RACE}:
                </label>
                <select
                    value={selectedRound || ''}
                    onChange={(e) => setSelectedRound(parseInt(e.target.value))}
                    style={{
                        padding: '10px 16px',
                        fontSize: '14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#fff',
                        cursor: 'pointer',
                        minWidth: '300px',
                    }}
                >
                    {raceOptions.map((race) => (
                        <option key={race.RoundNumber} value={race.RoundNumber} style={{ background: '#1e293b' }}>
                            {UI_ROUND} {race.RoundNumber}: {race.EventName} ({race.Country})
                        </option>
                    ))}
                </select>
            </div>

            {busy ? (
                <Loading message={UI_LOADING} />
            ) : (
                <>
                    {/* Stats Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '20px',
                        marginBottom: '32px',
                    }}>
                        <StatCard
                            title={UI_FASTEST_LAP}
                            value={stats.overallBest ? formatLapTime(stats.overallBest) : '--'}
                            subtitle={stats.overallBestDriver ? driverByNumber[stats.overallBestDriver]?.BroadcastName || stats.overallBestDriver : 'N/A'}
                            Icon={Trophy}
                            color="#f59e0b"
                        />
                        <StatCard
                            title={UI_AVG_LAP}
                            value={stats.overallAvg ? formatLapTime(Math.round(stats.overallAvg)) : '--'}
                            subtitle={UI_AVG_LAP_SUB}
                            Icon={Activity}
                            color="#3b82f6"
                        />
                        <StatCard
                            title={UI_FASTEST_S1}
                            value={stats.fastestS1 ? formatLapTime(stats.fastestS1) : '--'}
                            subtitle={stats.fastestS1Driver ? driverByNumber[stats.fastestS1Driver]?.BroadcastName || stats.fastestS1Driver : 'N/A'}
                            Icon={Zap}
                            color="#ef4444"
                        />
                        <StatCard
                            title={UI_FASTEST_S2}
                            value={stats.fastestS2 ? formatLapTime(stats.fastestS2) : '--'}
                            subtitle={stats.fastestS2Driver ? driverByNumber[stats.fastestS2Driver]?.BroadcastName || stats.fastestS2Driver : 'N/A'}
                            Icon={Gauge}
                            color="#10b981"
                        />
                        <StatCard
                            title={UI_FASTEST_S3}
                            value={stats.fastestS3 ? formatLapTime(stats.fastestS3) : '--'}
                            subtitle={stats.fastestS3Driver ? driverByNumber[stats.fastestS3Driver]?.BroadcastName || stats.fastestS3Driver : 'N/A'}
                            Icon={Timer}
                            color="#8b5cf6"
                        />
                    </div>

                    {/* Driver Selector */}
                    <DriverSelector
                        topDrivers={allDrivers}
                        selectedDrivers={selectedDrivers}
                        toggleDriver={toggleDriver}
                    />

                    {/* Charts Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px', marginBottom: '32px' }}>
                        
                        {/* 1. Lap Evolution (Line Chart) */}
                        {selectedDrivers.length > 0 && (
                            <ChartCard
                                title={UI_LAP_EVOLUTION_TITLE}
                                subtitle={UI_LAP_EVOLUTION_SUB}
                                Icon={TrendingUp}
                                span={12}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={comparisonData} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis 
                                            dataKey="lap" 
                                            tick={{ fill: "#9ca3af", fontSize: 12 }}
                                            label={{ value: UI_LAP_EVOLUTION_X, position: 'bottom', offset: 0, fill: '#6b7280' }}
                                            height={80}
                                        />
                                        <YAxis
                                            domain={["dataMin", "dataMax"]}
                                            tickFormatter={(v) => formatLapTimeShort(v)}
                                            tick={{ fill: "#9ca3af", fontSize: 12 }}
                                            label={{ value: UI_LAP_EVOLUTION_Y, angle: -90, position: 'left', offset: 0, fill: '#6b7280', style: { textAnchor: 'middle' } }}
                                            width={100}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: 'rgba(0, 0, 0, 0.95)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '10px', padding: '12px' }}
                                            formatter={(value: any, name: string) => {
                                                const driver = allDrivers.find(d => d.driverNumber === name);
                                                return [formatLapTimeShort(value), driver?.driver || name];
                                            }}
                                            labelFormatter={(l) => `${UI_LAP_EVOLUTION_X}: ${l}`}
                                        />
                                        <Legend verticalAlign="top" height={36} />
                                        {selectedDrivers.slice(0, 6).map((driverNum) => {
                                            const driver = allDrivers.find(d => d.driverNumber === driverNum);
                                            return (
                                                <Line
                                                    key={driverNum}
                                                    type="monotone"
                                                    dataKey={driverNum}
                                                    stroke={driver?.color || '#888'}
                                                    strokeWidth={2}
                                                    dot={false}
                                                    name={driver?.driver || driverNum}
                                                    connectNulls={true}
                                                />
                                            );
                                        })}
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        )}

                        {/* Position Changes Chart - Full Width, All Drivers */}
                        {!loading && positionData.length > 0 && (
                            <ChartCard
                                title="Position Changes"
                                subtitle="How all drivers moved through the field during the race"
                                Icon={TrendingUp}
                                span={12}
                            >
                                <ResponsiveContainer width="100%" height={600}>
                                    <LineChart
                                        data={positionData}
                                        margin={{ top: 20, right: 200, left: 60, bottom: 60 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis
                                            dataKey="lap"
                                            type="number"
                                            domain={['dataMin', 'dataMax']}
                                            tick={{ fill: '#9ca3af', fontSize: 12 }}
                                            label={{ value: 'Lap Number', position: 'insideBottom', offset: -10, fill: '#9ca3af' }}
                                        />
                                        <YAxis
                                            reversed={true}
                                            domain={[1, 20]}
                                            ticks={[1, 5, 10, 15, 20]}
                                            tick={{ fill: '#9ca3af', fontSize: 12 }}
                                            label={{ value: 'Position', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                                        />
                                        <Tooltip content={renderPositionTooltip} />
                                        <Legend 
                                            verticalAlign="top" 
                                            align="right"
                                            layout="vertical"
                                            content={renderPositionLegend}
                                            wrapperStyle={{ 
                                                paddingLeft: '30px',
                                                paddingTop: '6px',
                                                fontSize: '12px',
                                                maxHeight: '550px',
                                                overflowY: 'auto'
                                            }}
                                        />
                                        {driversWithPositions.map((driverInfo) => (
                                            <Line
                                                key={driverInfo.driverNumber}
                                                type="stepAfter"
                                                dataKey={driverInfo.driverNumber}
                                                stroke={driverInfo.color}
                                                strokeWidth={2}
                                                strokeDasharray={driverInfo.isDashed ? "5 5" : undefined}
                                                dot={false}
                                                name={driverInfo.driver}
                                                connectNulls={false}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        )}

                    </div>

                    {/* Telemetry Analysis - Single Driver */}
                    {selectedDrivers.length === 1 && (
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '28px',
                            marginBottom: '24px',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', direction: 'ltr' }}>
                                <Gauge size={24} color="#8b5cf6" />
                                <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', margin: 0 }}>
                                    {UI_TELEMETRY_TITLE} — {driverByNumber[selectedDrivers[0]]?.BroadcastName}
                                </h2>
                            </div>
                            <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '24px', direction: 'ltr' }}>
                                {UI_TELEMETRY_SUB}
                            </p>

                            {telemetryLoading ? (
                                <div style={{
                                    padding: '60px 24px',
                                    textAlign: 'center',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    borderRadius: '12px',
                                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                                }}>
                                    <Zap size={48} color="#9ca3af" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                                    <p style={{ fontSize: '15px', color: '#9ca3af', marginBottom: '8px' }}>Loading telemetry data...</p>
                                    <p style={{ fontSize: '12px', color: '#6b7280' }}>This may take a moment</p>
                                </div>
                            ) : telemetry ? (
                                <>
                                    {/* Performance Zones Mini Stats */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                        gap: '16px',
                                        marginBottom: '32px',
                                    }}>
                                        <div style={{
                                            padding: '20px',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            borderRadius: '12px',
                                        }}>
                                            <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{UI_SLOW_ZONES}</div>
                                            <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{speedZones.slow.toFixed(1)}%</div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{UI_SLOW_ZONES_SUB}</div>
                                        </div>
                                        <div style={{
                                            padding: '20px',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            border: '1px solid rgba(245, 158, 11, 0.3)',
                                            borderRadius: '12px',
                                        }}>
                                            <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{UI_MEDIUM_ZONES}</div>
                                            <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{speedZones.medium.toFixed(1)}%</div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{UI_MEDIUM_ZONES_SUB}</div>
                                        </div>
                                        <div style={{
                                            padding: '20px',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            borderRadius: '12px',
                                        }}>
                                            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{UI_FAST_ZONES}</div>
                                            <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>{speedZones.fast.toFixed(1)}%</div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{UI_FAST_ZONES_SUB}</div>
                                        </div>
                                        {allDrivers.find((d) => d.driverNumber === selectedDrivers[0])?.improvementRate !== null && (
                                            <div style={{
                                                padding: '20px',
                                                background: allDrivers.find((d) => d.driverNumber === selectedDrivers[0])?.improvementRate! >= 0 
                                                    ? 'rgba(16, 185, 129, 0.1)' 
                                                    : 'rgba(239, 68, 68, 0.1)',
                                                border: allDrivers.find((d) => d.driverNumber === selectedDrivers[0])?.improvementRate! >= 0 
                                                    ? '1px solid rgba(16, 185, 129, 0.3)' 
                                                    : '1px solid rgba(239, 68, 68, 0.3)',
                                                borderRadius: '12px',
                                            }}>
                                                <div style={{ 
                                                    fontSize: '11px', 
                                                    color: allDrivers.find((d) => d.driverNumber === selectedDrivers[0])?.improvementRate! >= 0 ? '#10b981' : '#ef4444', 
                                                    fontWeight: '600', 
                                                    marginBottom: '4px', 
                                                    textTransform: 'uppercase', 
                                                    letterSpacing: '0.5px' 
                                                }}>{UI_IMPROVEMENT_RATE}</div>
                                                <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>
                                                    {allDrivers.find((d) => d.driverNumber === selectedDrivers[0])?.improvementRate!.toFixed(1) || 0}%
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>{UI_IMPROVEMENT_RATE_SUB}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
                                        
                                        {/* 4. Telemetry Speed, Throttle, Brake */}
                                        <ChartCard
                                            title={UI_SPEED_BRAKE_TITLE}
                                            subtitle={UI_SPEED_BRAKE_SUB}
                                            Icon={Maximize2}
                                            span={12}
                                        >
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={telemetryData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                    <XAxis 
                                                        dataKey="distance" 
                                                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                                                        label={{ value: UI_DISTANCE_X, position: 'insideBottom', offset: -5, fill: '#6b7280' }}
                                                    />
                                                    <YAxis yAxisId="speed" orientation="left" stroke="#3b82f6" tick={{ fill: "#3b82f6", fontSize: 12 }} label={{ value: UI_SPEED_Y, angle: -90, position: 'insideLeft', fill: '#3b82f6' }} />
                                                    <YAxis yAxisId="controls" orientation="right" stroke="#10b981" tick={{ fill: "#10b981", fontSize: 12 }} label={{ value: UI_CONTROLS_Y, angle: 90, position: 'insideRight', fill: '#10b981' }} />
                                                    <Tooltip
                                                        contentStyle={{ background: 'rgba(0, 0, 0, 0.95)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '10px', padding: '12px' }}
                                                        formatter={(value: any, name: string) => [`${value.toFixed(1)}`, name]}
                                                        labelFormatter={(l) => `${UI_DISTANCE_X}: ${l}`}
                                                    />
                                                    <Legend />
                                                    
                                                    <Area 
                                                        yAxisId="speed"
                                                        type="monotone" 
                                                        dataKey="speed" 
                                                        stroke="#3b82f6" 
                                                        fill="#3b82f633" 
                                                        name={UI_SPEED_NAME}
                                                        strokeWidth={2}
                                                    />
                                                    <Line 
                                                        yAxisId="controls"
                                                        type="monotone" 
                                                        dataKey="throttle" 
                                                        stroke="#10b981" 
                                                        strokeWidth={1.5}
                                                        dot={false}
                                                        name={UI_THROTTLE_NAME}
                                                    />
                                                    <Line 
                                                        yAxisId="controls"
                                                        type="monotone" 
                                                        dataKey="brake" 
                                                        stroke="#ef4444" 
                                                        strokeWidth={2}
                                                        dot={false}
                                                        name={UI_BRAKE_NAME}
                                                    />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </ChartCard>

                                        {/* 5. Gear Usage */}
                                        <ChartCard
                                            title={UI_GEAR_TITLE}
                                            subtitle={UI_GEAR_SUB}
                                            Icon={Settings}
                                            span={12}
                                        >
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={gearAnalysis} margin={{ top: 10, right: 40, left: 40, bottom: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                    <XAxis 
                                                        dataKey="gear" 
                                                        tick={{ fill: "#9ca3af", fontSize: 14 }}
                                                        label={{ value: UI_GEAR_X, position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 14 }}
                                                    />
                                                    <YAxis 
                                                        tick={{ fill: "#9ca3af", fontSize: 14 }}
                                                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                                                        label={{ value: UI_GEAR_Y, angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 14 }}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{ background: 'rgba(0, 0, 0, 0.95)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '10px', padding: '12px' }}
                                                        formatter={(value: any) => [`${value.toFixed(1)}%`, 'Time in Gear']}
                                                        labelFormatter={(l) => `Gear ${l}`}
                                                    />
                                                    <Bar 
                                                        dataKey="percentage" 
                                                        name="Time in Gear"
                                                        radius={[8, 8, 0, 0]}
                                                    >
                                                        {gearAnalysis.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={`hsl(${120 + (entry.gear * 30)}, 70%, 50%)`} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </ChartCard>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}
                    
                    {/* Empty State for Comparison */}
                    {selectedDrivers.length === 0 && (
                        <div style={{
                            gridColumn: 'span 12',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '16px',
                            padding: '60px 24px',
                            textAlign: 'center',
                        }}>
                            <Zap size={48} color="#9ca3af" style={{ margin: '0 auto 16px' }} />
                            <h3 style={{ fontSize: '20px', color: '#fff', marginBottom: '8px' }}>
                                {UI_EMPTY_COMPARISON_TITLE}
                            </h3>
                            <p style={{ fontSize: '15px', color: '#9ca3af' }}>
                                {UI_EMPTY_COMPARISON_P}
                            </p>
                        </div>
                    )}
                    
                    {/* Telemetry requires one driver */}
                    {selectedDrivers.length > 1 && (
                        <div style={{
                            gridColumn: 'span 12',
                            background: 'rgba(239, 68, 68, 0.05)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '16px',
                            padding: '24px',
                            textAlign: 'center',
                        }}>
                            <Maximize2 size={24} color="#ef4444" style={{ margin: '0 auto 10px' }} />
                            <h3 style={{ fontSize: '18px', color: '#ef4444', marginBottom: '8px' }}>
                                {UI_TELEMETRY_ALERT_TITLE}
                            </h3>
                            <p style={{ fontSize: '14px', color: '#fca5a5' }}>
                                {UI_TELEMETRY_ALERT_P}
                            </p>
                        </div>
                    )}
                </>
            )}

            {/* No Data State */}
            {!busy && lapData.length === 0 && (
                <div style={{
                    gridColumn: 'span 12',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '60px 24px',
                    textAlign: 'center',
                }}>
                    <Activity size={48} color="#9ca3af" style={{ margin: '0 auto 16px' }} />
                    <h3 style={{ fontSize: '20px', color: '#fff', marginBottom: '8px' }}>
                        {UI_NO_DATA}
                    </h3>
                    <p style={{ fontSize: '15px', color: '#9ca3af' }}>
                        Please select a different race or check back later.
                    </p>
                </div>
            )}
        </div>
    );
};
