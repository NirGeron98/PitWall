import axios from 'axios';
import type { RaceEvent, Driver, RaceResult, DriverSeasonStats, DriverStanding, TeamStanding } from '../types/f1';
import type { User, Favorite } from '../types/auth';

const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const api = axios.create({
    baseURL: API_URL,
});

// Clerk session tokens are short-lived and refreshed by the SDK, so we fetch a
// fresh token per request via a registered async getter instead of caching one.
let tokenGetter: (() => Promise<string | null>) | null = null;

export const registerTokenGetter = (fn: (() => Promise<string | null>) | null) => {
    tokenGetter = fn;
};

api.interceptors.request.use(async (config) => {
    if (tokenGetter) {
        try {
            const token = await tokenGetter();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            } else {
                delete config.headers.Authorization;
            }
        } catch {
            delete config.headers.Authorization;
        }
    }
    return config;
});

export const getRaces = async (year: number): Promise<RaceEvent[]> => {
    const res = await api.get(`/api/races`, { params: { year } });
    return res.data.filter((r: RaceEvent) => r.RoundNumber > 0);
};

export const getDrivers = async (year: number): Promise<Driver[]> => {
    const res = await api.get(`/api/drivers`, { params: { year } });
    return res.data;
};

// Backwards-compatible alias: telemetry lives under /api/analysis/telemetry
export const getTelemetry = async (year: number, round: number, driverNumber: string): Promise<TelemetrySeries> => {
    return getTelemetryAnalysis(year, round, driverNumber);
};

export const getRaceResults = async (year: number, round: number): Promise<RaceResult[]> => {
    const res = await api.get(`/api/race-results`, {
        params: { year, round }
    });
    return res.data;
};

export type SessionStatus = 'ok' | 'ended_no_data' | 'no_data';

export const getSessionResults = async (
    year: number,
    round: number,
    session: string,
    refresh = false,
): Promise<{ results: RaceResult[]; sessionStatus: SessionStatus }> => {
    const res = await api.get(`/api/session-results`, {
        params: { year, round, session, refresh },
    });
    const sessionStatus = (res.headers['x-session-status'] as SessionStatus) || 'ok';
    return { results: res.data, sessionStatus };
};

export const getDriverStandings = async (year: number): Promise<DriverStanding[]> => {
    const res = await api.get(`/api/standings/drivers`, { params: { year } });
    return res.data;
};

export const getTeamStandings = async (year: number): Promise<TeamStanding[]> => {
    const res = await api.get(`/api/standings/teams`, { params: { year } });
    return res.data;
};

export interface SeasonResponse {
    races: RaceEvent[];
    drivers: Driver[];
    driverStandings: DriverStanding[];
    teamStandings: TeamStanding[];
}

export const getSeason = async (year: number): Promise<SeasonResponse> => {
    const res = await api.get(`/api/season`, { params: { year } });
    return {
        ...res.data,
        races: res.data.races.filter((r: RaceEvent) => r.RoundNumber > 0),
    };
};

export const getDriverStats = async (year: number, driverNumber: string): Promise<DriverSeasonStats> => {
    const res = await api.get(`/api/driver/${driverNumber}/stats`, { params: { year } });
    return res.data;
};

// Analysis endpoints
export interface LapPoint {
    driverNumber: string;
    lapNumber: number | null;
    lapTimeMs: number | null;
    s1Ms: number | null;
    s2Ms: number | null;
    s3Ms: number | null;
    compound?: string;
    stint?: number | null;
    position?: number | null;
}

export interface TelemetrySeries {
    distance: number[];
    speed: number[];
    throttle: number[];
    brake: number[];
    gear: number[];
    lapNumber?: number | null;
}

export interface StintInfo {
    stint: number | null;
    compound?: string;
    startLap: number;
    endLap: number;
    lapCount: number;
}

export interface DriverMeta {
    driverNumber: string;
    broadcastName: string;
    fullName: string;
    teamName: string;
    teamColor?: string;
    headshotUrl?: string | null;
}

export interface LapAnalysisResponse {
    laps: LapPoint[];
    drivers: DriverMeta[];
}

export const getLapAnalysis = async (year: number, round: number, drivers?: string[]): Promise<LapAnalysisResponse> => {
    const res = await api.get(`/api/analysis/laps`, { params: { year, round, drivers: drivers?.join(',') } });
    return res.data;
};

export const getTelemetryAnalysis = async (year: number, round: number, driver: string, lap?: number): Promise<TelemetrySeries> => {
    const res = await api.get(`/api/analysis/telemetry`, { params: { year, round, driver, lap } });
    return res.data;
};

export const getStintsAnalysis = async (year: number, round: number, driver: string): Promise<StintInfo[]> => {
    const res = await api.get(`/api/analysis/stints`, { params: { year, round, driver } });
    return res.data;
};

// --- Auth ---
// Login/registration are handled by Clerk on the client. The backend only
// exposes /auth/me, which verifies the Clerk token and returns the local user.
export const fetchMe = async (): Promise<User> => {
    const res = await api.get(`/auth/me`);
    return res.data;
};

// --- Favorites ---
export const getFavorites = async (): Promise<Favorite[]> => {
    const res = await api.get(`/api/favorites`);
    return res.data;
};

export const addFavorite = async (payload: { driver_id?: string | null; team_id?: string | null }): Promise<Favorite> => {
    const res = await api.post(`/api/favorites`, payload);
    return res.data;
};

export const removeFavorite = async (favoriteId: number): Promise<void> => {
    await api.delete(`/api/favorites/${favoriteId}`);
};

export { api as apiClient };
