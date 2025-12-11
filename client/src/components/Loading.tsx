import React from 'react';

interface LoadingProps {
  message?: string;
}

export const Loading: React.FC<LoadingProps> = ({ message }) => {
  return (
    <div className="cute-loader">
      <div className="orbital">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>
      <div className="loading-text">
        {message || 'Loading...'}
      </div>
    </div>
  );
};
