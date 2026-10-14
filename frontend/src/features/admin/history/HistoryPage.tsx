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
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui";
import type { AttendanceHistoryResponse, HistoryStatus } from "../../../types";

function getTodayDateInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function HistoryPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayDateInputValue());
  const [staffIdFilter, setStaffIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatus>("all");

  const [historyData, setHistoryData] = useState<AttendanceHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const toast = useToast();

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory() {
    if (!selectedDate) {
      toast.warning("Please choose a date to query attendance.");
      return;
    }

    setIsLoading(true);
    try {
      const data = await api.getAttendanceHistory({
        selected_date: selectedDate,
        status: statusFilter,
        staff_id: staffIdFilter,
      });
      setHistoryData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load attendance history.");
      setHistoryData(null);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void loadHistory();
  }

  async function handleExportCsv() {
    setIsExporting(true);
    try {
      await downloadCsvBlob(
        "/admin/export/attendance",
        `attendance_records_${selectedDate || "export"}.csv`
      );
      toast.success("Attendance CSV downloaded successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export attendance CSV.");
    } finally {
      setIsExporting(false);
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
          <h1>Attendance History</h1>
          <p>Query comprehensive institutional attendance logs by date, staff ID, and status.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button
            variant="outline"
            size="sm"
            isLoading={isExporting}
            onClick={() => void handleExportCsv()}
          >
            ⬇ Export Attendance CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => void loadHistory()} disabled={isLoading}>
            {isLoading ? "Loading..." : "↻ Refresh"}
          </Button>
        </div>
      </div>

      {/* Filter Form Bar */}
      <form onSubmit={handleFilterSubmit} className="admin-filter-bar">
        <div style={{ width: "160px" }}>
          <FormField id="filter-date" label="Date">
            <Input
              id="filter-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
          </FormField>
        </div>

        <div style={{ flex: 1, minWidth: "160px" }}>
          <FormField id="filter-staff" label="Staff ID">
            <Input
              id="filter-staff"
              value={staffIdFilter}
              onChange={(e) => setStaffIdFilter(e.target.value.toUpperCase())}
              placeholder="e.g. STF001 (optional)"
            />
          </FormField>
        </div>

        <div style={{ width: "160px" }}>
          <FormField id="filter-status" label="Status">
            <Select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as HistoryStatus)}
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="checked_in">Checked In</option>
            </Select>
          </FormField>
        </div>

        <div style={{ alignSelf: "flex-end", paddingBottom: "2px" }}>
          <Button type="submit" variant="primary" disabled={isLoading}>
            Apply Filters
          </Button>
        </div>
      </form>

      {/* History Table Card */}
      <Card>
        <CardHeader>
          <div>
            <strong style={{ fontSize: "var(--text-base)" }}>Attendance Records</strong>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {historyData
                ? `${historyData.total} records found for ${historyData.date}`
                : "Select filters above to inspect records"}
            </p>
          </div>
          {historyData && <Badge variant="neutral">{historyData.total} Records</Badge>}
        </CardHeader>

        <CardBody style={{ padding: 0 }}>
          {isLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : !historyData || historyData.records.length === 0 ? (
            <EmptyState
              title="No records match filters"
              description="No attendance records were found matching the selected date and filters."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Check-In Timestamp</TableHead>
                  <TableHead>Check-Out Timestamp</TableHead>
                  <TableHead>Attendance Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyData.records.map((rec) => (
                  <TableRow key={rec.staff_id}>
                    <TableCell>
                      <strong style={{ fontFamily: "var(--font-mono)" }}>{rec.staff_id}</strong>
                    </TableCell>
                    <TableCell>{formatDateTime(rec.check_in)}</TableCell>
                    <TableCell>{formatDateTime(rec.check_out)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rec.status === "present"
                            ? "success"
                            : rec.status === "half_day"
                              ? "half-day"
                              : rec.status === "checked_in"
                                ? "info"
                                : "danger"
                        }
                        dot
                      >
                        {rec.status === "present"
                          ? "Present"
                          : rec.status === "half_day"
                            ? "Half Day"
                            : rec.status === "checked_in"
                              ? "Checked In"
                              : "Absent"}
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

export default HistoryPage;
