import type { CSSProperties } from "react";
import "./ui.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-sm)",
  className = "",
  style,
}: SkeletonProps) {
  return (
    <div
      className={`ui-skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} style={{ display: "flex", gap: "var(--space-4)" }}>
          {Array.from({ length: cols }).map((__, cIdx) => (
            <Skeleton key={cIdx} height="24px" style={{ flex: cIdx === 0 ? 1.5 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
