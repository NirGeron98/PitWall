import React, { useMemo } from "react";
import type { Driver, DriverSeasonStats } from "../types/f1";
import {
  X,
  Trophy,
  AlertCircle,
  BarChart2,
  Award,
  Flag,
  TrendingUp,
  Grid3X3,
} from "lucide-react";

interface Props {
  drivers: Driver[];
  statsMap: Record<string, DriverSeasonStats | null>;
  loading: boolean;
  onClear: () => void;
}

interface MetricConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  comparison: "high" | "low";
  isPosition?: boolean;
}

export const DriverCompare: React.FC<Props> = ({
  drivers,
  statsMap,
  loading,
  onClear,
}) => {
  // --- 1. Data Processing ---
  const statsData = useMemo(() => {
    return drivers.map((d) => {
      const stats = statsMap[d.DriverNumber];
      if (!stats) return null;

      const totalPoints = stats.results.reduce(
        (sum, r) => sum + Number(r.points || 0),
        0
      );
      const finishes = stats.results
        .map((r) => Number(r.position || 0))
        .filter((n) => n > 0);
      const grids = stats.results
        .map((r) => Number(r.grid || 0))
        .filter((n) => n > 0);

      const wins = stats.results.filter((r) => Number(r.position) === 1).length;
      const dnfs = stats.results.filter(
        (r) => r.status !== "Finished" && !r.status.includes("Lap")
      ).length;

      const bestFinish = finishes.length ? Math.min(...finishes) : 9999;
      const avgFinish =
        finishes.length > 0
          ? Number(
              (finishes.reduce((a, b) => a + b, 0) / finishes.length).toFixed(2)
            )
          : 9999;
      const avgGrid =
        grids.length > 0
          ? Number((grids.reduce((a, b) => a + b, 0) / grids.length).toFixed(2))
          : 9999;
      const standing = stats.standingPosition
        ? Number(stats.standingPosition)
        : 9999;

      return {
        ...d,
        TeamColor: d.TeamColor ?? "#FFF",
        HeadshotUrl: d.HeadshotUrl ?? "",
        stats: {
          totalPoints,
          bestFinish,
          wins,
          dnfs,
          avgGrid,
          avgFinish,
          standing,
        },
      };
    });
  }, [drivers, statsMap]);

  // --- 2. Configuration ---
  const metrics: MetricConfig[] = [
    {
      key: "standing",
      label: "Champ Pos",
      icon: Award,
      comparison: "low",
      isPosition: true,
    },
    {
      key: "totalPoints",
      label: "Points",
      icon: BarChart2,
      comparison: "high",
    },
    { key: "wins", label: "Wins", icon: Trophy, comparison: "high" },
    {
      key: "bestFinish",
      label: "Best Finish",
      icon: Flag,
      comparison: "low",
      isPosition: true,
    },
    {
      key: "avgFinish",
      label: "Avg Finish",
      icon: TrendingUp,
      comparison: "low",
    },
    { key: "avgGrid", label: "Avg Grid", icon: Grid3X3, comparison: "low" },
    { key: "dnfs", label: "DNFs", icon: AlertCircle, comparison: "low" },
  ];

  const getBestValue = (key: string, comparison: "high" | "low") => {
    const values = statsData
      .map((d) => d?.stats[key as keyof typeof d.stats])
      .filter((v) => v !== undefined && v !== null && v !== 9999) as number[];
    if (values.length === 0) return null;
    return comparison === "high" ? Math.max(...values) : Math.min(...values);
  };

  const formatValue = (
    val: number | string | null | undefined,
    isPosition?: boolean
  ) => {
    if (val === null || val === undefined || val === 9999) return "-";
    const numVal = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(numVal)) return "-";
    if (isPosition) return `P${numVal}`;
    return numVal % 1 !== 0 ? numVal.toFixed(2) : numVal.toLocaleString();
  };

  return (
    <div className="compare-container animate-fade-in">
      {/* Header */}
      <div className="compare-header">
        {/* Changes made:
            1. Added 'flex' to enable flexbox layout.
            2. Added 'items-baseline' to align the bottom of the large text with the small text.
            3. Added 'gap-3' to create the actual space between the elements.
        */}
        <div className="header-title flex items-baseline gap-6 sm:gap-10">
          <h2 className="text-2xl font-black uppercase tracking-tighter italic">
            Head-to-Head
          </h2>
          <span className="text-sm text-gray-400 font-normal hidden sm:inline-block">
            ({drivers.length} Drivers Selected)
          </span>
        </div>
        {drivers.length > 0 ? (
          <button onClick={onClear} className="clear-btn">
            <X size={16} />{" "}
            <span className="hidden sm:inline">Clear Selection</span>
          </button>
        ) : (
          <div />
        )}
      </div>

      {drivers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <BarChart2 size={44} />
          </div>
          <div className="empty-title">No drivers selected</div>
          <div className="empty-subtitle">
            Go to the Drivers tab and tap the compare icon to select up to 3 drivers.
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">
          <AlertCircle className="animate-spin text-red-500 mb-4" size={32} />
          <span className="text-lg text-gray-300">
            Crunching the numbers...
          </span>
        </div>
      ) : (
        <div className="table-scroll-wrapper custom-scrollbar">
          <div
            className="compare-grid"
            style={
              {
                "--driver-count": drivers.length,
              } as React.CSSProperties
            }
          >
            {/* --- Row 0: Headers (Drivers) --- */}
            {/* Top Left Corner (Empty) */}
            <div className="grid-cell sticky-col header-corner"></div>

            {statsData.map((d, i) => (
              <div key={i} className="grid-cell driver-header">
                {d ? (
                  <>
                    <div className="img-wrapper">
                      <img
                        src={d.HeadshotUrl}
                        className="driver-img"
                        alt={d.BroadcastName}
                      />
                      <div
                        className="team-indicator"
                        style={{ background: d.TeamColor }}
                      ></div>
                    </div>
                    <div className="driver-meta">
                      <span className="name">{d.BroadcastName}</span>
                      <span className="team" style={{ color: d.TeamColor }}>
                        {d.TeamName}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-xs">...</span>
                )}
              </div>
            ))}

            {/* --- Rows 1-N: Metrics --- */}
            {metrics.map((metric, rowIdx) => {
              const bestValue = getBestValue(metric.key, metric.comparison);
              const Icon = metric.icon;
              const isEven = rowIdx % 2 === 0;

              return (
                <React.Fragment key={metric.key}>
                  {/* Sticky Label Column */}
                  <div
                    className={`grid-cell sticky-col metric-label ${
                      isEven ? "bg-even" : "bg-odd"
                    }`}
                  >
                    <div className="icon-box">
                      <Icon size={18} />
                    </div>
                    <span className="label-text">{metric.label}</span>
                  </div>

                  {/* Driver Values */}
                  {statsData.map((d, colIdx) => {
                    const rawVal = d?.stats[
                      metric.key as keyof typeof d.stats
                    ] as number;
                    const isBest = rawVal === bestValue && bestValue !== null;

                    return (
                      <div
                        key={`${metric.key}-${colIdx}`}
                        className={`grid-cell value-cell ${
                          isEven ? "bg-even" : "bg-odd"
                        } ${isBest ? "is-winner" : ""}`}
                      >
                        <span className="value-text">
                          {formatValue(rawVal, metric.isPosition)}
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        /* --- Main Container (Big Screen Fix) --- */
        .compare-container {
          width: 100%;
          /* Allows growing to full width on big screens */
          max-width: 100%; 
          margin: 0 auto;
          background: #09090b; /* Very Dark Bg */
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
        }

        /* On large screens, add some max constraint */
        @media (min-width: 1920px) {
          .compare-container {
            max-width: 1800px;
          }
        }

        .compare-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 32px;
          gap: 48px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.02);
        }

        .header-title { display: flex; align-items: baseline; gap: 32px; }

        .clear-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          padding: 8px 16px;
          border-radius: 8px;
          transition: 0.2s;
          font-weight: 600;
        }
        .clear-btn:hover { background: rgba(239, 68, 68, 0.2); }

        .loading-state {
          padding: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 300px;
        }

        .empty-state {
          padding: 64px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          min-height: 320px;
          text-align: center;
        }

        .empty-icon {
          width: 76px;
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.7);
          box-shadow: 0 12px 30px rgba(0,0,0,0.35);
        }

        .empty-title {
          font-weight: 900;
          font-size: 1.4rem;
          letter-spacing: -0.02em;
          color: rgba(255,255,255,0.92);
        }

        .empty-subtitle {
          max-width: 46ch;
          font-size: 0.95rem;
          line-height: 1.45;
          color: rgba(255,255,255,0.65);
        }

        /* --- Scroll Wrapper --- */
        .table-scroll-wrapper {
          overflow-x: auto;
          width: 100%;
          position: relative;
          /* Smooth scrolling on iOS */
          -webkit-overflow-scrolling: touch; 
          overscroll-behavior-x: contain;
        }

        /* --- Grid Layout Engine --- */
        .compare-grid {
          display: grid;
          /* MOBILE LOGIC:
             - Col 1 (Labels): shrinks on phones
             - Col 2+ (Drivers): smaller min width so 3 drivers can fit on most phones
          */
          grid-template-columns:
            clamp(56px, 18vw, 80px)
            repeat(var(--driver-count), minmax(clamp(84px, 24vw, 140px), 1fr));
          min-width: 100%;
        }

        /* Extra-compact phones: reduce padding + header/avatar sizes so more columns fit */
        @media (max-width: 480px) {
          .compare-header {
            padding: 18px 16px;
            gap: 20px;
          }

          .grid-cell {
            padding: 12px 6px;
          }

          .driver-header {
            padding: 14px 6px;
            gap: 10px;
          }

          .driver-img {
            width: 52px;
            height: 52px;
          }

          .team-indicator {
            width: 12px;
            height: 12px;
          }

          .name {
            font-size: 0.78rem;
          }

          .team {
            display: none;
          }

          .label-text {
            display: none;
          }

          .value-text {
            font-size: 0.95rem;
          }

          .is-winner .value-text {
            font-size: 1.05rem;
          }
        }

        /* --- Desktop Overrides --- */
        @media (min-width: 768px) {
            .compare-grid {
                /* PC LOGIC:
                   - Col 1: 180px for breathing room
                   - Col 2+: Equal distribution (1fr) to fill the screen
                */
                grid-template-columns: 180px repeat(var(--driver-count), 1fr);
            }
        }

        .grid-cell {
          padding: 16px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* --- Sticky Column (The Anchor) --- */
        .sticky-col {
          position: sticky;
          left: 0;
          z-index: 20;
          border-right: 1px solid rgba(255,255,255,0.1);
          /* Strong shadow to indicate scroll depth */
          box-shadow: 4px 0 12px rgba(0,0,0,0.5); 
        }

        .header-corner {
          background: #09090b;
          z-index: 30;
        }

        /* --- Driver Header --- */
        .driver-header {
          flex-direction: column;
          gap: 12px;
          padding: 24px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .img-wrapper { position: relative; }
        
        .driver-img {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(255,255,255,0.1);
          background: #18181b;
        }

        .team-indicator {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid #09090b;
        }

        .driver-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .name { 
            font-weight: 800; 
            font-size: 0.9rem; 
            text-transform: uppercase; 
            line-height: 1.1;
        }
        
        .team { 
            font-size: 0.75rem; 
            font-weight: 600; 
            opacity: 0.8; 
            margin-top: 4px;
        }

        /* --- Metric Labels --- */
        .metric-label {
          justify-content: center; /* Centered icon on mobile */
          flex-direction: column;
          gap: 6px;
          color: #a1a1aa;
        }

        .icon-box {
            color: #71717a;
        }

        .label-text {
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            text-align: center;
            line-height: 1;
        }

        /* PC Label Alignments */
        @media (min-width: 768px) {
            .metric-label {
                flex-direction: row;
                justify-content: flex-start;
                padding-left: 24px;
                gap: 12px;
            }
            .label-text { font-size: 0.8rem; }
            .driver-img { width: 80px; height: 80px; }
            .name { font-size: 1.2rem; }
            .team { font-size: 0.9rem; }
            .grid-cell { padding: 20px; }
        }

        /* --- Values --- */
        .value-cell {
          position: relative;
        }

        .value-text {
            font-family: 'Monospaced', monospace; /* Tabled numbers */
            font-size: 1.1rem;
            font-weight: 600;
            color: #fff;
        }

        .is-winner .value-text {
            color: #4ade80; /* Green highlight */
            font-weight: 900;
            font-size: 1.25rem;
            text-shadow: 0 0 15px rgba(74, 222, 128, 0.25);
        }

        @media (min-width: 768px) {
            .value-text { font-size: 1.4rem; }
            .is-winner .value-text { font-size: 1.6rem; }
        }

        /* --- Background Colors --- */
        /* IMPORTANT: Sticky cols need solid backgrounds to hide scroll content behind them */
        .bg-odd { background-color: transparent; }
        .sticky-col.bg-odd { background-color: #09090b; } 

        .bg-even { background-color: rgba(255,255,255,0.03); }
        .sticky-col.bg-even { background-color: #121215; } /* Slightly lighter dark for contrast */

        /* Scrollbar Styling */
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #09090b; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
            background: rgba(255,255,255,0.2); 
            border-radius: 4px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

      `}</style>
    </div>
  );
};
