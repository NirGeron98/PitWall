import React from "react";
import { DriverCompare } from "../components/DriverCompare";
import { DriverSearchSelect } from "../components/compare/DriverSearchSelect";
import type { Driver, DriverSeasonStats } from "../types/f1";
import { useData } from "../contexts/DataContext";
import { UserPlus } from "lucide-react";

interface Props {
  /** Selected drivers to compare (from parent state) */
  drivers: Driver[];
  /** Stats map for selected drivers */
  statsMap: Record<string, DriverSeasonStats | null>;
  /** Loading state for stats */
  loading: boolean;
  /** Clear all selected drivers */
  onClear: () => void;
  /** Add a driver to comparison */
  onAddDriver?: (driverNumber: string) => void;
  /** Remove a driver from comparison */
  onRemoveDriver?: (driverNumber: string) => void;
  /** All available drivers for search */
  allDrivers?: Driver[];
  /** Selected driver numbers */
  selectedDriverNumbers?: string[];
  /** Whether more drivers can be added */
  canAddMore?: boolean;
  /** Maximum drivers allowed */
  maxDrivers?: number;
}

export const ComparePage: React.FC<Props> = ({
  drivers,
  statsMap,
  loading,
  onClear,
  onAddDriver,
  onRemoveDriver,
  allDrivers,
  selectedDriverNumbers,
  canAddMore = true,
  maxDrivers = 3,
}) => {
  // Get all drivers from context if not provided
  const { drivers: contextDrivers } = useData();
  const availableDrivers = allDrivers || contextDrivers;
  const selectedNumbers = selectedDriverNumbers || drivers.map((d) => d.DriverNumber);

  // Check if we have the selection handlers (new enhanced mode)
  const hasSelectionHandlers = onAddDriver && onRemoveDriver;

  return (
    <div className="compare-page-wrapper">
      {/* Driver Selection Section */}
      <div className="compare-selection-section">
        <div className="selection-header">
          <div className="selection-icon">
            <UserPlus size={20} />
          </div>
          <div className="selection-text">
            <h3>Add Drivers to Compare</h3>
            <p>Search and select up to {maxDrivers} drivers to compare their stats</p>
          </div>
        </div>

        {hasSelectionHandlers ? (
          <DriverSearchSelect
            drivers={availableDrivers}
            selectedDriverNumbers={selectedNumbers}
            onAddDriver={onAddDriver}
            onRemoveDriver={onRemoveDriver}
            canAddMore={canAddMore}
            maxDrivers={maxDrivers}
            placeholder="Search by name, team, or number..."
          />
        ) : (
          <div className="selection-fallback">
            <p>Go to the Drivers tab and use the compare icon to select drivers.</p>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <DriverCompare
        drivers={drivers}
        statsMap={statsMap}
        loading={loading}
        onClear={onClear}
      />

      <style>{`
        .compare-page-wrapper {
          display: flex;
          flex-direction: column;
          gap: 24px;
          width: 100%;
        }

        .compare-selection-section {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 24px;
        }

        .selection-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
        }

        .selection-icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 12px;
          color: #ef4444;
          flex-shrink: 0;
        }

        .selection-text h3 {
          margin: 0 0 4px 0;
          font-size: 1.1rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
        }

        .selection-text p {
          margin: 0;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .selection-fallback {
          padding: 20px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          text-align: center;
        }

        .selection-fallback p {
          margin: 0;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.9rem;
        }

        @media (max-width: 640px) {
          .compare-selection-section {
            padding: 16px;
          }

          .selection-header {
            flex-direction: column;
            gap: 12px;
          }

          .selection-icon {
            width: 40px;
            height: 40px;
          }
        }
      `}</style>
    </div>
  );
};

