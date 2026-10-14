import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setApiAuthToken, setUnauthorizedListener } from "../api/client";
import type { UserRole } from "../types";
import { AuthContext, type AuthContextType, type AuthUser } from "./context";

const STORAGE_KEY = "campuspass_auth_session";

function getStoredSession(): { token: string; user: AuthUser } | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { token: string; staff_id: string; role: UserRole };
      if (parsed.token && parsed.staff_id && parsed.role) {
        setApiAuthToken(parsed.token);
        return {
          token: parsed.token,
          user: { staff_id: parsed.staff_id, role: parsed.role },
        };
      }
    }
  } catch {
    // Storage access restricted
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialSession = useMemo(() => getStoredSession(), []);

  const [token, setToken] = useState<string | null>(initialSession?.token ?? null);
  const [user, setUser] = useState<AuthUser | null>(initialSession?.user ?? null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  const logout = useCallback((expiredMessage?: string) => {
    setToken(null);
    setUser(null);
    setApiAuthToken(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage access error
    }
    if (expiredMessage) {
      setSessionExpiredNotice(expiredMessage);
    }
  }, []);

  const login = useCallback((newToken: string, staff_id: string, role: UserRole) => {
    setToken(newToken);
    const authUser: AuthUser = { staff_id, role };
    setUser(authUser);
    setApiAuthToken(newToken);
    setSessionExpiredNotice(null);
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: newToken, staff_id, role })
      );
    } catch {
      // Storage access error
    }
  }, []);

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(null);
  }, []);

  useEffect(() => {
    setUnauthorizedListener(() => {
      logout("Your session has expired. Please log in again.");
    });
    return () => {
      setUnauthorizedListener(null);
    };
  }, [logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading: false,
      login,
      logout,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
    }),
    [user, token, login, logout, sessionExpiredNotice, clearSessionExpiredNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
