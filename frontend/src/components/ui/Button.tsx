import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";
import "./ui.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger" | "danger-outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "ui-button",
    `ui-button-${variant}`,
    `ui-button-${size}`,
    fullWidth ? "ui-button-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={classes}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading ? (
        <Spinner size={size === "sm" ? 14 : size === "lg" ? 20 : 16} />
      ) : (
        leftIcon && <span aria-hidden="true">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </button>
  );
}
