import React from "react";
import type { Driver } from "../types/f1";
import { DriverCard } from "../components/DriverCard";

export type DriverTeamGroup = {
  team: string;
  color: string;
  drivers: Driver[];
};

interface Props {
  groups: DriverTeamGroup[];
  favoriteDriverIds: string[];
  onToggleFavorite: (driverNum: string) => void;
  onNavigateDriver: (driverNum: string) => void;
  onOpenTelemetry: (driver: Driver) => void;
  compareSelection: string[];
  onToggleCompare: (driverNum: string) => void;
  hasDrivers: boolean;
}

export const DriversPage: React.FC<Props> = ({
  groups,
  favoriteDriverIds,
  onToggleFavorite,
  onNavigateDriver,
  onOpenTelemetry,
  compareSelection,
  onToggleCompare,
  hasDrivers,
}) => {
  return (
    <div className="team-grid">
      {groups.map((group) => (
        <div key={group.team} className="team-card">
          <div className="team-header">
            <div className="team-swatch" style={{ background: group.color }} />
            <h3 style={{ margin: 0 }}>{group.team}</h3>
          </div>
          <div className="team-drivers">
            {group.drivers.map((driver) => (
              <DriverCard
                key={driver.DriverNumber}
                driver={driver}
                isFavorite={favoriteDriverIds.includes(driver.DriverNumber)}
                onToggleFavorite={onToggleFavorite}
                onClick={(d) => onNavigateDriver(d.DriverNumber)}
                onOpenTelemetry={onOpenTelemetry}
                isCompared={compareSelection.includes(driver.DriverNumber)}
                onToggleCompare={onToggleCompare}
              />
            ))}
          </div>
        </div>
      ))}
      {!hasDrivers && (
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
  );
};
