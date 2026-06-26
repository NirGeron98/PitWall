import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Card, CardBody, CardHeader } from '../ui/Card';

export const AnalysisSkeleton: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            {/* Top Stats Grid Skeleton */}
            <div className="analysis-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px' }}>
                            <Skeleton variant="text" width="60%" height="16px" />
                            <Skeleton variant="rect" width="80%" height="32px" />
                            <Skeleton variant="text" width="40%" height="12px" />
                        </CardBody>
                    </Card>
                ))}
            </div>

            {/* Main Chart Skeleton */}
            <Card>
                <CardHeader style={{ padding: '24px 24px 0 24px' }}>
                    <Skeleton variant="text" width="30%" height="24px" />
                    <Skeleton variant="text" width="50%" height="16px" style={{ marginTop: '8px' }} />
                </CardHeader>
                <CardBody style={{ padding: '24px' }}>
                    <Skeleton variant="rect" width="100%" height="400px" style={{ borderRadius: '8px' }} />
                </CardBody>
            </Card>

            {/* Sub Chart Skeleton */}
            <Card>
                <CardHeader style={{ padding: '24px 24px 0 24px' }}>
                    <Skeleton variant="text" width="40%" height="24px" />
                </CardHeader>
                <CardBody style={{ padding: '24px' }}>
                    <Skeleton variant="rect" width="100%" height="400px" style={{ borderRadius: '8px' }} />
                </CardBody>
            </Card>
        </div>
    );
};
