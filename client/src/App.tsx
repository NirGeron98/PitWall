import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { BarChart2, Flag, Star, Trophy, Users, PieChart, X } from "lucide-react";

import type { Driver, DriverSeasonStats, RaceEvent } from "./types/f1";
import type { DriverTeamGroup } from "./pages/DriversPage";
import { RaceCard } from "./components/RaceCard";
import { TelemetryModal } from "./components/TelemetryModal";
import { RaceDetailsModal } from "./components/RaceDetailsModal";
import { DriverProfile } from "./components/DriverProfile";
import { Header } from "./components/Header";
import { AuthPage } from "./pages/AuthPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { DriversPage } from "./pages/DriversPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { ComparePage } from "./pages/ComparePage";
import { StandingsPage } from "./pages/StandingsPage";
import { useData } from "./contexts/DataContext";
import { useAuth } from "./contexts/AuthContext";
import { DriverCardSkeleton } from "./components/skeletons/DriverCardSkeleton";
import { RaceCardSkeleton } from "./components/skeletons/RaceCardSkeleton";
import { Loading } from "./components/Loading";

type View =
  | "races"
  | "drivers"
  | "standings"
  | "profile"
  | "compare"
  | "favorites"
  | "analysis";

const navItems = [
  { label: "Races", path: "/races", icon: Flag },
  { label: "Drivers", path: "/drivers", icon: Users },
  { label: "Standings", path: "/standings", icon: Trophy },
  { label: "Favorites", path: "/favorites", icon: Star },
  { label: "Compare", path: "/compare", icon: BarChart2 },
  { label: "Analysis", path: "/analysis", icon: PieChart },
];

const DriverProfileScreen: React.FC<{
  drivers: Driver[];
  loading: boolean;
  onBack: () => void;
}> = ({ drivers, loading, onBack }) => {
  const { driverNumber } = useParams();
  const driver = drivers.find((d) => d.DriverNumber === driverNumber);

  if (!driver && loading) {
    return <Loading message="Loading driver..." />;
  }

  if (!driver) {
    return (
      <div style={{ padding: "64px", color: "var(--text-secondary)" }}>
        Driver not found.
      </div>
    );
  }

  return <DriverProfile driver={driver} onBack={onBack} />;
};

function AppShell() {
  const {
    year,
    setYear,
    races,
    drivers,
    loading,
    fetchDriverStatsWithCache,
    primeSeasons,
  } = useData();

  const {
    user,
    loading: authLoading,
    processing: authProcessing,
    favoriteDriverIds,
    toggleFavorite: toggleFavoriteMutation,
    login,
    register,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedRace, setSelectedRace] = useState<RaceEvent | null>(null);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [selectedDriverForTelemetry, setSelectedDriverForTelemetry] =
    useState<Driver | null>(null);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pitwall_compare_selection');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch {
      return [];
    }
  });
  const [compareStats, setCompareStats] = useState<
    Record<string, DriverSeasonStats | null>
  >({});
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareLimitToast, setCompareLimitToast] = useState<
    | {
        id: number;
        message: string;
      }
    | null
  >(null);

  useEffect(() => {
    if (!compareLimitToast) return;
    const t = window.setTimeout(() => setCompareLimitToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [compareLimitToast]);

  // Persist compareSelection to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pitwall_compare_selection', JSON.stringify(compareSelection));
    } catch (err) {
      console.error('Failed to save compare selection:', err);
    }
  }, [compareSelection]);

  const activeView: View = useMemo(() => {
    if (location.pathname.startsWith("/drivers/")) return "profile";
    if (location.pathname.startsWith("/drivers")) return "drivers";
    if (location.pathname.startsWith("/standings")) return "standings";
    if (location.pathname.startsWith("/favorites")) return "favorites";
    if (location.pathname.startsWith("/compare")) return "compare";
    if (location.pathname.startsWith("/analysis")) return "analysis";
    return "races";
  }, [location.pathname]);

  const selectedDriver = useMemo(() => {
    if (activeView === "profile") {
      const driverNumber = location.pathname.split("/drivers/")[1];
      return drivers.find((d) => d.DriverNumber === driverNumber);
    }
    return null;
  }, [activeView, location.pathname, drivers]);

  useEffect(() => {
    // Reset search when switching sections
    setSearch("");
  }, [activeView]);

  // Dynamic document title per route
  useEffect(() => {
    let title = "PitWall";
    if (activeView === "races") title = "PitWall - Race Calendar";
    else if (activeView === "drivers") title = "PitWall - Driver Roster";
    else if (activeView === "profile")
      title = `PitWall - ${selectedDriver?.BroadcastName || "Driver Profile"}`;
    else if (activeView === "standings") title = "PitWall - Standings";
    else if (activeView === "favorites") title = "PitWall - Favorites";
    else if (activeView === "compare") title = "PitWall - Driver Comparison";
    else if (activeView === "analysis") title = "PitWall - Analysis";

    document.title = title;
  }, [activeView, selectedDriver]);

  const handleToggleFavorite = async (driverNum: string) => {
    try {
      await toggleFavoriteMutation(driverNum);
    } catch (err) {
      console.error("Failed to toggle favorite", err);
      setAuthError("Please log in to manage favorites.");
      navigate("/drivers");
    }
  };

  const handleTelemetryOpen = (driver: Driver) => {
    setSelectedDriverForTelemetry(driver);
    setIsTelemetryOpen(true);
  };

  const toggleCompare = (driverNum: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(driverNum))
        return prev.filter((id) => id !== driverNum);
      const max = 3;
      if (prev.length >= max) {
        setCompareLimitToast({
          id: Date.now(),
          message: "You can compare up to 3 drivers at a time.",
        });
        return prev;
      }
      return [...prev, driverNum];
    });
  };

  useEffect(() => {
    const fetchStats = async () => {
      if (compareSelection.length === 0) {
        setCompareLoading(false);
        return;
      }
      const missing = compareSelection.filter((d) => !compareStats[d]);
      if (missing.length === 0) {
        setCompareLoading(false);
        return;
      }
      setCompareLoading(true);
      try {
        const entries = await Promise.all(
          missing.map(async (num) => {
            const stats = await fetchDriverStatsWithCache(num);
            return [num, stats] as [string, DriverSeasonStats | null];
          })
        );
        setCompareStats((prev) => {
          const copy = { ...prev };
          entries.forEach(([num, stats]) => {
            copy[num] = stats;
          });
          return copy;
        });
      } catch (err) {
        console.error("failed loading compare stats", err);
      } finally {
        setCompareLoading(false);
      }
    };
    fetchStats();
  }, [compareSelection, year]);

  const filteredRaces = races.filter(
    (r) =>
      r.EventName.toLowerCase().includes(search.toLowerCase()) ||
      r.Country.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDrivers = drivers.filter(
    (d) =>
      d.FullName.toLowerCase().includes(search.toLowerCase()) ||
      d.TeamName.toLowerCase().includes(search.toLowerCase())
  );

  const driversByTeam = useMemo(() => {
    const groups: Record<string, { color: string; drivers: Driver[] }> = {};
    const filtered = filteredDrivers;
    filtered.forEach((d) => {
      const key = d.TeamName || "Unknown";
      if (!groups[key]) {
        groups[key] = { color: d.TeamColor, drivers: [] };
      }
      groups[key].drivers.push(d);
    });
    return Object.entries(groups).map(([team, data]) => ({
      team,
      color: data.color,
      drivers: data.drivers,
    }));
  }, [filteredDrivers]);

  const selectedCompareDrivers = useMemo(
    () =>
      compareSelection
        .map((id) => drivers.find((d) => d.DriverNumber === id))
        .filter(Boolean) as Driver[],
    [compareSelection, drivers]
  );

  const handleLoginSubmit = async (email: string, password: string) => {
    setAuthError(null);
    setAuthStatus("Initializing telemetry uplink...");
    try {
      await login(email, password);
      setAuthStatus("Authenticating credentials...");
      await new Promise((r) => setTimeout(r, 800));
      setAuthStatus("Pre-loading 2024 + 2025 race intel...");
      await primeSeasons([2024, 2025]);
      setAuthStatus(null);
      navigate("/races");
    } catch (err) {
      setAuthStatus(null);
      setAuthError(
        "Unable to authenticate. Check your credentials and try again."
      );
      throw err;
    }
  };

  const handleRegisterSubmit = async (
    email: string,
    password: string,
    fullName?: string
  ) => {
    setAuthError(null);
    setAuthStatus("Provisioning paddock credentials...");
    try {
      await register(email, password, fullName);
      await primeSeasons([2024, 2025]);
      setAuthStatus(null);
      navigate("/races");
    } catch (err) {
      setAuthStatus(null);
      setAuthError("Registration failed. Try a different email.");
      throw err;
    }
  };

  if (authLoading) {
    return <Loading message="Initializing PitWall Stack..." />;
  }

  if (!user) {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <AuthPage
              mode="login"
              onModeChange={() => navigate("/signup")}
              onLogin={handleLoginSubmit}
              onRegister={handleRegisterSubmit}
              loading={authProcessing || Boolean(authStatus)}
              status={authStatus}
              error={authError}
            />
          }
        />
        <Route
          path="/signup"
          element={
            <AuthPage
              mode="register"
              onModeChange={() => navigate("/login")}
              onLogin={handleLoginSubmit}
              onRegister={handleRegisterSubmit}
              loading={authProcessing || Boolean(authStatus)}
              status={authStatus}
              error={authError}
            />
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <Header
        year={year}
        onYearChange={setYear}
        userEmail={user.email}
        navItems={navItems}
      />

      <main
        className={`container app-main ${
          activeView === "analysis"
            ? "app-main--wide"
            : activeView === "favorites" || activeView === "standings"
              ? "app-main--roomy"
              : ""
        } ${activeView === "profile" ? "app-main--profile" : ""}`}
      >
                  <div className="page-header-compact">
          <h1 className="page-title-compact">
            {activeView === "races" && "Race Calendar"}
            {activeView === "drivers" && "Driver Roster"}
            {activeView === "profile" && `Driver Profile - ${selectedDriver?.BroadcastName || "Loading"}`}
            {activeView === "standings" && "Standings"}
            {activeView === "favorites" && "Favorites"}
            {activeView === "compare" && "Compare"}
            {activeView === "analysis" && "Analysis"}
          </h1>
          <div className="title-accent">
            <div className="accent-line"></div>
            <div className="accent-dot"></div>
            <div className="accent-line"></div>
          </div>
        </div>

        <div className="animate-enter">
          {loading ? (
            <div
              className={
                activeView === "drivers" ? "drivers-grid" : "races-grid"
              }
            >
              {Array.from({ length: 8 }).map((_, i) =>
                activeView === "drivers" ? (
                  <DriverCardSkeleton key={i} />
                ) : (
                  <RaceCardSkeleton key={i} />
                )
              )}
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Navigate to="/races" replace />} />
              <Route
                path="/races"
                element={
                  <div className="races-grid">
                    {filteredRaces.map((race) => (
                      <RaceCard
                        key={race.RoundNumber}
                        race={race}
                        onClick={(r) => {
                          setSelectedRace(r);
                          setIsRaceModalOpen(true);
                        }}
                      />
                    ))}
                    {filteredRaces.length === 0 && (
                      <div
                        style={{
                          gridColumn: "1/-1",
                          textAlign: "center",
                          padding: "64px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        No races found.
                      </div>
                    )}
                  </div>
                }
              />

              <Route
                path="/drivers"
                element={
                  <DriversPage
                    groups={driversByTeam as DriverTeamGroup[]}
                    favoriteDriverIds={favoriteDriverIds}
                    onToggleFavorite={handleToggleFavorite}
                    onNavigateDriver={(num) => navigate(`/drivers/${num}`)}
                    onOpenTelemetry={handleTelemetryOpen}
                    compareSelection={compareSelection}
                    onToggleCompare={toggleCompare}
                    hasDrivers={filteredDrivers.length > 0}
                  />
                }
              />

              <Route
                path="/drivers/:driverNumber"
                element={
                  <DriverProfileScreen
                    drivers={drivers}
                    loading={loading}
                    onBack={() => navigate("/drivers")}
                  />
                }
              />

              <Route
                path="/favorites"
                element={
                  <FavoritesPage
                    drivers={drivers}
                    favoriteDriverIds={favoriteDriverIds}
                    onToggleFavorite={handleToggleFavorite}
                    onSelectDriver={(driver) =>
                      navigate(`/drivers/${driver.DriverNumber}`)
                    }
                    onOpenTelemetry={handleTelemetryOpen}
                  />
                }
              />

              <Route
                path="/compare"
                element={
                  <ComparePage
                    drivers={selectedCompareDrivers}
                    statsMap={compareStats}
                    loading={compareLoading}
                    onClear={() => {
                      setCompareSelection([]);
                      setCompareStats({});
                    }}
                  />
                }
              />

              <Route
                path="/standings"
                element={
                  <StandingsPage
                    onDriverSelect={(driverNumber) =>
                      navigate(`/drivers/${driverNumber}`)
                    }
                  />
                }
              />

              <Route path="/analysis" element={<AnalysisPage />} />
            </Routes>
          )}
        </div>
      </main>

      <RaceDetailsModal
        isOpen={isRaceModalOpen}
        onClose={() => setIsRaceModalOpen(false)}
        race={selectedRace}
        onDriverClick={(driverNumber) => navigate(`/drivers/${driverNumber}`)}
      />

      <TelemetryModal
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
        driver={selectedDriverForTelemetry}
        year={year}
      />

      {compareLimitToast && (
        typeof document !== "undefined" &&
          createPortal(
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
              onMouseDown={() => setCompareLimitToast(null)}
            >
              <div
                className="animate-enter"
                style={{
                  width: "min(520px, calc(100vw - 32px))",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(9,9,11,0.92)",
                  boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
                  padding: 18,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div
                    style={{
                      marginTop: 6,
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: "#ef4444",
                      boxShadow: "0 0 22px rgba(239,68,68,0.4)",
                      flex: "0 0 auto",
                    }}
                  />

                  <div style={{ flex: "1 1 auto" }}>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.92)",
                        fontWeight: 900,
                        fontSize: 18,
                        letterSpacing: "-0.02em",
                        marginBottom: 6,
                      }}
                    >
                      Compare limit reached
                    </div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.72)",
                        fontWeight: 600,
                        fontSize: 15,
                        lineHeight: 1.35,
                      }}
                    >
                      {compareLimitToast.message}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCompareLimitToast(null)}
                    aria-label="Dismiss"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.80)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flex: "0 0 auto",
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}





