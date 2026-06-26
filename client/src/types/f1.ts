export interface RaceEvent {
    RoundNumber: number;
    Country: string;
    Location: string;
    EventName: string;
    EventDate: string;
    EventFormat: string;
    Session5Date: string;   // Race day
    Session1Date?: string;  // FP1
    Session2Date?: string;  // FP2 / Sprint Qualifying
    Session3Date?: string;  // FP3 / Sprint
    Session4Date?: string;  // Qualifying
}

export interface Driver {
    DriverNumber: string;
    BroadcastName: string;
    FullName: string;
    TeamName: string;
    TeamColor: string;
    HeadshotUrl: string | null;
}

export interface RaceResult {
    Position: number;
    DriverNumber: string;
    BroadcastName: string;
    TeamName: string;
    Time: string;
    Status: string; // e.g. "Finished", "Collision", "+1 Lap"
    Points: number;
    SessionType?: string;
}

export interface DriverStanding {
    position: number;
    points: number;
    wins: number;
    driverId: string;
    driverNumber: string;
    givenName: string;
    familyName: string;
    constructorName: string; // From Ergast join
    headshotUrl?: string | null;
    teamColor?: string;
    broadcastName?: string;
    teamName?: string;
}

export interface TeamStanding {
    position: number;
    points: number;
    wins: number;
    constructorId: string;
    constructorName: string;
    nationality: string;
}

export interface DriverRaceResult {
    round: number;
    raceName: string;
    date: string;
    position: number;
    points: number;
    grid: number;
    status: string;
}

export interface DriverSeasonStats {
    standingPosition: number | string | null;
    standingPoints: number | string | null;
    results: DriverRaceResult[];
}
