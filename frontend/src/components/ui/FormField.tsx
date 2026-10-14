import type { ReactNode } from "react";
import "./ui.css";

export interface FormFieldProps {
  id?: string;
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  children,
  className = "",
}: FormFieldProps) {
  const errorId = id && error ? `${id}-error` : undefined;
  const hintId = id && hint ? `${id}-hint` : undefined;

  return (
    <div className={`ui-form-field ${className}`}>
      {label && (
        <label htmlFor={id} className="ui-label">
          {label}
          {required && <span className="ui-label-required" aria-hidden="true">*</span>}
        </label>
      )}

      {children}

      {error ? (
        <div id={errorId} className="ui-field-error" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div id={hintId} className="ui-field-hint">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
