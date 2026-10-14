import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { useToast } from "../../../hooks";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from "../../../components/ui";
import type { NotificationItem } from "../../../types";

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const toast = useToast();

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNotifications() {
    setIsLoading(true);
    try {
      const data = await api.getNotifications(50);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMarkOneRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error("Failed to mark notification as read.");
    }
  }

  async function handleMarkAllRead() {
    setIsMarkingAll(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read.");
    } catch {
      toast.error("Failed to mark all notifications as read.");
    } finally {
      setIsMarkingAll(false);
    }
  }

  function formatDateTime(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Header Bar */}
      <div className="admin-page-header">
        <div>
          <h1>System Notifications</h1>
          <p>Real-time updates, escalation notices, and administrative dispatch alerts.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button
            variant="outline"
            size="sm"
            disabled={isMarkingAll || unreadCount === 0}
            onClick={() => void handleMarkAllRead()}
          >
            Mark All as Read
          </Button>
          <Button variant="primary" size="sm" onClick={() => void loadNotifications()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </Button>
        </div>
      </div>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <div>
            <strong style={{ fontSize: "var(--text-base)" }}>Inbox</strong>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          {unreadCount > 0 && <Badge variant="warning">{unreadCount} Unread</Badge>}
        </CardHeader>

        <CardBody style={{ padding: 0 }}>
          {isLoading && notifications.length === 0 ? (
            <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Skeleton height="56px" />
              <Skeleton height="56px" />
              <Skeleton height="56px" />
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              title="No notifications"
              description="Your administrative inbox is all clear. No pending alerts."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: "var(--space-4) var(--space-6)",
                    borderBottom: "1px solid var(--border-subtle)",
                    background: n.is_read ? "var(--surface-card)" : "var(--brand-primary-soft)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "var(--space-4)",
                    transition: "background var(--duration-fast) var(--ease-standard)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                      <strong style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{n.title}</strong>
                      {!n.is_read && <Badge variant="info">New</Badge>}
                      <Badge variant="neutral" style={{ fontSize: "10px" }}>{n.type}</Badge>
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {n.message}
                    </p>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {formatDateTime(n.created_at)}
                    </span>
                  </div>

                  {!n.is_read && (
                    <Button variant="ghost" size="sm" onClick={() => void handleMarkOneRead(n.id)}>
                      Mark Read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default NotificationsPage;
