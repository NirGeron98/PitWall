import React from 'react';
import type { Driver } from '../types/f1';
import { Star, User, Activity } from 'lucide-react';
import { Card, CardHeader, CardBody, CardFooter } from './ui/Card';

interface Props {
  driver: Driver;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onClick: (driver: Driver) => void;
  isCompared?: boolean;
  onToggleCompare?: (id: string) => void;
  disableFavorite?: boolean;
  onOpenTelemetry?: (driver: Driver) => void;
}

export const DriverCard: React.FC<Props> = ({
  driver,
  isFavorite,
  onToggleFavorite,
  onClick,
  isCompared = false,
  onToggleCompare,
  disableFavorite = false,
  onOpenTelemetry,
}) => {
  return (
    <Card
      onClick={() => onClick(driver)}
      className="clickable"
    // Using inline styles for dynamic/specific visuals that don't need a global class
    // But relying on index.css .card classes for base styles
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: 'transparent',
          borderRadius: 'inherit',
          pointerEvents: 'none'
        }}
      />

      <CardHeader className="flex-row justify-between items-center">
        <span className="text-lg" style={{ fontWeight: 800, color: 'var(--text-tertiary)' }}>
          #{driver.DriverNumber}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(driver.DriverNumber);
          }}
          className="btn-reset"
          disabled={disableFavorite}
          style={{ opacity: disableFavorite ? 0.5 : 1 }}
        >
          <Star
            size={20}
            fill={isFavorite ? "var(--accent-red)" : "none"}
            color={isFavorite ? "var(--accent-red)" : "var(--text-secondary)"}
          />
        </button>
      </CardHeader>

      <CardBody className="flex-row items-center" style={{ gap: '16px' }}>
        <div style={{ position: 'relative' }}>
          {driver.HeadshotUrl ? (
            <img
              src={driver.HeadshotUrl}
              alt={driver.BroadcastName}
              className="driver-avatar"
            />
          ) : (
            <div className="driver-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={24} />
            </div>
          )}
          <div
            style={{
              height: '4px',
              width: '100%',
              background: driver.TeamColor,
              marginTop: '4px',
              borderRadius: '2px'
            }}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {driver.BroadcastName}
          </h3>
          <p className="text-muted text-sm" style={{ margin: '4px 0 0' }}>{driver.TeamName}</p>
        </div>
      </CardBody>

      <CardFooter className="flex-row justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenTelemetry?.(driver);
          }}
          className="btn-reset flex-row items-center"
          style={{ gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
        >
          <Activity size={14} />
          <span>Telemetry</span>
        </button>

        {onToggleCompare && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCompare(driver.DriverNumber); }}
            className="btn-reset"
            style={{
              padding: '4px 8px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
              color: isCompared ? 'var(--accent-red)' : 'var(--text-secondary)',
              borderColor: isCompared ? 'var(--accent-red)' : 'var(--border)',
              background: isCompared ? 'var(--accent-red-dim)' : 'transparent'
            }}
          >
            {isCompared ? 'Remove' : 'Compare'}
          </button>
        )}
      </CardFooter>
    </Card>
  );
};
