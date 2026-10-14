import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { useCamera, useToast } from "../../../hooks";
import { Button, Modal } from "../../../components/ui";
import type { StaffAccount } from "../../../types";

interface EnrollFaceModalProps {
  staff: StaffAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EnrollFaceModal({ staff, onClose, onSuccess }: EnrollFaceModalProps) {
  const { videoRef, isReady, error: cameraError, startCamera, stopCamera, captureFrame } = useCamera({
    autoStart: false,
  });
  const [isEnrolling, setIsEnrolling] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (staff) {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [staff, startCamera, stopCamera]);

  async function handleCaptureAndEnroll() {
    if (!staff) return;
    setIsEnrolling(true);

    try {
      const imageBase64 = captureFrame(0.9);
      await api.enrollStaffFace(staff.staff_id, imageBase64);
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

  if (!staff) return null;

  return (
    <Modal
      isOpen={!!staff}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={`Enroll Face: ${staff.staff_id}`}
      description="Ensure the staff member is in view with good lighting and directly facing the camera."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div className="camera-scanner-card" style={{ maxHeight: "300px" }}>
          {cameraError ? (
            <div className="camera-error-container">
              <div className="camera-error-icon">!</div>
              <h4 className="camera-error-title">Camera Unavailable</h4>
              <p className="camera-error-msg">{cameraError}</p>
              <Button variant="outline" size="sm" onClick={() => void startCamera()}>
                Retry Camera
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                aria-label="Staff face enrollment preview"
                className="camera-preview-video"
              />
              <div className="camera-guide-overlay">
                <div className="camera-guide-oval" />
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button
            variant="outline"
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
            disabled={!isReady || !!cameraError}
            isLoading={isEnrolling}
            onClick={() => void handleCaptureAndEnroll()}
          >
            {isEnrolling ? "Enrolling Face..." : "Capture & Enroll Profile"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
