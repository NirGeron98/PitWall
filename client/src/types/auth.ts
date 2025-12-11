export interface User {
  id: number;
  email: string;
  full_name?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Favorite {
  id: number;
  driver_id?: string | null;
  team_id?: string | null;
}
