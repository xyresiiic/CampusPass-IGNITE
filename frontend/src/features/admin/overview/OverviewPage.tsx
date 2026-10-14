import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import { useToast } from "../../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui";
import type { AdminDashboardData } from "../../../types";

export function OverviewPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const res = await api.getAdminDashboard();
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
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

  // Calculate SVG Donut parameters
  const total = data?.total_staff || 0;
  const present = data?.present_today || 0;
  const halfDay = data?.half_day_today || 0;
  const absent = data?.absent_today || 0;

  const presentPct = total > 0 ? (present / total) * 100 : 0;
  const halfDayPct = total > 0 ? (halfDay / total) * 100 : 0;
  const absentPct = total > 0 ? (absent / total) * 100 : 0;

  // SVG circle circumference for r = 40 is ~251.32
  const c = 2 * Math.PI * 40;
  const presentStroke = (presentPct / 100) * c;
  const halfDayStroke = (halfDayPct / 100) * c;
  const absentStroke = (absentPct / 100) * c;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1>Campus Overview</h1>
          <p>Real-time workforce attendance intelligence for {data?.date || "today"}.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isLoading}>
          {isLoading ? "Refreshing..." : "↻ Refresh Dashboard"}
        </Button>
      </div>

      {/* Stats Cards Grid */}
      <div className="admin-stats-grid">
        <StatCard
          label="Total Staff"
          value={isLoading ? "—" : total}
          subtitle="Registered accounts"
          icon="♙"
          accentColor="var(--brand-primary)"
        />
        <StatCard
          label="Present Today"
          value={isLoading ? "—" : present}
          subtitle="Marked on-campus attendance"
          icon="✓"
          accentColor="var(--color-success)"
        />
        <StatCard
          label="Half-Day Today"
          value={isLoading ? "—" : halfDay}
          subtitle="Late arrival & early departure"
          icon="½"
          accentColor="var(--color-warning)"
        />
        <StatCard
          label="Absent Today"
          value={isLoading ? "—" : absent}
          subtitle="Unmarked working accounts"
          icon="✕"
          accentColor="var(--color-danger)"
        />
        <StatCard
          label="Currently In"
          value={isLoading ? "—" : (data?.currently_checked_in ?? 0)}
          subtitle="Open attendance sessions"
          icon="↗"
          accentColor="var(--color-info)"
        />
        <StatCard
          label="Active Accounts"
          value={isLoading ? "—" : (data?.active_staff ?? 0)}
          subtitle="Permitted check-in access"
          icon="●"
          accentColor="var(--color-success)"
        />
      </div>

      {/* Split Donut Ring Chart & Summary Grid */}
      <div className="admin-charts-grid">
        <Card>
          <CardHeader>
            <div>
              <strong style={{ fontSize: "var(--text-sm)" }}>Attendance Split</strong>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Staff distribution today
              </p>
            </div>
            <Badge variant="neutral">{total} Staff</Badge>
          </CardHeader>
          <CardBody>
            <div className="donut-chart-container">
              <svg width="130" height="130" viewBox="0 0 100 100" aria-label="Attendance distribution donut chart">
                {/* Background Ring */}
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border-subtle)" strokeWidth="12" />

                {/* Present Ring (Green) */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth="12"
                  strokeDasharray={`${presentStroke} ${c}`}
                  strokeDashoffset="0"
                  transform="rotate(-90 50 50)"
                  style={{ transition: "stroke-dasharray var(--duration-slow) var(--ease-standard)" }}
                />

                {/* Half-Day Ring (Amber) */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="var(--color-warning)"
                  strokeWidth="12"
                  strokeDasharray={`${halfDayStroke} ${c}`}
                  strokeDashoffset={String(-presentStroke)}
                  transform="rotate(-90 50 50)"
                  style={{ transition: "stroke-dasharray var(--duration-slow) var(--ease-standard)" }}
                />

                {/* Absent Ring (Red) */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="var(--color-danger)"
                  strokeWidth="12"
                  strokeDasharray={`${absentStroke} ${c}`}
                  strokeDashoffset={String(-(presentStroke + halfDayStroke))}
                  transform="rotate(-90 50 50)"
                  style={{ transition: "stroke-dasharray var(--duration-slow) var(--ease-standard)" }}
                />

                <text x="50" y="47" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text-primary)">
                  {Math.round(presentPct)}%
                </text>
                <text x="50" y="60" textAnchor="middle" fontSize="8" fill="var(--text-muted)">
                  Present
                </text>
              </svg>

              <div className="donut-legend">
                <div className="donut-legend-item">
                  <div className="donut-legend-color" style={{ background: "var(--color-success)" }} />
                  <span>Present: {present} ({Math.round(presentPct)}%)</span>
                </div>
                <div className="donut-legend-item">
                  <div className="donut-legend-color" style={{ background: "var(--color-warning)" }} />
                  <span>Half-Day: {halfDay} ({Math.round(halfDayPct)}%)</span>
                </div>
                <div className="donut-legend-item">
                  <div className="donut-legend-color" style={{ background: "var(--color-danger)" }} />
                  <span>Absent: {absent} ({Math.round(absentPct)}%)</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Quick Actions & Policy Info */}
        <Card>
          <CardHeader>
            <div>
              <strong style={{ fontSize: "var(--text-sm)" }}>Institutional Attendance Rules</strong>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Automated threshold calculations
              </p>
            </div>
          </CardHeader>
          <CardBody style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span>Official Campus Hours</span>
              <strong>09:00 AM – 04:00 PM</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span>Half-Day Condition</span>
              <strong>Check-in &gt; 11:00 AM AND Check-out &lt; 02:00 PM</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span>Absence Alert Rule</span>
              <strong>&gt; 2 Consecutive Unexcused Days (WhatsApp Trigger)</strong>
            </div>
            <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-3)" }}>
              <Link to="/admin/history">
                <Button variant="outline" size="sm">Search Records →</Button>
              </Link>
              <Link to="/admin/alerts">
                <Button variant="outline" size="sm">Absence Alerts →</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Recent Attendance Records Table */}
      <Card>
        <CardHeader>
          <div>
            <strong style={{ fontSize: "var(--text-base)" }}>Recent Activity</strong>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Most recent attendance check-in / check-out records.
            </p>
          </div>
          <Link to="/admin/history">
            <Button variant="ghost" size="sm">
              View All History →
            </Button>
          </Link>
        </CardHeader>

        <CardBody style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: "var(--space-4)" }}>
              <Skeleton height="32px" style={{ marginBottom: "8px" }} />
              <Skeleton height="32px" style={{ marginBottom: "8px" }} />
              <Skeleton height="32px" />
            </div>
          ) : !data?.recent_attendance?.length ? (
            <EmptyState
              title="No recent attendance records"
              description="No attendance transactions have been recorded today yet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Check-In</TableHead>
                  <TableHead>Check-Out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_attendance.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>
                      <strong>{rec.staff_id}</strong>
                    </TableCell>
                    <TableCell>{formatDateTime(rec.check_in)}</TableCell>
                    <TableCell>{formatDateTime(rec.check_out)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rec.status === "half_day"
                            ? "half-day"
                            : rec.check_out
                              ? "success"
                              : "warning"
                        }
                        dot
                      >
                        {rec.status === "half_day"
                          ? "Half Day"
                          : rec.check_out
                            ? "Completed"
                            : "Checked In"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default OverviewPage;
