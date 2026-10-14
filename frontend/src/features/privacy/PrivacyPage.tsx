import { Link } from "react-router-dom";
import { Button, Card, CardBody, CardHeader } from "../../components/ui";

export function PrivacyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-bg)",
        padding: "var(--space-8) var(--space-4)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "680px" }}>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Link to="/check-in">
            <Button variant="ghost" size="sm">
              ← Return to Check-in
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div>
              <span className="hero-eyebrow">LEGAL & PRIVACY DISCLOSURE</span>
              <h1 style={{ fontSize: "var(--text-2xl)", margin: "var(--space-1) 0 0" }}>
                CampusPass Privacy Notice
              </h1>
            </div>
          </CardHeader>
          <CardBody style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", lineHeight: 1.6 }}>
            <section>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-1)" }}>
                1. Purpose of Data Collection
              </h2>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>
                CampusPass captures temporary facial camera frames and geographic positioning (GPS) solely for the
                purpose of authenticating identity and verifying physical presence within authorized campus boundaries.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-1)" }}>
                2. 3D Facial Liveness &amp; Verification
              </h2>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>
                Live camera captures are transmitted securely over TLS to generate a time-limited verification proof (valid
                for 90 seconds). This ensures protection against photo presentation, screen replays, and unauthorized proxy
                attendance. Camera streams are not continuously recorded or distributed.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-1)" }}>
                3. GPS Geofence Verification
              </h2>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>
                Location readings are captured strictly at the moment attendance confirmation is submitted. Your device is
                never tracked in the background after attendance is completed.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-1)" }}>
                4. Data Protection &amp; Retention
              </h2>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>
                All records, audit logs, and attendance timestamps are maintained on secure institution servers in compliance
                with university data governance policies.
              </p>
            </section>

            <div
              style={{
                marginTop: "var(--space-4)",
                paddingTop: "var(--space-4)",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Last updated: October 2026
              </span>
              <Link to="/check-in">
                <Button variant="primary" size="sm">
                  Acknowledge &amp; Return
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default PrivacyPage;
