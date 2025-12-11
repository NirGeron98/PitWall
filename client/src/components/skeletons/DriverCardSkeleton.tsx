import React from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export const DriverCardSkeleton: React.FC = () => {
    return (
        <Card style={{ height: '180px' }}>
            <CardHeader className="flex-row justify-between items-center" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
                <Skeleton width="40px" height="1.5em" />
                <Skeleton width="24px" height="24px" variant="circle" />
            </CardHeader>

            <CardBody className="flex-row items-center" style={{ gap: '16px', paddingTop: 0 }}>
                <Skeleton variant="circle" width="64px" height="64px" />
                <div className="flex-col" style={{ gap: '8px', flex: 1 }}>
                    <Skeleton width="80%" height="1.2em" />
                    <Skeleton width="50%" height="0.9em" />
                </div>
            </CardBody>

            <CardFooter className="flex-row justify-between">
                <Skeleton width="60px" height="1em" />
                <Skeleton width="60px" height="1.5em" />
            </CardFooter>
        </Card>
    );
};
