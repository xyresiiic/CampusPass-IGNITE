import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../api/client";
import { useConfirm, useToast } from "../../../hooks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Skeleton,
} from "../../../components/ui";
import type { AbsenceAlert, Holiday } from "../../../types";

function buildWhatsAppUrl(phone: string, name: string, days: number): string {
  const digits = phone.replace(/\D/g, "");
  const number = digits.startsWith("91")
    ? digits
    : digits.startsWith("0")
      ? `91${digits.slice(1)}`
      : `91${digits}`;
  const msg = `Hello ${name},\n\nOur CampusPass attendance records show that you have been absent for ${days} consecutive working days. If you have approved leave or authorised campus duty, or believe your attendance record is incorrect, please contact the college administration.\n\nRegards,\nCampusPass Administration`;
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

export function AlertsPage() {
  const [alerts, setAlerts] = useState<AbsenceAlert[]>([]);
  const [thresholdDays, setThresholdDays] = useState(2);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);

  // Holidays state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayDesc, setNewHolidayDesc] = useState("");
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    void loadAbsenceAlerts();
    void loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAbsenceAlerts() {
    setIsLoadingAlerts(true);
    try {
      const data = await api.getAbsenceAlerts();
      setAlerts(data.alerts);
      setThresholdDays(data.threshold_days);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load absence alerts.");
    } finally {
      setIsLoadingAlerts(false);
    }
  }

  async function loadHolidays() {
    setIsLoadingHolidays(true);
    try {
      const data = await api.getHolidays();
      setHolidays(data);
    } catch {
      // silent
    } finally {
      setIsLoadingHolidays(false);
    }
  }

  async function handleAddHoliday(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newHolidayDate) return;

    setIsAddingHoliday(true);
    try {
      await api.addHoliday({
        holiday_date: newHolidayDate,
        description: newHolidayDesc.trim() || undefined,
      });
      toast.success("College holiday added successfully!");
      setNewHolidayDate("");
      setNewHolidayDesc("");
      void loadHolidays();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add holiday.");
    } finally {
      setIsAddingHoliday(false);
    }
  }

  async function handleDeleteHoliday(dateStr: string) {
    const confirmed = await confirm({
      title: "Remove Holiday?",
      message: `Are you sure you want to remove ${dateStr} from the college holiday calendar? Days will be recalculated in absence monitoring.`,
      confirmText: "Remove Holiday",
      isDestructive: true,
    });

    if (!confirmed) return;

    try {
      await api.deleteHoliday(dateStr);
      toast.success(`Holiday ${dateStr} removed.`);
      setHolidays((prev) => prev.filter((h) => h.holiday_date !== dateStr));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete holiday.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Header Bar */}
      <div className="admin-page-header">
        <div>
          <h1>Absence Monitoring &amp; Alerts</h1>
          <p>
            Track staff absent for more than {thresholdDays} consecutive working days. Weekends, approved
            leaves, and college holidays are automatically excluded.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => void loadAbsenceAlerts()} disabled={isLoadingAlerts}>
          {isLoadingAlerts ? "Scanning..." : "↻ Scan for Absences"}
        </Button>
      </div>

      {/* Alerts Grid */}
      <Card>
        <CardHeader>
          <div>
            <strong style={{ fontSize: "var(--text-base)" }}>Staff Absence Flags</strong>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Threshold: &gt; {thresholdDays} consecutive working days
            </p>
          </div>
          <Badge variant={alerts.length > 0 ? "danger" : "success"}>
            {alerts.length} Flagged
          </Badge>
        </CardHeader>

        <CardBody>
          {isLoadingAlerts ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Skeleton height="72px" />
              <Skeleton height="72px" />
            </div>
          ) : alerts.length === 0 ? (
            <EmptyState
              icon="✓"
              title="All staff accounted for"
              description="No staff members have exceeded the consecutive absence threshold. Attendance compliance is optimal."
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--space-4)" }}>
              {alerts.map((alert) => (
                <div
                  key={alert.staff_id}
                  style={{
                    padding: "var(--space-4)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-danger-border)",
                    background: "var(--color-danger-soft)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: "var(--text-base)", color: "var(--text-primary)" }}>
                        {alert.full_name}
                      </strong>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "2px" }}>
                        Staff ID: <code style={{ fontFamily: "var(--font-mono)" }}>{alert.staff_id}</code>
                      </div>
                      {alert.phone && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: "2px" }}>
                          📞 {alert.phone}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "var(--text-2xl)",
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          color: "var(--color-danger)",
                        }}
                      >
                        {alert.consecutive_absent_days}
                      </span>
                      <span style={{ display: "block", fontSize: "10px", textTransform: "uppercase", color: "var(--color-danger-text)" }}>
                        Days Absent
                      </span>
                    </div>
                  </div>

                  {alert.absent_since && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      Absent since: <strong>{alert.absent_since}</strong>
                    </div>
                  )}

                  <div>
                    {alert.phone ? (
                      <a
                        href={buildWhatsAppUrl(alert.phone, alert.full_name, alert.consecutive_absent_days)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: "none" }}
                      >
                        <Button variant="primary" size="sm" fullWidth style={{ background: "#16a34a" }}>
                          💬 Send WhatsApp Notice
                        </Button>
                      </a>
                    ) : (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        No phone registered. Add contact in Staff Management.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* College Holidays Calendar Card */}
      <Card>
        <CardHeader>
          <div>
            <strong style={{ fontSize: "var(--text-base)" }}>Official College Holidays</strong>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Official non-working days excluded from automated absence tracking.
            </p>
          </div>
          <Badge variant="neutral">{holidays.length} Holidays</Badge>
        </CardHeader>

        <CardBody style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Add Holiday Form */}
          <form onSubmit={handleAddHoliday} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ width: "160px" }}>
              <FormField id="new-holiday-date" label="Holiday Date" required>
                <Input
                  id="new-holiday-date"
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  required
                />
              </FormField>
            </div>

            <div style={{ flex: 1, minWidth: "180px" }}>
              <FormField id="new-holiday-desc" label="Description (Optional)">
                <Input
                  id="new-holiday-desc"
                  value={newHolidayDesc}
                  onChange={(e) => setNewHolidayDesc(e.target.value)}
                  placeholder="e.g. Diwali, Independence Day"
                />
              </FormField>
            </div>

            <Button type="submit" variant="primary" isLoading={isAddingHoliday} disabled={!newHolidayDate}>
              + Add Holiday
            </Button>
          </form>

          {/* Holiday List Chips */}
          <div style={{ marginTop: "var(--space-2)" }}>
            {isLoadingHolidays ? (
              <Skeleton height="36px" />
            ) : holidays.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                No college holidays configured.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {holidays.map((h) => (
                  <div
                    key={h.holiday_date}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-1-5) var(--space-3)",
                      borderRadius: "var(--radius-full)",
                      background: "var(--surface-card-subtle)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    <strong>{h.holiday_date}</strong>
                    {h.description && (
                      <span style={{ color: "var(--text-muted)" }}>({h.description})</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteHoliday(h.holiday_date)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        padding: "0 2px",
                        fontWeight: 700,
                      }}
                      title="Remove holiday"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default AlertsPage;
