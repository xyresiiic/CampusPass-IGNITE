import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import "./ui.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | boolean | null;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    type = "text",
    error,
    leftIcon,
    rightIcon,
    showPasswordToggle = false,
    className = "",
    id,
    disabled,
    ...rest
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password" || showPasswordToggle;
  const computedType = isPassword ? (showPassword ? "text" : "password") : type;

  const errorId = id && error ? `${id}-error` : undefined;

  return (
    <div className="ui-input-wrapper">
      {leftIcon && (
        <span
          style={{
            position: "absolute",
            left: "12px",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          {leftIcon}
        </span>
      )}

      <input
        ref={ref}
        id={id}
        type={computedType}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={`ui-input ${error ? "ui-input-error" : ""} ${className}`}
        style={{
          paddingLeft: leftIcon ? "38px" : undefined,
          paddingRight: isPassword && showPasswordToggle ? "42px" : rightIcon ? "38px" : undefined,
        }}
        {...rest}
      />

      {isPassword && showPasswordToggle ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((prev) => !prev)}
          style={{
            position: "absolute",
            right: "8px",
            padding: "6px 8px",
            color: "var(--text-muted)",
            fontSize: "12px",
            fontWeight: 600,
            borderRadius: "4px",
          }}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      ) : rightIcon ? (
        <span
          style={{
            position: "absolute",
            right: "12px",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
          }}
          aria-hidden="true"
        >
          {rightIcon}
        </span>
      ) : null}
    </div>
  );
});
