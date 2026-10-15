import type { AttendanceAction } from "../../types";

interface ActionSelectorProps {
  action: AttendanceAction;
  onSelectAction: (action: AttendanceAction) => void;
}

export function ActionSelector({ action, onSelectAction }: ActionSelectorProps) {
  return (
    <div className="action-selector-group" role="radiogroup" aria-label="Attendance Action">
      <button
        type="button"
        role="radio"
        aria-checked={action === "check-in"}
        className={`action-selector-btn ${action === "check-in" ? "selected" : ""}`}
        onClick={() => onSelectAction("check-in")}
      >
        <span aria-hidden="true">↗</span> Check In
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={action === "check-out"}
        className={`action-selector-btn ${action === "check-out" ? "selected" : ""}`}
        onClick={() => onSelectAction("check-out")}
      >
        <span aria-hidden="true">↙</span> Check Out
      </button>
    </div>
  );
}
