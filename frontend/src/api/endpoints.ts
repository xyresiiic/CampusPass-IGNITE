import type {
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
import { apiRequest } from "./request";

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
