export type UserRole = "admin" | "staff";

export type AttendanceAction = "check-in" | "check-out";

export type HistoryStatus = "all" | "present" | "half_day" | "absent" | "checked_in";

export type LeaveRequestType = "leave" | "duty";

export type LeaveRequestStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  staff_id: string;
  request_type: LeaveRequestType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveRequestStatus;
  reviewer_id?: string | null;
  review_comment?: string | null;
  escalated: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  recipient_role: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  reference_id?: string | null;
  created_at: string;
}

export interface AuditLog {
  id?: number | string;
  actor_id: string;
  actor_role: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  staff_id: string;
  check_in: string;
  check_out: string | null;
  status?: string | null;
  created_at?: string;
}

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export interface AdminDashboardData {
  date: string;
  total_staff: number;
  active_staff: number;
  inactive_staff: number;
  present_today: number;
  absent_today: number;
  half_day_today?: number;
  currently_checked_in: number;
  recent_attendance: AttendanceRecord[];
}

export interface StaffAccount {
  staff_id: string;
  role: string;
  is_active: boolean;
  full_name?: string | null;
  phone?: string | null;
  created_at?: string;
  has_face_enrolled?: boolean;
}

export interface AbsenceAlert {
  staff_id: string;
  full_name: string;
  phone: string;
  consecutive_absent_days: number;
  absent_since: string | null;
}

export interface Holiday {
  holiday_date: string;
  description?: string | null;
}

export interface AttendanceHistoryRecord {
  staff_id: string;
  status: "present" | "half_day" | "absent" | "checked_in";
  check_in: string | null;
  check_out: string | null;
}

export interface AttendanceHistoryResponse {
  date: string;
  total: number;
  records: AttendanceHistoryRecord[];
}

export interface FaceVerificationResponse {
  verified: boolean;
  proof_id: string;
  action: AttendanceAction;
  expires_at?: string;
  message?: string;
}

export interface LoginResponse {
  access_token: string;
  role: UserRole;
  staff_id?: string;
}

export interface ApiErrorDetail {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

export interface AttendanceSubmitResponse {
  message?: string;
  detail?: string;
  location?: {
    distance_m?: number;
    within_geofence?: boolean;
    accuracy_m?: number;
  };
}
