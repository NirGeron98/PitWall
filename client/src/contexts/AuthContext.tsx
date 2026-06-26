import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import type { User, Favorite } from '../types/auth';
import {
  registerTokenGetter,
  getFavorites,
  addFavorite,
  removeFavorite,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean; // session bootstrap (Clerk loading)
  favorites: Favorite[];
  favoriteDriverIds: string[];
  logout: () => Promise<void>;
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
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Map the Clerk user onto the app's existing User shape so downstream
  // components (Header, pages) keep working unchanged.
  const user: User | null = useMemo(() => {
    if (!isSignedIn || !clerkUser) return null;
    return {
      id: 0, // backend owns the numeric id; UI only reads email/full_name
      email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
      full_name: clerkUser.fullName ?? clerkUser.firstName ?? null,
    };
  }, [isSignedIn, clerkUser]);

  const favoriteDriverIds = useMemo(
    () => favorites.filter((f) => f.driver_id).map((f) => String(f.driver_id)),
    [favorites]
  );

  // Feed Clerk session tokens to the axios request interceptor.
  useEffect(() => {
    registerTokenGetter(() => getToken());
    return () => registerTokenGetter(null);
  }, [getToken]);

  const hydrateFavorites = async () => {
    try {
      const data = await getFavorites();
      setFavorites(data);
    } catch (err) {
      console.error('Failed to load favorites', err);
    }
  };

  // Load favorites once Clerk reports a signed-in session; clear on sign-out.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      hydrateFavorites();
    } else {
      setFavorites([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const logout = async () => {
    setFavorites([]);
    await signOut();
  };

  const refreshFavorites = async () => {
    await hydrateFavorites();
  };

  const toggleFavorite = async (driverId: string) => {
    if (!isSignedIn) {
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: !isLoaded,
        favorites,
        favoriteDriverIds,
        logout,
        refreshFavorites,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
