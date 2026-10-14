import type {
  ApiErrorDetail,
  AttendanceAction,
  AttendanceHistoryResponse,
  AttendanceRecord,
  AttendanceSubmitResponse,
  FaceVerificationResponse,
  GPSLocation,
  Holiday,
  LeaveRequest,
  LoginResponse,
  NotificationItem,
  StaffAccount,
} from "../types";

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "https://campuspass-ignite.onrender.com";

let authToken: string | null = null;
let unauthorizedListener: (() => void) | null = null;

export function setApiAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedListener(listener: (() => void) | null): void {
  unauthorizedListener = listener;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function parseErrorDetail(data: unknown, status: number): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item: ApiErrorDetail) => (typeof item === "object" && item?.msg ? item.msg : String(item)))
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  }

  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "Access denied. You do not have permission for this action.";
  if (status === 404) return "Requested resource was not found.";
  if (status === 503) return "Server is temporarily unavailable. Please retry in a few moments.";
  if (status >= 500) return `Internal server error (${status}). Please try again later.`;

  return `Request failed with status ${status}.`;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, token, headers = {}, ...rest } = options;
  const activeToken = token !== undefined ? token : authToken;

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...((headers as Record<string, string>) || {}),
  };

  if (activeToken) {
    reqHeaders.Authorization = `Bearer ${activeToken}`;
  }

  let finalBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === "string" || body instanceof FormData || body instanceof Blob) {
      finalBody = body as BodyInit;
    } else {
      reqHeaders["Content-Type"] = "application/json";
      finalBody = JSON.stringify(body);
    }
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${API_URL}${cleanPath}`, {
    ...rest,
    headers: reqHeaders,
    body: finalBody,
  });

  if (response.status === 401) {
    if (unauthorizedListener) {
      unauthorizedListener();
    }
  }

  const contentType = response.headers.get("content-type") || "";
  let responseData: unknown = null;
  if (contentType.includes("application/json")) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    try {
      responseData = await response.text();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const errorMsg = parseErrorDetail(responseData, response.status);
    throw new ApiError(errorMsg, response.status, responseData);
  }

  return responseData as T;
}

export async function downloadCsvBlob(path: string, defaultFilename: string): Promise<void> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_URL}${cleanPath}`, { headers });
  if (!response.ok) {
    let errorDetail = "Failed to export CSV.";
    try {
      const err = await response.json();
      errorDetail = parseErrorDetail(err, response.status);
    } catch {
      // ignore
    }
    throw new ApiError(errorDetail, response.status);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// Typed API Endpoints
// -----------------------------------------------------------------------------

export const api = {
  // Health
  checkHealth: (signal?: AbortSignal) =>
    apiRequest<{ status: string }>("/health", { signal }),

  // Auth
  login: (staff_id: string, pin: string, signal?: AbortSignal) =>
    apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: { staff_id, pin },
      signal,
    }),

  // Face Verification & Attendance
  verifyFace: (image: string, action: AttendanceAction, signal?: AbortSignal) =>
    apiRequest<FaceVerificationResponse>("/face/verify", {
      method: "POST",
      body: { image, action },
      signal,
    }),

  submitAttendance: (
    action: AttendanceAction,
    payload: GPSLocation & { face_proof: string },
    signal?: AbortSignal
  ) =>
    apiRequest<AttendanceSubmitResponse>(`/attendance/${action}`, {
      method: "POST",
      body: payload,
      signal,
    }),

  getMyAttendance: async (signal?: AbortSignal): Promise<AttendanceRecord[]> => {
    const data = await apiRequest<
      AttendanceRecord[] | { records?: AttendanceRecord[]; attendance?: AttendanceRecord[] }
    >("/attendance/me", { signal });
    if (Array.isArray(data)) return data;
    return data.records || data.attendance || [];
  },

  // Requests (Staff)
  getMyRequests: async (signal?: AbortSignal): Promise<LeaveRequest[]> => {
    const data = await apiRequest<{ requests: LeaveRequest[] }>("/requests/me", { signal });
    return Array.isArray(data.requests) ? data.requests : [];
  },

  submitRequest: (
    payload: {
      request_type: "leave" | "duty";
      start_date: string;
      end_date: string;
      reason: string;
    },
    signal?: AbortSignal
  ) =>
    apiRequest<{ request: LeaveRequest }>("/requests", {
      method: "POST",
      body: payload,
      signal,
    }),

  // Notifications
  getNotifications: (limit = 50, signal?: AbortSignal) =>
    apiRequest<{ notifications: NotificationItem[]; unread_count: number }>(
      `/notifications?limit=${limit}`,
      { signal }
    ),

  markNotificationRead: (id: string, signal?: AbortSignal) =>
    apiRequest<{ success: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      signal,
    }),

  markAllNotificationsRead: (signal?: AbortSignal) =>
    apiRequest<{ success: boolean }>("/notifications/read-all", {
      method: "PATCH",
      signal,
    }),

  // Admin Dashboard
  getAdminDashboard: (signal?: AbortSignal) =>
    apiRequest<import("../types").AdminDashboardData>("/admin/dashboard", { signal }),

  // Admin Staff Management
  getStaffList: async (signal?: AbortSignal): Promise<StaffAccount[]> => {
    const data = await apiRequest<{ staff: StaffAccount[] }>("/admin/staff", { signal });
    return Array.isArray(data.staff) ? data.staff : [];
  },

  createStaff: (
    payload: {
      staff_id: string;
      pin: string;
      phone: string;
      full_name: string | null;
    },
    signal?: AbortSignal
  ) =>
    apiRequest<{ message: string; staff_id: string }>("/admin/staff", {
      method: "POST",
      body: payload,
      signal,
    }),

  updateStaffProfile: (
    staffId: string,
    payload: { full_name: string | null; phone: string | null },
    signal?: AbortSignal
  ) =>
    apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(staffId)}/profile`, {
      method: "PATCH",
      body: payload,
      signal,
    }),

  resetStaffPin: (staffId: string, pin: string, signal?: AbortSignal) =>
    apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(staffId)}/pin`, {
      method: "PATCH",
      body: { pin },
      signal,
    }),

  toggleStaffStatus: (staffId: string, is_active: boolean, signal?: AbortSignal) =>
    apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(staffId)}/status`, {
      method: "PATCH",
      body: { is_active },
      signal,
    }),

  deleteStaff: (staffId: string, signal?: AbortSignal) =>
    apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(staffId)}`, {
      method: "DELETE",
      signal,
    }),

  enrollStaffFace: (staffId: string, image: string, signal?: AbortSignal) =>
    apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(staffId)}/face`, {
      method: "POST",
      body: { image },
      signal,
    }),

  // Admin Attendance History
  getAttendanceHistory: (
    params: { selected_date: string; status?: string; staff_id?: string },
    signal?: AbortSignal
  ) => {
    const query = new URLSearchParams();
    query.set("selected_date", params.selected_date);
    if (params.status && params.status !== "all") query.set("status", params.status);
    if (params.staff_id?.trim()) query.set("staff_id", params.staff_id.trim().toUpperCase());
    return apiRequest<AttendanceHistoryResponse>(`/admin/attendance/history?${query.toString()}`, {
      signal,
    });
  },

  // Admin Leave & Duty Requests
  getAdminRequests: async (
    filters: { status?: string; request_type?: string } = {},
    signal?: AbortSignal
  ): Promise<LeaveRequest[]> => {
    const query = new URLSearchParams();
    if (filters.status && filters.status !== "all") query.set("status", filters.status);
    if (filters.request_type && filters.request_type !== "all") {
      query.set("request_type", filters.request_type);
    }
    const data = await apiRequest<{ requests: LeaveRequest[] }>(
      `/admin/requests?${query.toString()}`,
      { signal }
    );
    return Array.isArray(data.requests) ? data.requests : [];
  },

  reviewRequest: (
    id: string,
    payload: { status: "approved" | "rejected"; review_comment?: string | null },
    signal?: AbortSignal
  ) =>
    apiRequest<{ message: string }>(`/admin/requests/${encodeURIComponent(id)}/review`, {
      method: "PATCH",
      body: payload,
      signal,
    }),

  // Admin Audit Logs
  getAuditLogs: async (
    filters: { action?: string; actor_id?: string; limit?: number } = {},
    signal?: AbortSignal
  ): Promise<import("../types").AuditLog[]> => {
    const query = new URLSearchParams({ limit: String(filters.limit || 200) });
    if (filters.action?.trim()) query.set("action", filters.action.trim());
    if (filters.actor_id?.trim()) query.set("actor_id", filters.actor_id.trim().toUpperCase());
    const data = await apiRequest<{ logs: import("../types").AuditLog[] }>(
      `/admin/audit-logs?${query.toString()}`,
      { signal }
    );
    return Array.isArray(data.logs) ? data.logs : [];
  },

  // Admin Absence Alerts & Holidays
  getAbsenceAlerts: async (
    signal?: AbortSignal
  ): Promise<{ alerts: import("../types").AbsenceAlert[]; threshold_days: number }> => {
    const data = await apiRequest<{
      alerts: import("../types").AbsenceAlert[];
      threshold_days?: number;
    }>("/admin/absence-alerts", { signal });
    return {
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      threshold_days: typeof data.threshold_days === "number" ? data.threshold_days : 2,
    };
  },

  getHolidays: async (signal?: AbortSignal): Promise<Holiday[]> => {
    const data = await apiRequest<{ holidays: Array<string | Holiday> }>("/admin/holidays", {
      signal,
    });
    if (!Array.isArray(data.holidays)) return [];
    return data.holidays.map((item) =>
      typeof item === "string" ? { holiday_date: item, description: "" } : item
    );
  },

  addHoliday: (payload: { holiday_date: string; description?: string }, signal?: AbortSignal) =>
    apiRequest<{ message: string }>("/admin/holidays", {
      method: "POST",
      body: payload,
      signal,
    }),

  deleteHoliday: (dateStr: string, signal?: AbortSignal) =>
    apiRequest<{ message: string }>(`/admin/holidays/${encodeURIComponent(dateStr)}`, {
      method: "DELETE",
      signal,
    }),
};
