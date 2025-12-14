import React, { useState } from 'react';
import { Trophy, Shield } from 'lucide-react';
import type { DriverStanding, TeamStanding } from '../types/f1';
import { useData } from '../contexts/DataContext';

interface Props {
  onDriverSelect?: (driverNumber: string) => void;
}

export const StandingsView: React.FC<Props> = ({ onDriverSelect }) => {
  const [view, setView] = useState<'drivers' | 'teams'>('drivers');
  const { driverStandings, teamStandings } = useData();

  const data: (DriverStanding | TeamStanding)[] =
    view === 'drivers' ? driverStandings : teamStandings;

  const getMedalClass = (position: number) => {
    if (position === 1) return 'medal-gold';
    if (position === 2) return 'medal-silver';
    if (position === 3) return 'medal-bronze';
    return 'medal-default';
  };

  return (
    <div className="standings-wrapper">
      {/* Toggle Buttons */}
      <div className="flex-row standings-toggle">
        <button
          className={`btn-tab ${view === 'drivers' ? 'active' : ''}`}
          onClick={() => setView('drivers')}
          style={{
            background:
              view === 'drivers' ? 'var(--accent-red)' : 'rgba(225, 6, 0, 0.1)',
            color: view === 'drivers' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <Trophy size={18} style={{ marginRight: 8 }} />
          Drivers Championship
        </button>
        <button
          className={`btn-tab ${view === 'teams' ? 'active' : ''}`}
          onClick={() => setView('teams')}
          style={{
            background:
              view === 'teams' ? 'var(--accent-red)' : 'rgba(225, 6, 0, 0.1)',
            color: view === 'teams' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <Shield size={18} style={{ marginRight: 8 }} />
          Constructors Championship
        </button>
      </div>

      {/* Table */}
      <div className="card standings-card">
        <table
          className="table-compact table-desktop"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '2px solid var(--border)',
                backgroundColor: 'var(--bg-subtle)',
              }}
            >
              <th
                style={{
                  padding: '16px 20px',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                POS
              </th>
              <th
                style={{
                  padding: '16px 20px',
                  textAlign: 'left',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                {view === 'drivers' ? 'DRIVER' : 'TEAM'}
              </th>
              {view === 'drivers' && (
                <th
                  style={{
                    padding: '16px 20px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    letterSpacing: '0.5px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  TEAM
                </th>
              )}
              <th
                style={{
                  padding: '16px 20px',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                WINS
              </th>
              <th
                style={{
                  padding: '16px 20px',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  letterSpacing: '0.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                POINTS
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((item: any, idx) => (
              <tr
                key={idx}
                className={`table-row-hover ${
                  view === 'drivers' ? 'clickable-row' : ''
                }`}
                onClick={() => {
                  if (view === 'drivers' && onDriverSelect && item.driverNumber) {
                    onDriverSelect(item.driverNumber);
                  }
                }}
                style={{
                  borderBottom: '1px solid var(--border)',
                  transition: 'background-color 0.2s',
                }}
              >
                <td
                  style={{
                    padding: '16px 20px',
                    textAlign: 'center',
                    fontWeight: 700,
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background:
                        item.position === 1
                          ? '#FFD700'
                          : item.position === 2
                          ? '#C0C0C0'
                          : item.position === 3
                          ? '#CD7F32'
                          : 'var(--bg-highlight)',
                      color: item.position <= 3 ? '#000' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                    }}
                  >
                    {item.position}
                  </div>
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <div className="flex-row" style={{ gap: 12, alignItems: 'center' }}>
                    {view === 'drivers' && item.headshotUrl && (
                      <img
                        src={item.headshotUrl}
                        alt={item.familyName}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid var(--border)',
                        }}
                      />
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {view === 'drivers' ? item.broadcastName : item.constructorName}
                      </div>
                      {view === 'drivers' && (
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.8rem', marginTop: '2px' }}
                        >
                          {item.givenName} {item.familyName}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {view === 'drivers' && (
                  <td
                    style={{
                      padding: '16px 20px',
                      fontSize: '0.9rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {item.constructorName || item.teamName || '—'}
                  </td>
                )}
                <td
                  style={{
                    padding: '16px 20px',
                    textAlign: 'center',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                  }}
                >
                  {item.wins}
                </td>
                <td
                  style={{
                    padding: '16px 20px',
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    color: item.position <= 3 ? 'var(--accent-red)' : 'inherit',
                  }}
                >
                  {item.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mobile-list">
          {data.map((item: any, idx) => {
            const medalClass = getMedalClass(item.position);

            return (
              <div
                key={idx}
                className="mobile-row standing-row"
                onClick={() => {
                  if (view === 'drivers' && onDriverSelect && item.driverNumber) {
                    onDriverSelect(item.driverNumber);
                  }
                }}
                style={{ cursor: view === 'drivers' ? 'pointer' : 'default' }}
              >
                <div className="standing-left">
                  <div className={`standing-pos ${medalClass}`}>P{item.position}</div>
                  {view === 'drivers' && item.headshotUrl && (
                    <img
                      src={item.headshotUrl}
                      alt={item.familyName}
                      className="driver-avatar-small"
                    />
                  )}
                  <div>
                    <div className="standing-name">
                      {view === 'drivers' ? `${item.givenName} ${item.familyName}` : item.constructorName}
                    </div>
                    <div className="text-muted standing-sub">
                      {view === 'drivers' ? item.constructorName || item.teamName : item.nationality}
                    </div>
                  </div>
                </div>
                <div className="standing-right">
                  <div className="standing-points">{item.points} pts</div>
                  <div className="pill ghost standing-wins">{item.wins} wins</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
