import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Driver, DriverSeasonStats } from '../types/f1';
import { getDriverStats } from '../services/api';

// Maximum number of drivers that can be compared at once
const MAX_COMPARE_DRIVERS = 3;

// Local storage key for persisting selection
const STORAGE_KEY = 'pitwall_compare_selection';

/**
 * Load initial selection from localStorage
 */
function loadInitialSelection(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE_DRIVERS) : [];
  } catch {
    return [];
  }
}

/**
 * Custom hook for managing driver comparison state and logic.
 * Handles selection, stats fetching, and persistence.
 */
export function useDriverComparison(
  allDrivers: Driver[],
  year: number
) {
  // Selected driver numbers (up to MAX_COMPARE_DRIVERS)
  const [selectedDriverNumbers, setSelectedDriverNumbers] = useState<string[]>(loadInitialSelection);
  
  // Cached stats for each selected driver
  const [statsMap, setStatsMap] = useState<Record<string, DriverSeasonStats | null>>({});
  
  // Loading state
  const [loading, setLoading] = useState(false);
  
  // Toast state for limit exceeded
  const [limitToast, setLimitToast] = useState<{ id: number; message: string } | null>(null);
  
  // Track in-flight requests to avoid duplicates
  const inFlightRequests = useRef<Set<string>>(new Set());

  // Persist selection to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedDriverNumbers));
    } catch (err) {
      console.error('Failed to save compare selection:', err);
    }
  }, [selectedDriverNumbers]);

  // Auto-dismiss toast after 2.6 seconds
  useEffect(() => {
    if (!limitToast) return;
    const t = window.setTimeout(() => setLimitToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [limitToast]);

  // Clear stats cache when year changes
  useEffect(() => {
    setStatsMap({});
  }, [year]);

  // Fetch stats for selected drivers (on selection change)
  useEffect(() => {
    const fetchMissingStats = async () => {
      const missing = selectedDriverNumbers.filter(
        (num) => !statsMap[num] && !inFlightRequests.current.has(num)
      );

      if (missing.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Mark as in-flight
      missing.forEach((num) => inFlightRequests.current.add(num));

      try {
        const results = await Promise.all(
          missing.map(async (driverNumber) => {
            try {
              const stats = await getDriverStats(year, driverNumber);
              return [driverNumber, stats] as [string, DriverSeasonStats];
            } catch (err) {
              console.error(`Failed to fetch stats for driver ${driverNumber}:`, err);
              return [driverNumber, null] as [string, null];
            }
          })
        );

        setStatsMap((prev) => {
          const updated = { ...prev };
          results.forEach(([num, stats]) => {
            updated[num] = stats;
          });
          return updated;
        });
      } finally {
        // Remove from in-flight
        missing.forEach((num) => inFlightRequests.current.delete(num));
        setLoading(false);
      }
    };

    fetchMissingStats();
  }, [selectedDriverNumbers, year, statsMap]);

  /**
   * Toggle a driver in/out of comparison selection
   */
  const toggleDriver = useCallback((driverNumber: string) => {
    setSelectedDriverNumbers((prev) => {
      // If already selected, remove
      if (prev.includes(driverNumber)) {
        return prev.filter((num) => num !== driverNumber);
      }

      // If at max capacity, show toast and don't add
      if (prev.length >= MAX_COMPARE_DRIVERS) {
        setLimitToast({
          id: Date.now(),
          message: `You can compare up to ${MAX_COMPARE_DRIVERS} drivers at a time.`,
        });
        return prev;
      }

      // Add to selection
      return [...prev, driverNumber];
    });
  }, []);

  /**
   * Add a driver to comparison (if not already selected and under limit)
   */
  const addDriver = useCallback((driverNumber: string) => {
    setSelectedDriverNumbers((prev) => {
      if (prev.includes(driverNumber)) {
        return prev; // Already selected
      }

      if (prev.length >= MAX_COMPARE_DRIVERS) {
        setLimitToast({
          id: Date.now(),
          message: `You can compare up to ${MAX_COMPARE_DRIVERS} drivers at a time.`,
        });
        return prev;
      }

      return [...prev, driverNumber];
    });
  }, []);

  /**
   * Remove a specific driver from comparison
   */
  const removeDriver = useCallback((driverNumber: string) => {
    setSelectedDriverNumbers((prev) => prev.filter((num) => num !== driverNumber));
    // Also remove from stats cache
    setStatsMap((prev) => {
      const updated = { ...prev };
      delete updated[driverNumber];
      return updated;
    });
  }, []);

  /**
   * Clear all selected drivers
   */
  const clearSelection = useCallback(() => {
    setSelectedDriverNumbers([]);
    setStatsMap({});
  }, []);

  /**
   * Check if a driver is currently selected
   */
  const isSelected = useCallback(
    (driverNumber: string) => selectedDriverNumbers.includes(driverNumber),
    [selectedDriverNumbers]
  );

  /**
   * Get the full Driver objects for selected drivers
   */
  const selectedDrivers = useMemo(
    () =>
      selectedDriverNumbers
        .map((num) => allDrivers.find((d) => d.DriverNumber === num))
        .filter((d): d is Driver => d !== undefined),
    [selectedDriverNumbers, allDrivers]
  );

  /**
   * Check if we can add more drivers
   */
  const canAddMore = useMemo(
    () => selectedDriverNumbers.length < MAX_COMPARE_DRIVERS,
    [selectedDriverNumbers]
  );

  /**
   * Dismiss the limit toast manually
   */
  const dismissLimitToast = useCallback(() => {
    setLimitToast(null);
  }, []);

  return {
    // Selection state
    selectedDriverNumbers,
    selectedDrivers,
    
    // Stats
    statsMap,
    loading,
    
    // Actions
    toggleDriver,
    addDriver,
    removeDriver,
    clearSelection,
    
    // Helpers
    isSelected,
    canAddMore,
    
    // Toast
    limitToast,
    dismissLimitToast,
    
    // Constants
    maxDrivers: MAX_COMPARE_DRIVERS,
  };
}


