import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { useToast } from "../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
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
} from "../../components/ui";
import type { LeaveRequest } from "../../types";

interface LeaveDutyFormProps {
  requests: LeaveRequest[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function LeaveDutyForm({ requests, isLoading, onRefresh }: LeaveDutyFormProps) {
  const [reqType, setReqType] = useState<"leave" | "duty">("leave");
  const [reqStartDate, setReqStartDate] = useState("");
  const [reqEndDate, setReqEndDate] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reqStartDate || !reqEndDate || !reqReason.trim()) {
      toast.error("Please complete all required fields.");
      return;
    }
    if (reqStartDate > reqEndDate) {
      toast.error("Start date cannot be after end date.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.submitRequest({
        request_type: reqType,
        start_date: reqStartDate,
        end_date: reqEndDate,
        reason: reqReason.trim(),
      });
      toast.success("Leave / Duty request submitted successfully!");
      setReqReason("");
      setReqStartDate("");
      setReqEndDate("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <strong style={{ fontSize: "var(--text-base)" }}>Leave &amp; Duty Requests</strong>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Submit leaves or official campus duties for administration review.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <FormField id="req-type" label="Request Type" required>
            <Select
              id="req-type"
              value={reqType}
              onChange={(e) => setReqType(e.target.value as "leave" | "duty")}
            >
              <option value="leave">Leave Request</option>
              <option value="duty">Off-Campus Duty</option>
            </Select>
          </FormField>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <FormField id="req-start" label="Start Date" required>
              <Input
                id="req-start"
                type="date"
                value={reqStartDate}
                onChange={(e) => setReqStartDate(e.target.value)}
                required
              />
            </FormField>
            <FormField id="req-end" label="End Date" required>
              <Input
                id="req-end"
                type="date"
                value={reqEndDate}
                onChange={(e) => setReqEndDate(e.target.value)}
                required
              />
            </FormField>
          </div>

          <FormField id="req-reason" label="Reason for Request" required hint="Minimum 3 characters">
            <Input
              id="req-reason"
              value={reqReason}
              onChange={(e) => setReqReason(e.target.value)}
              placeholder="Brief explanation for leave / off-campus duty"
              minLength={3}
              maxLength={500}
              required
            />
          </FormField>

          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Submit Request
          </Button>
        </form>

        <div style={{ marginTop: "var(--space-5)", borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
            <strong style={{ fontSize: "var(--text-sm)" }}>Submitted Requests</strong>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "↻ Refresh"}
            </Button>
          </div>

          {isLoading && requests.length === 0 ? (
            <SkeletonTable rows={2} cols={4} />
          ) : requests.length === 0 ? (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", margin: 0 }}>
              No requests filed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={r.request_type === "duty" ? "info" : "neutral"}>
                        {r.request_type === "duty" ? "Duty" : "Leave"}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ fontSize: "var(--text-xs)" }}>
                      {r.start_date} → {r.end_date}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "approved"
                            ? "success"
                            : r.status === "rejected"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {r.status}
                        {r.escalated ? " ⚠" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      {r.review_comment || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
