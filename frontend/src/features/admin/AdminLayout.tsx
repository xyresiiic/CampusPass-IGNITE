import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth";
import { usePolling, useTheme, useToast } from "../../hooks";
import { Button } from "../../components/ui";
import type { NotificationItem } from "../../types";
import "./admin.css";

const NAV_LINKS = [
  { path: "/admin/overview", label: "Dashboard", icon: "▦" },
  { path: "/admin/staff", label: "Staff Management", icon: "♙" },
  { path: "/admin/history", label: "Attendance History", icon: "▤" },
  { path: "/admin/requests", label: "Leave & Duty", icon: "📋" },
  { path: "/admin/notifications", label: "Notifications", icon: "🔔" },
  { path: "/admin/audit", label: "Audit Trail", icon: "🗂" },
  { path: "/admin/alerts", label: "Absence Alerts", icon: "⚠" },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Poll notifications every 60s
  usePolling(async () => {
    try {
      const data = await api.getNotifications(10);
      setNotifications(data.notifications || []);
      setUnreadNotifsCount(data.unread_count || 0);
    } catch {
      // silent
    }
  }, 60_000);

  async function handleMarkOneRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadNotifsCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadNotifsCount(0);
      toast.success("All notifications marked as read.");
    } catch {
      toast.error("Failed to mark all as read.");
    }
  }

  // Derive current page title from path
  const currentNav = NAV_LINKS.find((l) => location.pathname.startsWith(l.path));
  const pageTitle = currentNav?.label || "Admin Console";

  return (
    <div className="admin-shell">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          className="admin-mobile-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}
        aria-label="Admin Navigation"
      >
        <div>
          <div className="admin-sidebar-header">
            <Link to="/admin/overview" className="admin-sidebar-brand">
              <span className="brand-badge-logo" style={{ width: 34, height: 34, fontSize: 14 }} aria-hidden="true">
                CP
              </span>
              <div>
                <strong style={{ display: "block", fontSize: "var(--text-sm)" }}>CampusPass</strong>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Admin Workspace</span>
              </div>
            </Link>
          </div>

          <nav className="admin-sidebar-nav">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  `admin-nav-item ${isActive ? "active" : ""}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <span aria-hidden="true">{link.icon}</span>
                <span>{link.label}</span>
                {link.path === "/admin/notifications" && unreadNotifsCount > 0 && (
                  <span className="admin-nav-badge">{unreadNotifsCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-user-card">
            <div className="admin-avatar" aria-hidden="true">
              {user?.staff_id?.slice(0, 2) || "AD"}
            </div>
            <div className="admin-user-meta">
              <strong>{user?.staff_id}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <Button variant="outline" size="sm" fullWidth onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle navigation drawer"
            >
              ☰
            </button>
            <div className="admin-breadcrumbs">
              <span>CampusPass</span>
              <span aria-hidden="true">/</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{pageTitle}</span>
            </div>
          </div>

          <div className="admin-topbar-right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotifPanel((prev) => !prev)}
              aria-label={`View notifications (${unreadNotifsCount} unread)`}
              style={{ position: "relative" }}
            >
              🔔
              {unreadNotifsCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "var(--color-danger)",
                  }}
                  aria-hidden="true"
                />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "☀" : "☾"}
            </Button>
          </div>
        </header>

        {/* Slide-over Notification Panel */}
        {showNotifPanel && (
          <aside className="notif-panel" aria-label="Recent notifications">
            <div className="notif-panel-header">
              <strong style={{ fontSize: "var(--text-sm)" }}>
                Notifications ({unreadNotifsCount} unread)
              </strong>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {unreadNotifsCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => void handleMarkAllRead()}>
                    Mark read
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowNotifPanel(false)}>
                  ✕
                </Button>
              </div>
            </div>

            <div className="notif-panel-list">
              {notifications.length === 0 ? (
                <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                  No notifications recorded.
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`notif-card ${!n.is_read ? "unread" : ""}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
                      <strong style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)" }}>{n.title}</strong>
                      {!n.is_read && (
                        <button
                          type="button"
                          onClick={() => void handleMarkOneRead(n.id)}
                          style={{ fontSize: "11px", color: "var(--brand-primary)", textDecoration: "underline" }}
                        >
                          Read
                        </button>
                      )}
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Nested Admin Page Routes */}
        <main className="admin-content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
