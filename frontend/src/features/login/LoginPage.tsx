import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth";
import { useOnlineStatus, useTheme, useToast } from "../../hooks";
import { Button, FormField, Input, Spinner } from "../../components/ui";
import "./login.css";

export function LoginPage() {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cold start detection
  const [isServerWakingUp, setIsServerWakingUp] = useState(false);
  const [serverHealth, setServerHealth] = useState<"checking" | "healthy" | "waking">("checking");

  const { login, sessionExpiredNotice, clearSessionExpiredNotice } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const abortControllerRef = useRef<AbortController | null>(null);

  // Health check with cold-start detection
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const wakeTimer = window.setTimeout(() => {
      if (!cancelled) {
        setIsServerWakingUp(true);
        setServerHealth("waking");
      }
    }, 2000);

    async function checkHealth() {
      try {
        await api.checkHealth(controller.signal);
        if (!cancelled) {
          window.clearTimeout(wakeTimer);
          setIsServerWakingUp(false);
          setServerHealth("healthy");
        }
      } catch {
        if (!cancelled) {
          setServerHealth("waking");
        }
      }
    }

    void checkHealth();

    return () => {
      cancelled = true;
      window.clearTimeout(wakeTimer);
      controller.abort();
    };
  }, []);

  // Display session expired notice from auth state
  useEffect(() => {
    if (sessionExpiredNotice) {
      toast.warning(sessionExpiredNotice, "Session Expired");
      clearSessionExpiredNotice();
    }
  }, [sessionExpiredNotice, toast, clearSessionExpiredNotice]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const cleanStaffId = staffId.trim().toUpperCase();
    if (!cleanStaffId) {
      setErrorMessage("Please enter your Staff ID.");
      return;
    }
    if (!pin.trim()) {
      setErrorMessage("Please enter your PIN.");
      return;
    }

    setIsSubmitting(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await api.login(cleanStaffId, pin.trim(), controller.signal);

      if (!data.access_token) {
        throw new Error("Login succeeded but no access token was returned.");
      }

      login(data.access_token, cleanStaffId, data.role);
      toast.success(`Welcome back, ${cleanStaffId}!`);

      // Redirect based on role or original intended location
      const origin = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      if (origin && !origin.startsWith("/login")) {
        navigate(origin, { replace: true });
      } else if (data.role === "admin") {
        navigate("/admin/overview", { replace: true });
      } else {
        navigate("/check-in", { replace: true });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to sign in. Please verify your credentials."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-split">
        {/* Left Hero Panel (Desktop) */}
        <aside className="login-hero" aria-label="Brand Overview">
          <div className="login-hero-top">
            <div className="brand-badge-logo" aria-hidden="true">
              CP
            </div>
            <div>
              <div className="brand-logo-text">CampusPass</div>
              <span className="brand-tagline">High-Assurance Staff Attendance</span>
            </div>
          </div>

          <div className="login-hero-content">
            <span className="hero-eyebrow">SMART CAMPUS ACCESS</span>
            <h1 className="hero-title">Attendance, verified with confidence.</h1>
            <p className="hero-description">
              Engineered with tamper-proof 3D facial verification and precision GPS geofencing to
              eliminate proxy attendance and secure institutional compliance.
            </p>

            <div className="hero-highlights">
              <div className="hero-highlight-item">
                <span className="hero-highlight-pill">01</span>
                <span>Cryptographic face-liveness proof verification</span>
              </div>
              <div className="hero-highlight-item">
                <span className="hero-highlight-pill">02</span>
                <span>Active campus perimeter GPS validation</span>
              </div>
              <div className="hero-highlight-item">
                <span className="hero-highlight-pill">03</span>
                <span>Automated half-day calculation & absence alerts</span>
              </div>
            </div>
          </div>

          <div className="login-hero-footer">
            <span>Enterprise Attendance Engine v2.0</span>
            <span>Secure TLS 1.3 · ISO-Compliant Records</span>
          </div>
        </aside>

        {/* Right Form Panel */}
        <main className="login-form-panel">
          <div className="login-theme-toggle">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </Button>
          </div>

          <div className="login-card-container">
            {/* Offline Alert */}
            {!isOnline && (
              <div className="offline-alert-banner" role="status">
                <span aria-hidden="true">⚠</span>
                <span>You are currently offline. Check your internet connection.</span>
              </div>
            )}

            {/* Cold Start / Waking Up Banner */}
            {isServerWakingUp && serverHealth === "waking" && (
              <div className="cold-start-banner" role="status" aria-live="polite">
                <Spinner size={16} />
                <div>
                  <strong>Waking up the server...</strong>
                  <p style={{ margin: "2px 0 0", opacity: 0.9 }}>
                    Free-tier hosting spin-up can take up to 45 seconds on initial visit.
                  </p>
                </div>
              </div>
            )}

            <div className="login-header-group">
              <h2 className="login-title">Sign in to CampusPass</h2>
              <p className="login-subtitle">
                Enter your staff credentials to access your attendance workspace.
              </p>
            </div>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <FormField id="staff-id" label="Staff ID" required error={null}>
                <Input
                  id="staff-id"
                  name="staff_id"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                  placeholder="e.g. STF001"
                  autoComplete="username"
                  autoCapitalize="characters"
                  required
                  disabled={isSubmitting}
                />
              </FormField>

              <FormField
                id="staff-pin"
                label="Account PIN"
                required
                hint="4 to 12 digits registered with administration"
                error={null}
              >
                <Input
                  id="staff-pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter your PIN"
                  autoComplete="current-password"
                  showPasswordToggle
                  required
                  disabled={isSubmitting}
                />
              </FormField>

              {errorMessage && (
                <div
                  className="ui-field-error"
                  role="alert"
                  aria-live="polite"
                  style={{
                    padding: "var(--space-2-5) var(--space-3)",
                    background: "var(--color-danger-soft)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-danger-border)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isSubmitting}
                style={{ marginTop: "var(--space-2)" }}
              >
                Sign in to CampusPass →
              </Button>
            </form>

            <div
              style={{
                marginTop: "var(--space-6)",
                paddingTop: "var(--space-4)",
                borderTop: "1px solid var(--border-subtle)",
                textAlign: "center",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
              }}
            >
              <span>Need help logging in? Contact your institution administrator.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
export default LoginPage;
