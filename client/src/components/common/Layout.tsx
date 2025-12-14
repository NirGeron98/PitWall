// src/components/common/Layout.tsx

import React from 'react';

interface ContainerProps {
  children: React.ReactNode;
  wide?: boolean; // allows wider layouts when needed
  className?: string;
  as?: React.ElementType; // optional tag override for non-main contexts
}

export const AppContainer: React.FC<ContainerProps> = ({ children, wide, className, as: Component = 'main' }) => {
  return (
    <Component className={`app-container ${wide ? 'app-main--wide' : ''} ${className || ''}`.trim()}>
      {children}
    </Component>
  );
};

interface GridProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const FluidGrid: React.FC<GridProps> = ({ children, className, style }) => {
  return (
    <div className={`grid-fluid ${className || ''}`.trim()} style={style}>
      {children}
    </div>
  );
};

// Generic Card wrapper to standardize usage (optional utility)
interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ children, className, style }) => {
  return (
    <div className={`card ${className || ''}`.trim()} style={style}>
      {children}
    </div>
  );
};
