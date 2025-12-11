import React from 'react';
import type { RaceEvent } from '../types/f1';
import { MapPin, Calendar } from 'lucide-react';
import { Card, CardHeader, CardFooter, CardBody } from './ui/Card';

interface Props {
  race: RaceEvent;
  onClick: (race: RaceEvent) => void;
}

export const RaceCard: React.FC<Props> = ({ race, onClick }) => {
  const raceDate = new Date(race.Session5Date || race.EventDate).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric'
  });

  const isSprint = race.EventFormat === 'sprint';

  return (
    <Card
      onClick={() => onClick(race)}
      className="clickable"
    >
      <CardHeader className="flex-row justify-between items-center">
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--accent-red)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase'
          }}
        >
          Round {race.RoundNumber}
        </span>
        {isSprint && (
          <span className="badge badge-blue">Sprint</span>
        )}
      </CardHeader>

      <CardBody>
        <h3 className="text-h2" style={{ margin: '0 0 8px', lineHeight: 1 }}>
          {race.Country}
        </h3>
        <p className="text-muted text-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {race.EventName}
        </p>
      </CardBody>

      <CardFooter className="flex-row justify-between text-muted">
        <div className="flex-row items-center">
          <Calendar size={14} style={{ marginRight: 6 }} />
          <span>{raceDate}</span>
        </div>
        <div className="flex-row items-center" style={{ maxWidth: '40%' }}>
          <MapPin size={14} style={{ marginRight: 6 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{race.Location}</span>
        </div>
      </CardFooter>
    </Card>
  );
};