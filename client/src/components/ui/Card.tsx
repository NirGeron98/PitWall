import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
    return (
        <div
            className={`card ${className} ${props.onClick ? 'clickable' : ''}`}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
    <div className={`card-header ${className}`} {...props}>{children}</div>
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
    <div className={`card-body ${className}`} {...props}>{children}</div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
    <div className={`card-footer ${className}`} {...props}>{children}</div>
);
