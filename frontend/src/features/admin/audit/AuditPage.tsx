import { useEffect, useState, type FormEvent } from "react";
import { api, downloadCsvBlob } from "../../../api/client";
import { useToast } from "../../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui";
import type { AuditLog } from "../../../types";

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [isExportingAudit, setIsExportingAudit] = useState(false);
  const [isExportingAttendance, setIsExportingAttendance] = useState(false);

  const toast = useToast();

  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLogs() {
    setIsLoading(true);
    try {
      const data = await api.getAuditLogs({
        action: actionFilter,
        actor_id: actorFilter,
        limit: 200,
      });
      setLogs(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit logs.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void loadLogs();
  }

  async function handleExportAuditCsv() {
    setIsExportingAudit(true);
    try {
      const query = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : "";
      await downloadCsvBlob(
        `/admin/export/audit-logs${query}`,
        `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast.success("Audit trail CSV downloaded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export audit CSV.");
    } finally {
      setIsExportingAudit(false);
    }
  }

  async function handleExportAttendanceCsv() {
    setIsExportingAttendance(true);
    try {
      await downloadCsvBlob(
        "/admin/export/attendance",
        `attendance_export_${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast.success("Attendance records CSV downloaded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export attendance CSV.");
    } finally {
      setIsExportingAttendance(false);
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
          <h1>Security &amp; Audit Trail</h1>
          <p>Cryptographically traceable, immutable event journal across all system operations.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button
            variant="outline"
            size="sm"
            isLoading={isExportingAttendance}
            onClick={() => void handleExportAttendanceCsv()}
          >
            ⬇ Attendance CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            isLoading={isExportingAudit}
            onClick={() => void handleExportAuditCsv()}
          >
            ⬇ Audit Trail CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => void loadLogs()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <form onSubmit={handleFilterSubmit} className="admin-filter-bar">
        <div style={{ flex: 1, minWidth: "180px" }}>
          <FormField id="filter-action" label="Filter Action">
            <Input
              id="filter-action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder="e.g. CHECK_IN, CREATE_STAFF"
            />
          </FormField>
        </div>

        <div style={{ flex: 1, minWidth: "160px" }}>
          <FormField id="filter-actor" label="Actor Staff ID">
            <Input
              id="filter-actor"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value.toUpperCase())}
              placeholder="e.g. STF001"
            />
          </FormField>
        </div>

        <div style={{ alignSelf: "flex-end", paddingBottom: "2px" }}>
          <Button type="submit" variant="primary" disabled={isLoading}>
            Filter Events
          </Button>
        </div>
      </form>

      {/* Audit Logs Table Card */}
      <Card>
        <CardHeader>
          <div>
            <strong style={{ fontSize: "var(--text-base)" }}>System Events Journal</strong>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Latest {logs.length} events logged in database
            </p>
          </div>
          <Badge variant="neutral">{logs.length} Entries</Badge>
        </CardHeader>

        <CardBody style={{ padding: 0 }}>
          {isLoading && logs.length === 0 ? (
            <SkeletonTable rows={5} cols={6} />
          ) : logs.length === 0 ? (
            <EmptyState
              title="No audit entries"
              description="No audit events matched your query parameters."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp (IST)</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Event Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log, i) => (
                  <TableRow key={log.id ?? i}>
                    <TableCell style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <strong style={{ fontFamily: "var(--font-mono)" }}>{log.actor_id}</strong>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{log.actor_role}</Badge>
                    </TableCell>
                    <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                      {log.action}
                    </TableCell>
                    <TableCell style={{ fontSize: "var(--text-xs)" }}>
                      {log.target_type ? `${log.target_type}${log.target_id ? ` · ${log.target_id}` : ""}` : "—"}
                    </TableCell>
                    <TableCell
                      style={{
                        maxWidth: "240px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "var(--text-xs)",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                      }}
                      title={log.details ? JSON.stringify(log.details) : ""}
                    >
                      {log.details ? JSON.stringify(log.details) : "—"}
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

export default AuditPage;
