import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getRaces, getSeason, getDriverStats, getSessionResults } from '../services/api';
import type { RaceEvent, Driver, DriverStanding, TeamStanding, DriverSeasonStats, RaceResult } from '../types/f1';
import { useAuth } from './AuthContext';

// Cache interfaces
interface DriverStatsCache {
  [driverNumber: string]: DriverSeasonStats;
}

interface SessionCache {
  [key: string]: RaceResult[]; // key format: "round-session"
}

interface SeasonBundle {
  races: RaceEvent[];
  drivers: Driver[];
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
}

interface DataContextType {
  year: number;
  setYear: (year: number) => void;
  races: RaceEvent[];
  drivers: Driver[];
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  fetchDriverStatsWithCache: (driverNumber: string, forceRefresh?: boolean) => Promise<DriverSeasonStats | null>;
  fetchSessionResultsWithCache: (round: number, session: string, forceRefresh?: boolean) => Promise<RaceResult[]>;
  primeSeasons: (years: number[]) => Promise<void>;
  prefetchAllData: () => Promise<void>;
  prefetchRacesForYear: (targetYear?: number) => void;
  prefetchLastCompletedRaceResults: (targetYear?: number) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

interface DataProviderProps {
  children: ReactNode;
  initialYear?: number;
}

const getDefaultSeasonYear = (): number => {
  const yr = new Date().getFullYear();
  return Number.isFinite(yr) && yr >= 1950 ? yr : 2026;
};

export const DataProvider: React.FC<DataProviderProps> = ({ children, initialYear = getDefaultSeasonYear() }) => {
  const { user } = useAuth();
  const [year, setYear] = useState<number>(initialYear);
  const [races, setRaces] = useState<RaceEvent[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([]);
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonCache, setSeasonCache] = useState<Record<number, SeasonBundle>>({});
  const [racesCache, setRacesCache] = useState<Record<number, RaceEvent[]>>({});

  // In-memory caches
  const [driverStatsCache, setDriverStatsCache] = useState<DriverStatsCache>({});
  const [sessionCache, setSessionCache] = useState<SessionCache>({});

  // Deduping in-flight requests
  // We use a mutable ref for in-flight promises because we don't need re-renders on every new request
  const sessionPromiseCache = React.useRef<Record<string, Promise<RaceResult[]>>>({});
  const racesPromiseCache = React.useRef<Record<string, Promise<RaceEvent[]> | undefined>>({});

  const applySeasonToState = (bundle: SeasonBundle) => {
    setRaces(bundle.races);
    setDrivers(bundle.drivers);
    setDriverStandings(bundle.driverStandings);
    setTeamStandings(bundle.teamStandings);
    // Clear dependent caches when swapping seasons
    setDriverStatsCache({});
    setSessionCache({});
  };

  const fetchSeason = async (targetYear: number): Promise<SeasonBundle> => {
    const bundle = await getSeason(targetYear);
    setRacesCache((prev) => ({ ...prev, [targetYear]: bundle.races }));
    return bundle;
  };

  const prefetchRacesForYear = (targetYear: number = year) => {
    if (!user) return;

    // Already have races for the active year
    if (targetYear === year && races.length) return;

    const cachedRaces = racesCache[targetYear];
    if (cachedRaces?.length) {
      if (targetYear === year && races.length === 0) setRaces(cachedRaces);
      return;
    }

    const key = String(targetYear);
    const inFlight = racesPromiseCache.current[key];
    if (inFlight) return;

    racesPromiseCache.current[key] = getRaces(targetYear)
      .then((racesData) => {
        setRacesCache((prev) => ({ ...prev, [targetYear]: racesData }));

        if (targetYear === year && races.length === 0) {
          setRaces(racesData);
        }

        return racesData;
      })
      .catch((err) => {
        console.error('Failed to prefetch races', err);
        return [];
      })
      .finally(() => {
        delete racesPromiseCache.current[key];
      });
  };

  const prefetchLastCompletedRaceResults = (targetYear: number = year) => {
    if (!user) return;

    // Fire-and-forget: if we have the race list, compute last completed and prefetch Race session.
    const list = (targetYear === year ? races : racesCache[targetYear]) ?? [];
    if (!list.length) return;

    const now = Date.now();
    const completed = list
      .map((r) => {
        const d = new Date(String(r.Session5Date ?? ''));
        return { race: r, time: Number.isNaN(d.getTime()) ? null : d.getTime() };
      })
      .filter((x) => x.time !== null && (x.time as number) <= now)
      .sort((a, b) => (b.race.RoundNumber ?? 0) - (a.race.RoundNumber ?? 0));

    const last = completed[0]?.race;
    if (!last) return;

    // Uses the existing session cache + in-flight dedupe.
    void fetchSessionResultsWithCache(last.RoundNumber, 'R', false);
  };

  const ensureSeason = async (targetYear: number, applyToState: boolean): Promise<SeasonBundle> => {
    const cached = seasonCache[targetYear];
    if (cached) {
      if (applyToState) applySeasonToState(cached);
      return cached;
    }

    const bundle = await fetchSeason(targetYear);
    setSeasonCache((prev) => ({ ...prev, [targetYear]: bundle }));
    if (applyToState) applySeasonToState(bundle);
    return bundle;
  };

  useEffect(() => {
    if (!user) {
      setRaces([]);
      setDrivers([]);
      setDriverStandings([]);
      setTeamStandings([]);
      setDriverStatsCache({});
      setSessionCache({});
      setSeasonCache({});
      setRacesCache({});
      setLoading(false);
      return;
    }

    const loadSeason = async () => {
      const hasCached = Boolean(seasonCache[year]);
      if (!hasCached) {
        setLoading(true);
      }
      setError(null);
      try {
        await ensureSeason(year, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadSeason();
  }, [year, user?.id, seasonCache[year]]);

  const refreshData = async () => {
    setSeasonCache((prev) => {
      const copy = { ...prev };
      delete copy[year];
      return copy;
    });
    const bundle = await fetchSeason(year);
    setSeasonCache((prev) => ({ ...prev, [year]: bundle }));
    applySeasonToState(bundle);
  };

  const primeSeasons = async (years: number[]) => {
    const uniqueYears = Array.from(new Set(years));
    await Promise.all(uniqueYears.map((yr) => ensureSeason(yr, yr === year)));
  };

  // Background prefetch: races (and likely next-click: last completed race results)
  useEffect(() => {
    if (!user) return;
    prefetchRacesForYear(year);
  }, [user?.id, year]);

  useEffect(() => {
    if (!user) return;
    prefetchLastCompletedRaceResults(year);
  }, [user?.id, year, races]);

  // Fetch driver stats with intelligent caching
  const fetchDriverStatsWithCache = async (
    driverNumber: string,
    forceRefresh: boolean = false
  ): Promise<DriverSeasonStats | null> => {
    const cacheKey = driverNumber;

    // Return from cache if available and not forcing refresh
    if (!forceRefresh && driverStatsCache[cacheKey]) {
      return driverStatsCache[cacheKey];
    }

    try {
      const stats = await getDriverStats(year, driverNumber);

      // Update cache
      setDriverStatsCache(prev => ({
        ...prev,
        [cacheKey]: stats
      }));

      return stats;
    } catch (err) {
      return null;
    }
  };

  // Fetch session results with intelligent caching
  const fetchSessionResultsWithCache = async (
    round: number,
    session: string,
    forceRefresh: boolean = false
  ): Promise<RaceResult[]> => {
    const cacheKey = `${round}-${session}`;

    // Return from cache if available and not forcing refresh
    if (!forceRefresh && sessionCache[cacheKey]) {
      return sessionCache[cacheKey];
    }

    // Check for in-flight request
    const inFlightPromise = sessionPromiseCache.current[cacheKey] as Promise<RaceResult[]> | undefined;
    if (!forceRefresh && inFlightPromise) {
      return inFlightPromise;
    }

    try {
      const promise = getSessionResults(year, round, session, forceRefresh)
        .then(({ results, sessionStatus }) => {
          // Only cache non-empty results; empty means "retry next time"
          if (results.length > 0) {
            setSessionCache(prev => ({ ...prev, [cacheKey]: results }));
          }
          // Attach sessionStatus as a property so RaceDetailsModal can read it.
          (results as any)._sessionStatus = sessionStatus;
          return results;
        })
        .finally(() => {
          delete sessionPromiseCache.current[cacheKey];
        });

      sessionPromiseCache.current[cacheKey] = promise;
      return promise;
    } catch (err) {
      return [];
    }
  };

  // Background prefetch for all data
  const prefetchAllData = async () => {
    // Prefetch disabled to avoid hammering external APIs.
    return;
  };

  return (
    <DataContext.Provider
      value={{
        year,
        setYear,
        races,
        drivers,
        driverStandings,
        teamStandings,
        loading,
        error,
        refreshData,
        fetchDriverStatsWithCache,
        fetchSessionResultsWithCache,
        primeSeasons,
        prefetchAllData,
        prefetchRacesForYear,
        prefetchLastCompletedRaceResults,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
