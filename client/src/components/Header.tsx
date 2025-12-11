import React, { useEffect, useState } from 'react';
import { LogOut, Calendar, User } from 'lucide-react';
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
  userName?: string;
  navItems: NavItem[];
}

export const Header: React.FC<Props> = ({ year, onYearChange, userEmail, userName, navItems }) => {
  const { logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
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
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', alignItems: 'center', gap: '16px' }}>
        {/* Brand */}
        <div className="flex-row items-center" style={{ gap: '12px' }}>
          <div className="brand" style={{ fontSize: '1.5rem', lineHeight: 1 }}>
            PIT<span style={{ color: 'var(--accent-red)' }}>WALL</span>
          </div>
          <div className="pill ghost" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
            BETA v2.0
          </div>
        </div>

        {/* Navigation */}
        <nav className="nav-links" style={{ justifyContent: 'center', gap: '10px' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link key={item.path} to={item.path} className={`nav-link ${isActive ? 'active' : ''}`}>
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex-row items-center" style={{ gap: '16px', justifyContent: 'flex-end' }}>

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
            <div className="flex-row items-center" style={{ gap: '12px' }}>
              <div className="flex-row items-center hidden-mobile" style={{ gap: '8px', padding: '6px 12px', background: 'var(--bg-subtle)', borderRadius: '99px', border: '1px solid var(--border)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{userName || userEmail.split('@')[0]}</span>
              </div>
              <button
                onClick={logout}
                className="btn-reset flex-row items-center"
                style={{ color: 'var(--accent-red)', padding: '8px' }}
                title="Sign Out"
              >
                <LogOut size={20} className="hover-red" />
              </button>
            </div>
          ) : (
            <div className="flex-row items-center" style={{ gap: '8px', opacity: 0.5 }}>
              <User size={20} />
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 960px) {
          .nav-links { display: none; }
        }
        @media (max-width: 640px) {
          .hidden-mobile { display: none !important; }
        }
        .hover-red:hover { color: var(--accent-red); }
      `}</style>
    </header>
  );
};
