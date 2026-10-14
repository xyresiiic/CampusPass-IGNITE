import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./useAuth";

interface GuardProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: GuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        <span>Loading CampusPass...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: GuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role !== "admin") {
    return <Navigate to="/check-in" replace />;
  }

  return <>{children}</>;
}

export function StaffRoute({ children }: GuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role !== "staff") {
    return <Navigate to="/admin/overview" replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: GuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated && user) {
    if (user.role === "admin") {
      return <Navigate to="/admin/overview" replace />;
    }
    return <Navigate to="/check-in" replace />;
  }

  return <>{children}</>;
}
