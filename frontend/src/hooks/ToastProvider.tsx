import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ToastContext, type ToastContextType, type ToastItem } from "./toastContext";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 5000 }: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]);

      if (duration > 0) {
        window.setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, title?: string) => showToast({ type: "success", title, message }),
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string) => showToast({ type: "error", title, message, duration: 7000 }),
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string) => showToast({ type: "info", title, message }),
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => showToast({ type: "warning", title, message }),
    [showToast]
  );

  const value = useMemo<ToastContextType>(
    () => ({ toasts, showToast, success, error, info, warning, dismissToast }),
    [toasts, showToast, success, error, info, warning, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-card toast-${toast.type}`}
          role="status"
        >
          <div className="toast-icon" aria-hidden="true">
            {toast.type === "success" && "✓"}
            {toast.type === "error" && "✕"}
            {toast.type === "warning" && "!"}
            {toast.type === "info" && "i"}
          </div>
          <div className="toast-content">
            {toast.title && <strong className="toast-title">{toast.title}</strong>}
            <div className="toast-message">{toast.message}</div>
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
