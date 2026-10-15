import type { RefObject } from "react";
import { Badge, Button, Card, CardBody, CardHeader } from "../../components/ui";

interface CameraScannerProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  cameraError: string | null;
  isVerifying: boolean;
  action: "check-in" | "check-out";
  onRetryCamera: () => void;
  onVerifyFace: () => void;
}

export function CameraScanner({
  videoRef,
  isReady,
  cameraError,
  isVerifying,
  action,
  onRetryCamera,
  onVerifyFace,
}: CameraScannerProps) {
  const canScanFace = isReady && !cameraError && !isVerifying;

  return (
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
              <Button variant="outline" size="sm" onClick={onRetryCamera}>
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
                <div className={`camera-guide-oval ${isVerifying ? "scanning" : ""}`}>
                  {isVerifying && <div className="scanner-laser" aria-hidden="true" />}
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
            isLoading={isVerifying}
            onClick={onVerifyFace}
          >
            {isVerifying ? "Verifying Face Liveness..." : `Scan Face to ${action === "check-in" ? "Check In" : "Check Out"}`}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
