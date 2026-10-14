import type { ReactNode } from "react";
import "./ui.css";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = "∅",
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`}>
      <div className="ui-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="ui-empty-title">{title}</h3>
      {description && <p className="ui-empty-description">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
