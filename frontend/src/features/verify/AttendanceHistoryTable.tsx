import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui";
import type { AttendanceRecord } from "../../types";

interface AttendanceHistoryTableProps {
  records: AttendanceRecord[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function AttendanceHistoryTable({
  records,
  isLoading,
  onRefresh,
}: AttendanceHistoryTableProps) {
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
    <Card>
      <CardHeader>
        <div>
          <strong style={{ fontSize: "var(--text-base)" }}>My Attendance History</strong>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Your recent attendance sessions recorded in the database.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={isLoading} onClick={onRefresh}>
          {isLoading ? "Refreshing..." : "↻ Refresh"}
        </Button>
      </CardHeader>

      <CardBody style={{ padding: 0 }}>
        {isLoading && records.length === 0 ? (
          <SkeletonTable rows={4} cols={3} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No attendance records"
            description="You have not marked attendance yet today."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((rec, i) => (
                <TableRow key={rec.id ?? i}>
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
  );
}
