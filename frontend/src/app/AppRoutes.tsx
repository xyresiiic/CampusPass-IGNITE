import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminRoute, ProtectedRoute, PublicOnlyRoute, StaffRoute } from "../auth";
import { Spinner } from "../components/ui";

const LoginPage = lazy(() => import("../features/login/LoginPage"));
const CheckInPage = lazy(() => import("../features/verify/CheckInPage"));
const PrivacyPage = lazy(() => import("../features/privacy/PrivacyPage"));
const AdminLayout = lazy(() => import("../features/admin/AdminLayout"));
const OverviewPage = lazy(() => import("../features/admin/overview/OverviewPage"));
const StaffPage = lazy(() => import("../features/admin/staff/StaffPage"));
const HistoryPage = lazy(() => import("../features/admin/history/HistoryPage"));
const RequestsPage = lazy(() => import("../features/admin/requests/RequestsPage"));
const NotificationsPage = lazy(() => import("../features/admin/notifications/NotificationsPage"));
const AuditPage = lazy(() => import("../features/admin/audit/AuditPage"));
const AlertsPage = lazy(() => import("../features/admin/alerts/AlertsPage"));

function RouteSuspenseFallback() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "var(--space-3)",
        background: "var(--surface-bg)",
        color: "var(--text-muted)",
      }}
    >
      <Spinner size={32} color="var(--brand-primary)" />
      <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, fontFamily: "var(--font-display)" }}>
        Loading CampusPass...
      </span>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-bg)",
        padding: "var(--space-6)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-4xl)",
          fontWeight: 700,
          color: "var(--brand-primary)",
          marginBottom: "var(--space-2)",
        }}
      >
        404
      </div>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-2)" }}>Page Not Found</h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "420px", marginBottom: "var(--space-5)" }}>
        The page URL you requested does not exist or has been relocated within the CampusPass system.
      </p>
      <Navigate to="/login" replace />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteSuspenseFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/check-in"
          element={
            <StaffRoute>
              <CheckInPage />
            </StaffRoute>
          }
        />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="alerts" element={<AlertsPage />} />
        </Route>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/check-in" replace />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
