import { forwardRef, type SelectHTMLAttributes } from "react";
import "./ui.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string | boolean | null;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, className = "", children, id, ...rest },
  ref
) {
  const errorId = id && error ? `${id}-error` : undefined;

  return (
    <div className="ui-input-wrapper">
      <select
        ref={ref}
        id={id}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={`ui-select ${error ? "ui-select-error" : ""} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});
