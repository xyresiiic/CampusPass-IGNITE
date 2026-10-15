import { Badge, Button } from "../../components/ui";
import type { GPSLocation } from "../../types";

interface LocationGeofenceCardProps {
  location: GPSLocation | null;
  accuracy: number | null;
  geoError: string | null;
  isLocating: boolean;
  canAcquire: boolean;
  onAcquire: () => void;
}

export function LocationGeofenceCard({
  location,
  accuracy,
  geoError,
  isLocating,
  canAcquire,
  onAcquire,
}: LocationGeofenceCardProps) {
  const statusClass = isLocating
    ? "status-locking"
    : location
      ? accuracy && accuracy <= 50
        ? "status-accurate"
        : "status-inaccurate"
      : "status-locking";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div className={`location-status-card ${statusClass}`}>
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

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canAcquire}
        isLoading={isLocating}
        onClick={onAcquire}
      >
        {isLocating ? "Acquiring GPS..." : "Acquire GPS Location"}
      </Button>
    </div>
  );
}
