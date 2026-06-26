import { useState, useCallback } from 'react';
import { getRaces, getSeason, getDriverStats, getSessionResults, getFavorites, addFavorite, removeFavorite } from '../services/api';
import type { RaceEvent, Driver, DriverStanding, TeamStanding, DriverSeasonStats, RaceResult } from '../types/f1';
import type { Favorite } from '../types/auth';

export interface SeasonBundle {
    races: RaceEvent[];
    drivers: Driver[];
    driverStandings: DriverStanding[];
    teamStandings: TeamStanding[];
}

// Module-level cache to persist data across component unmounts and ensure it is not refetched when switching tabs.
const seasonCache: Record<number, SeasonBundle> = {};
const racesCache: Record<number, RaceEvent[]> = {};
const driverStatsCache: Record<string, DriverSeasonStats> = {};
const sessionCache: Record<string, RaceResult[]> = {};

// In-flight promises to deduplicate concurrent requests
const racesPromiseCache: Record<number, Promise<RaceEvent[]> | undefined> = {};
const sessionPromiseCache: Record<string, Promise<RaceResult[]> | undefined> = {};
const seasonPromiseCache: Record<number, Promise<SeasonBundle> | undefined> = {};

export function useF1Data() {
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [favorites, setFavorites] = useState<Favorite[]>([]);

    const hydrateFavorites = useCallback(async () => {
        try {
            const data = await getFavorites();
            setFavorites(data);
        } catch (err) {
            console.error('Failed to load favorites', err);
        }
    }, []);

    const clearFavorites = useCallback(() => {
        setFavorites([],);
    }, []);

    const fetchSeason = useCallback(async (targetYear: number): Promise<SeasonBundle> => {
        if (seasonCache[targetYear]) return seasonCache[targetYear];

        if (seasonPromiseCache[targetYear]) {
            return seasonPromiseCache[targetYear];
        }

        const promise = (async () => {
            // Check sessionStorage for instant race list restore
            const storageKey = `races_${targetYear}`;
            if (!racesCache[targetYear]) {
                try {
                    const storedRaces = sessionStorage.getItem(storageKey);
                    if (storedRaces) {
                        racesCache[targetYear] = JSON.parse(storedRaces);
                    }
                } catch (e) {
                    console.error("Failed to parse races from sessionStorage", e);
                }
            }

            const bundle = await getSeason(targetYear);
            racesCache[targetYear] = bundle.races;
            sessionStorage.setItem(storageKey, JSON.stringify(bundle.races));

            seasonCache[targetYear] = bundle;
            return bundle;
        })();
        seasonPromiseCache[targetYear] = promise;
        try {
            const bundle = await promise;
            return bundle;
        } finally {
            delete seasonPromiseCache[targetYear];
        }
    }, []);

    const ensureSeason = useCallback(async (targetYear: number): Promise<SeasonBundle> => {
        if (seasonCache[targetYear]) return seasonCache[targetYear];
        setLoading(true);
        setError(null);
        try {
            return await fetchSeason(targetYear);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [fetchSeason]);

    const fetchDriverStatsWithCache = useCallback(async (
        year: number,
        driverNumber: string,
        forceRefresh: boolean = false
    ): Promise<DriverSeasonStats | null> => {
        const cacheKey = `${year}-${driverNumber}`;

        if (!forceRefresh && driverStatsCache[cacheKey]) {
            return driverStatsCache[cacheKey];
        }

        try {
            const stats = await getDriverStats(year, driverNumber);
            driverStatsCache[cacheKey] = stats;
            return stats;
        } catch (err) {
            return null;
        }
    }, []);

    const fetchSessionResultsWithCache = useCallback(async (
        year: number,
        round: number,
        session: string,
        forceRefresh: boolean = false
    ): Promise<RaceResult[]> => {
        const cacheKey = `${year}-${round}-${session}`;

        if (!forceRefresh && sessionCache[cacheKey]) {
            return sessionCache[cacheKey];
        }

        if (!forceRefresh && sessionPromiseCache[cacheKey]) {
            return sessionPromiseCache[cacheKey];
        }

        try {
            const promise = getSessionResults(year, round, session, forceRefresh)
                .then(({ results }) => {
                    if (results.length > 0) sessionCache[cacheKey] = results;
                    return results;
                })
                .finally(() => {
                    delete sessionPromiseCache[cacheKey];
                });

            sessionPromiseCache[cacheKey] = promise;
            return promise;
        } catch (err) {
            return [];
        }
    }, []);

    const prefetchRacesForYear = useCallback(async (targetYear: number) => {
        if (racesCache[targetYear]) return;
        if (racesPromiseCache[targetYear]) return;

        racesPromiseCache[targetYear] = getRaces(targetYear)
            .then((racesData) => {
                racesCache[targetYear] = racesData;
                return racesData;
            })
            .catch((err) => {
                console.error('Failed to prefetch races', err);
                return [];
            })
            .finally(() => {
                delete racesPromiseCache[targetYear];
            });
    }, []);

    const clearSeasonCache = useCallback((year: number) => {
        delete seasonCache[year];
    }, []);

    const toggleFavoriteWithOptimisticUI = useCallback(async (driverId: string) => {
        // Optimistic UI update
        const existing = favorites.find(f => f.driver_id === driverId);
        const originalFavorites = [...favorites];

        if (existing) {
            setFavorites(prev => prev.filter(f => f.id !== existing.id));
        } else {
            // Add a temporary optimistic record
            setFavorites(prev => [...prev, { id: -1, driver_id: driverId }]);
        }

        try {
            if (existing) {
                await removeFavorite(existing.id);
                return;
            }

            const favorite = await addFavorite({ driver_id: driverId });

            // Re-sync with actual DB state if needed (e.g. mapping the valid returned ID)
            setFavorites(prev => prev.map(f => (f.driver_id === driverId && f.id === -1 ? favorite : f)));
        } catch (err) {
            console.error('Failed to toggle favorite. Reverting.', err);
            // Revert on error
            setFavorites(originalFavorites);
            throw err;
        }
    }, [favorites]);

    return {
        loading,
        error,
        favorites,
        ensureSeason,
        fetchDriverStatsWithCache,
        fetchSessionResultsWithCache,
        prefetchRacesForYear,
        clearSeasonCache,
        toggleFavoriteWithOptimisticUI,
        hydrateFavorites,
        clearFavorites,
    };
}
