import React from "react";
import { StandingsView } from "../components/StandingsView";

interface Props {
  onDriverSelect?: (driverNumber: string) => void;
}

export const StandingsPage: React.FC<Props> = ({ onDriverSelect }) => {
  return <StandingsView onDriverSelect={onDriverSelect} />;
};
