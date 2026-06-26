import React from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';

interface Props {
  mode: 'login' | 'register';
}

// Clerk-hosted auth UI (email + Google). Registration and login are fully
// handled by Clerk; the surrounding container keeps the app's dark look.
const clerkAppearance = {
  variables: {
    colorPrimary: '#e10600',
    colorBackground: '#11141a',
    colorText: '#ffffff',
    colorInputBackground: '#1b1f27',
    colorInputText: '#ffffff',
    colorNeutral: '#ffffff',
    borderRadius: '10px',
  },
  elements: {
    // Social buttons (Google etc.) — white background so the logo is visible
    socialButtonsBlockButton: {
      backgroundColor: '#ffffff',
      color: '#11141a',
      border: '1px solid rgba(255,255,255,0.15)',
      '&:hover': { backgroundColor: '#f0f0f0' },
    },
    socialButtonsBlockButtonText: {
      color: '#11141a',
      fontWeight: '500',
    },
  },
};

export const AuthPage: React.FC<Props> = ({ mode }) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '24px',
        background: 'radial-gradient(circle at top, #1a1f29 0%, #0b0d12 60%)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', letterSpacing: '0.04em' }}>
          PIT<span style={{ color: 'var(--accent-red)' }}>WALL</span>
        </h1>
        <p className="text-muted" style={{ marginTop: '6px', fontSize: '0.9rem' }}>
          Formula 1 analytics — sign in to continue
        </p>
      </div>

      {mode === 'login' ? (
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/signup"
          forceRedirectUrl="/races"
          appearance={clerkAppearance}
        />
      ) : (
        <SignUp
          routing="path"
          path="/signup"
          signInUrl="/login"
          forceRedirectUrl="/races"
          appearance={clerkAppearance}
        />
      )}
    </div>
  );
};
