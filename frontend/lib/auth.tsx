"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiLogin, apiPost } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, orgName: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("geolift_token") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    apiGet<User>("/api/auth/me")
      .then(setUser)
      .catch(() => window.localStorage.removeItem("geolift_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiLogin(email, password);
    window.localStorage.setItem("geolift_token", data.access_token);
    setUser(data.user as User);
  }

  async function register(email: string, password: string, fullName: string, orgName: string) {
    const data = await apiPost<{ access_token: string; user: User }>("/api/auth/register", {
      email,
      password,
      full_name: fullName,
      organization_name: orgName,
    });
    window.localStorage.setItem("geolift_token", data.access_token);
    setUser(data.user);
  }

  function logout() {
    window.localStorage.removeItem("geolift_token");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.replace("/login");
    }
  }, [auth.loading, auth.user, router]);

  return auth;
}
