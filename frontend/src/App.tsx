import { useEffect, useRef, useState, type FormEvent } from "react";
import "./App.css";

type Screen = "login" | "verify" | "admin";
type AdminSection = "overview" | "staff" | "history" | "requests" | "audit" | "notifications" | "alerts";
type AttendanceAction = "check-in" | "check-out";

type LeaveRequest = {
  id: string;
  staff_id: string;
  request_type: "leave" | "duty";
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewer_id?: string | null;
  review_comment?: string | null;
  escalated: boolean;
  created_at: string;
  updated_at: string;
};

type Notification = {
  id: string;
  recipient_id: string;
  recipient_role: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  reference_id?: string | null;
  created_at: string;
};

type AuditLog = {
  id?: number | string;
  actor_id: string;
  actor_role: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
};

type AttendanceRecord = {
  id: number;
  staff_id: string;
  check_in: string;
  check_out: string | null;
  created_at?: string;
};

type GPSLocation = {
  latitude: number;
  longitude: number;
  accuracy_m: number;
};

type AdminDashboardData = {
  date: string;
  total_staff: number;
  active_staff: number;
  inactive_staff: number;
  present_today: number;
  absent_today: number;
  currently_checked_in: number;
  recent_attendance: AttendanceRecord[];
};

type StaffAccount = {
  staff_id: string;
  role: string;
  is_active: boolean;
  full_name?: string | null;
  phone?: string | null;
  created_at?: string;
};

type AbsenceAlert = {
  staff_id: string;
  full_name: string;
  phone: string;
  consecutive_absent_days: number;
  absent_since: string | null;
};

type Holiday = {
  holiday_date: string;
  description?: string | null;
};

type HistoryStatus = "all" | "present" | "absent" | "checked_in";

type AttendanceHistoryRecord = {
  staff_id: string;
  status: "present" | "absent" | "checked_in";
  check_in: string | null;
  check_out: string | null;
};

type AttendanceHistoryResponse = {
  date: string;
  total: number;
  records: AttendanceHistoryRecord[];
};

type FaceVerificationResponse = {
  verified: boolean;
  proof_id: string;
  action: AttendanceAction;
  expires_at?: string;
  message?: string;
};

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://campuspass-ignite.onrender.com";

function getTodayDateInputValue() {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000
  );
  return localDate.toISOString().slice(0, 10);
}

/**
 * Requests the user's current GPS location.
 *
 * The browser may still block the request if its site permission,
 * Android location service, or Chrome app permission is disabled.
 * This function cannot override those operating-system settings.
 */
function getCurrentLocation(): Promise<GPSLocation> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(
        new Error(
          "Location requires HTTPS. Open https://campuspass-ignite.vercel.app in Chrome."
        )
      );
      return;
    }

    if (!("geolocation" in navigator)) {
      reject(
        new Error(
          "Location is not supported by this browser. Please use an updated version of Chrome."
        )
      );
      return;
    }

    let watchId: number | null = null;
    let finished = false;
    let best: GPSLocation | null = null;
    let timer: number | undefined;

    const timeoutMs = 25000;
    const targetAccuracyM = 50;

    const finish = (
      location?: GPSLocation,
      error?: Error
    ) => {
      if (finished) return;
      finished = true;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (timer !== undefined) {
        window.clearTimeout(timer);
      }

      if (location) {
        resolve(location);
      } else {
        reject(
          error ??
            new Error(
              "Unable to get your location. Enable location services and try again."
            )
        );
      }
    };

    const handleLocationError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        finish(
          undefined,
          new Error(
            "Location access is blocked. In Android Settings, open Apps > Chrome > Permissions > Location and allow location access. Then open Chrome Settings > Site settings > Location, allow location requests, and reload CampusPass."
          )
        );
        return;
      }

      if (error.code === error.POSITION_UNAVAILABLE) {
        if (best && best.accuracy_m <= targetAccuracyM) {
          finish(best);
        } else {
          finish(
            undefined,
            new Error(
              "Your phone could not determine your location accurately. Turn on Android Location, enable precise location for Chrome, and try again outdoors."
            )
          );
        }
        return;
      }

      if (error.code === error.TIMEOUT) {
        if (best) {
          finish(best);
        } else {
          finish(
            undefined,
            new Error(
              "Getting your location timed out. Turn on Location and try again in an open area."
            )
          );
        }
        return;
      }

      finish(
        undefined,
        new Error(
          "An unexpected location error occurred. Reload CampusPass and try again."
        )
      );
    };

    timer = window.setTimeout(() => {
      if (best) {
        finish(best);
      } else {
        finish(
          undefined,
          new Error(
            "No GPS reading was received within 25 seconds. Enable your phone's Location setting and Chrome location permission, then try again."
          )
        );
      }
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const candidate: GPSLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
          };

          if (
            !Number.isFinite(candidate.latitude) ||
            !Number.isFinite(candidate.longitude) ||
            !Number.isFinite(candidate.accuracy_m) ||
            candidate.latitude < -90 ||
            candidate.latitude > 90 ||
            candidate.longitude < -180 ||
            candidate.longitude > 180 ||
            candidate.accuracy_m <= 0
          ) {
            return;
          }

          if (
            !best ||
            candidate.accuracy_m < best.accuracy_m
          ) {
            best = candidate;
          }

          if (candidate.accuracy_m <= targetAccuracyM) {
            finish(candidate);
          }
        },
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        }
      );
    } catch (error) {
      finish(
        undefined,
        new Error(
          error instanceof Error
            ? `Could not start GPS: ${error.message}`
            : "Could not start GPS. Check your browser and device location settings."
        )
      );
    }
  });
}

function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [adminSection, setAdminSection] =
    useState<AdminSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [apiStatus, setApiStatus] = useState("Checking...");
  const [accessToken, setAccessToken] = useState("");

  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [pendingAttendanceAction, setPendingAttendanceAction] =
    useState<AttendanceAction | null>(null);

  const [faceProof, setFaceProof] = useState("");
  const [faceProofAction, setFaceProofAction] =
    useState<AttendanceAction | null>(null);

  const [adminData, setAdminData] =
    useState<AdminDashboardData | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  const [historyDate, setHistoryDate] = useState(
    getTodayDateInputValue()
  );
  const [historyStaffId, setHistoryStaffId] = useState("");
  const [historyStatus, setHistoryStatus] =
    useState<HistoryStatus>("all");
  const [historyData, setHistoryData] =
    useState<AttendanceHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [staffList, setStaffList] = useState<StaffAccount[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffMessage, setStaffMessage] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);

  const [newStaffId, setNewStaffId] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [newStaffFullName, setNewStaffFullName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [resetStaffId, setResetStaffId] = useState("");
  const [resetPin, setResetPin] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [enrollingStaffId, setEnrollingStaffId] =
    useState<string | null>(null);
  const [enrollCameraError, setEnrollCameraError] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState("");
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);

  // Phase 2 — Leave / Off-campus duty requests (staff view)
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(false);
  const [reqType, setReqType] = useState<"leave" | "duty">("leave");
  const [reqStartDate, setReqStartDate] = useState("");
  const [reqEndDate, setReqEndDate] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [reqMessage, setReqMessage] = useState("");
  const [reqError, setReqError] = useState("");

  // Phase 2 — Admin approval panel
  const [adminRequests, setAdminRequests] = useState<LeaveRequest[]>([]);
  const [adminRequestsLoading, setAdminRequestsLoading] = useState(false);
  const [adminRequestsError, setAdminRequestsError] = useState("");
  const [adminReqFilterStatus, setAdminReqFilterStatus] = useState("all");
  const [adminReqFilterType, setAdminReqFilterType] = useState("all");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");

  // Phase 3 — Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditFilterAction, setAuditFilterAction] = useState("");
  const [auditFilterActor, setAuditFilterActor] = useState("");

  // Phase 4 — Absence alerts & holidays
  const [absenceAlerts, setAbsenceAlerts] = useState<AbsenceAlert[]>([]);
  const [absenceLoading, setAbsenceLoading] = useState(false);
  const [absenceError, setAbsenceError] = useState("");
  const [absenceThreshold, setAbsenceThreshold] = useState(2);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayDesc, setNewHolidayDesc] = useState("");
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [holidayMessage, setHolidayMessage] = useState("");

  async function checkBackend() {
    try {
      const response = await fetch(`${API_URL}/health`);

      if (!response.ok) {
        throw new Error("Backend returned an error.");
      }

      const data = await response.json();
      setApiStatus(data.status === "healthy" ? "Connected" : "Unknown");
    } catch {
      setApiStatus("Disconnected");
    }
  }

  useEffect(() => {
    void checkBackend();
  }, []);

  // Phase 3 — poll notifications every 60 s when logged in
  useEffect(() => {
    if (!accessToken) return;
    void loadNotifications(accessToken);
    const interval = window.setInterval(() => {
      void loadNotifications(accessToken);
    }, 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function loadNotifications(token: string) {
    if (!token) return;
    setNotifLoading(true);
    try {
      const res = await fetch(`${API_URL}/notifications?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setNotifUnread(typeof data.unread_count === "number" ? data.unread_count : 0);
    } catch {
      // silent
    } finally {
      setNotifLoading(false);
    }
  }

  async function handleMarkAllRead() {
    if (!accessToken || markingRead) return;
    setMarkingRead(true);
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await loadNotifications(accessToken);
    } catch {
      // silent
    } finally {
      setMarkingRead(false);
    }
  }

  async function handleMarkOneRead(id: string) {
    if (!accessToken) return;
    try {
      await fetch(`${API_URL}/notifications/${encodeURIComponent(id)}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setNotifUnread((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  async function loadAuditLogs(token: string) {
    setAuditLoading(true);
    setAuditError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (auditFilterAction.trim()) params.set("action", auditFilterAction.trim());
      if (auditFilterActor.trim()) params.set("actor_id", auditFilterActor.trim().toUpperCase());
      const res = await fetch(`${API_URL}/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load audit logs.");
      setAuditLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Failed to load audit logs.");
    } finally {
      setAuditLoading(false);
    }
  }

  // Phase 4 — Absence alerts helpers
  async function loadAbsenceAlerts(token: string) {
    setAbsenceLoading(true);
    setAbsenceError("");
    try {
      const res = await fetch(`${API_URL}/admin/absence-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load absence alerts.");
      setAbsenceAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setAbsenceThreshold(typeof data.threshold_days === "number" ? data.threshold_days : 2);
    } catch (e) {
      setAbsenceError(e instanceof Error ? e.message : "Failed to load absence alerts.");
    } finally {
      setAbsenceLoading(false);
    }
  }

  async function loadHolidays(token: string) {
    setHolidaysLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/holidays`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.holidays)) {
        setHolidays(
          data.holidays.map((item: any) =>
            typeof item === "string"
              ? { holiday_date: item, description: "" }
              : { holiday_date: item.holiday_date, description: item.description || "" }
          )
        );
      }
    } catch { /* silent */ }
    finally { setHolidaysLoading(false); }
  }

  async function handleAddHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newHolidayDate || !accessToken || holidayBusy) return;
    setHolidayBusy(true);
    setHolidayMessage("");
    try {
      const res = await fetch(`${API_URL}/admin/holidays`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ holiday_date: newHolidayDate, description: newHolidayDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add holiday.");
      setHolidayMessage("Holiday added.");
      setNewHolidayDate("");
      setNewHolidayDesc("");
      await loadHolidays(accessToken);
    } catch (e) {
      setHolidayMessage(e instanceof Error ? e.message : "Failed.");
    } finally {
      setHolidayBusy(false);
    }
  }

  async function handleDeleteHoliday(dateStr: string) {
    if (!accessToken) return;
    try {
      await fetch(`${API_URL}/admin/holidays/${encodeURIComponent(dateStr)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setHolidays((prev) => prev.filter((h) => h.holiday_date !== dateStr));
    } catch { /* silent */ }
  }

  function buildWhatsAppUrl(phone: string, name: string, days: number): string {
    // Strip non-numeric chars and ensure country code (default +91 India)
    const digits = phone.replace(/\D/g, "");
    const number = digits.startsWith("91") ? digits : digits.startsWith("0") ? `91${digits.slice(1)}` : `91${digits}`;
    const msg = `Hello ${name},\n\nOur CampusPass attendance records show that you have been absent for ${days} consecutive working days. If you have approved leave or authorised campus duty, or believe your attendance record is incorrect, please contact the college administration.\n\nRegards,\nCampusPass Administration`;
    return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
  }

  async function loadAdminRequests(token: string) {
    setAdminRequestsLoading(true);
    setAdminRequestsError("");
    try {
      const params = new URLSearchParams();
      if (adminReqFilterStatus !== "all") params.set("status", adminReqFilterStatus);
      if (adminReqFilterType !== "all") params.set("request_type", adminReqFilterType);
      const res = await fetch(`${API_URL}/admin/requests?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load requests.");
      setAdminRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (e) {
      setAdminRequestsError(e instanceof Error ? e.message : "Failed to load requests.");
    } finally {
      setAdminRequestsLoading(false);
    }
  }

  async function handleReviewRequest(id: string, status: "approved" | "rejected") {
    if (!accessToken || reviewBusy) return;
    setReviewBusy(true);
    setReviewMessage("");
    try {
      const res = await fetch(`${API_URL}/admin/requests/${encodeURIComponent(id)}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status, review_comment: reviewComment || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Review failed.");
      setReviewMessage(`Request ${status} successfully.`);
      setReviewingId(null);
      setReviewComment("");
      await loadAdminRequests(accessToken);
      await loadNotifications(accessToken);
    } catch (e) {
      setReviewMessage(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function loadMyRequests(token: string) {
    setMyRequestsLoading(true);
    try {
      const res = await fetch(`${API_URL}/requests/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMyRequests(Array.isArray(data.requests) ? data.requests : []);
      }
    } catch {
      // silent
    } finally {
      setMyRequestsLoading(false);
    }
  }

  async function handleSubmitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || reqBusy) return;
    setReqError("");
    setReqMessage("");
    if (!reqStartDate || !reqEndDate) {
      setReqError("Please select both start and end dates.");
      return;
    }
    if (reqStartDate > reqEndDate) {
      setReqError("Start date cannot be after end date.");
      return;
    }
    if (reqReason.trim().length < 3) {
      setReqError("Please provide a reason (minimum 3 characters).");
      return;
    }
    setReqBusy(true);
    try {
      const res = await fetch(`${API_URL}/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          request_type: reqType,
          start_date: reqStartDate,
          end_date: reqEndDate,
          reason: reqReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not submit request.");
      setReqMessage(`Request submitted successfully (ID: ${data.request?.id ?? ""}).`);
      setReqReason("");
      setReqStartDate("");
      setReqEndDate("");
      await loadMyRequests(accessToken);
    } catch (e) {
      setReqError(e instanceof Error ? e.message : "Could not submit request.");
    } finally {
      setReqBusy(false);
    }
  }

  useEffect(() => {
    if (screen !== "verify") return;

    let stream: MediaStream | null = null;
    let cancelled = false;
    let videoElement: HTMLVideoElement | null = null;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera access is unavailable. Open CampusPass in Chrome using HTTPS."
        );
        return;
      }

      try {
        const cameraStream =
          await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
          });

        if (cancelled) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = cameraStream;
        videoElement = videoRef.current;

        if (videoElement) {
          videoElement.srcObject = cameraStream;
          await videoElement.play().catch(() => undefined);
        }

        setCameraError("");
      } catch (error) {
        console.error("CampusPass camera error:", error);

        if (!cancelled) {
          setCameraError(
            "Unable to access the camera. Allow camera permission and check that no other app is using it."
          );
        }
      }
    }

    setCameraError("");
    void startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());

      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [screen]);

  useEffect(() => {
    if (!enrollingStaffId || screen !== "admin") return;

    let stream: MediaStream | null = null;
    let cancelled = false;
    let videoElement: HTMLVideoElement | null = null;

    async function startEnrollmentCamera() {
      setEnrollCameraError("");

      if (!navigator.mediaDevices?.getUserMedia) {
        setEnrollCameraError(
          "Camera access is unavailable. Open CampusPass using HTTPS."
        );
        return;
      }

      try {
        const cameraStream =
          await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
          });

        if (cancelled) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = cameraStream;
        videoElement = enrollVideoRef.current;

        if (videoElement) {
          videoElement.srcObject = cameraStream;
          await videoElement.play().catch(() => undefined);
        }
      } catch (error) {
        console.error("CampusPass enrollment camera error:", error);

        if (!cancelled) {
          setEnrollCameraError(
            error instanceof Error
              ? error.message
              : "Unable to access the enrollment camera. Check camera permissions."
          );
        }
      }
    }

    void startEnrollmentCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());

      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [enrollingStaffId, screen]);

  async function loadAttendance(token: string) {
    const response = await fetch(`${API_URL}/attendance/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not load attendance history.");
    }

    const records: AttendanceRecord[] = Array.isArray(data)
      ? data
      : data.records ?? data.attendance ?? [];

    setAttendanceRecords(records);
  }

  async function loadAdminDashboard(token: string) {
    setAdminLoading(true);
    setAdminError("");

    try {
      const response = await fetch(`${API_URL}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load admin dashboard.");
      }

      setAdminData(data as AdminDashboardData);
    } catch (error) {
      console.error("CampusPass dashboard error:", error);
      setAdminError(
        error instanceof Error
          ? error.message
          : "Unable to load admin dashboard."
      );
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadStaff(token: string) {
    setStaffLoading(true);
    setStaffError("");

    try {
      const response = await fetch(`${API_URL}/admin/staff`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load staff accounts.");
      }

      setStaffList(Array.isArray(data.staff) ? data.staff : []);
    } catch (error) {
      console.error("CampusPass staff loading error:", error);
      setStaffError(
        error instanceof Error
          ? error.message
          : "Unable to load staff accounts."
      );
    } finally {
      setStaffLoading(false);
    }
  }

  async function loadAttendanceHistory(token: string) {
    if (!historyDate) {
      setHistoryError("Please select an attendance date.");
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const params = new URLSearchParams();
      params.set("selected_date", historyDate);
      params.set("status", historyStatus);

      if (historyStaffId.trim()) {
        params.set("staff_id", historyStaffId.trim().toUpperCase());
      }

      const response = await fetch(
        `${API_URL}/admin/attendance/history?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to load attendance history."
        );
      }

      setHistoryData(data as AttendanceHistoryResponse);
    } catch (error) {
      console.error("CampusPass history error:", error);
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Unable to load attendance history."
      );
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (screen === "admin" && accessToken) {
      void loadAdminDashboard(accessToken);
      void loadStaff(accessToken);
      void loadAttendanceHistory(accessToken);
      void loadAdminRequests(accessToken);
    }
    if (screen === "verify" && accessToken) {
      void loadMyRequests(accessToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, accessToken]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setAttendanceMessage("");
    setAdminError("");
    setAdminData(null);
    setStaffError("");
    setStaffMessage("");
    setStaffList([]);
    setHistoryData(null);
    setHistoryError("");
    setFaceProof("");
    setFaceProofAction(null);
    setMyRequests([]);
    setAdminRequests([]);
    setNotifications([]);
    setNotifUnread(0);
    setAuditLogs([]);

    if (!staffId.trim() || !pin.trim()) {
      setMessage("Please enter your Staff ID and PIN.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId.trim(), pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Login failed.");
        return;
      }

      if (!data.access_token) {
        setMessage(
          "Login succeeded, but the backend did not return an access token."
        );
        return;
      }

      setAccessToken(data.access_token);
      setAttendanceRecords([]);
      setPin("");

      if (data.role === "admin") {
        setAdminSection("overview");
        setScreen("admin");
      } else if (data.role === "staff") {
        setScreen("verify");

        try {
          await loadAttendance(data.access_token);
        } catch (error) {
          console.error("Attendance history error:", error);
          setAttendanceMessage(
            error instanceof Error
              ? error.message
              : "Could not load attendance history."
          );
        }
      } else {
        setAccessToken("");
        setMessage("This account has an unrecognized role.");
      }
    } catch (error) {
      console.error("CampusPass login error:", error);
      setMessage(
        "Cannot connect to the backend. Check the backend URL and connection."
      );
    }
  }

  async function verifyFaceForAction(
    action: AttendanceAction
  ): Promise<string> {
    if (!accessToken) {
      throw new Error("Please log in again to continue.");
    }

    const video = videoRef.current;

    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      throw new Error(
        "Camera is not ready. Allow camera access and try again."
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to capture the camera image.");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.85);

    setAttendanceMessage("Verifying your face...");

    const response = await fetch(`${API_URL}/face/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ image, action }),
    });

    const responseText = await response.text();

    let data: Partial<FaceVerificationResponse> & {
      detail?: string;
    };

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(
        `Unexpected face-verification response (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : `Face verification failed (HTTP ${response.status}).`
      );
    }

    if (
      data.verified !== true ||
      typeof data.proof_id !== "string" ||
      data.action !== action
    ) {
      throw new Error(
        "The server did not return a valid face-verification proof."
      );
    }

    setFaceProof(data.proof_id);
    setFaceProofAction(action);

    return data.proof_id;
  }

  /**
   * Updated flow:
   * 1. Request GPS immediately when the user confirms attendance.
   * 2. Verify the live camera image.
   * 3. Send the GPS coordinates and face proof to the existing backend.
   * 4. Let the backend enforce its own GPS accuracy and campus geofence.
   */
  async function handleAttendance(action: AttendanceAction) {
    if (!accessToken) {
      setAttendanceMessage("Please log in again to continue.");
      handleLogout();
      return;
    }

    if (attendanceBusy) return;

    setAttendanceBusy(true);
    setAttendanceMessage("");

    let proof = faceProofAction === action ? faceProof : "";

    try {
      // Request location before waiting for the face-verification API.
      setAttendanceMessage("Requesting GPS location...");
      const location = await getCurrentLocation();

      // Preserve the existing face-verification requirement.
      if (!proof) {
        proof = await verifyFaceForAction(action);
      }

      setAttendanceMessage("Face verified. Submitting attendance...");

      const response = await fetch(`${API_URL}/attendance/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...location,
          face_proof: proof,
        }),
      });

      const responseText = await response.text();

      let data: {
        detail?: string;
        message?: string;
        location?: { distance_m?: number };
      };

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `Unexpected server response (HTTP ${response.status}).`
        );
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : `Attendance failed (HTTP ${response.status}).`;

        const normalized = detail.toLowerCase();

        if (response.status === 401) {
          setAttendanceMessage(
            "Your session has expired. Please log in again."
          );
          handleLogout();
          return;
        }

        if (
          normalized.includes("outside the campus") ||
          normalized.includes("outside campus")
        ) {
          setAttendanceMessage(
            "You are outside the campus area. Please reach the college to mark attendance."
          );
        } else if (normalized.includes("accuracy")) {
          setAttendanceMessage(
            "Your GPS accuracy is too low. Move to an open area and try again."
          );
        } else if (
          normalized.includes("spoof") ||
          normalized.includes("photo") ||
          normalized.includes("screen replay")
        ) {
          setAttendanceMessage(
            "⚠️ Spoofing detected: 2D photograph or screen replay rejected. Please face the live camera in person."
          );
        } else {
          setAttendanceMessage(detail);
        }

        if (
          response.status === 403 ||
          response.status === 409 ||
          normalized.includes("proof") ||
          normalized.includes("face verification")
        ) {
          setFaceProof("");
          setFaceProofAction(null);
        }

        return;
      }

      setFaceProof("");
      setFaceProofAction(null);

      const distance = data.location?.distance_m;

      setAttendanceMessage(
        `${data.message || "Attendance recorded successfully."}${
          distance !== undefined
            ? ` Distance from campus pin: ${distance} metres.`
            : ""
        }`
      );

      await loadAttendance(accessToken);
    } catch (error) {
      console.error(`CampusPass ${action} error:`, error);
      setFaceProof("");
      setFaceProofAction(null);

      const rawError =
        error instanceof Error
          ? error.message
          : "Attendance request failed. Please try again.";
      const lower = rawError.toLowerCase();

      if (
        lower.includes("spoof") ||
        lower.includes("photo") ||
        lower.includes("screen replay")
      ) {
        setAttendanceMessage(
          "⚠️ Spoofing detected: 2D photograph or screen replay rejected. Please face the live camera in person."
        );
      } else {
        setAttendanceMessage(rawError);
      }
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function handleCreateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStaffMessage("");
    setStaffError("");

    const cleanId = newStaffId.trim().toUpperCase();

    if (!cleanId || !newStaffPin) {
      setStaffError("Enter a Staff ID and an initial PIN.");
      return;
    }

    if (!/^\d{4,12}$/.test(newStaffPin)) {
      setStaffError("PIN must contain 4 to 12 digits.");
      return;
    }

    setStaffBusy(true);

    try {
      const response = await fetch(`${API_URL}/admin/staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ staff_id: cleanId, pin: newStaffPin, full_name: newStaffFullName.trim() || null, phone: newStaffPhone.trim() || null }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to create staff account."
        );
      }

      setStaffMessage(`Staff account ${cleanId} created successfully.`);
      setNewStaffId("");
      setNewStaffPin("");
      setNewStaffFullName("");
      setNewStaffPhone("");

      await loadStaff(accessToken);
      await loadAdminDashboard(accessToken);
    } catch (error) {
      setStaffError(
        error instanceof Error
          ? error.message
          : "Unable to create staff account."
      );
    } finally {
      setStaffBusy(false);
    }
  }

  async function handleResetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStaffMessage("");
    setStaffError("");

    const cleanId = resetStaffId.trim().toUpperCase();

    if (!cleanId || !resetPin) {
      setStaffError("Select a Staff ID and enter the new PIN.");
      return;
    }

    if (!/^\d{4,12}$/.test(resetPin)) {
      setStaffError("PIN must contain 4 to 12 digits.");
      return;
    }

    setStaffBusy(true);

    try {
      const response = await fetch(
        `${API_URL}/admin/staff/${encodeURIComponent(cleanId)}/pin`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ pin: resetPin }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to reset PIN.");
      }

      setStaffMessage(`PIN reset successfully for ${cleanId}.`);
      setResetStaffId("");
      setResetPin("");
    } catch (error) {
      setStaffError(
        error instanceof Error ? error.message : "Unable to reset PIN."
      );
    } finally {
      setStaffBusy(false);
    }
  }

  async function handleToggleStaff(staff: StaffAccount) {
    const nextStatus = !staff.is_active;
    const action = nextStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${staff.staff_id}?`
    );

    if (!confirmed) return;

    setStaffBusy(true);
    setStaffMessage("");
    setStaffError("");

    try {
      const response = await fetch(
        `${API_URL}/admin/staff/${encodeURIComponent(staff.staff_id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ is_active: nextStatus }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to update account status.");
      }

      setStaffMessage(
        `${staff.staff_id} has been ${
          nextStatus ? "activated" : "deactivated"
        }.`
      );

      await loadStaff(accessToken);
      await loadAdminDashboard(accessToken);
    } catch (error) {
      setStaffError(
        error instanceof Error
          ? error.message
          : "Unable to update account status."
      );
    } finally {
      setStaffBusy(false);
    }
  }

  function openFaceEnrollment(staff: StaffAccount) {
    if (!staff.is_active || staffBusy || enrollBusy) return;

    setEnrollCameraError("");
    setEnrollMessage("");
    setEnrollingStaffId(staff.staff_id);
  }

  function closeFaceEnrollment() {
    if (enrollBusy) return;

    setEnrollingStaffId(null);
    setEnrollCameraError("");
    setEnrollMessage("");
  }

  async function handleEnrollFace() {
    if (!accessToken || !enrollingStaffId || enrollBusy) return;

    const video = enrollVideoRef.current;

    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setEnrollCameraError(
        "Camera is not ready. Wait for the preview and try again."
      );
      return;
    }

    setEnrollBusy(true);
    setEnrollMessage("");
    setEnrollCameraError("");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Unable to capture the camera image.");
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.9);

      const response = await fetch(
        `${API_URL}/admin/staff/${encodeURIComponent(enrollingStaffId)}/face`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ image }),
        }
      );

      const responseText = await response.text();
      let data: { detail?: string; message?: string } = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `Unexpected server response (HTTP ${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Face enrollment failed (HTTP ${response.status}).`
        );
      }

      setStaffMessage(
        `Face enrolled successfully for ${enrollingStaffId}.`
      );
      setEnrollMessage(
        `Face enrollment completed for ${enrollingStaffId}.`
      );
      setEnrollingStaffId(null);
    } catch (error) {
      setEnrollCameraError(
        error instanceof Error
          ? error.message
          : "Face enrollment failed. Please try again."
      );
    } finally {
      setEnrollBusy(false);
    }
  }

  function handleLogout() {
    setEnrollingStaffId(null);
    setEnrollCameraError("");
    setEnrollMessage("");
    setEnrollBusy(false);

    setAccessToken("");
    setAttendanceRecords([]);
    setAttendanceMessage("");
    setPendingAttendanceAction(null);
    setAttendanceBusy(false);
    setFaceProof("");
    setFaceProofAction(null);
    setCameraError("");
    setAdminData(null);
    setAdminError("");
    setStaffList([]);
    setStaffError("");
    setStaffMessage("");
    setNewStaffId("");
    setNewStaffPin("");
    setResetStaffId("");
    setResetPin("");
    setHistoryData(null);
    setHistoryError("");
    setHistoryStaffId("");
    setHistoryStatus("all");
    setHistoryDate(getTodayDateInputValue());
    setMessage("");
    setPin("");
    setAdminSection("overview");
    setSidebarOpen(false);
    // Phase 2/3 reset
    setMyRequests([]);
    setAdminRequests([]);
    setAdminRequestsError("");
    setReviewingId(null);
    setReviewComment("");
    setReviewMessage("");
    setReqMessage("");
    setReqError("");
    setNotifications([]);
    setNotifUnread(0);
    setAuditLogs([]);
    setAuditError("");
    setAuditFilterAction("");
    setAuditFilterActor("");
    // Phase 4 reset
    setAbsenceAlerts([]);
    setAbsenceError("");
    setHolidays([]);
    setNewHolidayDate("");
    setNewHolidayDesc("");
    setHolidayMessage("");
    setNewStaffFullName("");
    setNewStaffPhone("");
    setScreen("login");
  }

  function formatDateTime(value: string | null) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  const pageTitles: Record<AdminSection, string> = {
    overview: "Dashboard overview",
    staff: "Staff management",
    history: "Attendance history",
    requests: "Leave & duty requests",
    audit: "Audit trail",
    notifications: "Notifications",
    alerts: "Absence alerts",
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="mobile-menu-button"
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          ☰
        </button>

        <button
          className="brand"
          type="button"
          onClick={() => {
            if (screen !== "login") handleLogout();
          }}
        >
          <span className="brand-icon">CP</span>
          <span>
            <strong>CampusPass</strong>
            <small>Secure staff attendance</small>
          </span>
        </button>

        <div className="top-actions">
          <span
            className={`status-dot ${
              apiStatus === "Connected" ? "status-online" : "status-offline"
            }`}
          />
          <span className="api-status">API: {apiStatus}</span>
          <button
            className="outline-button"
            type="button"
            onClick={() => void checkBackend()}
          >
            Test API
          </button>
        </div>
      </header>

      {screen === "login" && (
        <main className="main-content">
          <section className="login-layout">
            <div className="intro-panel">
              <span className="eyebrow">SMART CAMPUS ACCESS</span>
              <h1>
                Attendance,
                <br />
                made smarter.
              </h1>
              <p>
                A secure attendance experience designed around staff
                identity, campus location, and reliable records.
              </p>

              <div className="feature-list">
                <div><span>01</span> Staff identity verification</div>
                <div><span>02</span> Camera-based face matching</div>
                <div><span>03</span> Location-aware attendance</div>
              </div>
            </div>

            <form className="login-card" onSubmit={handleLogin}>
              <div className="card-symbol">CP</div>
              <h2>Welcome back</h2>
              <p className="muted">Enter your staff details to continue.</p>

              <label htmlFor="staffId">Staff ID</label>
              <input
                id="staffId"
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
                placeholder="e.g. STF001"
                autoComplete="username"
                required
              />

              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="Enter your PIN"
                autoComplete="current-password"
                required
              />

              {message && (
                <p className="error-message" role="alert">{message}</p>
              )}

              <button className="primary-button" type="submit">
                Sign in <span>→</span>
              </button>

              <p className="demo-note">
                Use your registered CampusPass account.
              </p>
            </form>
          </section>
        </main>
      )}

      {screen === "verify" && (
        <main className="main-content">
          <section className="workflow-card">
            <button
              className="text-button"
              type="button"
              onClick={handleLogout}
            >
              ← Log out
            </button>

            <span className="eyebrow">STAFF ATTENDANCE</span>
            <h1>Welcome, {staffId}</h1>
            <p className="muted">
              Your face and campus location must be verified before
              attendance is recorded.
            </p>

            <div className="camera-placeholder">
              {cameraError ? (
                <div className="camera-error">
                  <strong>Camera unavailable</strong>
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => {
                      setCameraError("");
                      setScreen("login");
                      window.setTimeout(() => setScreen("verify"), 0);
                    }}
                  >
                    Try camera again
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Live camera preview"
                  />
                  <strong>Live camera preview</strong>
                  <p>
                    Your camera image will be checked against your enrolled
                    face profile when you confirm attendance.
                  </p>
                </>
              )}
            </div>

            <div className="challenge-box">
              <span className="eyebrow">FACE VERIFICATION</span>
              <h2>Look directly at the camera</h2>
              <p className="muted">
                Keep your face clearly visible in good lighting. Live 3D facial
                verification protects against photos and screen replays.
              </p>
            </div>

            <div className="button-row">
              <button
                className="primary-button"
                type="button"
                disabled={attendanceBusy || !!cameraError}
                onClick={() => {
                  setAttendanceMessage("");
                  setPendingAttendanceAction("check-in");
                }}
              >
                {attendanceBusy ? "Please wait..." : "Check in"}
              </button>

              <button
                className="outline-button"
                type="button"
                disabled={attendanceBusy || !!cameraError}
                onClick={() => {
                  setAttendanceMessage("");
                  setPendingAttendanceAction("check-out");
                }}
              >
                {attendanceBusy ? "Please wait..." : "Check out"}
              </button>
            </div>

            {!attendanceBusy && !pendingAttendanceAction && (
              <p className="muted">
                Ready to record attendance. Select Check in or Check out.
              </p>
            )}

            {attendanceMessage && (
              <div
                className={`attendance-alert ${
                  /outside the campus|not accurate|accuracy is too low|failed|unable|denied|too long|cannot connect|error|gps signal|could not|not enrolled|not ready|expired|rejected|must be|blocked|timed out|permission/i.test(
                    attendanceMessage
                  )
                    ? "alert-error"
                    : "alert-success"
                }`}
                role="status"
                aria-live="polite"
              >
                <span>{attendanceMessage}</span>
              </div>
            )}

            <div className="table-card">
              <div className="admin-heading">
                <div>
                  <h2>My attendance history</h2>
                  <p className="muted">
                    Records saved in the CampusPass database.
                  </p>
                </div>
                <button
                  className="outline-button"
                  type="button"
                  disabled={attendanceBusy}
                  onClick={async () => {
                    setAttendanceMessage("");
                    try {
                      await loadAttendance(accessToken);
                      setAttendanceMessage(
                        "Attendance history refreshed."
                      );
                    } catch (error) {
                      setAttendanceMessage(
                        error instanceof Error
                          ? error.message
                          : "Could not refresh attendance."
                      );
                    }
                  }}
                >
                  Refresh
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.length === 0 ? (
                      <tr>
                        <td colSpan={3}>No attendance records found.</td>
                      </tr>
                    ) : (
                      attendanceRecords.map((record, index) => (
                        <tr key={record.id ?? index}>
                          <td>{formatDateTime(record.check_in)}</td>
                          <td>{formatDateTime(record.check_out)}</td>
                          <td>
                            <span
                              className={`badge ${
                                record.check_out ? "verified" : "gps-only"
                              }`}
                            >
                              {record.check_out ? "Completed" : "Checked in"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Phase 2: Staff — Leave / Duty Request Form */}
          <section className="workflow-card" style={{ marginTop: 24 }}>
            <span className="eyebrow">LEAVE &amp; OFF-CAMPUS DUTY</span>
            <h2>Submit a request</h2>
            <p className="muted">Submit a leave or off-campus duty request for admin approval.</p>

            <form onSubmit={handleSubmitRequest} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
              <div>
                <label htmlFor="reqType" style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}>Request type</label>
                <select
                  id="reqType"
                  value={reqType}
                  onChange={(e) => setReqType(e.target.value as "leave" | "duty")}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14 }}
                >
                  <option value="leave">Leave</option>
                  <option value="duty">Off-campus duty</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="reqStart" style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}>Start date</label>
                  <input id="reqStart" type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} required style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="reqEnd" style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}>End date</label>
                  <input id="reqEnd" type="date" value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} required style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14 }} />
                </div>
              </div>
              <div>
                <label htmlFor="reqReason" style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 600 }}>Reason</label>
                <textarea
                  id="reqReason"
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder="Brief reason for your request..."
                  minLength={3}
                  maxLength={500}
                  required
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
                />
              </div>
              {reqError && <p className="error-message" role="alert">{reqError}</p>}
              {reqMessage && <p className="success-message" role="status">{reqMessage}</p>}
              <button className="primary-button" type="submit" disabled={reqBusy}>
                {reqBusy ? "Submitting..." : "Submit request"}
              </button>
            </form>

            {/* My requests list */}
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>My requests</h3>
                <button className="outline-button" type="button" disabled={myRequestsLoading} onClick={() => void loadMyRequests(accessToken)} style={{ fontSize: 13 }}>
                  {myRequestsLoading ? "Loading..." : "↻ Refresh"}
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequestsLoading && myRequests.length === 0 ? (
                      <tr><td colSpan={5}>Loading...</td></tr>
                    ) : myRequests.length === 0 ? (
                      <tr><td colSpan={5}>No requests submitted yet.</td></tr>
                    ) : (
                      myRequests.map((req) => (
                        <tr key={req.id}>
                          <td style={{ fontSize: 12, fontFamily: "monospace" }}>{req.id}</td>
                          <td><span className={`badge ${req.request_type === "leave" ? "gps-only" : "verified"}`}>{req.request_type === "duty" ? "Off-campus" : "Leave"}</span></td>
                          <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{req.start_date} → {req.end_date}</td>
                          <td>
                            <span className={`badge ${
                              req.status === "approved" ? "verified" :
                              req.status === "rejected" ? "badge-red" : "gps-only"
                            }`}>
                              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                              {req.escalated ? " ⚠" : ""}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: "var(--muted)" }}>{req.review_comment || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      )}

      {screen === "admin" && (
        <div className="admin-layout">
          {sidebarOpen && (
            <button
              type="button"
              aria-label="Close navigation"
              className="sidebar-backdrop"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
            <div className="sidebar-heading">
              <span className="sidebar-section-label">WORKSPACE</span>
            </div>

            <nav className="sidebar-nav" aria-label="Admin navigation">
              <button
                type="button"
                className={`nav-item ${
                  adminSection === "overview" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("overview");
                  setSidebarOpen(false);
                }}
              >
                <span className="nav-icon">▦</span>
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                className={`nav-item ${
                  adminSection === "staff" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("staff");
                  setSidebarOpen(false);
                }}
              >
                <span className="nav-icon">♙</span>
                <span>Staff management</span>
              </button>

              <button
                type="button"
                className={`nav-item ${
                  adminSection === "history" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("history");
                  setSidebarOpen(false);
                }}
              >
                <span className="nav-icon">▤</span>
                <span>Attendance history</span>
              </button>

              <button
                type="button"
                className={`nav-item ${
                  adminSection === "requests" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("requests");
                  setSidebarOpen(false);
                  void loadAdminRequests(accessToken);
                }}
              >
                <span className="nav-icon">📋</span>
                <span>Leave &amp; duty</span>
              </button>

              <button
                type="button"
                className={`nav-item ${
                  adminSection === "notifications" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("notifications");
                  setSidebarOpen(false);
                  void loadNotifications(accessToken);
                }}
              >
                <span className="nav-icon">🔔</span>
                <span>
                  Notifications
                  {notifUnread > 0 && (
                    <span className="notif-badge">{notifUnread}</span>
                  )}
                </span>
              </button>

              <button
                type="button"
                className={`nav-item ${
                  adminSection === "audit" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("audit");
                  setSidebarOpen(false);
                  void loadAuditLogs(accessToken);
                }}
              >
                <span className="nav-icon">🗂</span>
                <span>Audit trail</span>
              </button>

              <button
                type="button"
                className={`nav-item ${
                  adminSection === "alerts" ? "active" : ""
                }`}
                onClick={() => {
                  setAdminSection("alerts");
                  setSidebarOpen(false);
                  void loadAbsenceAlerts(accessToken);
                  void loadHolidays(accessToken);
                }}
              >
                <span className="nav-icon">⚠</span>
                <span>
                  Absence alerts
                  {absenceAlerts.length > 0 && (
                    <span className="notif-badge" style={{ background: "var(--red)" }}>{absenceAlerts.length}</span>
                  )}
                </span>
              </button>
            </nav>

            <div className="sidebar-bottom">
              <div className="sidebar-help">
                <span className="help-icon">i</span>
                <div>
                  <strong>Need help?</strong>
                  <p>Contact your system administrator.</p>
                </div>
              </div>
              <button
                type="button"
                className="sidebar-logout"
                onClick={handleLogout}
              >
                <span>↪</span> Sign out
              </button>
            </div>
          </aside>

          <main className="admin-main">
            <div className="admin-topline">
              <div>
                <span className="breadcrumb">CampusPass / Admin</span>
                <h1>{pageTitles[adminSection]}</h1>
              </div>

              <div className="admin-top-actions">
                <span
                  className={`connection-label ${
                    apiStatus === "Connected"
                      ? "connected"
                      : "disconnected"
                  }`}
                >
                  <span className="status-dot" />
                  {apiStatus}
                </span>
                {notifUnread > 0 && (
                  <button
                    className="notif-bell-button"
                    type="button"
                    title={`${notifUnread} unread notification${notifUnread > 1 ? "s" : ""}`}
                    onClick={() => {
                      setAdminSection("notifications");
                      void loadNotifications(accessToken);
                    }}
                  >
                    🔔 <span className="notif-badge">{notifUnread}</span>
                  </button>
                )}
                <button
                  className="outline-button"
                  type="button"
                  disabled={adminLoading || staffLoading}
                  onClick={() => {
                    void loadAdminDashboard(accessToken);
                    void loadStaff(accessToken);
                    void loadAttendanceHistory(accessToken);
                    void loadNotifications(accessToken);
                  }}
                >
                  {adminLoading || staffLoading
                    ? "Refreshing..."
                    : "↻ Refresh"}
                </button>
              </div>
            </div>

            {adminError && (
              <div className="error-message" role="alert">
                {adminError}
              </div>
            )}

            {adminSection === "overview" && (
              <>
                <div className="welcome-banner">
                  <div>
                    <span className="eyebrow">
                      YOUR CAMPUS AT A GLANCE
                    </span>
                    <h2>Good to see you, Admin.</h2>
                    <p>
                      Here is the latest attendance summary
                      {adminData ? ` for ${adminData.date}` : ""}.
                    </p>
                  </div>
                  <div className="welcome-mark">CP</div>
                </div>

                <div className="section-heading">
                  <div>
                    <h2>Attendance overview</h2>
                    <p>Key workforce statistics for today.</p>
                  </div>
                  <span className="date-chip">
                    {adminData?.date || historyDate}
                  </span>
                </div>

                <div className="stats-grid">
                  <div className="stat-card stat-blue">
                    <div className="stat-top">
                      <span>Total staff</span>
                      <span className="stat-icon">♙</span>
                    </div>
                    <strong>
                      {adminLoading && !adminData
                        ? "—"
                        : adminData?.total_staff ?? 0}
                    </strong>
                    <small>All registered accounts</small>
                  </div>

                  <div className="stat-card stat-green">
                    <div className="stat-top">
                      <span>Present today</span>
                      <span className="stat-icon">✓</span>
                    </div>
                    <strong>
                      {adminLoading && !adminData
                        ? "—"
                        : adminData?.present_today ?? 0}
                    </strong>
                    <small>Staff who checked in</small>
                  </div>

                  <div className="stat-card stat-orange">
                    <div className="stat-top">
                      <span>Absent today</span>
                      <span className="stat-icon">◷</span>
                    </div>
                    <strong>
                      {adminLoading && !adminData
                        ? "—"
                        : adminData?.absent_today ?? 0}
                    </strong>
                    <small>Not yet marked present</small>
                  </div>

                  <div className="stat-card stat-purple">
                    <div className="stat-top">
                      <span>Currently checked in</span>
                      <span className="stat-icon">↗</span>
                    </div>
                    <strong>
                      {adminLoading && !adminData
                        ? "—"
                        : adminData?.currently_checked_in ?? 0}
                    </strong>
                    <small>Open attendance sessions</small>
                  </div>

                  <div className="stat-card stat-teal">
                    <div className="stat-top">
                      <span>Active staff</span>
                      <span className="stat-icon">●</span>
                    </div>
                    <strong>
                      {adminLoading && !adminData
                        ? "—"
                        : adminData?.active_staff ?? 0}
                    </strong>
                    <small>Accounts with access</small>
                  </div>

                  <div className="stat-card stat-red">
                    <div className="stat-top">
                      <span>Inactive staff</span>
                      <span className="stat-icon">⊘</span>
                    </div>
                    <strong>
                      {adminLoading && !adminData
                        ? "—"
                        : adminData?.inactive_staff ?? 0}
                    </strong>
                    <small>Deactivated accounts</small>
                  </div>
                </div>

                <div className="table-card">
                  <div className="admin-heading">
                    <div>
                      <h2>Recent attendance</h2>
                      <p className="muted">
                        Latest records returned by the dashboard API.
                      </p>
                    </div>
                    <button
                      className="outline-button"
                      type="button"
                      onClick={() => {
                        setAdminSection("history");
                        void loadAttendanceHistory(accessToken);
                      }}
                    >
                      View all records →
                    </button>
                  </div>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Staff ID</th>
                          <th>Check-in</th>
                          <th>Check-out</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!adminData?.recent_attendance?.length ? (
                          <tr>
                            <td colSpan={4}>
                              {adminLoading
                                ? "Loading recent attendance..."
                                : "No recent attendance records."}
                            </td>
                          </tr>
                        ) : (
                          adminData.recent_attendance.map((record) => (
                            <tr key={record.id}>
                              <td>{record.staff_id}</td>
                              <td>{formatDateTime(record.check_in)}</td>
                              <td>{formatDateTime(record.check_out)}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    record.check_out
                                      ? "verified"
                                      : "gps-only"
                                  }`}
                                >
                                  {record.check_out
                                    ? "Completed"
                                    : "Checked in"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {adminSection === "staff" && (
              <div className="table-card">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">ACCOUNT MANAGEMENT</span>
                    <h2>Manage staff accounts</h2>
                    <p className="muted">
                      Create accounts, reset PINs, and control account access.
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    type="button"
                    disabled={staffLoading || staffBusy}
                    onClick={() => void loadStaff(accessToken)}
                  >
                    {staffLoading ? "Loading..." : "Refresh staff"}
                  </button>
                </div>

                {staffError && (
                  <p className="error-message" role="alert">{staffError}</p>
                )}
                {staffMessage && (
                  <p className="success-message" role="status">
                    {staffMessage}
                  </p>
                )}

                <div className="staff-forms-grid">
                  <form className="staff-form" onSubmit={handleCreateStaff}>
                    <h3>Add staff account</h3>
                    <p className="muted">
                      Create a new staff login with a unique ID.
                    </p>
                    <label htmlFor="newStaffId">New Staff ID</label>
                    <input
                      id="newStaffId"
                      value={newStaffId}
                      onChange={(event) => setNewStaffId(event.target.value)}
                      placeholder="e.g. STF002"
                      minLength={3}
                      maxLength={30}
                      required
                    />
                    <label htmlFor="newStaffPin">Initial PIN</label>
                    <input
                      id="newStaffPin"
                      type="password"
                      inputMode="numeric"
                      value={newStaffPin}
                      onChange={(event) => setNewStaffPin(event.target.value)}
                      placeholder="4–12 digit PIN"
                      minLength={4}
                      maxLength={12}
                      pattern="[0-9]{4,12}"
                      autoComplete="new-password"
                      required
                    />
                    <label htmlFor="newStaffFullName">Full Name (optional)</label>
                    <input
                      id="newStaffFullName"
                      value={newStaffFullName}
                      onChange={(event) => setNewStaffFullName(event.target.value)}
                      placeholder="e.g. Ravi Kumar"
                      maxLength={100}
                    />
                    <label htmlFor="newStaffPhone">Phone Number (optional)</label>
                    <input
                      id="newStaffPhone"
                      type="tel"
                      inputMode="numeric"
                      value={newStaffPhone}
                      onChange={(event) => setNewStaffPhone(event.target.value)}
                      placeholder="e.g. 9876543210"
                      maxLength={15}
                    />
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={staffBusy}
                    >
                      {staffBusy ? "Please wait..." : "Create account"}
                    </button>
                  </form>

                  <form className="staff-form" onSubmit={handleResetPin}>
                    <h3>Reset staff PIN</h3>
                    <p className="muted">
                      Set a new PIN for an existing account.
                    </p>
                    <label htmlFor="resetStaffId">Staff account</label>
                    <select
                      id="resetStaffId"
                      value={resetStaffId}
                      onChange={(event) => setResetStaffId(event.target.value)}
                      required
                    >
                      <option value="">Select a staff account</option>
                      {staffList.map((staff) => (
                        <option key={staff.staff_id} value={staff.staff_id}>
                          {staff.staff_id}
                          {staff.is_active ? "" : " (Inactive)"}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="resetPin">New PIN</label>
                    <input
                      id="resetPin"
                      type="password"
                      inputMode="numeric"
                      value={resetPin}
                      onChange={(event) => setResetPin(event.target.value)}
                      placeholder="4–12 digit PIN"
                      minLength={4}
                      maxLength={12}
                      pattern="[0-9]{4,12}"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={staffBusy}
                    >
                      {staffBusy ? "Please wait..." : "Reset PIN"}
                    </button>
                  </form>
                </div>

                <div className="section-heading staff-list-heading">
                  <div>
                    <h2>Registered staff</h2>
                    <p>
                      Manage account status and enroll staff face profiles.
                    </p>
                  </div>
                  <span className="date-chip">
                    {staffList.length} accounts
                  </span>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Staff ID</th>
                        <th>Account status</th>
                        <th>Created</th>
                        <th>Face enrollment</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffLoading && staffList.length === 0 ? (
                        <tr>
                          <td colSpan={5}>Loading staff accounts...</td>
                        </tr>
                      ) : staffList.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No staff accounts found.</td>
                        </tr>
                      ) : (
                        staffList.map((staff) => (
                          <tr key={staff.staff_id}>
                            <td>{staff.staff_id}</td>
                            <td>
                              <span
                                className={`badge ${
                                  staff.is_active ? "verified" : "gps-only"
                                }`}
                              >
                                {staff.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>
                              {staff.created_at
                                ? formatDateTime(staff.created_at)
                                : "—"}
                            </td>
                            <td>
                              <button
                                className="primary-button"
                                type="button"
                                disabled={
                                  staffBusy ||
                                  !staff.is_active ||
                                  !!enrollingStaffId
                                }
                                onClick={() => openFaceEnrollment(staff)}
                              >
                                Enroll face
                              </button>
                            </td>
                            <td>
                              <button
                                className="outline-button"
                                type="button"
                                disabled={staffBusy}
                                onClick={() => void handleToggleStaff(staff)}
                              >
                                {staff.is_active ? "Deactivate" : "Activate"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminSection === "history" && (
              <div className="table-card">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">ATTENDANCE RECORDS</span>
                    <h2>Attendance history</h2>
                    <p className="muted">
                      Search records by date, staff ID, and status.
                    </p>
                  </div>
                </div>

                <form
                  className="history-filters"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadAttendanceHistory(accessToken);
                  }}
                >
                  <div className="staff-form">
                    <label htmlFor="historyDate">Attendance date</label>
                    <input
                      id="historyDate"
                      type="date"
                      value={historyDate}
                      onChange={(event) => setHistoryDate(event.target.value)}
                      required
                    />
                  </div>

                  <div className="staff-form">
                    <label htmlFor="historyStaffId">
                      Staff ID (optional)
                    </label>
                    <input
                      id="historyStaffId"
                      value={historyStaffId}
                      onChange={(event) =>
                        setHistoryStaffId(event.target.value)
                      }
                      placeholder="e.g. STF001"
                    />
                  </div>

                  <div className="staff-form">
                    <label htmlFor="historyStatus">Status</label>
                    <select
                      id="historyStatus"
                      value={historyStatus}
                      onChange={(event) =>
                        setHistoryStatus(
                          event.target.value as HistoryStatus
                        )
                      }
                    >
                      <option value="all">All statuses</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="checked_in">Checked in</option>
                    </select>
                  </div>

                  <div className="staff-form filter-action">
                    <label>Search records</label>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={historyLoading || !historyDate}
                    >
                      {historyLoading ? "Loading..." : "Apply filters"}
                    </button>
                  </div>
                </form>

                {historyError && (
                  <p className="error-message" role="alert">{historyError}</p>
                )}

                {historyData && (
                  <div className="results-summary">
                    <strong>{historyData.total} records</strong>
                    <span>Attendance for {historyData.date}</span>
                  </div>
                )}

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Staff ID</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLoading ? (
                        <tr>
                          <td colSpan={4}>Loading attendance history...</td>
                        </tr>
                      ) : !historyData ? (
                        <tr>
                          <td colSpan={4}>
                            {historyError
                              ? "Could not load attendance records."
                              : "No results loaded yet."}
                          </td>
                        </tr>
                      ) : historyData.records.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            No records match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        historyData.records.map((record) => (
                          <tr key={record.staff_id}>
                            <td>{record.staff_id}</td>
                            <td>{formatDateTime(record.check_in)}</td>
                            <td>{formatDateTime(record.check_out)}</td>
                            <td>
                              <span
                                className={`badge ${
                                  record.status === "present"
                                    ? "verified"
                                    : record.status === "checked_in"
                                      ? "gps-only"
                                      : ""
                                }`}
                              >
                                {record.status === "checked_in"
                                  ? "Checked in"
                                  : record.status === "present"
                                    ? "Present"
                                    : "Absent"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="history-footer">
                  <button
                    className="outline-button"
                    type="button"
                    disabled={historyLoading}
                    onClick={() =>
                      void loadAttendanceHistory(accessToken)
                    }
                  >
                    ↻ Refresh results
                  </button>
                </div>
              </div>
            )}

            {/* Phase 2: Admin — Requests Panel */}
            {adminSection === "requests" && (
              <div className="table-card">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">APPROVALS</span>
                    <h2>Leave &amp; off-campus duty requests</h2>
                    <p className="muted">
                      Review, approve, or reject pending staff requests.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={adminReqFilterStatus}
                      onChange={(e) => setAdminReqFilterStatus(e.target.value)}
                      style={{ fontSize: 14, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)" }}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <select
                      value={adminReqFilterType}
                      onChange={(e) => setAdminReqFilterType(e.target.value)}
                      style={{ fontSize: 14, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)" }}
                    >
                      <option value="all">All types</option>
                      <option value="leave">Leave</option>
                      <option value="duty">Off-campus duty</option>
                    </select>
                    <button
                      className="outline-button"
                      type="button"
                      disabled={adminRequestsLoading}
                      onClick={() => void loadAdminRequests(accessToken)}
                    >
                      {adminRequestsLoading ? "Loading..." : "↻ Refresh"}
                    </button>
                    <a
                      href={`${API_URL}/admin/export/requests?status=${adminReqFilterStatus}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="outline-button"
                      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 8 }}
                    >
                      ⬇ Export CSV
                    </a>
                  </div>
                </div>

                {adminRequestsError && (
                  <p className="error-message" role="alert">{adminRequestsError}</p>
                )}
                {reviewMessage && (
                  <p className="success-message" role="status">{reviewMessage}</p>
                )}

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Staff ID</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Escalated</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminRequestsLoading && adminRequests.length === 0 ? (
                        <tr><td colSpan={8}>Loading requests...</td></tr>
                      ) : adminRequests.length === 0 ? (
                        <tr><td colSpan={8}>No requests found.</td></tr>
                      ) : (
                        adminRequests.map((req) => (
                          <tr key={req.id}>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{req.id}</td>
                            <td>{req.staff_id}</td>
                            <td>
                              <span className={`badge ${req.request_type === "leave" ? "gps-only" : "verified"}`}>
                                {req.request_type === "duty" ? "Off-campus duty" : "Leave"}
                              </span>
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{req.start_date} → {req.end_date}</td>
                            <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={req.reason}>{req.reason}</td>
                            <td>
                              <span className={`badge ${
                                req.status === "approved" ? "verified" :
                                req.status === "rejected" ? "badge-red" : "gps-only"
                              }`}>
                                {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                              </span>
                            </td>
                            <td>{req.escalated ? <span className="badge badge-red">⚠ Yes</span> : "No"}</td>
                            <td>
                              {req.status === "pending" ? (
                                reviewingId === req.id ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                                    <input
                                      type="text"
                                      placeholder="Comment (optional)"
                                      value={reviewComment}
                                      onChange={(e) => setReviewComment(e.target.value)}
                                      style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
                                    />
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button
                                        className="primary-button"
                                        type="button"
                                        disabled={reviewBusy}
                                        style={{ fontSize: 13, padding: "5px 12px" }}
                                        onClick={() => void handleReviewRequest(req.id, "approved")}
                                      >
                                        ✓ Approve
                                      </button>
                                      <button
                                        className="outline-button"
                                        type="button"
                                        disabled={reviewBusy}
                                        style={{ fontSize: 13, padding: "5px 12px", color: "var(--red)" }}
                                        onClick={() => void handleReviewRequest(req.id, "rejected")}
                                      >
                                        ✗ Reject
                                      </button>
                                      <button
                                        className="outline-button"
                                        type="button"
                                        style={{ fontSize: 13, padding: "5px 10px" }}
                                        onClick={() => { setReviewingId(null); setReviewComment(""); }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    className="outline-button"
                                    type="button"
                                    style={{ fontSize: 13 }}
                                    onClick={() => { setReviewingId(req.id); setReviewComment(""); setReviewMessage(""); }}
                                  >
                                    Review
                                  </button>
                                )
                              ) : (
                                <span className="muted" style={{ fontSize: 13 }}>
                                  {req.reviewer_id ? `By ${req.reviewer_id}` : "—"}
                                  {req.review_comment ? ` · "${req.review_comment}"` : ""}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Phase 3: Admin — Notifications Panel */}
            {adminSection === "notifications" && (
              <div className="table-card">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">INBOX</span>
                    <h2>Notifications</h2>
                    <p className="muted">System alerts, approvals, and escalation notices.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="outline-button"
                      type="button"
                      disabled={notifLoading}
                      onClick={() => void loadNotifications(accessToken)}
                    >
                      {notifLoading ? "Loading..." : "↻ Refresh"}
                    </button>
                    <button
                      className="outline-button"
                      type="button"
                      disabled={markingRead || notifUnread === 0}
                      onClick={() => void handleMarkAllRead()}
                    >
                      Mark all read
                    </button>
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
                    {notifLoading ? "Loading notifications..." : "No notifications yet."}
                  </div>
                ) : (
                  <div className="notif-list">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item ${
                          !n.is_read ? "notif-unread" : ""
                        } notif-type-${n.type}`}
                      >
                        <div className="notif-item-header">
                          <strong>{n.title}</strong>
                          <span className="notif-time muted">
                            {formatDateTime(n.created_at)}
                          </span>
                        </div>
                        <p className="notif-body">{n.message}</p>
                        {!n.is_read && (
                          <button
                            className="text-button"
                            type="button"
                            style={{ fontSize: 12 }}
                            onClick={() => void handleMarkOneRead(n.id)}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Phase 1: Admin — Audit Trail */}
            {adminSection === "audit" && (
              <div className="table-card">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">SECURITY &amp; COMPLIANCE</span>
                    <h2>Audit trail</h2>
                    <p className="muted">Immutable record of all actions performed in CampusPass.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Filter action (e.g. CHECK_IN)"
                      value={auditFilterAction}
                      onChange={(e) => setAuditFilterAction(e.target.value)}
                      style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", minWidth: 170 }}
                    />
                    <input
                      type="text"
                      placeholder="Filter actor ID"
                      value={auditFilterActor}
                      onChange={(e) => setAuditFilterActor(e.target.value)}
                      style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", minWidth: 130 }}
                    />
                    <button
                      className="outline-button"
                      type="button"
                      disabled={auditLoading}
                      onClick={() => void loadAuditLogs(accessToken)}
                    >
                      {auditLoading ? "Loading..." : "↻ Search"}
                    </button>
                    <a
                      href={`${API_URL}/admin/export/audit-logs${auditFilterAction ? `?action=${encodeURIComponent(auditFilterAction)}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="outline-button"
                      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 8 }}
                    >
                      ⬇ Export CSV
                    </a>
                  </div>
                </div>

                {auditError && <p className="error-message" role="alert">{auditError}</p>}

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp (IST)</th>
                        <th>Actor</th>
                        <th>Role</th>
                        <th>Action</th>
                        <th>Target</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLoading && auditLogs.length === 0 ? (
                        <tr><td colSpan={6}>Loading audit logs...</td></tr>
                      ) : auditLogs.length === 0 ? (
                        <tr><td colSpan={6}>No audit log entries found.</td></tr>
                      ) : (
                        auditLogs.map((log, i) => (
                          <tr key={log.id ?? i}>
                            <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{formatDateTime(log.created_at)}</td>
                            <td>{log.actor_id}</td>
                            <td><span className="badge gps-only" style={{ fontSize: 11 }}>{log.actor_role}</span></td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{log.action}</td>
                            <td style={{ fontSize: 12 }}>
                              {log.target_type && <span>{log.target_type}{log.target_id ? ` · ${log.target_id}` : ""}</span>}
                            </td>
                            <td style={{ fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={log.details ? JSON.stringify(log.details) : ""}>
                              {log.details ? JSON.stringify(log.details) : ""}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Export attendance CSV */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 14 }}>Export attendance records:</span>
                  <a
                    href={`${API_URL}/admin/export/attendance`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="outline-button"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 8, fontSize: 14 }}
                  >
                    ⬇ Attendance CSV
                  </a>
                </div>
              </div>
            )}

            {/* Phase 4: Admin — Absence Alerts */}
            {adminSection === "alerts" && (
              <div className="table-card">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">STAFF MONITORING</span>
                    <h2>Absence alerts</h2>
                    <p className="muted">
                      Staff members absent for more than {absenceThreshold} consecutive working days.
                      Weekends, college holidays, and approved leave/duty are excluded.
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    type="button"
                    disabled={absenceLoading}
                    onClick={() => void loadAbsenceAlerts(accessToken)}
                  >
                    {absenceLoading ? "Scanning..." : "↻ Refresh alerts"}
                  </button>
                </div>

                {absenceError && <p className="error-message" role="alert">{absenceError}</p>}

                {absenceAlerts.length === 0 && !absenceLoading && !absenceError ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
                    ✅ No staff members have exceeded the absence threshold. All good!
                  </div>
                ) : (
                  <div className="absence-alert-list">
                    {absenceAlerts.map((alert) => (
                      <div key={alert.staff_id} className="absence-alert-card">
                        <div className="absence-alert-top">
                          <div className="absence-alert-info">
                            <strong>{alert.full_name}</strong>
                            <span className="muted" style={{ fontSize: 13 }}>ID: {alert.staff_id}</span>
                            {alert.phone && (
                              <span className="muted" style={{ fontSize: 13 }}>📞 {alert.phone}</span>
                            )}
                          </div>
                          <div className="absence-alert-badge">
                            <span className="absence-days-count">{alert.consecutive_absent_days}</span>
                            <span className="absence-days-label">days absent</span>
                          </div>
                        </div>
                        <div className="absence-alert-meta">
                          {alert.absent_since && (
                            <span className="muted" style={{ fontSize: 13 }}>
                              Absent since: <strong>{alert.absent_since}</strong>
                            </span>
                          )}
                        </div>
                        <div className="absence-alert-actions">
                          {alert.phone ? (
                            <a
                              href={buildWhatsAppUrl(alert.phone, alert.full_name, alert.consecutive_absent_days)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whatsapp-button"
                            >
                              💬 Message on WhatsApp
                            </a>
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>
                              No phone number saved — add it in Staff management
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* College Holidays Manager */}
                <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                  <div className="admin-heading">
                    <div>
                      <span className="eyebrow">HOLIDAY CALENDAR</span>
                      <h3 style={{ margin: 0 }}>College holidays</h3>
                      <p className="muted" style={{ marginTop: 4 }}>
                        Days listed here are excluded from absence calculations.
                      </p>
                    </div>
                  </div>

                  <form className="holiday-add-form" onSubmit={handleAddHoliday}>
                    <input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      required
                      style={{ fontSize: 14, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={newHolidayDesc}
                      onChange={(e) => setNewHolidayDesc(e.target.value)}
                      style={{ fontSize: 14, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", minWidth: 180 }}
                    />
                    <button className="primary-button" type="submit" disabled={holidayBusy || !newHolidayDate}>
                      {holidayBusy ? "Adding..." : "+ Add holiday"}
                    </button>
                  </form>

                  {holidayMessage && <p className="success-message" role="status" style={{ marginTop: 8 }}>{holidayMessage}</p>}

                  {holidays.length > 0 && (
                    <div className="holiday-list">
                      {holidays.map((h) => (
                        <div key={h.holiday_date} className="holiday-chip">
                          <span>{h.holiday_date}</span>
                          {h.description && <span className="muted" style={{ fontSize: 12 }}>({h.description})</span>}
                          <button
                            type="button"
                            className="holiday-remove-btn"
                            title="Remove holiday"
                            onClick={() => void handleDeleteHoliday(h.holiday_date)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {holidays.length === 0 && !holidaysLoading && (
                    <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                      No college holidays configured for this year.
                    </p>
                  )}
                </div>
              </div>
            )}

            <footer className="admin-footer">
              CampusPass · Project prototype
              <span>Identity · Location · Trust</span>
            </footer>
          </main>
        </div>
      )}

      {enrollingStaffId && screen === "admin" && (
        <div
          className="confirm-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !enrollBusy
            ) {
              closeFaceEnrollment();
            }
          }}
        >
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enroll-title"
            aria-describedby="enroll-description"
          >
            <span className="eyebrow">STAFF FACE ENROLLMENT</span>
            <h2 id="enroll-title">Enroll {enrollingStaffId}</h2>
            <p id="enroll-description">
              Make sure the correct staff member is in view. Their face
              should be clearly visible, well lit, and facing the camera.
              Only enroll a person with their knowledge and consent.
            </p>

            <div
              style={{
                width: "100%",
                overflow: "hidden",
                borderRadius: "12px",
                background: "#111827",
                margin: "16px 0",
              }}
            >
              <video
                ref={enrollVideoRef}
                autoPlay
                playsInline
                muted
                aria-label="Face enrollment camera preview"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "320px",
                  minHeight: "180px",
                  objectFit: "cover",
                }}
              />
            </div>

            {enrollCameraError && (
              <p className="error-message" role="alert">
                {enrollCameraError}
              </p>
            )}
            {enrollMessage && (
              <p className="success-message" role="status">
                {enrollMessage}
              </p>
            )}

            <div className="confirm-actions">
              <button
                type="button"
                className="outline-button"
                disabled={enrollBusy}
                onClick={closeFaceEnrollment}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={enrollBusy || !!enrollCameraError}
                onClick={() => void handleEnrollFace()}
              >
                {enrollBusy ? "Enrolling..." : "Capture and enroll"}
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingAttendanceAction && (
        <div
          className="confirm-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !attendanceBusy
            ) {
              setPendingAttendanceAction(null);
            }
          }}
        >
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
          >
            <div
              className={`confirm-icon ${
                pendingAttendanceAction === "check-in"
                  ? "confirm-icon-in"
                  : "confirm-icon-out"
              }`}
              aria-hidden="true"
            >
              {pendingAttendanceAction === "check-in" ? "↗" : "↙"}
            </div>

            <span className="eyebrow">ATTENDANCE CONFIRMATION</span>
            <h2 id="confirm-title">
              Confirm your{" "}
              {pendingAttendanceAction === "check-in"
                ? "check-in"
                : "check-out"}?
            </h2>
            <p id="confirm-description">
              {pendingAttendanceAction === "check-in"
                ? "Your face will be verified before marking today's attendance."
                : "Your face will be verified before ending your current attendance session."}
            </p>

            <div className="confirm-notice">
              <span aria-hidden="true">ⓘ</span>
              <p>
                The live camera image and GPS location will be checked.
                Attendance is recorded only if face verification, campus
                location, and GPS accuracy requirements pass.
              </p>
            </div>

            <div className="confirm-actions">
              <button
                type="button"
                className="outline-button"
                disabled={attendanceBusy}
                onClick={() => setPendingAttendanceAction(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                disabled={attendanceBusy || !pendingAttendanceAction}
                onClick={() => {
                  const action = pendingAttendanceAction;
                  if (!action || attendanceBusy) return;

                  setPendingAttendanceAction(null);
                  void handleAttendance(action);
                }}
              >
                {attendanceBusy
                  ? "Please wait..."
                  : `Yes, ${
                      pendingAttendanceAction === "check-in"
                        ? "check in"
                        : "check out"
                    }`}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;