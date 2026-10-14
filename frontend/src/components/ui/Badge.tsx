import type { HTMLAttributes, ReactNode } from "react";
import "./ui.css";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "half-day";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({
  variant = "neutral",
  dot = false,
  children,
  className = "",
  ...rest
}: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge-${variant} ${className}`} {...rest}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
