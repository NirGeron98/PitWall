import React, { useEffect, useMemo, useState } from 'react';

export interface DriverAvatarProps {
  name: string;
  url?: string | null;
  teamColor?: string | null;
  className?: string;
  alt?: string;
  title?: string;
  style?: React.CSSProperties;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';

  const parts = trimmed
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}

export const DriverAvatar: React.FC<DriverAvatarProps> = ({
  name,
  url,
  teamColor,
  className,
  alt,
  title,
  style,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  const safeUrl = typeof url === 'string' ? url.trim() : '';
  const initials = useMemo(() => getInitials(name), [name]);

  useEffect(() => {
    setImageFailed(false);
  }, [safeUrl]);

  const imgStyle: React.CSSProperties = {
    ...(teamColor ? { borderColor: teamColor } : null),
    ...style,
  };

  const fallbackStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundImage: 'linear-gradient(135deg, #222, #444)',
    ...(teamColor ? { border: `2px solid ${teamColor}` } : null),
    ...style,
  };

  const label = alt || name;

  if (safeUrl && !imageFailed) {
    return (
      <img
        src={safeUrl}
        alt={label}
        title={title}
        className={className}
        style={imgStyle}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className={className} style={fallbackStyle} aria-label={label} title={title} role="img">
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 800,
          fontSize: '0.95rem',
          letterSpacing: '0.04em',
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          userSelect: 'none',
        }}
      >
        {initials || '—'}
      </span>
    </div>
  );
};
