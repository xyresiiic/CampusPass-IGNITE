import { useEffect, useState } from "react";
import { api, downloadCsvBlob } from "../../../api/client";
import { useToast } from "../../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  SkeletonTable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui";
import type { LeaveRequest } from "../../../types";

export function RequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Review Modal State
  const [reviewingRequest, setReviewingRequest] = useState<LeaveRequest | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const toast = useToast();

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  async function loadRequests() {
    setIsLoading(true);
    try {
      const data = await api.getAdminRequests({
        status: statusFilter,
        request_type: typeFilter,
      });
      setRequests(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load requests.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReview(status: "approved" | "rejected") {
    if (!reviewingRequest) return;
    setIsReviewing(true);

    try {
      await api.reviewRequest(reviewingRequest.id, {
        status,
        review_comment: reviewComment.trim() || null,
      });
      toast.success(`Request ${status} successfully!`);
      setReviewingRequest(null);
      setReviewComment("");
      void loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review request.");
    } finally {
      setIsReviewing(false);
    }
  }

  async function handleExportCsv() {
    setIsExporting(true);
    try {
      await downloadCsvBlob(
        `/admin/export/requests?status=${statusFilter}`,
        `leave_duty_requests_${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast.success("Requests CSV exported successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export requests CSV.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Header Bar */}
      <div className="admin-page-header">
        <div>
          <h1>Leave &amp; Off-Campus Duty Requests</h1>
          <p>Review staff attendance exemption requests and record official admin decisions.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button
            variant="outline"
            size="sm"
            isLoading={isExporting}
            onClick={() => void handleExportCsv()}
          >
            ⬇ Export Requests CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => void loadRequests()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div style={{ width: "160px" }}>
          <FormField id="filter-req-status" label="Status">
            <Select
              id="filter-req-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
          </FormField>
        </div>

        <div style={{ width: "160px" }}>
          <FormField id="filter-req-type" label="Type">
            <Select
              id="filter-req-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="leave">Leave Only</option>
              <option value="duty">Off-Campus Duty Only</option>
            </Select>
          </FormField>
        </div>
      </div>

      {/* Requests Table Card */}
      <Card>
        <CardBody style={{ padding: 0 }}>
          {isLoading && requests.length === 0 ? (
            <SkeletonTable rows={5} cols={7} />
          ) : requests.length === 0 ? (
            <EmptyState
              title="No requests found"
              description="No leave or off-campus duty requests match your active filters."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Escalated</TableHead>
                  <TableHead>Decision / Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <strong style={{ fontFamily: "var(--font-mono)" }}>{req.staff_id}</strong>
                    </TableCell>
                    <TableCell>
                      <Badge variant={req.request_type === "duty" ? "info" : "neutral"}>
                        {req.request_type === "duty" ? "Off-Campus Duty" : "Leave"}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
                      {req.start_date} → {req.end_date}
                    </TableCell>
                    <TableCell style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={req.reason}>
                      {req.reason}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          req.status === "approved"
                            ? "success"
                            : req.status === "rejected"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {req.escalated ? <Badge variant="danger">⚠ Yes</Badge> : "No"}
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setReviewingRequest(req);
                            setReviewComment("");
                          }}
                        >
                          Review Request
                        </Button>
                      ) : (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          {req.reviewer_id ? `By ${req.reviewer_id}` : "Reviewed"}
                          {req.review_comment ? ` · "${req.review_comment}"` : ""}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Review Request Modal */}
      {reviewingRequest && (
        <Modal
          isOpen={!!reviewingRequest}
          onClose={() => setReviewingRequest(null)}
          title={`Review ${reviewingRequest.request_type === "duty" ? "Duty" : "Leave"} Request`}
          description={`Submitted by ${reviewingRequest.staff_id} for ${reviewingRequest.start_date} to ${reviewingRequest.end_date}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div
              style={{
                padding: "var(--space-3)",
                background: "var(--surface-card-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <strong style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "block" }}>
                Reason provided:
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                {reviewingRequest.reason}
              </p>
            </div>

            <FormField id="review-comment" label="Reviewer Comment (Optional)">
              <Input
                id="review-comment"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Add institutional note or justification..."
                autoFocus
              />
            </FormField>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <Button variant="outline" onClick={() => setReviewingRequest(null)} disabled={isReviewing}>
                Cancel
              </Button>
              <Button
                variant="danger-outline"
                disabled={isReviewing}
                onClick={() => void handleReview("rejected")}
              >
                ✕ Reject Request
              </Button>
              <Button
                variant="primary"
                isLoading={isReviewing}
                onClick={() => void handleReview("approved")}
              >
                ✓ Approve Request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default RequestsPage;
