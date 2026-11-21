'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { IUser, LoginInput, RegisterInput } from '@rentease/shared';

interface AuthContextValue {
  user: IUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<IUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        setUser(null);
        setAccessToken(null);
        return false;
      }

      const data = await res.json();
      if (data.success && data.data) {
        setUser(data.data.user);
        setAccessToken(data.data.accessToken);
        return true;
      }
      return false;
    } catch {
      setUser(null);
      setAccessToken(null);
      return false;
    }
  }, []);

  // Initial silent refresh on app boot
  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      await refreshSession();
      if (mounted) {
        setIsLoading(false);
      }
    }
    initAuth();
    return () => {
      mounted = false;
    };
  }, [refreshSession]);

  // Periodic silent refresh before 15m access token expiry (every 12 minutes)
  useEffect(() => {
    if (!accessToken) return;
    const interval = setInterval(
      () => {
        refreshSession();
      },
      12 * 60 * 1000
    );
    return () => clearInterval(interval);
  }, [accessToken, refreshSession]);

  const login = async (input: LoginInput): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Login failed. Please check your credentials.');
    }

    setUser(data.data.user);
    setAccessToken(data.data.accessToken);
  };

  const register = async (input: RegisterInput): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Registration failed.');
    }

    setUser(data.data.user);
    setAccessToken(data.data.accessToken);
  };

  const googleLogin = async (credential: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Google authentication failed.');
    }

    setUser(data.data.user);
    setAccessToken(data.data.accessToken);
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
      });
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  const logoutAll = async (): Promise<void> => {
    try {
      if (accessToken) {
        await fetch(`${API_BASE}/auth/logout-all`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'include',
        });
      }
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        register,
        googleLogin,
        logout,
        logoutAll,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
