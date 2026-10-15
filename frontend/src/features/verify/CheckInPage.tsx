import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth";
import { useCamera, useGeolocation, useTheme, useToast } from "../../hooks";
import { Button, Stepper } from "../../components/ui";
import type { AttendanceAction, AttendanceRecord, LeaveRequest } from "../../types";
import { CameraScanner } from "./CameraScanner";
import { AttendanceHistoryTable } from "./AttendanceHistoryTable";
import { LeaveDutyForm } from "./LeaveDutyForm";
import { AttendanceSuccessCard } from "./AttendanceSuccessCard";
import { CheckInTopBar } from "./CheckInTopBar";
import { ActionSelector } from "./ActionSelector";
import { ReviewConfirmCard } from "./ReviewConfirmCard";
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

  // Face verification
  const { videoRef, isReady, error: cameraError, startCamera, stopCamera, captureFrame } = useCamera({
    autoStart: true,
  });
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [faceProofId, setFaceProofId] = useState<string | null>(null);
  const [proofSecondsLeft, setProofSecondsLeft] = useState<number>(0);

  // GPS Geolocation
  const { location, error: geoError, isLocating, accuracy, getLocation, resetLocation } = useGeolocation();

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attendanceSuccessInfo, setAttendanceSuccessInfo] = useState<{
    action: AttendanceAction;
    time: string;
    distanceM?: number;
    message: string;
  } | null>(null);

  // History & Requests State
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

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

  // Load records on mount
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

  // Step 1: Face Match
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

      stopCamera();
      void handleAcquireLocation();
    } catch (err) {
      setFailedStep(1);
      const msg = err instanceof Error ? err.message : "Face verification failed.";
      toast.error(msg, "Verification Failed");
    } finally {
      setIsVerifyingFace(false);
    }
  }

  // Step 2: Location
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

  // Step 3: Final Confirm
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

      setAttendanceSuccessInfo({
        action,
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        distanceM: res.location?.distance_m,
        message: res.message || `${action === "check-in" ? "Check-in" : "Check-out"} recorded successfully!`,
      });

      toast.success(
        `${action === "check-in" ? "Checked in" : "Checked out"} successfully!`,
        "Attendance Recorded"
      );

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

  function handleSelectAction(newAction: AttendanceAction) {
    setAction(newAction);
    if (faceProofId) {
      setFaceProofId(null);
      setCurrentStep(1);
      void startCamera();
    }
  }

  const canAcquireLocation = !isLocating;
  const canSubmitAttendance = !!faceProofId && !!location && !isSubmitting;

  return (
    <div className="verify-page">
      <CheckInTopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={() => {
          stopCamera();
          logout();
        }}
      />

      <main className="verify-main" id="main-content">
        <div className="verify-greeting">
          <span className="hero-eyebrow">STAFF CHECK-IN & ATTENDANCE</span>
          <h1>Welcome, {user?.staff_id}</h1>
          <p>Complete 3D face verification and GPS location to record today's attendance.</p>
        </div>

        <Stepper steps={STEP_ITEMS} currentStep={currentStep} failedStep={failedStep} />

        <ActionSelector action={action} onSelectAction={handleSelectAction} />

        {attendanceSuccessInfo && (
          <AttendanceSuccessCard
            info={attendanceSuccessInfo}
            onDismiss={() => setAttendanceSuccessInfo(null)}
          />
        )}

        {currentStep === 1 && (
          <CameraScanner
            videoRef={videoRef}
            isReady={isReady}
            cameraError={cameraError}
            isVerifying={isVerifyingFace}
            action={action}
            onRetryCamera={() => void startCamera()}
            onVerifyFace={() => void handleVerifyFace()}
          />
        )}

        {currentStep >= 2 && (
          <ReviewConfirmCard
            currentStep={currentStep}
            faceProofId={faceProofId}
            proofSecondsLeft={proofSecondsLeft}
            action={action}
            location={location}
            accuracy={accuracy}
            geoError={geoError}
            isLocating={isLocating}
            canAcquireLocation={canAcquireLocation}
            canSubmitAttendance={canSubmitAttendance}
            isSubmitting={isSubmitting}
            onRescanFace={() => {
              setFaceProofId(null);
              setCurrentStep(1);
              void startCamera();
            }}
            onAcquireLocation={() => void handleAcquireLocation()}
            onSubmitAttendance={() => void handleFinalSubmit()}
          />
        )}

        <section id="attendance-history-section" style={{ marginTop: "var(--space-4)" }}>
          <AttendanceHistoryTable
            records={myAttendance}
            isLoading={loadingHistory}
            onRefresh={() => void loadAttendanceRecords()}
          />
        </section>

        <section style={{ marginTop: "var(--space-4)" }}>
          <LeaveDutyForm
            requests={myRequests}
            isLoading={loadingRequests}
            onRefresh={() => void loadLeaveRequests()}
          />
        </section>

        <footer style={{ textAlign: "center", padding: "var(--space-4) 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <p style={{ margin: 0 }}>
            Face image and GPS coordinates are processed solely for verification and geofence validation.{" "}
            <Link to="/privacy" style={{ fontWeight: 600 }}>
              Read our Privacy Notice →
            </Link>
          </p>
        </footer>
      </main>

      <div className="mobile-fixed-bottom-bar">
        {currentStep === 1 && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!isReady || !!cameraError || isVerifyingFace}
            isLoading={isVerifyingFace}
            onClick={() => void handleVerifyFace()}
          >
            {isVerifyingFace ? "Verifying..." : `Scan Face (${action === "check-in" ? "In" : "Out"})`}
          </Button>
        )}

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
            {isSubmitting ? "Submitting..." : `Confirm ${action === "check-in" ? "Check-In" : "Check-Out"}`}
          </Button>
        )}
      </div>
    </div>
  );
}

export default CheckInPage;
