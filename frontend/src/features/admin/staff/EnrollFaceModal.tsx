import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../../../api/client";
import { useCamera, useToast } from "../../../hooks";
import { Badge, Button, Modal } from "../../../components/ui";
import type { StaffAccount } from "../../../types";
import "./enrollFace.css";

interface EnrollFaceModalProps {
  staff: StaffAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EnrollFaceModal({ staff, onClose, onSuccess }: EnrollFaceModalProps) {
  const {
    videoRef,
    isReady,
    isStarting,
    error: cameraError,
    facingMode,
    startCamera,
    stopCamera,
    toggleCamera,
    captureFrame,
  } = useCamera({
    autoStart: false,
    initialFacingMode: "user",
  });

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (staff) {
      setCapturedImage(null);
      void startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
    }
    return () => {
      stopCamera();
    };
  }, [staff, startCamera, stopCamera]);

  function handleSnapPhoto() {
    try {
      const frame = captureFrame(0.92);
      setIsFlashing(true);
      window.setTimeout(() => setIsFlashing(false), 250);
      setCapturedImage(frame);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to capture camera frame.");
    }
  }

  function handleRetake() {
    setCapturedImage(null);
    if (!isReady && !isStarting) {
      void startCamera();
    }
  }

  async function handleConfirmEnroll(imageToSave?: string) {
    const finalImage = imageToSave || capturedImage;
    if (!staff || !finalImage) return;

    setIsEnrolling(true);
    try {
      await api.enrollStaffFace(staff.staff_id, finalImage);
      toast.success(`Face enrolled successfully for ${staff.staff_id}!`);
      stopCamera();
      onClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Face enrollment failed.");
    } finally {
      setIsEnrolling(false);
    }
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        setCapturedImage(result);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  if (!staff) return null;

  const staffInitials = staff.full_name
    ? staff.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : staff.staff_id.slice(-2);

  return (
    <Modal
      isOpen={!!staff}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="Enroll Facial Profile"
      description="Biometric face enrollment for authentication & attendance."
      maxWidth={460}
    >
      <div className="enroll-face-wrapper">
        {/* Hidden Fallback File/Camera Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="user"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />

        {/* Staff Identity Card */}
        <div className="enroll-staff-banner">
          <div className="enroll-staff-meta">
            <div className="enroll-staff-avatar">{staffInitials}</div>
            <div>
              <p className="enroll-staff-name">{staff.full_name || staff.staff_id}</p>
              <div className="enroll-staff-id-pill">ID: {staff.staff_id}</div>
            </div>
          </div>
          <Badge variant={staff.has_face_enrolled ? "info" : "warning"} dot>
            {staff.has_face_enrolled ? "Profile Active" : "Not Enrolled"}
          </Badge>
        </div>

        {/* Camera Viewfinder */}
        <div className="enroll-camera-card">
          {/* Flash Effect on capture */}
          <div className={`enroll-flash-overlay ${isFlashing ? "active" : ""}`} />

          {cameraError && !capturedImage ? (
            <div className="enroll-error-container">
              <div className="enroll-error-icon">!</div>
              <h4 className="enroll-error-title">Camera Inactive</h4>
              <p className="enroll-error-msg">{cameraError}</p>
              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <Button variant="outline" size="sm" onClick={() => void startCamera()}>
                  Retry Camera
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Photo
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Top HUD inside camera viewport */}
              <div className="enroll-hud-top">
                <div className="enroll-status-pill">
                  <span
                    className={`enroll-status-dot ${capturedImage ? "frozen" : ""}`}
                  />
                  <span>{capturedImage ? "REVIEW" : isStarting ? "STARTING..." : "LIVE FEED"}</span>
                </div>

                {!capturedImage && (
                  <button
                    type="button"
                    className="enroll-switch-cam-btn"
                    onClick={() => void toggleCamera()}
                    title="Switch between front and back cameras"
                    aria-label="Switch camera"
                  >
                    <span>🔄</span>
                    <span>{facingMode === "user" ? "Front" : "Rear"}</span>
                  </button>
                )}
              </div>

              {/* Video Feed or Captured Preview Image */}
              {capturedImage ? (
                <img
                  src={capturedImage}
                  alt="Captured face preview"
                  className="enroll-preview-img"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label="Staff face enrollment preview"
                  className={`enroll-preview-video ${facingMode === "user" ? "mirror" : ""}`}
                />
              )}

              {/* Biometric Guide Overlay */}
              <div className="enroll-guide-overlay">
                <div
                  className={`enroll-guide-oval ${
                    capturedImage
                      ? "captured"
                      : isEnrolling
                      ? "scanning"
                      : isReady
                      ? "ready"
                      : ""
                  }`}
                >
                  <span className="enroll-guide-corner tl" />
                  <span className="enroll-guide-corner tr" />
                  <span className="enroll-guide-corner bl" />
                  <span className="enroll-guide-corner br" />

                  {isEnrolling && <div className="enroll-laser-line" />}
                </div>
              </div>

              {/* Bottom Guidance inside viewport */}
              <div className="enroll-hud-bottom">
                <div className="enroll-hint-pill">
                  {capturedImage
                    ? "Verify lighting & clarity before saving"
                    : "Center face in oval • Look straight"}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Guidance Chips */}
        <div className="enroll-guidance-chips">
          <div className="enroll-chip">
            <span>💡</span> Even Light
          </div>
          <div className="enroll-chip">
            <span>👤</span> Face Forward
          </div>
          <div className="enroll-chip">
            <span>👓</span> No Dark Glare
          </div>
        </div>

        {/* Review Mode Banner if photo captured */}
        {capturedImage && (
          <div className="enroll-review-banner">
            <span>✓ Snapshot captured</span>
            <span style={{ fontSize: "11px", fontWeight: 400 }}>Ready to register</span>
          </div>
        )}

        {/* Action Buttons (Mobile-first layout) */}
        <div className="enroll-actions-group">
          {capturedImage ? (
            <>
              <Button
                variant="outline"
                className="btn-cancel"
                onClick={handleRetake}
                disabled={isEnrolling}
              >
                ↺ Retake
              </Button>
              <Button
                variant="primary"
                className="btn-action"
                isLoading={isEnrolling}
                onClick={() => void handleConfirmEnroll()}
              >
                {isEnrolling ? "Saving Face..." : "✓ Confirm & Enroll"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="btn-cancel"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                disabled={isEnrolling}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="btn-action"
                disabled={!isReady || !!cameraError}
                onClick={handleSnapPhoto}
              >
                📸 Capture Photo
              </Button>
            </>
          )}
        </div>

        {/* Mobile Native Camera / File Fallback */}
        <div className="enroll-fallback-row">
          <button
            type="button"
            className="enroll-fallback-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Switch to phone native camera / album
          </button>
        </div>
      </div>
    </Modal>
  );
}
