import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, X, Check, ChevronDown, User } from 'lucide-react';
import type { Driver } from '../../types/f1';

interface DriverSearchSelectProps {
  /** All available drivers to search from */
  drivers: Driver[];
  /** Currently selected driver numbers */
  selectedDriverNumbers: string[];
  /** Callback when a driver is added */
  onAddDriver: (driverNumber: string) => void;
  /** Callback when a driver is removed */
  onRemoveDriver: (driverNumber: string) => void;
  /** Whether more drivers can be added (max not reached) */
  canAddMore: boolean;
  /** Maximum number of drivers allowed */
  maxDrivers: number;
  /** Optional placeholder text */
  placeholder?: string;
}

/**
 * A searchable dropdown component for selecting drivers to compare.
 * Features:
 * - Fuzzy search by driver name, team, or number
 * - Visual indicator for already-selected drivers
 * - Team color accents
 * - Premium dark theme styling
 */
export const DriverSearchSelect: React.FC<DriverSearchSelectProps> = ({
  drivers,
  selectedDriverNumbers,
  onAddDriver,
  onRemoveDriver,
  canAddMore,
  maxDrivers,
  placeholder = 'Search drivers...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter drivers based on search query
  const filteredDrivers = useMemo(() => {
    if (!searchQuery.trim()) {
      return drivers;
    }

    const query = searchQuery.toLowerCase().trim();
    return drivers.filter((driver) => {
      const fullName = driver.FullName?.toLowerCase() || '';
      const broadcastName = driver.BroadcastName?.toLowerCase() || '';
      const teamName = driver.TeamName?.toLowerCase() || '';
      const driverNumber = driver.DriverNumber?.toLowerCase() || '';

      return (
        fullName.includes(query) ||
        broadcastName.includes(query) ||
        teamName.includes(query) ||
        driverNumber.includes(query)
      );
    });
  }, [drivers, searchQuery]);

  // Group drivers by team for better organization
  const groupedDrivers = useMemo(() => {
    const groups: Record<string, Driver[]> = {};
    filteredDrivers.forEach((driver) => {
      const team = driver.TeamName || 'Unknown';
      if (!groups[team]) {
        groups[team] = [];
      }
      groups[team].push(driver);
    });
    return groups;
  }, [filteredDrivers]);

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleDriverClick = (driver: Driver) => {
    const isSelected = selectedDriverNumbers.includes(driver.DriverNumber);
    
    if (isSelected) {
      onRemoveDriver(driver.DriverNumber);
    } else if (canAddMore) {
      onAddDriver(driver.DriverNumber);
    }
    
    // Keep dropdown open for multiple selections
    inputRef.current?.focus();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  // Get selected drivers for display
  const selectedDrivers = useMemo(
    () => drivers.filter((d) => selectedDriverNumbers.includes(d.DriverNumber)),
    [drivers, selectedDriverNumbers]
  );

  return (
    <div className="driver-search-container" ref={containerRef}>
      {/* Selected Drivers Pills */}
      {selectedDrivers.length > 0 && (
        <div className="selected-pills">
          {selectedDrivers.map((driver) => (
            <div
              key={driver.DriverNumber}
              className="selected-pill"
              style={{ borderColor: driver.TeamColor || '#444' }}
            >
              {driver.HeadshotUrl ? (
                <img
                  src={driver.HeadshotUrl}
                  alt={driver.BroadcastName}
                  className="pill-avatar"
                />
              ) : (
                <div className="pill-avatar-placeholder">
                  <User size={12} />
                </div>
              )}
              <span className="pill-name">{driver.BroadcastName}</span>
              <button
                className="pill-remove"
                onClick={() => onRemoveDriver(driver.DriverNumber)}
                aria-label={`Remove ${driver.BroadcastName}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div className="search-input-wrapper">
        <Search size={18} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleInputFocus}
          placeholder={
            canAddMore
              ? placeholder
              : `Maximum ${maxDrivers} drivers selected`
          }
          className="search-input"
          disabled={!canAddMore && selectedDriverNumbers.length >= maxDrivers}
        />
        {searchQuery && (
          <button className="clear-search" onClick={handleClearSearch}>
            <X size={16} />
          </button>
        )}
        <ChevronDown
          size={18}
          className={`dropdown-icon ${isOpen ? 'open' : ''}`}
        />
      </div>

      {/* Dropdown List */}
      {isOpen && (
        <div className="dropdown-list">
          {filteredDrivers.length === 0 ? (
            <div className="no-results">
              <Search size={20} />
              <span>No drivers found</span>
            </div>
          ) : (
            Object.entries(groupedDrivers).map(([teamName, teamDrivers]) => (
              <div key={teamName} className="team-group">
                <div
                  className="team-header"
                  style={{
                    borderLeftColor: teamDrivers[0]?.TeamColor || '#444',
                  }}
                >
                  {teamName}
                </div>
                {teamDrivers.map((driver) => {
                  const isSelected = selectedDriverNumbers.includes(
                    driver.DriverNumber
                  );
                  const isDisabled = !canAddMore && !isSelected;

                  return (
                    <button
                      key={driver.DriverNumber}
                      className={`driver-option ${isSelected ? 'selected' : ''} ${
                        isDisabled ? 'disabled' : ''
                      }`}
                      onClick={() => handleDriverClick(driver)}
                      disabled={isDisabled}
                    >
                      <div className="driver-option-left">
                        {driver.HeadshotUrl ? (
                          <img
                            src={driver.HeadshotUrl}
                            alt={driver.BroadcastName}
                            className="option-avatar"
                          />
                        ) : (
                          <div
                            className="option-avatar-placeholder"
                            style={{ borderColor: driver.TeamColor || '#444' }}
                          >
                            <User size={16} />
                          </div>
                        )}
                        <div className="option-info">
                          <span className="option-name">{driver.FullName}</span>
                          <span className="option-number">#{driver.DriverNumber}</span>
                        </div>
                      </div>
                      <div className="driver-option-right">
                        {isSelected ? (
                          <div className="selected-indicator">
                            <Check size={16} />
                          </div>
                        ) : (
                          <div className="add-indicator">
                            <Plus size={16} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        .driver-search-container {
          position: relative;
          width: 100%;
          max-width: 480px;
        }

        /* Selected Pills */
        .selected-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .selected-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px 6px 6px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid;
          border-radius: 24px;
          font-size: 0.85rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          transition: all 0.15s ease;
        }

        .selected-pill:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .pill-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
        }

        .pill-avatar-placeholder {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.5);
        }

        .pill-name {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pill-remove {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          transition: all 0.15s ease;
          cursor: pointer;
          border: none;
        }

        .pill-remove:hover {
          background: rgba(239, 68, 68, 0.4);
        }

        /* Search Input */
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          color: rgba(255, 255, 255, 0.4);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 14px 80px 14px 44px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.95);
          outline: none;
          transition: all 0.2s ease;
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .search-input:focus {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.2);
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
        }

        .search-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .clear-search {
          position: absolute;
          right: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }

        .clear-search:hover {
          background: rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.9);
        }

        .dropdown-icon {
          position: absolute;
          right: 14px;
          color: rgba(255, 255, 255, 0.4);
          transition: transform 0.2s ease;
          pointer-events: none;
        }

        .dropdown-icon.open {
          transform: rotate(180deg);
        }

        /* Dropdown List */
        .dropdown-list {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          max-height: 360px;
          overflow-y: auto;
          background: #18181b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          z-index: 100;
          animation: dropdownFadeIn 0.15s ease;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-list::-webkit-scrollbar {
          width: 8px;
        }

        .dropdown-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .dropdown-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .dropdown-list::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        /* No Results */
        .no-results {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 32px;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.9rem;
        }

        /* Team Group */
        .team-group {
          padding: 4px 0;
        }

        .team-group:not(:last-child) {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .team-header {
          padding: 8px 16px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.5);
          background: rgba(255, 255, 255, 0.02);
          border-left: 3px solid;
        }

        /* Driver Option */
        .driver-option {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .driver-option:hover:not(.disabled) {
          background: rgba(255, 255, 255, 0.06);
        }

        .driver-option.selected {
          background: rgba(74, 222, 128, 0.1);
        }

        .driver-option.selected:hover {
          background: rgba(239, 68, 68, 0.15);
        }

        .driver-option.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .driver-option-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .option-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          background: #27272a;
        }

        .option-avatar-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          border: 2px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.4);
        }

        .option-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .option-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.95);
        }

        .option-number {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 500;
        }

        .driver-option-right {
          display: flex;
          align-items: center;
        }

        .selected-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
        }

        .add-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.4);
          transition: all 0.15s ease;
        }

        .driver-option:hover:not(.disabled):not(.selected) .add-indicator {
          background: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.8);
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
          .driver-search-container {
            max-width: 100%;
          }

          .search-input {
            padding: 12px 70px 12px 40px;
            font-size: 0.9rem;
          }

          .pill-name {
            max-width: 80px;
          }

          .option-avatar {
            width: 32px;
            height: 32px;
          }

          .option-avatar-placeholder {
            width: 32px;
            height: 32px;
          }
        }
      `}</style>
    </div>
  );
};


