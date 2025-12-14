import axios from 'axios';
import type { RaceEvent, Driver, RaceResult, DriverSeasonStats, DriverStanding, TeamStanding } from '../types/f1';
import type { AuthResponse, User, Favorite } from '../types/auth';

const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const api = axios.create({
    baseURL: API_URL,
});

export const setAuthToken = (token?: string | null) => {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common.Authorization;
    }
};

export const getRaces = async (year: number): Promise<RaceEvent[]> => {
    const res = await api.get(`/api/races`, { params: { year } });
    return res.data.filter((r: RaceEvent) => r.RoundNumber > 0);
};

export const getDrivers = async (year: number): Promise<Driver[]> => {
    const res = await api.get(`/api/drivers`, { params: { year } });
    return res.data;
};

// New function for Telemetry
export interface TelemetryPoint {
    Distance: number;
    Speed: number;
    RPM: number;
    nGear: number;
}

export const getTelemetry = async (year: number, round: number, driverNumber: string): Promise<TelemetryPoint[]> => {
    // We default to the last race of the year if round is not specified, 
    // but for now let's assume we want data from Round 1 (Bahrain) for consistency in this demo
    // or pass the specific round from the UI.
    const targetRound = round || 1; 
    
    const res = await api.get(`/api/telemetry`, { 
        params: { 
            year, 
            race_round: targetRound, 
            driver_no: driverNumber 
        } 
    });
    return res.data;
};

export const getRaceResults = async (year: number, round: number): Promise<RaceResult[]> => {
    const res = await api.get(`/api/race-results`, { 
        params: { year, round } 
    });
    return res.data;
};

export const getSessionResults = async (year: number, round: number, session: string, refresh = false): Promise<RaceResult[]> => {
    const res = await api.get(`/api/session-results`, { 
        params: { year, round, session, refresh } 
    });
    return res.data;
};

export const getDriverStandings = async (year: number): Promise<DriverStanding[]> => {
    const res = await api.get(`/api/standings/drivers`, { params: { year } });
    return res.data;
};

export const getTeamStandings = async (year: number): Promise<TeamStanding[]> => {
    const res = await api.get(`/api/standings/teams`, { params: { year } });
    return res.data;
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
export const loginUser = async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.post(`/auth/login`, { email, password });
    return res.data;
};

export const registerUser = async (email: string, password: string, full_name?: string): Promise<AuthResponse> => {
    const res = await api.post(`/auth/register`, { email, password, full_name });
    return res.data;
};

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
