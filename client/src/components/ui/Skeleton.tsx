import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circle' | 'rect';
    width?: string | number;
    height?: string | number;
    style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'text',
    width,
    height,
    style = {}
}) => {
    const finalStyles: React.CSSProperties = {
        width: width,
        height: height,
        ...style
    };

    const baseClass = 'skeleton';
    const variantClass = variant === 'circle' ? 'skeleton-circle' :
        variant === 'rect' ? 'skeleton-rect' :
            'skeleton-text';

    return (
        <div
            className={`${baseClass} ${variantClass} ${className}`}
            style={finalStyles}
        />
    );
};
