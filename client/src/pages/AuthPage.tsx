import React, { useState } from 'react';
import { Loader2, ShieldCheck, Zap, Flag } from 'lucide-react';

interface Props {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, fullName?: string) => Promise<void>;
  loading: boolean;
  status?: string | null;
  error?: string | null;
}

export const AuthPage: React.FC<Props> = ({
  mode,
  onModeChange,
  onLogin,
  onRegister,
  loading,
  status,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === 'register' && password !== confirm) {
      setLocalError('Passwords must match');
      return;
    }

    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(email, password, fullName.trim());
      }
    } catch (err) {
      setLocalError('Authentication failed. Please try again.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Decor */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-10%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(225,6,0,0.15) 0%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none'
      }} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 2fr) minmax(300px, 3fr)',
        width: '100%',
        maxWidth: '1000px',
        background: 'rgba(24, 24, 27, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }} className="auth-container-responsive">

        {/* Left Side: Brand */}
        <div style={{
          padding: '48px',
          background: 'linear-gradient(135deg, rgba(24,24,27,0.95), rgba(9,9,11,1))',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRight: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
              <Flag color="var(--accent-red)" />
              <div className="brand" style={{ fontSize: '1.5rem' }}>PIT<span>WALL</span></div>
            </div>

            <h1 style={{ fontSize: '2.5rem', lineHeight: 1.1, marginBottom: '16px' }}>
              Precision Data for <span style={{ color: 'var(--accent-red)' }}>Race Strategy</span>
            </h1>
            <p className="text-muted" style={{ lineHeight: 1.6 }}>
              Access real-time telemetry, historical archives, and predictive analytics used by the pros. Your personalized paddock awaits.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <ShieldCheck size={18} color="#10b981" />
              <span>Enterprise Grade Security</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <Zap size={18} color="#f59e0b" />
              <span>Real-time Telemetry Uplink</span>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div style={{ padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>
                {mode === 'login' ? 'Welcome Back' : 'Join the Paddock'}
              </h2>
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                {mode === 'login'
                  ? 'Enter your credentials to access the telemetry feed.'
                  : 'Create an account to start tracking performance.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="flex-col" style={{ gap: '6px' }}>
                <label className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
                <input
                  type="email"
                  required
                  style={{ width: '100%' }}
                  className="search-input"
                  placeholder="engineer@pitwall.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="flex-col" style={{ gap: '6px' }}>
                <label className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
                <input
                  type="password"
                  required
                  style={{ width: '100%' }}
                  className="search-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {mode === 'register' && (
                <div className="flex-col" style={{ gap: '6px' }}>
                  <label className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</label>
                  <input
                    type="text"
                    required
                    style={{ width: '100%' }}
                    className="search-input"
                    placeholder="e.g. Ayrton Senna"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              )}

              {mode === 'register' && (
                <div className="flex-col" style={{ gap: '6px' }}>
                  <label className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm Password</label>
                  <input
                    type="password"
                    required
                    style={{ width: '100%' }}
                    className="search-input"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              )}

              {(localError || error) && (
                <div style={{
                  background: 'rgba(225, 6, 0, 0.1)',
                  border: '1px solid rgba(225, 6, 0, 0.2)',
                  color: '#ff4d4d',
                  fontSize: '0.9rem',
                  padding: '12px',
                  borderRadius: '8px'
                }}>
                  {localError || error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '8px',
                  background: 'var(--accent-red)',
                  color: 'white',
                  border: 'none',
                  padding: '14px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                {loading && <Loader2 className="spin" size={18} />}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
                className="btn-reset"
                style={{ color: 'var(--text-primary)', textDecoration: 'underline', fontWeight: 500 }}
              >
                {mode === 'login' ? 'Get Started' : 'Log In'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Stack Fix via inline media query simulation logic or simple stacked fallback? 
          Since we can't do media queries in inline styles easily without a library, 
          we'll rely on a basic flex-wrap in a style tag or a utility class if possible.
          But for now, I added 'auth-container-responsive' class trying to hook into something, 
          but actually let's just make sure it wraps if screen is small by adding flex-wrap to the grid container substitute?
          Grid is harder to make responsive inline.
          Let's stick to flexbox for the main container to ensure wrapping.
      */}
      <style>{`
        @media (max-width: 768px) {
          .auth-container-responsive {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {status && (
        <div className="auth-overlay">
          <div className="overlay-card">
            <Loader2 className="spin" size={26} color="var(--accent-red)" />
            <div>
              <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>Connecting...</p>
              <h4 style={{ margin: 0 }}>{status}</h4>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
