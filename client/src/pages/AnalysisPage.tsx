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
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { useData } from "../contexts/DataContext";
import { getLapAnalysis } from "../services/api";
import type {
  DriverMeta,
  LapAnalysisResponse,
  LapPoint,
} from "../services/api";
import type { RaceResult } from "../types/f1";
import { Loading } from "../components/Loading";
import { ChartCard } from "../components/common/ChartCard";
import { StatCard } from "../components/common/StatCard";
import { DriverSelector } from "../components/analysis/DriverSelector";
import { formatLapTime, formatLapTimeShort } from "../utils/formatters";
import {
  Trophy,
  Zap,
  TrendingUp,
  Activity,
  Gauge,
  Timer,
  Maximize2,
} from "lucide-react";

interface Props {}

export const AnalysisPage: React.FC<Props> = () => {
  // UI strings in English
  const UI_HEADER = "Advanced Race Analytics";
  const UI_SUBHEADER =
    "Deep telemetry analysis, lap comparisons, and performance insights.";
  const UI_LOADING = "Analyzing race data...";
  const UI_NO_DATA = "No data available for this race";
  const UI_SELECT_RACE = "Select Grand Prix";
  const UI_ROUND = "Round";

  // Stats Card Labels
  const UI_FASTEST_LAP = "FASTEST LAP";
  const UI_AVG_LAP = "AVERAGE LAP";
  const UI_AVG_LAP_SUB = "across all drivers";
  const UI_FASTEST_S1 = "FASTEST SECTOR 1";
  const UI_FASTEST_S2 = "FASTEST SECTOR 2";
  const UI_FASTEST_S3 = "FASTEST SECTOR 3";

  // Chart Titles
  const UI_LAP_EVOLUTION_TITLE = "Lap Time Evolution";
  const UI_LAP_EVOLUTION_SUB = "Performance throughout the race";
  const UI_LAP_EVOLUTION_X = "Lap Number";
  const UI_LAP_EVOLUTION_Y = "Lap Time";

  const UI_MOBILE_NOTICE_TITLE = "Charts & diagrams need more space";
  const UI_MOBILE_NOTICE_P =
    "You can view key numbers on mobile. For full analysis (graphs/diagrams), open this page on a larger screen.";

  // State and Context initialization
  const { year, races, drivers, loading, fetchSessionResultsWithCache } =
    useData();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [lapData, setLapData] = useState<LapPoint[]>([]);
  const [sessionDrivers, setSessionDrivers] = useState<DriverMeta[]>([]);
  const [busy, setBusy] = useState(false);
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
        const results = await fetchSessionResultsWithCache(
          selectedRound,
          "race"
        );
        setRaceResults(results || []);
      } catch (err) {
        console.error("Race results fetch failed", err);
        setRaceResults([]);
      }
    };
    loadResults();
  }, [year, selectedRound, fetchSessionResultsWithCache]);

  // Load lap data (fast operation)
  // Backend now computes on-demand, so we can try for any year
  useEffect(() => {
    const loadData = async () => {
      if (!selectedRound) return;
      setBusy(true);
      try {
        // Fetch all lap data for this race (no filtering so we capture mid-season replacements)
        // Backend will compute on-demand if not cached
        const lapsResp: LapAnalysisResponse = await getLapAnalysis(
          year,
          selectedRound
        );
        setLapData(lapsResp.laps || []);
        setSessionDrivers(lapsResp.drivers || []);
      } catch (err) {
        console.error("Lap analysis fetch failed", err);
        setLapData([]);
        setSessionDrivers([]);
      } finally {
        setBusy(false);
      }
    };
    loadData();
  }, [year, selectedRound, drivers]);

  const raceOptions = races.sort((a, b) => a.RoundNumber - b.RoundNumber);

  const driverByNumber = useMemo(() => {
    const map: Record<
      string,
      {
        DriverNumber: string;
        BroadcastName: string;
        FullName: string;
        TeamName: string;
        TeamColor: string;
        HeadshotUrl?: string;
      }
    > = {};
    drivers.forEach((d) => {
      map[d.DriverNumber] = {
        DriverNumber: d.DriverNumber,
        BroadcastName: d.BroadcastName,
        FullName: d.FullName,
        TeamName: d.TeamName,
        TeamColor: d.TeamColor,
        HeadshotUrl: d.HeadshotUrl ?? undefined,
      };
    });
    sessionDrivers.forEach((d) => {
      if (!map[d.driverNumber]) {
        map[d.driverNumber] = {
          DriverNumber: d.driverNumber,
          BroadcastName: d.broadcastName,
          FullName: d.fullName,
          TeamName: d.teamName,
          TeamColor: d.teamColor || "#888",
          HeadshotUrl: d.headshotUrl || undefined,
        };
      }
    });
    return map;
  }, [drivers, sessionDrivers]);

  // Enhanced statistics calculation
  const stats = useMemo(() => {
    const driverStats: Record<
      string,
      {
        best: number | null;
        avg: number | null;
        median: number | null;
        laps: number;
        consistency: number | null;
        improvementRate: number | null;
      }
    > = {};

    let overallBest = Number.POSITIVE_INFINITY;
    let overallBestDriver: string | null = null;
    let totalValidLaps = 0;
    const podium: Record<number, { driver: string; lap: number }> = {};

    lapData.forEach((lp) => {
      if (!lp.driverNumber) return;
      if (!driverStats[lp.driverNumber]) {
        driverStats[lp.driverNumber] = {
          best: null,
          avg: null,
          median: null,
          laps: 0,
          consistency: null,
          improvementRate: null,
        };
      }

      if (lp.lapTimeMs) {
        driverStats[lp.driverNumber].laps++;
        totalValidLaps++;
        if (
          !driverStats[lp.driverNumber].best ||
          lp.lapTimeMs < driverStats[lp.driverNumber].best!
        ) {
          driverStats[lp.driverNumber].best = lp.lapTimeMs;
        }
        if (lp.lapTimeMs < overallBest) {
          overallBest = lp.lapTimeMs;
          overallBestDriver = lp.driverNumber;
        }
        const pos = lp.position;
        if (pos && pos <= 3) {
          if (!podium[pos] || lp.lapTimeMs < podium[pos].lap) {
            podium[pos] = { driver: lp.driverNumber, lap: lp.lapTimeMs };
          }
        }
      }
    });

    Object.keys(driverStats).forEach((drv) => {
      const driverLaps = lapData
        .filter((l) => l.driverNumber === drv && l.lapTimeMs)
        .sort((a, b) => (a.lapNumber || 0) - (b.lapNumber || 0));

      if (driverLaps.length > 0) {
        const times = driverLaps.map((l) => l.lapTimeMs!);
        const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
        driverStats[drv].avg = Math.round(avg);

        // Median calculation
        const sorted = [...times].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        driverStats[drv].median =
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];

        // Consistency (Standard Deviation)
        const variance =
          times.reduce((sum, t) => {
            const diff = t - avg;
            return sum + diff * diff;
          }, 0) / times.length;
        driverStats[drv].consistency = Math.sqrt(variance);

        // Improvement rate calculation
        if (driverLaps.length >= 10) {
          const first5 = driverLaps.slice(0, 5).map((l) => l.lapTimeMs!);
          const last5 = driverLaps.slice(-5).map((l) => l.lapTimeMs!);
          const firstAvg = first5.reduce((a, b) => a + b, 0) / 5;
          const lastAvg = last5.reduce((a, b) => a + b, 0) / 5;
          // Positive value means improvement (first avg > last avg)
          driverStats[drv].improvementRate =
            ((firstAvg - lastAvg) / firstAvg) * 100;
        }
      }
    });

    // Calculate overall average and median
    const allValidTimes = lapData
      .filter((l) => l.lapTimeMs)
      .map((l) => l.lapTimeMs!);
    const overallAvg =
      allValidTimes.length > 0
        ? allValidTimes.reduce((sum, t) => sum + t, 0) / allValidTimes.length
        : null;

    // Find fastest sectors
    let fastestS1 = Number.POSITIVE_INFINITY;
    let fastestS1Driver: string | null = null;
    let fastestS2 = Number.POSITIVE_INFINITY;
    let fastestS2Driver: string | null = null;
    let fastestS3 = Number.POSITIVE_INFINITY;
    let fastestS3Driver: string | null = null;

    lapData.forEach((lp) => {
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
      overallBest:
        overallBest !== Number.POSITIVE_INFINITY ? overallBest : null,
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
      podium,
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
    const lapNumbers = Object.keys(byLap)
      .map(Number)
      .sort((a, b) => a - b);
    const lapMaxFromData = lapData.reduce(
      (m, lp) => (lp.lapNumber && lp.lapNumber > m ? lp.lapNumber : m),
      0
    );
    let maxLap = lapNumbers.length
      ? lapNumbers[lapNumbers.length - 1]
      : lapMaxFromData;
    if (!maxLap) maxLap = 1;

    // Ensure every lap row exists up to maxLap
    for (let lap = 1; lap <= maxLap; lap++) {
      if (!byLap[lap]) byLap[lap] = { lap };
    }

    // If some drivers are missing in lap data, backfill with flat line at final classification
    if (raceResults.length) {
      const driverSet = new Set<string>();
      Object.values(byLap).forEach((row) => {
        Object.keys(row).forEach((k) => {
          if (k !== "lap") driverSet.add(k);
        });
      });
      const missing = raceResults.filter((r) => !driverSet.has(r.DriverNumber));
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
    const sorted = [...payload].sort(
      (a, b) => (a?.value ?? 0) - (b?.value ?? 0)
    );
    return (
      <div className="analysis-tooltip">
        <div className="analysis-tooltip__label">Lap {label}</div>
        {sorted.map((entry: any) => (
          <div
            key={entry.dataKey}
            className="analysis-tooltip__row"
          >
            <svg
              className="analysis-tooltip__swatch"
              viewBox="0 0 18 6"
              aria-hidden="true"
              focusable="false"
            >
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke={entry.color}
                strokeWidth="2"
                strokeDasharray={entry?.strokeDasharray ? "5 4" : undefined}
              />
            </svg>
            <span className="analysis-tooltip__name">{entry.name}</span>
            <span className="analysis-tooltip__value">P{entry.value}</span>
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

  // Derived datasets for extra charts
  const bestLapDelta = useMemo(() => {
    const pool = selectedDrivers.length
      ? allDrivers.filter((d) => selectedDrivers.includes(d.driverNumber))
      : allDrivers.slice(0, 12);
    const withBest = pool.filter((d) => d.best);
    if (!withBest.length) return [];
    const fastest = Math.min(...withBest.map((d) => d.best));
    return withBest
      .map((d) => ({
        driver: d.driver,
        best: d.best,
        delta: d.best - fastest,
        color: d.color,
      }))
      .sort((a, b) => a.best - b.best);
  }, [allDrivers, selectedDrivers]);

  const consistencyData = useMemo(() => {
    const pool = selectedDrivers.length
      ? allDrivers.filter((d) => selectedDrivers.includes(d.driverNumber))
      : allDrivers.slice(0, 12);
    return pool
      .filter((d) => Number.isFinite(d.consistency))
      .map((d) => ({
        driver: d.driver,
        consistency: d.consistency,
        color: d.color,
      }))
      .sort((a, b) => (a.consistency ?? 0) - (b.consistency ?? 0));
  }, [allDrivers, selectedDrivers]);

  // Get all drivers who have position data for the position chart (derive from positionData keys)
  // Group by team and assign solid/dashed lines
  const driversWithPositions = useMemo(() => {
    const driverSet = new Set<string>();
    positionData.forEach((row: any) => {
      Object.keys(row).forEach((key) => {
        if (key !== "lap") driverSet.add(key);
      });
    });

    const driversList = Array.from(driverSet);

    // Group drivers by team color to identify teammates
    const teamGroups: Record<string, string[]> = {};
    driversList.forEach((driverNum) => {
      const teamColor = driverByNumber[driverNum]?.TeamColor || "#888";
      if (!teamGroups[teamColor]) {
        teamGroups[teamColor] = [];
      }
      teamGroups[teamColor].push(driverNum);
    });

    // Sort drivers within each team by driver number for consistency
    Object.keys(teamGroups).forEach((color) => {
      teamGroups[color].sort((a, b) => Number(a) - Number(b));
    });

    // Assign solid line to first driver, dashed to second driver of each team
    const driversWithStyle: Array<{
      driverNumber: string;
      isDashed: boolean;
      driver: string;
      color: string;
    }> = [];
    Object.values(teamGroups).forEach((teammates) => {
      teammates.forEach((driverNum, index) => {
        const driverData = allDrivers.find((d) => d.driverNumber === driverNum);
        driversWithStyle.push({
          driverNumber: driverNum,
          isDashed: index > 0, // First driver solid, others dashed
          driver: driverData?.driver || driverNum,
          color: driverData?.color || "#888",
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
      type: "line" as const,
      strokeDasharray: d.isDashed ? "5 5" : undefined,
    }));
  }, [driversWithPositions]);

  // Custom legend to display dashed/solid indicators
  const renderPositionLegend = useCallback(() => {
    return (
      <div className="analysis-position-legend">
        {positionLegendPayload.map((item) => (
          <div key={item.id} className="analysis-position-legend__row">
            <svg
              className="analysis-position-legend__swatch"
              viewBox="0 0 22 6"
              aria-hidden="true"
              focusable="false"
            >
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke={item.color}
                strokeWidth="2"
                strokeDasharray={item.strokeDasharray ? "6 4" : undefined}
              />
            </svg>
            <span className="analysis-position-legend__name">{item.value}</span>
          </div>
        ))}
      </div>
    );
  }, [positionLegendPayload]);

  const renderLapEvolutionTooltip = useCallback(
    (props: any) => {
      const { active, payload, label } = props;
      if (!active || !payload || !payload.length) return null;

      return (
        <div className="analysis-tooltip">
          <div className="analysis-tooltip__label">{UI_LAP_EVOLUTION_X}: {label}</div>
          {payload.map((entry: any) => {
            const driver = allDrivers.find((d) => d.driverNumber === entry.dataKey);
            return (
              <div key={entry.dataKey} className="analysis-tooltip__row">
                <svg
                  className="analysis-tooltip__swatch"
                  viewBox="0 0 18 6"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line
                    x1="0"
                    y1="3"
                    x2="18"
                    y2="3"
                    stroke={entry.color}
                    strokeWidth="2"
                  />
                </svg>
                <span className="analysis-tooltip__name">{driver?.driver || entry.name || entry.dataKey}</span>
                <span className="analysis-tooltip__value">{formatLapTimeShort(entry.value)}</span>
              </div>
            );
          })}
        </div>
      );
    },
    [allDrivers, UI_LAP_EVOLUTION_X]
  );

  const renderBestLapDeltaTooltip = useCallback((props: any) => {
    const { active, payload, label } = props;
    if (!active || !payload || !payload.length) return null;
    const deltaEntry = payload.find((p: any) => p.dataKey === "delta");
    const bestEntry = payload.find((p: any) => p.dataKey === "best");

    return (
      <div className="analysis-tooltip">
        <div className="analysis-tooltip__label">{label}</div>
        {bestEntry && (
          <div className="analysis-tooltip__row">
            <span className="analysis-tooltip__name">Best Lap</span>
            <span className="analysis-tooltip__value">{formatLapTimeShort(Number(bestEntry.value))}</span>
          </div>
        )}
        {deltaEntry && (
          <div className="analysis-tooltip__row">
            <span className="analysis-tooltip__name">Delta</span>
            <span className="analysis-tooltip__value">+{formatLapTimeShort(Number(deltaEntry.value))}</span>
          </div>
        )}
      </div>
    );
  }, []);

  const renderConsistencyTooltip = useCallback((props: any) => {
    const { active, payload, label } = props;
    if (!active || !payload || !payload.length) return null;
    const value = payload[0]?.value;
    return (
      <div className="analysis-tooltip">
        <div className="analysis-tooltip__label">{label}</div>
        <div className="analysis-tooltip__row">
          <span className="analysis-tooltip__name">Std Dev</span>
          <span className="analysis-tooltip__value">{formatLapTimeShort(Number(value))}</span>
        </div>
      </div>
    );
  }, []);

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
    <div className="analysis-page analysis-page--ltr">
      {/* Desktop-only hero header */}
      <div
        className="analysis-desktop-only analysis-hero-grid"
      >
        <div className="analysis-top3-card">
          <div className="analysis-top3-card__header">
            <TrendingUp size={16} />
            <span>Top 3 Finishing Order</span>
          </div>
          <table className="analysis-top3-table">
            <thead>
              <tr className="analysis-top3-table__headRow">
                <th className="analysis-top3-table__th">Position</th>
                <th className="analysis-top3-table__th">Driver</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((pos) => {
                const entry = stats.podium[pos];
                const name =
                  entry && entry.driver
                    ? driverByNumber[entry.driver]?.BroadcastName ||
                      entry.driver
                    : "--";
                return (
                  <tr key={pos} className="analysis-top3-table__row">
                    <td className="analysis-top3-table__pos">{`P${pos}`}</td>
                    <td className="analysis-top3-table__td">{name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="analysis-hero-center">
          <h1 className="analysis-hero-title">
            {UI_HEADER}
          </h1>
          <p className="analysis-hero-subtitle">{UI_SUBHEADER}</p>
        </div>

        {/* Spacer to keep title centered relative to the table on the left */}
        <div className="analysis-hero-spacer" />
      </div>

      {/* Race Selector */}
      <div className="analysis-race-selector">
        <label className="analysis-race-label">
          {UI_SELECT_RACE}:
        </label>
        <select
          className="analysis-race-select"
          value={selectedRound || ""}
          onChange={(e) => setSelectedRound(parseInt(e.target.value))}
        >
          {raceOptions.map((race) => (
            <option
              key={race.RoundNumber}
              value={race.RoundNumber}
              className="analysis-race-option"
            >
              {UI_ROUND} {race.RoundNumber}: {race.EventName} ({race.Country})
            </option>
          ))}
        </select>
      </div>

      {busy ? (
        <Loading message={UI_LOADING} />
      ) : (
        <>
          {/* Mobile-only: Top 3 finishing order (numbers-only, OK for small screens) */}
          <div className="analysis-mobile-top3">
            <div className="analysis-top3-card">
              <div className="analysis-top3-card__header">
                <TrendingUp size={16} />
                <span>Top 3 Finishing Order</span>
              </div>
              <table className="analysis-top3-table">
                <thead>
                  <tr className="analysis-top3-table__headRow">
                    <th className="analysis-top3-table__th">Position</th>
                    <th className="analysis-top3-table__th">Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((pos) => {
                    const entry = stats.podium[pos];
                    const name =
                      entry && entry.driver
                        ? driverByNumber[entry.driver]?.BroadcastName ||
                          entry.driver
                        : "--";
                    return (
                      <tr key={pos} className="analysis-top3-table__row">
                        <td className="analysis-top3-table__pos">{`P${pos}`}</td>
                        <td className="analysis-top3-table__td">{name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile-only notice */}
          <div className="analysis-mobile-only analysis-mobile-notice">
            <div className="analysis-mobile-notice__iconWrap">
              <Maximize2 size={18} color="#e5e7eb" />
            </div>
            <div className="analysis-mobile-notice__body">
              <div className="analysis-mobile-notice__title">
                {UI_MOBILE_NOTICE_TITLE}
              </div>
              <div className="analysis-mobile-notice__text">
                {UI_MOBILE_NOTICE_P}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="analysis-stats-grid">
            <StatCard
              title={UI_FASTEST_LAP}
              value={
                stats.overallBest ? formatLapTime(stats.overallBest) : "--"
              }
              subtitle={
                stats.overallBestDriver
                  ? driverByNumber[stats.overallBestDriver]?.BroadcastName ||
                    stats.overallBestDriver
                  : "N/A"
              }
              Icon={Trophy}
              color="#f59e0b"
            />
            <StatCard
              title={UI_AVG_LAP}
              value={
                stats.overallAvg
                  ? formatLapTime(Math.round(stats.overallAvg))
                  : "--"
              }
              subtitle={UI_AVG_LAP_SUB}
              Icon={Activity}
              color="#3b82f6"
            />
            <StatCard
              title={UI_FASTEST_S1}
              value={stats.fastestS1 ? formatLapTime(stats.fastestS1) : "--"}
              subtitle={
                stats.fastestS1Driver
                  ? driverByNumber[stats.fastestS1Driver]?.BroadcastName ||
                    stats.fastestS1Driver
                  : "N/A"
              }
              Icon={Zap}
              color="#ef4444"
            />
            <StatCard
              title={UI_FASTEST_S2}
              value={stats.fastestS2 ? formatLapTime(stats.fastestS2) : "--"}
              subtitle={
                stats.fastestS2Driver
                  ? driverByNumber[stats.fastestS2Driver]?.BroadcastName ||
                    stats.fastestS2Driver
                  : "N/A"
              }
              Icon={Gauge}
              color="#10b981"
            />
            <StatCard
              title={UI_FASTEST_S3}
              value={stats.fastestS3 ? formatLapTime(stats.fastestS3) : "--"}
              subtitle={
                stats.fastestS3Driver
                  ? driverByNumber[stats.fastestS3Driver]?.BroadcastName ||
                    stats.fastestS3Driver
                  : "N/A"
              }
              Icon={Timer}
              color="#8b5cf6"
            />
          </div>

          <div className="analysis-desktop-only">
            {/* Position Changes Chart - desktop/tablet only */}
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
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis
                      dataKey="lap"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      label={{
                        value: "Lap Number",
                        position: "insideBottom",
                        offset: -10,
                        fill: "#9ca3af",
                      }}
                    />
                    <YAxis
                      reversed={true}
                      domain={[1, 20]}
                      ticks={[1, 5, 10, 15, 20]}
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      label={{
                        value: "Position",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#9ca3af",
                      }}
                    />
                    <Tooltip content={renderPositionTooltip} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      layout="vertical"
                      content={renderPositionLegend}
                    />
                    {driversWithPositions.map((driverInfo) => (
                      <Line
                        key={driverInfo.driverNumber}
                        type="stepAfter"
                        dataKey={driverInfo.driverNumber}
                        stroke={driverInfo.color}
                        strokeWidth={2}
                        strokeDasharray={
                          driverInfo.isDashed ? "5 5" : undefined
                        }
                        dot={false}
                        name={driverInfo.driver}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Driver Selector */}
            <DriverSelector
              topDrivers={allDrivers}
              selectedDrivers={selectedDrivers}
              toggleDriver={toggleDriver}
            />

            {/* Charts Grid */}
            <div
              className="analysis-charts-grid"
            >
              {/* 1. Lap Evolution (Line Chart) */}
              {selectedDrivers.length > 0 && (
                <ChartCard
                  title={UI_LAP_EVOLUTION_TITLE}
                  subtitle={UI_LAP_EVOLUTION_SUB}
                  Icon={TrendingUp}
                  span={12}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={comparisonData}
                      margin={{ top: 20, right: 30, left: 60, bottom: 60 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                      />
                      <XAxis
                        dataKey="lap"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        label={{
                          value: UI_LAP_EVOLUTION_X,
                          position: "bottom",
                          offset: 0,
                          fill: "#6b7280",
                        }}
                        height={80}
                      />
                      <YAxis
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(v) => formatLapTimeShort(v)}
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        label={{
                          value: UI_LAP_EVOLUTION_Y,
                          angle: -90,
                          position: "left",
                          offset: 0,
                          fill: "#6b7280",
                          style: { textAnchor: "middle" },
                        }}
                        width={100}
                      />
                      <Tooltip
                        content={renderLapEvolutionTooltip}
                      />
                      <Legend
                        verticalAlign="top"
                        height={selectedDrivers.length > 6 ? 64 : 36}
                      />
                      {selectedDrivers.map((driverNum) => {
                        const driver = allDrivers.find(
                          (d) => d.driverNumber === driverNum
                        );
                        return (
                          <Line
                            key={driverNum}
                            type="monotone"
                            dataKey={driverNum}
                            stroke={driver?.color || "#888"}
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

              {/* Additional comparison visuals */}
              {bestLapDelta.length > 0 && (
                <ChartCard
                  title="Fastest Lap Delta"
                  subtitle="How far each driver is from the quickest lap"
                  Icon={TrendingUp}
                  span={6}
                >
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(320, bestLapDelta.length * 32)}
                  >
                    <BarChart
                      layout="vertical"
                      data={bestLapDelta}
                      margin={{ top: 16, right: 24, left: 32, bottom: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                      />
                      <XAxis
                        type="number"
                        tickFormatter={(v) =>
                          v === 0 ? "0" : "+" + formatLapTimeShort(v)
                        }
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="driver"
                        tick={{
                          fill: "#e5e7eb",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                        width={110}
                        interval={0}
                      />
                      <Tooltip
                        content={renderBestLapDeltaTooltip}
                      />
                      <Bar dataKey="delta" radius={[0, 6, 6, 0]}>
                        {bestLapDelta.map((entry, index) => (
                          <Cell key={index} fill={entry.color || "#60a5fa"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {consistencyData.length > 0 && (
                <ChartCard
                  title="Consistency (Std Dev)"
                  subtitle="Lower is smoother pace across the race"
                  Icon={Activity}
                  span={6}
                >
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(320, consistencyData.length * 32)}
                  >
                    <BarChart
                      layout="vertical"
                      data={consistencyData}
                      margin={{ top: 16, right: 24, left: 32, bottom: 16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                      />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => formatLapTimeShort(v)}
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="driver"
                        tick={{
                          fill: "#e5e7eb",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                        width={110}
                        interval={0}
                      />
                      <Tooltip
                        content={renderConsistencyTooltip}
                      />
                      <Bar dataKey="consistency" radius={[0, 6, 6, 0]}>
                        {consistencyData.map((entry, index) => (
                          <Cell key={index} fill={entry.color || "#22c55e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          </div>
        </>
      )}

      {/* No Data State */}
      {!busy && lapData.length === 0 && (
        <div
          className="analysis-no-data"
        >
          <Activity
            size={48}
            color="#9ca3af"
            className="analysis-no-data__icon"
          />
          <h3 className="analysis-no-data__title">
            {UI_NO_DATA}
          </h3>
          <p className="analysis-no-data__subtitle">
            Please select a different race or check back later.
          </p>
        </div>
      )}
    </div>
  );
};
