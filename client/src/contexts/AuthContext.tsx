import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Favorite } from '../types/auth';
import {
  loginUser,
  registerUser,
  fetchMe,
  setAuthToken,
  getFavorites,
  addFavorite,
  removeFavorite,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean; // session bootstrap
  processing: boolean; // active auth action
  favorites: Favorite[];
  favoriteDriverIds: string[];
  login: (email: string, password: string) => Promise<User | null>;
  register: (email: string, password: string, fullName?: string) => Promise<User | null>;
  logout: () => void;
  refreshFavorites: () => Promise<void>;
  toggleFavorite: (driverId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

interface Props {
  children: ReactNode;
}

export const AuthProvider: React.FC<Props> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pitwall_token'));
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const favoriteDriverIds = useMemo(
    () => favorites.filter((f) => f.driver_id).map((f) => String(f.driver_id)),
    [favorites]
  );

  const hydrateFavorites = async (activeToken?: string | null) => {
    const effectiveToken = activeToken ?? token;
    if (!effectiveToken) return;
    try {
      const data = await getFavorites();
      setFavorites(data);
    } catch (err) {
      console.error('Failed to load favorites', err);
    }
  };

  const bootstrapSession = async (activeToken: string, activeUser: User) => {
    setToken(activeToken);
    setUser(activeUser);
    localStorage.setItem('pitwall_token', activeToken);
    setAuthToken(activeToken);
    await hydrateFavorites(activeToken);
  };

  const login = async (email: string, password: string): Promise<User | null> => {
    setProcessing(true);
    try {
      const res = await loginUser(email, password);
      await bootstrapSession(res.access_token, res.user);
      return res.user;
    } catch (err) {
      console.error('Login failed', err);
      throw err;
    } finally {
      setProcessing(false);
    }
  };

  const register = async (email: string, password: string, fullName?: string): Promise<User | null> => {
    setProcessing(true);
    try {
      const res = await registerUser(email, password, fullName);
      await bootstrapSession(res.access_token, res.user);
      return res.user;
    } catch (err) {
      console.error('Registration failed', err);
      throw err;
    } finally {
      setProcessing(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setFavorites([]);
    localStorage.removeItem('pitwall_token');
    setAuthToken(null);
  };

  const refreshFavorites = async () => {
    await hydrateFavorites();
  };

  const toggleFavorite = async (driverId: string) => {
    if (!user) {
      throw new Error('Not authenticated');
    }
    const existing = favorites.find((f) => f.driver_id === driverId);
    try {
      if (existing) {
        await removeFavorite(existing.id);
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
      } else {
        const created = await addFavorite({ driver_id: driverId });
        setFavorites((prev) => [...prev, created]);
      }
    } catch (err) {
      console.error('Failed to toggle favorite', err);
      throw err;
    }
  };

  useEffect(() => {
    setAuthToken(token);
    const init = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setUser(me);
        await hydrateFavorites(token);
      } catch (err) {
        console.error('Session bootstrap failed', err);
        logout();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        processing,
        favorites,
        favoriteDriverIds,
        login,
        register,
        logout,
        refreshFavorites,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
