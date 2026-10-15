import { Button, Card, CardBody, CardHeader } from "../../components/ui";
import type { AttendanceAction, GPSLocation } from "../../types";
import { LocationGeofenceCard } from "./LocationGeofenceCard";

interface ReviewConfirmCardProps {
  currentStep: number;
  faceProofId: string | null;
  proofSecondsLeft: number;
  action: AttendanceAction;
  location: GPSLocation | null;
  accuracy: number | null;
  geoError: string | null;
  isLocating: boolean;
  canAcquireLocation: boolean;
  canSubmitAttendance: boolean;
  isSubmitting: boolean;
  onRescanFace: () => void;
  onAcquireLocation: () => void;
  onSubmitAttendance: () => void;
}

export function ReviewConfirmCard({
  currentStep,
  faceProofId,
  proofSecondsLeft,
  action,
  location,
  accuracy,
  geoError,
  isLocating,
  canAcquireLocation,
  canSubmitAttendance,
  isSubmitting,
  onRescanFace,
  onAcquireLocation,
  onSubmitAttendance,
}: ReviewConfirmCardProps) {
  return (
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
            onClick={onRescanFace}
          >
            Rescan
          </Button>
        </div>

        {currentStep === 2 ? (
          <LocationGeofenceCard
            location={location}
            accuracy={accuracy}
            geoError={geoError}
            isLocating={isLocating}
            canAcquire={canAcquireLocation}
            onAcquire={onAcquireLocation}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                background: "var(--surface-card-subtle)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-xs)",
                color: "var(--text-secondary)",
              }}
            >
              <div>Location locked: ±{accuracy}m accuracy.</div>
              <div>Action: Ready to {action === "check-in" ? "Check In" : "Check Out"}.</div>
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmitAttendance}
              isLoading={isSubmitting}
              onClick={onSubmitAttendance}
            >
              {isSubmitting ? "Submitting Attendance..." : `Confirm ${action === "check-in" ? "Check-in" : "Check-out"}`}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
