import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth";
import { useCamera, useGeolocation, useTheme, useToast } from "../../hooks";
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
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui";
import type { AttendanceAction, AttendanceRecord, LeaveRequest } from "../../types";
import "./verify.css";

const STEP_ITEMS = [
  { number: 1, label: "Face Match" },
  { number: 2, label: "GPS Location" },
  { number: 3, label: "Confirm" },
];

export function CheckInPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  const [action, setAction] = useState<AttendanceAction>("check-in");
  const [currentStep, setCurrentStep] = useState(1);
  const [failedStep, setFailedStep] = useState<number | null>(null);

  // Face verification state
  const { videoRef, isReady, error: cameraError, startCamera, stopCamera, captureFrame } = useCamera({
    autoStart: true,
  });
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [faceProofId, setFaceProofId] = useState<string | null>(null);
  const [proofSecondsLeft, setProofSecondsLeft] = useState<number>(0);

  const { location, error: geoError, isLocating, accuracy, getLocation, resetLocation } = useGeolocation();

  // Attendance Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attendanceSuccessInfo, setAttendanceSuccessInfo] = useState<{
    action: AttendanceAction;
    time: string;
    distanceM?: number;
    message: string;
  } | null>(null);

  // Attendance History State
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Leave / Duty Request State
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [reqType, setReqType] = useState<"leave" | "duty">("leave");
  const [reqStartDate, setReqStartDate] = useState("");
  const [reqEndDate, setReqEndDate] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  const proofTimerRef = useRef<number | null>(null);

  // 90-second proof countdown
  useEffect(() => {
    if (!faceProofId) {
      if (proofTimerRef.current !== null) {
        window.clearInterval(proofTimerRef.current);
      }
      return;
    }

    proofTimerRef.current = window.setInterval(() => {
      setProofSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(proofTimerRef.current!);
          setFaceProofId(null);
          setCurrentStep(1);
          toast.warning("Face verification proof expired. Please scan face again.", "Proof Expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (proofTimerRef.current !== null) {
        window.clearInterval(proofTimerRef.current);
      }
    };
  }, [faceProofId, toast]);

  // Load attendance history & requests on mount
  useEffect(() => {
    void loadAttendanceRecords();
    void loadLeaveRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAttendanceRecords() {
    setLoadingHistory(true);
    try {
      const records = await api.getMyAttendance();
      setMyAttendance(records);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load attendance records.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadLeaveRequests() {
    setLoadingRequests(true);
    try {
      const reqs = await api.getMyRequests();
      setMyRequests(reqs);
    } catch {
      // silent
    } finally {
      setLoadingRequests(false);
    }
  }

  // Handle Step 1: Face Verification
  async function handleVerifyFace() {
    setFailedStep(null);
    setIsVerifyingFace(true);

    try {
      const imageBase64 = captureFrame(0.85);
      const res = await api.verifyFace(imageBase64, action);

      if (!res.verified || !res.proof_id) {
        throw new Error(res.message || "Face could not be verified. Please position your face clearly.");
      }

      setFaceProofId(res.proof_id);
      setProofSecondsLeft(90);
      setCurrentStep(2);
      toast.success("Face verified successfully! Acquiring campus GPS...", "Step 1 Complete");

      // Stop camera tracks to save battery once verified
      stopCamera();

      // Automatically initiate GPS location in Step 2
      void handleAcquireLocation();
    } catch (err) {
      setFailedStep(1);
      const msg = err instanceof Error ? err.message : "Face verification failed.";
      toast.error(msg, "Verification Failed");
    } finally {
      setIsVerifyingFace(false);
    }
  }

  // Handle Step 2: Location Acquisition
  async function handleAcquireLocation() {
    setFailedStep(null);
    try {
      await getLocation();
      setCurrentStep(3);
    } catch (err) {
      setFailedStep(2);
      const msg = err instanceof Error ? err.message : "Failed to acquire GPS reading.";
      toast.error(msg, "GPS Error");
    }
  }

  // Handle Step 3: Final Attendance Confirmation
  async function handleFinalSubmit() {
    if (!faceProofId) {
      toast.error("Face verification proof is missing or expired. Please rescan face.");
      setCurrentStep(1);
      void startCamera();
      return;
    }

    if (!location) {
      toast.error("GPS location reading is missing. Acquiring location now...");
      void handleAcquireLocation();
      return;
    }

    setIsSubmitting(true);
    setFailedStep(null);

    try {
      const res = await api.submitAttendance(action, {
        ...location,
        face_proof: faceProofId,
      });

      const recordedDistance = res.location?.distance_m;

      setAttendanceSuccessInfo({
        action,
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        distanceM: recordedDistance,
        message: res.message || `${action === "check-in" ? "Check-in" : "Check-out"} recorded successfully!`,
      });

      toast.success(
        `${action === "check-in" ? "Checked in" : "Checked out"} successfully!`,
        "Attendance Recorded"
      );

      // Reset flow
      setFaceProofId(null);
      resetLocation();
      setCurrentStep(1);
      void loadAttendanceRecords();
    } catch (err) {
      setFailedStep(3);
      const msg = err instanceof Error ? err.message : "Attendance submission failed.";
      toast.error(msg, "Submission Error");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Leave / Duty Request Form
  async function handleRequestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reqStartDate || !reqEndDate || !reqReason.trim()) {
      toast.error("Please complete all required fields.");
      return;
    }

    if (reqStartDate > reqEndDate) {
      toast.error("Start date cannot be after end date.");
      return;
    }

    setIsSubmittingReq(true);
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
      void loadLeaveRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setIsSubmittingReq(false);
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

  // Determine button state and hint for mobile bottom bar
  const canScanFace = isReady && !cameraError && !isVerifyingFace;
  const canAcquireLocation = !isLocating;
  const canSubmitAttendance = !!faceProofId && !!location && !isSubmitting;

  return (
    <div className="verify-page">
      {/* Top Bar */}
      <header className="verify-topbar">
        <div className="verify-topbar-left">
          <span className="brand-badge-logo" style={{ width: 32, height: 32, fontSize: 13 }} aria-hidden="true">
            CP
          </span>
          <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>CampusPass</span>
        </div>

        <div className="verify-topbar-right">
          <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stopCamera();
              logout();
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="verify-main" id="main-content">
        {/* Header Greeting */}
        <div className="verify-greeting">
          <span className="hero-eyebrow">STAFF CHECK-IN & ATTENDANCE</span>
          <h1>Welcome, {user?.staff_id}</h1>
          <p>Complete 3D face verification and GPS location to record today's attendance.</p>
        </div>

        {/* Stepper (Face -> Location -> Confirm) */}
        <Stepper steps={STEP_ITEMS} currentStep={currentStep} failedStep={failedStep} />

        {/* Check-In / Check-Out Selector */}
        <div className="action-selector-group" role="radiogroup" aria-label="Attendance Action">
          <button
            type="button"
            role="radio"
            aria-checked={action === "check-in"}
            className={`action-selector-btn ${action === "check-in" ? "selected" : ""}`}
            onClick={() => {
              setAction("check-in");
              if (faceProofId) {
                setFaceProofId(null);
                setCurrentStep(1);
                void startCamera();
              }
            }}
          >
            <span aria-hidden="true">↗</span> Check In
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={action === "check-out"}
            className={`action-selector-btn ${action === "check-out" ? "selected" : ""}`}
            onClick={() => {
              setAction("check-out");
              if (faceProofId) {
                setFaceProofId(null);
                setCurrentStep(1);
                void startCamera();
              }
            }}
          >
            <span aria-hidden="true">↙</span> Check Out
          </button>
        </div>

        {/* Confirmation Success Banner (if just verified) */}
        {attendanceSuccessInfo && (
          <div className="success-screen-card" role="status" aria-live="polite">
            <div className="success-check-badge">✓</div>
            <h2 style={{ fontSize: "var(--text-xl)", margin: 0 }}>
              {attendanceSuccessInfo.action === "check-in" ? "Checked In!" : "Checked Out!"}
            </h2>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              Recorded at <strong>{attendanceSuccessInfo.time}</strong>.
              {attendanceSuccessInfo.distanceM !== undefined && (
                <span> Distance from campus: {attendanceSuccessInfo.distanceM}m.</span>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAttendanceSuccessInfo(null);
                const el = document.getElementById("attendance-history-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              View My Attendance Records ↓
            </Button>
          </div>
        )}

        {/* STEP 1: Face Liveness Scanner */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <div>
                <strong style={{ fontSize: "var(--text-sm)" }}>Step 1: 3D Face Verification</strong>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  Position your face within the guide in good ambient lighting.
                </p>
              </div>
              <Badge variant="info">Live Feed</Badge>
            </CardHeader>
            <CardBody style={{ padding: "var(--space-4)" }}>
              <div className="camera-scanner-card">
                {cameraError ? (
                  <div className="camera-error-container">
                    <div className="camera-error-icon">!</div>
                    <h3 className="camera-error-title">Camera Unavailable</h3>
                    <p className="camera-error-msg">{cameraError}</p>
                    <Button variant="outline" size="sm" onClick={() => void startCamera()}>
                      ↻ Retry Camera
                    </Button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      aria-label="Live front camera feed"
                      className="camera-preview-video"
                    />
                    <div className="camera-guide-overlay">
                      <div className={`camera-guide-oval ${isVerifyingFace ? "scanning" : ""}`}>
                        {isVerifyingFace && <div className="scanner-laser" aria-hidden="true" />}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-2)" }}>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={!canScanFace}
                  isLoading={isVerifyingFace}
                  onClick={() => void handleVerifyFace()}
                >
                  {isVerifyingFace ? "Verifying Face Liveness..." : `Scan Face to ${action === "check-in" ? "Check In" : "Check Out"}`}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* STEP 2: Location Geofence & STEP 3: Confirm Review */}
        {currentStep >= 2 && (
          <Card>
            <CardHeader>
              <div>
                <strong style={{ fontSize: "var(--text-sm)" }}>
                  {currentStep === 2 ? "Step 2: Campus Location Geofence" : "Step 3: Review & Submit Attendance"}
                </strong>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {currentStep === 2 ? "Acquiring precision GPS coordinates..." : "All prerequisites met. Confirm your attendance."}
                </p>
              </div>
              {faceProofId && (
                <div className="proof-countdown-badge">
                  <span>⏱ Proof expires in {proofSecondsLeft}s</span>
                </div>
              )}
            </CardHeader>

            <CardBody style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {/* Face verification confirmed card */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-3) var(--space-4)",
                  background: "var(--color-success-soft)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-success-border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <span style={{ color: "var(--color-success)", fontWeight: 700, fontSize: "var(--text-lg)" }}>✓</span>
                  <div>
                    <strong style={{ fontSize: "var(--text-sm)", color: "var(--color-success-text)" }}>
                      Face Verified
                    </strong>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      Proof ID: {faceProofId?.slice(0, 18)}...
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFaceProofId(null);
                    setCurrentStep(1);
                    void startCamera();
                  }}
                >
                  Rescan
                </Button>
              </div>

              {/* Location Status Card */}
              <div
                className={`location-status-card ${
                  isLocating
                    ? "status-locking"
                    : location
                      ? accuracy && accuracy <= 50
                        ? "status-accurate"
                        : "status-inaccurate"
                      : "status-locking"
                }`}
              >
                <div className="location-icon-wrapper" aria-hidden="true">
                  {isLocating ? "◷" : location ? "📍" : "!"}
                </div>
                <div className="location-info">
                  <div className="location-title">
                    <span>
                      {isLocating
                        ? "Locking GPS satellites..."
                        : location
                          ? "GPS Coordinates Acquired"
                          : "Location Pending"}
                    </span>
                    {accuracy !== null && (
                      <Badge variant={accuracy <= 50 ? "success" : "warning"}>
                        ±{accuracy}m accuracy
                      </Badge>
                    )}
                  </div>
                  <div className="location-detail">
                    {geoError ? (
                      <span style={{ color: "var(--color-danger)" }}>{geoError}</span>
                    ) : isLocating ? (
                      "Acquiring high-accuracy satellite fix. Please remain in open view."
                    ) : location ? (
                      `Lat: ${location.latitude.toFixed(5)}, Lng: ${location.longitude.toFixed(5)}`
                    ) : (
                      "Tap below to acquire GPS."
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons for Step 2 & 3 */}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {currentStep === 2 && (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!canAcquireLocation}
                    isLoading={isLocating}
                    onClick={() => void handleAcquireLocation()}
                  >
                    {isLocating ? "Acquiring GPS..." : "Acquire GPS Location"}
                  </Button>
                )}

                {currentStep === 3 && (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!canSubmitAttendance}
                    isLoading={isSubmitting}
                    onClick={() => void handleFinalSubmit()}
                  >
                    {isSubmitting ? "Submitting Attendance..." : `Confirm ${action === "check-in" ? "Check-in" : "Check-out"}`}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Attendance History Section */}
        <section id="attendance-history-section" style={{ marginTop: "var(--space-4)" }}>
          <Card>
            <CardHeader>
              <div>
                <strong style={{ fontSize: "var(--text-base)" }}>My Attendance History</strong>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  Your recent attendance sessions recorded in the database.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingHistory}
                onClick={() => void loadAttendanceRecords()}
              >
                {loadingHistory ? "Refreshing..." : "↻ Refresh"}
              </Button>
            </CardHeader>

            <CardBody style={{ padding: 0 }}>
              {loadingHistory && myAttendance.length === 0 ? (
                <SkeletonTable rows={4} cols={3} />
              ) : myAttendance.length === 0 ? (
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
                    {myAttendance.map((rec, i) => (
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
        </section>

        {/* Leave & Off-Campus Duty Requests Section */}
        <section style={{ marginTop: "var(--space-4)" }}>
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
              <form onSubmit={handleRequestSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
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

                <Button type="submit" variant="primary" isLoading={isSubmittingReq}>
                  Submit Request
                </Button>
              </form>

              {/* Requests history */}
              <div style={{ marginTop: "var(--space-5)", borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-4)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                  <strong style={{ fontSize: "var(--text-sm)" }}>Submitted Requests</strong>
                  <Button variant="ghost" size="sm" onClick={() => void loadLeaveRequests()} disabled={loadingRequests}>
                    {loadingRequests ? "Refreshing..." : "↻ Refresh"}
                  </Button>
                </div>

                {loadingRequests && myRequests.length === 0 ? (
                  <SkeletonTable rows={2} cols={4} />
                ) : myRequests.length === 0 ? (
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
                      {myRequests.map((r) => (
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
        </section>

        {/* Privacy Notice Footer Link */}
        <footer style={{ textAlign: "center", padding: "var(--space-4) 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <p style={{ margin: 0 }}>
            Face image and GPS coordinates are processed solely for verification and geofence validation.{" "}
            <Link to="/privacy" style={{ fontWeight: 600 }}>
              Read our Privacy Notice →
            </Link>
          </p>
        </footer>
      </main>

      {/* Mobile Fixed Thumb-Reachable Primary Action Button */}
      <div className="mobile-fixed-bottom-bar">
        {currentStep === 1 && (
          <>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canScanFace}
              isLoading={isVerifyingFace}
              onClick={() => void handleVerifyFace()}
            >
              {isVerifyingFace ? "Verifying..." : `Scan Face (${action === "check-in" ? "In" : "Out"})`}
            </Button>
            {!canScanFace && (
              <span className="fixed-button-reason">
                {cameraError ? "Camera unavailable. Check permissions." : "Initializing live camera preview..."}
              </span>
            )}
          </>
        )}

        {currentStep === 2 && (
          <>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canAcquireLocation}
              isLoading={isLocating}
              onClick={() => void handleAcquireLocation()}
            >
              {isLocating ? "Acquiring GPS..." : "Acquire GPS Location"}
            </Button>
            {isLocating && <span className="fixed-button-reason">Reading satellite coordinates...</span>}
          </>
        )}

        {currentStep === 3 && (
          <>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmitAttendance}
              isLoading={isSubmitting}
              onClick={() => void handleFinalSubmit()}
            >
              {isSubmitting ? "Submitting..." : `Confirm ${action === "check-in" ? "Check-In" : "Check-Out"}`}
            </Button>
            {faceProofId && (
              <span className="fixed-button-reason">Proof expires in {proofSecondsLeft}s</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CheckInPage;
