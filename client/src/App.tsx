import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { BarChart2, Flag, Star, Trophy, Users } from "lucide-react";

import type { Driver, DriverSeasonStats, RaceEvent } from "./types/f1";
import { DriverCard } from "./components/DriverCard";
import { RaceCard } from "./components/RaceCard";
import { TelemetryModal } from "./components/TelemetryModal";
import { RaceDetailsModal } from "./components/RaceDetailsModal";
import { StandingsView } from "./components/StandingsView";
import { DriverProfile } from "./components/DriverProfile";
import { DriverCompare } from "./components/DriverCompare";
import { FavoritesView } from "./components/FavoritesView";
import { Header } from "./components/Header";
import { AuthPage } from "./pages/AuthPage";
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
  | "favorites";

const navItems = [
  { label: "Races", path: "/races", icon: Flag },
  { label: "Drivers", path: "/drivers", icon: Users },
  { label: "Standings", path: "/standings", icon: Trophy },
  { label: "Favorites", path: "/favorites", icon: Star },
  { label: "Compare", path: "/compare", icon: BarChart2 },
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

  const authMode: "login" | "register" = location.pathname.startsWith("/signup")
    ? "register"
    : "login";
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedRace, setSelectedRace] = useState<RaceEvent | null>(null);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [selectedDriverForTelemetry, setSelectedDriverForTelemetry] =
    useState<Driver | null>(null);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareStats, setCompareStats] = useState<
    Record<string, DriverSeasonStats | null>
  >({});
  const [compareLoading, setCompareLoading] = useState(false);

  const activeView: View = useMemo(() => {
    if (location.pathname.startsWith("/drivers/")) return "profile";
    if (location.pathname.startsWith("/drivers")) return "drivers";
    if (location.pathname.startsWith("/standings")) return "standings";
    if (location.pathname.startsWith("/favorites")) return "favorites";
    if (location.pathname.startsWith("/compare")) return "compare";
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
      const max = 4;
      if (prev.length >= max) return [...prev.slice(-(max - 1)), driverNum];
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
    filteredDrivers.forEach((d) => {
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

      <main className="container app-main">
          <div style={{ textAlign: "center" }}>
            <div className="page-header-enhanced">
              <div className="header-bg">
                <div className="grid-overlay"></div>
                <div className="glow-orb glow-left"></div>
                <div className="glow-orb glow-right"></div>
                <div className="speed-lines">
                  <div className="speed-line"></div>
                  <div className="speed-line"></div>
                  <div className="speed-line"></div>
                </div>
              </div>
              <div className="header-content">
                <h1 className="page-title-enhanced">
                  {activeView === "races" && "Race Calendar"}
                  {activeView === "drivers" && "Driver Roster"}
                  {activeView === "profile" && `Driver Profile — ${selectedDriver?.BroadcastName || "Loading"}`}
                  {activeView === "standings" && "Standings"}
                  {activeView === "favorites" && "Favorites"}
                  {activeView === "compare" && "Compare"}
                </h1>
                <div className="title-accent">
                  <div className="accent-line"></div>
                  <div className="accent-dot"></div>
                  <div className="accent-line"></div>
                </div>
              </div>
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
                  <div className="team-grid">
                    {driversByTeam.map((group) => (
                      <div key={group.team} className="team-card">
                        <div className="team-header">
                          <div
                            className="team-swatch"
                            style={{ background: group.color }}
                          />
                          <h3 style={{ margin: 0 }}>{group.team}</h3>
                        </div>
                        <div className="team-drivers">
                          {group.drivers.map((driver) => (
                            <DriverCard
                              key={driver.DriverNumber}
                              driver={driver}
                              isFavorite={favoriteDriverIds.includes(
                                driver.DriverNumber
                              )}
                              onToggleFavorite={handleToggleFavorite}
                              onClick={(d) =>
                                navigate(`/drivers/${d.DriverNumber}`)
                              }
                              onOpenTelemetry={handleTelemetryOpen}
                              isCompared={compareSelection.includes(
                                driver.DriverNumber
                              )}
                              onToggleCompare={toggleCompare}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <div
                        style={{
                          gridColumn: "1/-1",
                          textAlign: "center",
                          padding: "64px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        No drivers found.
                      </div>
                    )}
                  </div>
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
                  <FavoritesView
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
                  <DriverCompare
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
                  <StandingsView
                    onDriverSelect={(driverNumber) =>
                      navigate(`/drivers/${driverNumber}`)
                    }
                  />
                }
              />
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
