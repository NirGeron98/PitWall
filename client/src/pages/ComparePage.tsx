import React from "react";
import { DriverCompare } from "../components/DriverCompare";
import type { Driver, DriverSeasonStats } from "../types/f1";

interface Props {
  drivers: Driver[];
  statsMap: Record<string, DriverSeasonStats | null>;
  loading: boolean;
  onClear: () => void;
}

export const ComparePage: React.FC<Props> = (props) => {
  return <DriverCompare {...props} />;
};
