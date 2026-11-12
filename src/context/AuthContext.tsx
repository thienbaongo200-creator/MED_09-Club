"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, setToken } from "@/lib/api";
import type { AuthResponse, ThanhVien, VaiTro } from "@/lib/types";

interface AuthContextType {
  user: ThanhVien | null;
  isLoading: boolean;
  hasRole: (...roles: VaiTro[]) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ThanhVien | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const token = window.localStorage.getItem("mediclub_access_token");
    if (!token) {
      Promise.resolve().then(() => { if (active) setIsLoading(false); });
      return () => { active = false; };
    }

    api.get<ThanhVien>("/auth/me")
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) setToken(null);
        setUser(null);
      })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<AuthResponse>("/auth/login", { email, password });
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: VaiTro[]) =>
    user !== null && roles.includes(user.vaiTro), [user]);

  const value = useMemo(() => ({ user, isLoading, hasRole, login, logout }),
    [user, isLoading, hasRole, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
