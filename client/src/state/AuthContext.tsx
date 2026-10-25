import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { get, post } from "../lib/api";

export interface Me {
  id: string;
  name: string;
  username: string;
  needsSetupWizard: boolean;
  settings?: CompanySettings;
}

export interface CompanySettings {
  companyName: string;
  phone?: string;
  address?: string;
  language: "en" | "hi" | "gu";
  currency: string;
  timezone: string;
  reportFooter?: string;
  setupCompleted: boolean;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ me: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await get<Me>("/api/auth/me");
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await post("/api/auth/logout");
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
