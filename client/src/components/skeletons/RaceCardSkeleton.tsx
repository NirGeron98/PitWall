import React from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export const RaceCardSkeleton: React.FC = () => {
    return (
        <Card style={{ height: '200px' }}>
            <CardHeader className="flex-row justify-between items-start" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
                <Skeleton width="60px" height="1em" />
                <Skeleton width="50px" height="20px" variant="rect" style={{ borderRadius: '999px' }} />
            </CardHeader>

            <CardBody className="flex-col" style={{ paddingTop: 0, gap: '8px' }}>
                <Skeleton width="70%" height="2rem" />
                <Skeleton width="50%" height="1em" />
            </CardBody>

            <CardFooter className="flex-row justify-between">
                <Skeleton width="80px" height="1em" />
                <Skeleton width="100px" height="1em" />
            </CardFooter>
        </Card>
    );
};
