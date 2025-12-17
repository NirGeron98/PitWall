// src/utils/formatters.ts

/**
 * Formats time in milliseconds to M:SS.MMM string.
 * @param ms - Time in milliseconds.
 * @returns Formatted time string (e.g., 1:23.456).
 */
export const formatLapTime = (ms?: number | null) => {
    if (!ms || Number.isNaN(ms)) return "-";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
        .toString()
        .padStart(3, "0")}`;
};

/**
 * Formats time in milliseconds to M:SS.MMM string (shortened, high precision).
 * @param ms - Time in milliseconds.
 * @returns Formatted time string (e.g., 1:23.456).
 */
export const formatLapTimeShort = (ms?: number | null) => {
    if (!ms || Number.isNaN(ms)) return "-";
    const seconds = ((ms % 60000) / 1000).toFixed(3);
    const minutes = Math.floor(ms / 60000);
    return `${minutes}:${seconds.padStart(6, "0")}`;
};

/**
 * Formats a driver's broadcast name.
 * Ensures single-letter initials include a trailing dot (e.g., "L NORRIS" -> "L. NORRIS").
 */
export const formatBroadcastName = (name?: string | null) => {
    const raw = (name || "").trim();
    if (!raw) return "";

    // Match: single letter initial, optional dot, whitespace, then the rest of the name
    const match = raw.match(/^([A-Za-z])\.?\s+(.+)$/);
    if (!match) return raw;

    const initial = match[1].toUpperCase();
    const rest = match[2].trim();
    if (!rest) return `${initial}.`;

    return `${initial}. ${rest}`;
};