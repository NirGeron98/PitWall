import React from "react";
import type { Driver } from "../types/f1";
import { FavoritesView } from "../components/FavoritesView";

interface Props {
  drivers: Driver[];
  favoriteDriverIds: string[];
  onToggleFavorite: (id: string) => void;
  onSelectDriver: (driver: Driver) => void;
  onOpenTelemetry: (driver: Driver) => void;
}

export const FavoritesPage: React.FC<Props> = (props) => {
  return <FavoritesView {...props} />;
};
