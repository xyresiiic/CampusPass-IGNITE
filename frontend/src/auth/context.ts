import { createContext } from "react";
import type { UserRole } from "../types";

export interface AuthUser {
  staff_id: string;
  role: UserRole;
}

export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, staff_id: string, role: UserRole) => void;
  logout: (message?: string) => void;
  sessionExpiredNotice: string | null;
  clearSessionExpiredNotice: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
