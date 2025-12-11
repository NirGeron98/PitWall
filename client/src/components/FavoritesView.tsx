import React from 'react';
import type { Driver } from '../types/f1';
import { DriverCard } from './DriverCard';
import { Heart } from 'lucide-react';

interface Props {
    drivers: Driver[];
    favoriteDriverIds: string[];
    onToggleFavorite: (id: string) => void;
    onSelectDriver: (driver: Driver) => void;
    onOpenTelemetry: (driver: Driver) => void;
}

export const FavoritesView: React.FC<Props> = ({
    drivers,
    favoriteDriverIds,
    onToggleFavorite,
    onSelectDriver,
    onOpenTelemetry
}) => {

    const favoriteDrivers = drivers.filter(d => favoriteDriverIds.includes(d.DriverNumber));

    if (favoriteDrivers.length === 0) {
        return (
            <div className="animate-fade-in" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px',
                textAlign: 'center',
                color: 'var(--text-secondary)'
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                }}>
                    <Heart size={40} strokeWidth={1} />
                </div>
                <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>No Favorites Yet</h2>
                <p style={{ maxWidth: '400px', lineHeight: 1.5 }}>
                    Star your favorite drivers from the Drivers tab to have quick access to their telemetry and stats here.
                </p>
            </div>
        );
    }

    return (
        <div className="favorites-grid animate-fade-in">
            {favoriteDrivers.map(driver => (
                <DriverCard
                    key={driver.DriverNumber}
                    driver={driver}
                    isFavorite={true}
                    onToggleFavorite={onToggleFavorite}
                    onClick={onSelectDriver}
                    onOpenTelemetry={onOpenTelemetry}
                />
            ))}
        </div>
    );
};
