import React, { useEffect, useState } from 'react';
import { LogOut, Calendar, User, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number }>;
}

interface Props {
  year: number;
  onYearChange: (year: number) => void;
  userEmail?: string;
  navItems: NavItem[];
}

export const Header: React.FC<Props> = ({ year, onYearChange, userEmail, navItems }) => {
  const { logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className="app-header"
      style={{
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
        background: 'rgba(9,9,11,0.9)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.3s ease',
        width: '100%',
      }}
    >
      <div className="container header-grid" style={{ position: 'relative' }}>
        {/* Brand */}
        <div className="flex-row items-center" style={{ gap: '12px' }}>
          <div className="brand-lockup">
            <span className="brand-pill">
              <span className="brand-pit">PIT</span>
              <span className="brand-wall">WALL</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="nav-links header-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex-row items-center header-actions">
          {/* Mobile Menu Toggle in first row */}
          <button
            className="btn-reset mobile-menu-btn"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Season Selector */}
          <div className="flex-row items-center season-picker" style={{ gap: '8px' }}>
            <span className="text-muted text-xs font-bold uppercase tracking-wider hidden-mobile">
              Season
            </span>
            <div className="year-select-wrap">
              <select
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="year-select"
                style={{
                  appearance: 'none',
                  paddingRight: '32px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  fontWeight: 700,
                }}
              >
                <option value={2020}>2020</option>
                <option value={2021}>2021</option>
                <option value={2022}>2022</option>
                <option value={2023}>2023</option>
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
              </select>
              <Calendar
                size={14}
                className="year-select-icon"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--text-secondary)',
                }}
              />
            </div>
          </div>

          {/* User Profile (desktop only) */}
          {userEmail ? (
            <button
              onClick={logout}
              className="btn-reset flex-row items-center hidden-mobile"
              style={{ color: 'var(--accent-red)', padding: '6px 8px', gap: '6px', fontWeight: 700, whiteSpace: 'nowrap', alignItems: 'center' }}
              title="Sign Out"
            >
              <LogOut size={20} className="hover-red" />
              <span>Sign out</span>
            </button>
          ) : (
            <div className="flex-row items-center" style={{ gap: '8px', opacity: 0.5 }}>
              <User size={20} />
            </div>
          )}

        </div>

        {/* Mobile Menu Panel */}
        {mobileNavOpen && (
          <div className="mobile-nav-panel">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-link mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
            {userEmail && (
              <button
                onClick={() => { setMobileNavOpen(false); logout(); }}
                className="btn-reset nav-link mobile-nav-link"
                style={{ justifyContent: 'flex-start', gap: '10px', color: 'var(--accent-red)', fontWeight: 700 }}
              >
                <LogOut size={18} />
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
      <style>{`
        .header-grid {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 12px;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
        }

        .brand-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
          border: 1px solid var(--border);
        }

        .brand-pit {
          font-weight: 800;
          color: #0b0b0d;
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 8px;
        }

        .brand-wall {
          font-weight: 900;
          color: var(--accent-red);
          letter-spacing: 0.02em;
        }

        .header-actions button {
          display: inline-flex;
          align-items: center;
        }

        .header-nav {
          justify-content: center;
          gap: 10px;
        }

        .header-actions {
          gap: 12px;
          justify-content: flex-end;
        }

        .year-select-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .header-actions .year-select {
          height: 38px;
          padding-top: 0;
          padding-bottom: 0;
        }

        @media (max-width: 960px) {
          .app-header {
            height: auto;
            padding-top: var(--space-3);
            padding-bottom: var(--space-3);
          }

          .header-grid {
            grid-template-columns: auto 1fr auto;
            row-gap: 8px;
            position: relative;
          }

          .header-nav {
            display: none;
          }

          .header-actions {
            justify-content: flex-end;
            gap: 8px;
            position: relative;
          }

          .mobile-menu-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: var(--bg-subtle);
            color: var(--text-primary);
          }

          .mobile-nav-panel {
            position: absolute;
            top: calc(100% + 6px);
            right: 0;
            left: auto;
            background: rgba(24, 24, 27, 0.98);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 18px 40px -16px rgba(0,0,0,0.6);
            z-index: 5;
            min-width: 180px;
          }

          .mobile-nav-link {
            width: 100%;
            justify-content: flex-start;
            border-radius: 10px;
            padding: 10px 12px;
          }

          .header-year-row {
            margin-top: 6px;
          }
        }

        @media (max-width: 640px) {
          .hidden-mobile { display: none !important; }
        }

        @media (min-width: 961px) {
          .header-actions .mobile-menu-btn { display: none; }
          .mobile-nav-panel { display: none; }
        }
        .hover-red:hover { color: var(--accent-red); }
      `}</style>
    </header>
  );
};
