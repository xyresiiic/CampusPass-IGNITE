import type { ReactNode } from "react";
import "./ui.css";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  accentColor?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  accentColor,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`ui-stat-card ${className}`}
      style={{
        borderTop: accentColor ? `3px solid ${accentColor}` : undefined,
      }}
    >
      <div className="ui-stat-top">
        <span>{label}</span>
        {icon && (
          <span
            style={{
              color: accentColor || "var(--text-muted)",
              fontSize: "16px",
            }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <div className="ui-stat-value">{value}</div>

      {subtitle && <div className="ui-stat-subtitle">{subtitle}</div>}
    </div>
  );
}
