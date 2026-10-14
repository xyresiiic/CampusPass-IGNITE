import type { HTMLAttributes, ReactNode } from "react";
import "./ui.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div className={`ui-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "", ...rest }: CardProps) {
  return (
    <div className={`ui-card-header ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = "", ...rest }: CardProps) {
  return (
    <div className={`ui-card-body ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = "", ...rest }: CardProps) {
  return (
    <div className={`ui-card-footer ${className}`} {...rest}>
      {children}
    </div>
  );
}
