import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getRaces, getDrivers, getDriverStandings, getTeamStandings, getDriverStats, getSessionResults } from '../services/api';
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

export const DataProvider: React.FC<DataProviderProps> = ({ children, initialYear = 2025 }) => {
  const { user } = useAuth();
  const [year, setYear] = useState<number>(initialYear);
  const [races, setRaces] = useState<RaceEvent[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([]);
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonCache, setSeasonCache] = useState<Record<number, SeasonBundle>>({});

  // In-memory caches
  const [driverStatsCache, setDriverStatsCache] = useState<DriverStatsCache>({});
  const [sessionCache, setSessionCache] = useState<SessionCache>({});

  // Deduping in-flight requests
  // We use a mutable ref for in-flight promises because we don't need re-renders on every new request
  const sessionPromiseCache = React.useRef<Record<string, Promise<RaceResult[]>>>({});

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
    const [racesData, driversData, driverStandingsData, teamStandingsData] = await Promise.all([
      getRaces(targetYear),
      getDrivers(targetYear),
      getDriverStandings(targetYear),
      getTeamStandings(targetYear),
    ]);

    return {
      races: racesData,
      drivers: driversData,
      driverStandings: driverStandingsData,
      teamStandings: teamStandingsData,
    };
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
        console.log(`[DataContext] Loading season ${year}...`);
        await ensureSeason(year, true);
      } catch (err) {
        console.error('[DataContext] Failed to load data:', err);
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
    await ensureSeason(year, true);
  };

  const primeSeasons = async (years: number[]) => {
    const uniqueYears = Array.from(new Set(years));
    await Promise.all(uniqueYears.map((yr) => ensureSeason(yr, yr === year)));
  };

  useEffect(() => {
    if (!user) return;
    const warmYears = Array.from(new Set([year, 2024, 2025]));
    primeSeasons(warmYears).catch((err) => console.error('Failed to pre-warm seasons', err));
  }, [user?.id]);

  // Fetch driver stats with intelligent caching
  const fetchDriverStatsWithCache = async (
    driverNumber: string,
    forceRefresh: boolean = false
  ): Promise<DriverSeasonStats | null> => {
    const cacheKey = driverNumber;

    // Return from cache if available and not forcing refresh
    if (!forceRefresh && driverStatsCache[cacheKey]) {
      console.log(`[DataContext] Returning cached stats for driver ${driverNumber}`);
      return driverStatsCache[cacheKey];
    }

    try {
      console.log(`[DataContext] Fetching fresh stats for driver ${driverNumber}...`);
      const stats = await getDriverStats(year, driverNumber);

      // Update cache
      setDriverStatsCache(prev => ({
        ...prev,
        [cacheKey]: stats
      }));

      return stats;
    } catch (err) {
      console.error(`[DataContext] Failed to fetch driver stats for ${driverNumber}:`, err);
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
      console.log(`[DataContext] Returning cached results for round ${round} session ${session}`);
      return sessionCache[cacheKey];
    }

    // Check for in-flight request
    const inFlightPromise = sessionPromiseCache.current[cacheKey] as Promise<RaceResult[]> | undefined;
    if (!forceRefresh && inFlightPromise) {
      console.log(`[DataContext] Joining in-flight request for round ${round} session ${session}`);
      return inFlightPromise;
    }

    try {
      console.log(`[DataContext] Fetching fresh results for round ${round} session ${session}...`);

      const promise = getSessionResults(year, round, session, forceRefresh)
        .then(results => {
          // Update cache
          setSessionCache(prev => ({
            ...prev,
            [cacheKey]: results
          }));
          return results;
        })
        .finally(() => {
          delete sessionPromiseCache.current[cacheKey];
        });

      sessionPromiseCache.current[cacheKey] = promise;
      return promise;
    } catch (err) {
      console.error(`[DataContext] Failed to fetch session results for round ${round} ${session}:`, err);
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
        prefetchAllData
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
