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
          <div className="brand" style={{ fontSize: '1.5rem', lineHeight: 1 }}>
            PIT<span style={{ color: 'var(--accent-red)' }}>WALL</span>
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

          {/* Season Selector */}
          <div className="flex-row items-center" style={{ gap: '8px' }}>
            <span className="text-muted text-xs font-bold uppercase tracking-wider hidden-mobile">Season</span>
            <div style={{ position: 'relative' }}>
              <select
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="year-select"
                style={{
                  appearance: 'none',
                  paddingRight: '32px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  fontWeight: 700
                }}
              >
                <option value={2020}>2020</option>
                <option value={2021}>2021</option>
                <option value={2022}>2022</option>
                <option value={2023}>2023</option>
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
              </select>
              <Calendar size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* User Profile */}
          {userEmail ? (
            <button
              onClick={logout}
              className="btn-reset flex-row items-center"
              style={{ color: 'var(--accent-red)', padding: '8px', gap: '6px', fontWeight: 600 }}
              title="Sign Out"
            >
              <LogOut size={20} className="hover-red" />
              <span className="hidden-mobile">Sign out</span>
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
          </div>
        )}
      </div>
      <style>{`
        .header-grid {
          display: grid;
          grid-template-columns: 1fr 2fr 1fr;
          align-items: center;
          gap: 16px;
        }

        .header-nav {
          justify-content: center;
          gap: 10px;
        }

        .header-actions {
          gap: 16px;
          justify-content: flex-end;
        }

        @media (max-width: 960px) {
          .app-header {
            height: auto;
            padding-top: var(--space-3);
            padding-bottom: var(--space-3);
          }

          .header-grid {
            grid-template-columns: 1fr;
            row-gap: 12px;
            position: relative;
          }

          .header-nav {
            display: none;
          }

          .header-actions {
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 10px;
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
            margin-left: 8px;
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
        }

        @media (max-width: 640px) {
          .hidden-mobile { display: none !important; }
        }

        @media (min-width: 961px) {
          .mobile-menu-btn { display: none; }
          .mobile-nav-panel { display: none; }
        }
        .hover-red:hover { color: var(--accent-red); }
      `}</style>
    </header>
  );
};
