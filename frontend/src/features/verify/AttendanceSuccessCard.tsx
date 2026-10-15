import { Button } from "../../components/ui";
import type { AttendanceAction } from "../../types";

interface AttendanceSuccessCardProps {
  info: {
    action: AttendanceAction;
    time: string;
    distanceM?: number;
    message: string;
  };
  onDismiss: () => void;
}

export function AttendanceSuccessCard({ info, onDismiss }: AttendanceSuccessCardProps) {
  return (
    <div className="success-screen-card" role="status" aria-live="polite">
      <div className="success-check-badge">✓</div>
      <h2 style={{ fontSize: "var(--text-xl)", margin: 0 }}>
        {info.action === "check-in" ? "Checked In!" : "Checked Out!"}
      </h2>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        Recorded at <strong>{info.time}</strong>.
        {info.distanceM !== undefined && (
          <span> Distance from campus: {info.distanceM}m.</span>
        )}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onDismiss();
          const el = document.getElementById("attendance-history-section");
          el?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        View My Attendance Records ↓
      </Button>
    </div>
  );
}
