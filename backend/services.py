import os
import io
import csv
import json
import uuid
import sqlite3
from datetime import datetime, timezone, timedelta, time, date as Date
from typing import Any, Optional
from supabase import Client

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "data", "campuspass_local.db")
INDIA_TIMEZONE = timezone(timedelta(hours=5, minutes=30))

def _get_sqlite_conn():
    os.makedirs(os.path.dirname(SQLITE_PATH), exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_id TEXT NOT NULL,
                actor_role TEXT NOT NULL DEFAULT 'system',
                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                details TEXT,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS leave_requests (
                id TEXT PRIMARY KEY,
                staff_id TEXT NOT NULL,
                request_type TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                reviewer_id TEXT,
                review_comment TEXT,
                escalated INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                recipient_id TEXT NOT NULL,
                recipient_role TEXT NOT NULL DEFAULT 'staff',
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'info',
                is_read INTEGER NOT NULL DEFAULT 0,
                reference_id TEXT,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS staff_profiles (
                staff_id TEXT PRIMARY KEY,
                full_name TEXT,
                phone TEXT,
                updated_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS college_holidays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                holiday_date TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS attendance_status (
                attendance_id INTEGER PRIMARY KEY,
                status TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
    return conn


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------------------
# Half-Day Attendance Calculation & Attendance Status Helpers
# ------------------------------------------------------------------------------

def determine_attendance_status(
    check_in_str: Optional[str],
    check_out_str: Optional[str],
    stored_status: Optional[str] = None,
    has_leave: bool = False,
) -> str:
    """
    Evaluates attendance status based on college timings & half-day rule.
    - Not checked in -> 'absent'
    - Not checked out yet -> 'checked_in'
    - If approved leave/duty -> retain normal/excused status, do not overwrite with half_day
    - If stored_status == 'half_day' and not has_leave -> 'half_day'
    - Exact Half-Day Rule:
        Late arrival: check-in strictly after 11:00 AM IST
        Early departure: check-out strictly before 02:00 PM IST (14:00)
        Both check-in and check-out must belong to the same local calendar day in Asia/Kolkata
        Both conditions must be True -> 'half_day'
        Otherwise -> 'present'
    """
    if not check_in_str:
        return "absent"
    if not check_out_str:
        return "checked_in"
    if has_leave:
        return stored_status or "present"
    if stored_status == "half_day":
        return "half_day"

    try:
        cin_dt = datetime.fromisoformat(check_in_str.replace("Z", "+00:00")).astimezone(INDIA_TIMEZONE)
        cout_dt = datetime.fromisoformat(check_out_str.replace("Z", "+00:00")).astimezone(INDIA_TIMEZONE)

        # Apply rule only when both timestamps belong to the same local calendar day
        if cin_dt.date() == cout_dt.date():
            is_late_arrival = cin_dt.time() > time(11, 0, 0)
            is_early_departure = cout_dt.time() < time(14, 0, 0)
            if is_late_arrival and is_early_departure:
                return "half_day"
    except Exception as e:
        print(f"Error evaluating attendance timestamps: {e}")

    return stored_status or "present"


def has_approved_leave_or_duty(supabase: Optional[Client], staff_id: str, check_date: Any) -> bool:
    """Check if the staff member has an approved leave or duty on this local date."""
    date_str = check_date.isoformat() if hasattr(check_date, "isoformat") else str(check_date)
    if supabase is not None:
        try:
            res = (
                supabase.table("leave_requests")
                .select("id")
                .eq("staff_id", staff_id)
                .eq("status", "approved")
                .lte("start_date", date_str)
                .gte("end_date", date_str)
                .limit(1)
                .execute()
            )
            if res.data:
                return True
        except Exception:
            pass

    try:
        conn = _get_sqlite_conn()
        row = conn.execute(
            """
            SELECT id FROM leave_requests
            WHERE staff_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?
            LIMIT 1
            """,
            (staff_id, date_str, date_str),
        ).fetchone()
        conn.close()
        return bool(row)
    except Exception:
        return False


def save_attendance_status(supabase: Optional[Client], attendance_id: int, status: str) -> None:
    """Save attendance status to SQLite and attempt Supabase update if column exists."""
    now_iso = _now_utc_iso()
    try:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO attendance_status (attendance_id, status, updated_at) VALUES (?, ?, ?)",
                (attendance_id, status, now_iso),
            )
        conn.close()
    except Exception as e:
        print(f"Error saving attendance status in local DB: {e}")

    if supabase is not None:
        try:
            supabase.table("attendance").update({"status": status}).eq("id", attendance_id).execute()
        except Exception:
            pass


# ------------------------------------------------------------------------------
# Phase 1: Audit Trail Service
# ------------------------------------------------------------------------------

def log_audit_event(
    supabase: Optional[Client],
    actor_id: str,
    actor_role: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    now_iso = _now_utc_iso()
    details_dict = details or {}

    # Attempt Supabase write first
    if supabase is not None:
        try:
            supabase.table("audit_logs").insert({
                "actor_id": actor_id,
                "actor_role": actor_role,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "details": details_dict,
                "created_at": now_iso,
            }).execute()
            return
        except Exception as error:
            # Table might not exist yet in Supabase schema cache
            pass

    # Local fallback
    try:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute(
                """
                INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, details, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (actor_id, actor_role, action, target_type, target_id, json.dumps(details_dict), now_iso)
            )
        conn.close()
    except Exception as err:
        print(f"Audit log write error: {err}")


def get_audit_logs(
    supabase: Optional[Client],
    action: Optional[str] = None,
    actor_id: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    # Attempt Supabase read
    if supabase is not None:
        try:
            query = supabase.table("audit_logs").select("*").order("created_at", desc=True).limit(limit)
            if action and action.strip():
                query = query.eq("action", action.strip())
            if actor_id and actor_id.strip():
                query = query.eq("actor_id", actor_id.strip().upper())
            res = query.execute()
            if res.data is not None:
                return res.data
        except Exception:
            pass

    # Local fallback
    conn = _get_sqlite_conn()
    clauses = []
    params = []
    if action and action.strip():
        clauses.append("action = ?")
        params.append(action.strip())
    if actor_id and actor_id.strip():
        clauses.append("actor_id = ?")
        params.append(actor_id.strip().upper())

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM audit_logs {where_sql} ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("details"), str):
            try:
                d["details"] = json.loads(d["details"])
            except Exception:
                pass
        result.append(d)
    conn.close()
    return result


# ------------------------------------------------------------------------------
# Phase 2: Leave & Off-Campus Duty Approvals Service
# ------------------------------------------------------------------------------

def create_leave_request(
    supabase: Optional[Client],
    staff_id: str,
    request_type: str,
    start_date: str,
    end_date: str,
    reason: str,
) -> dict[str, Any]:
    req_id = f"REQ-{uuid.uuid4().hex[:8].upper()}"
    now_iso = _now_utc_iso()
    record = {
        "id": req_id,
        "staff_id": staff_id.strip().upper(),
        "request_type": request_type,
        "start_date": start_date,
        "end_date": end_date,
        "reason": reason.strip(),
        "status": "pending",
        "reviewer_id": None,
        "review_comment": None,
        "escalated": False,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    saved = False
    if supabase is not None:
        try:
            res = supabase.table("leave_requests").insert(record).execute()
            if res.data:
                saved = True
        except Exception:
            pass

    if not saved:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute(
                """
                INSERT INTO leave_requests (id, staff_id, request_type, start_date, end_date, reason, status, reviewer_id, review_comment, escalated, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (req_id, record["staff_id"], request_type, start_date, end_date, reason.strip(), "pending", None, None, 0, now_iso, now_iso)
            )
        conn.close()

    # Log audit event
    log_audit_event(
        supabase,
        actor_id=staff_id,
        actor_role="staff",
        action=f"{request_type.upper()}_REQUESTED",
        target_type="leave_request",
        target_id=req_id,
        details={"start_date": start_date, "end_date": end_date, "reason": reason.strip()}
    )

    # Trigger admin notification
    type_label = "Off-Campus Duty" if request_type == "duty" else "Leave"
    create_notification(
        supabase,
        recipient_id="ALL_ADMINS",
        recipient_role="admin",
        title=f"New {type_label} Request: {staff_id}",
        message=f"{staff_id} requested {type_label.lower()} from {start_date} to {end_date}: \"{reason.strip()}\"",
        n_type="approval",
        reference_id=req_id,
    )

    return record


def get_staff_requests(supabase: Optional[Client], staff_id: str) -> list[dict[str, Any]]:
    normalized_id = staff_id.strip().upper()
    if supabase is not None:
        try:
            res = supabase.table("leave_requests").select("*").eq("staff_id", normalized_id).order("created_at", desc=True).execute()
            if res.data is not None:
                return res.data
        except Exception:
            pass

    conn = _get_sqlite_conn()
    rows = conn.execute(
        "SELECT * FROM leave_requests WHERE staff_id = ? ORDER BY created_at DESC",
        (normalized_id,)
    ).fetchall()
    result = [dict(r) for r in rows]
    for item in result:
        item["escalated"] = bool(item.get("escalated"))
    conn.close()
    return result


def get_all_requests(
    supabase: Optional[Client],
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    staff_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    if supabase is not None:
        try:
            query = supabase.table("leave_requests").select("*").order("created_at", desc=True)
            if status and status != "all":
                query = query.eq("status", status)
            if request_type and request_type != "all":
                query = query.eq("request_type", request_type)
            if staff_id and staff_id.strip():
                query = query.eq("staff_id", staff_id.strip().upper())
            res = query.execute()
            if res.data is not None:
                return res.data
        except Exception:
            pass

    conn = _get_sqlite_conn()
    clauses = []
    params = []
    if status and status != "all":
        clauses.append("status = ?")
        params.append(status)
    if request_type and request_type != "all":
        clauses.append("request_type = ?")
        params.append(request_type)
    if staff_id and staff_id.strip():
        clauses.append("staff_id = ?")
        params.append(staff_id.strip().upper())

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM leave_requests {where_sql} ORDER BY created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    result = [dict(r) for r in rows]
    for item in result:
        item["escalated"] = bool(item.get("escalated"))
    conn.close()
    return result


def review_leave_request(
    supabase: Optional[Client],
    request_id: str,
    reviewer_id: str,
    status: str,
    review_comment: Optional[str] = None,
) -> dict[str, Any]:
    now_iso = _now_utc_iso()
    comment = review_comment.strip() if review_comment else None
    updated = False
    staff_id = None
    req_type = "leave"

    if supabase is not None:
        try:
            res = (
                supabase.table("leave_requests")
                .update({
                    "status": status,
                    "reviewer_id": reviewer_id,
                    "review_comment": comment,
                    "updated_at": now_iso,
                })
                .eq("id", request_id)
                .execute()
            )
            if res.data:
                updated = True
                staff_id = res.data[0].get("staff_id")
                req_type = res.data[0].get("request_type", "leave")
        except Exception:
            pass

    if not updated:
        conn = _get_sqlite_conn()
        with conn:
            existing = conn.execute("SELECT staff_id, request_type FROM leave_requests WHERE id = ?", (request_id,)).fetchone()
            if existing:
                staff_id = existing["staff_id"]
                req_type = existing["request_type"]
            conn.execute(
                """
                UPDATE leave_requests
                SET status = ?, reviewer_id = ?, review_comment = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, reviewer_id, comment, now_iso, request_id)
            )
        conn.close()

    # Log audit event
    action_name = f"{req_type.upper()}_{status.upper()}"
    log_audit_event(
        supabase,
        actor_id=reviewer_id,
        actor_role="admin",
        action=action_name,
        target_type="leave_request",
        target_id=request_id,
        details={"status": status, "comment": comment, "staff_id": staff_id}
    )

    # Notify staff member of the review outcome
    if staff_id:
        type_label = "Off-Campus Duty" if req_type == "duty" else "Leave"
        status_label = "approved ✅" if status == "approved" else "rejected ❌"
        msg = f"Your {type_label} request ({request_id}) has been {status_label} by {reviewer_id}."
        if comment:
            msg += f" Note: \"{comment}\""
        create_notification(
            supabase,
            recipient_id=staff_id,
            recipient_role="staff",
            title=f"{type_label} Request {status.capitalize()}",
            message=msg,
            n_type="approval",
            reference_id=request_id,
        )

    return {
        "id": request_id,
        "status": status,
        "reviewer_id": reviewer_id,
        "review_comment": comment,
        "updated_at": now_iso,
    }


# ------------------------------------------------------------------------------
# Phase 3: Notifications & Escalation Service
# ------------------------------------------------------------------------------

def create_notification(
    supabase: Optional[Client],
    recipient_id: str,
    recipient_role: str,
    title: str,
    message: str,
    n_type: str = "info",
    reference_id: Optional[str] = None,
) -> dict[str, Any]:
    n_id = f"NOTIF-{uuid.uuid4().hex[:8].upper()}"
    now_iso = _now_utc_iso()
    notif = {
        "id": n_id,
        "recipient_id": recipient_id.strip().upper(),
        "recipient_role": recipient_role,
        "title": title,
        "message": message,
        "type": n_type,
        "is_read": False,
        "reference_id": reference_id,
        "created_at": now_iso,
    }

    saved = False
    if supabase is not None:
        try:
            res = supabase.table("notifications").insert(notif).execute()
            if res.data:
                saved = True
        except Exception:
            pass

    if not saved:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute(
                """
                INSERT INTO notifications (id, recipient_id, recipient_role, title, message, type, is_read, reference_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (n_id, notif["recipient_id"], recipient_role, title, message, n_type, 0, reference_id, now_iso)
            )
        conn.close()

    return notif


def get_notifications(
    supabase: Optional[Client],
    recipient_id: str,
    role: str,
    limit: int = 50,
) -> dict[str, Any]:
    norm_id = recipient_id.strip().upper()
    items = []

    if supabase is not None:
        try:
            if role == "admin":
                # Admin receives targeted notifications plus ALL_ADMINS
                res = (
                    supabase.table("notifications")
                    .select("*")
                    .in_("recipient_id", [norm_id, "ALL_ADMINS"])
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )
            else:
                res = (
                    supabase.table("notifications")
                    .select("*")
                    .eq("recipient_id", norm_id)
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )
            if res.data is not None:
                items = res.data
        except Exception:
            pass

    if not items:
        conn = _get_sqlite_conn()
        if role == "admin":
            rows = conn.execute(
                "SELECT * FROM notifications WHERE recipient_id IN (?, 'ALL_ADMINS') ORDER BY created_at DESC LIMIT ?",
                (norm_id, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT ?",
                (norm_id, limit)
            ).fetchall()
        items = [dict(r) for r in rows]
        for it in items:
            it["is_read"] = bool(it.get("is_read"))
        conn.close()

    unread_count = sum(1 for it in items if not it.get("is_read"))
    return {
        "notifications": items,
        "unread_count": unread_count,
        "total": len(items)
    }


def mark_notification_read(supabase: Optional[Client], notification_id: str, recipient_id: str) -> None:
    norm_id = recipient_id.strip().upper()
    if supabase is not None:
        try:
            supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
            return
        except Exception:
            pass

    conn = _get_sqlite_conn()
    with conn:
        conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))
    conn.close()


def mark_all_notifications_read(supabase: Optional[Client], recipient_id: str, role: str) -> None:
    norm_id = recipient_id.strip().upper()
    if supabase is not None:
        try:
            if role == "admin":
                supabase.table("notifications").update({"is_read": True}).in_("recipient_id", [norm_id, "ALL_ADMINS"]).execute()
            else:
                supabase.table("notifications").update({"is_read": True}).eq("recipient_id", norm_id).execute()
            return
        except Exception:
            pass

    conn = _get_sqlite_conn()
    with conn:
        if role == "admin":
            conn.execute("UPDATE notifications SET is_read = 1 WHERE recipient_id IN (?, 'ALL_ADMINS')", (norm_id,))
        else:
            conn.execute("UPDATE notifications SET is_read = 1 WHERE recipient_id = ?", (norm_id,))
    conn.close()


def check_and_escalate_pending_requests(
    supabase: Optional[Client],
    deadline_hours: int = 24,
) -> list[dict[str, Any]]:
    """Escalates pending requests older than deadline_hours and alerts administrators."""
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(hours=deadline_hours)
    threshold_iso = threshold.isoformat()

    all_pending = get_all_requests(supabase, status="pending")
    escalated_items = []

    for req in all_pending:
        created_str = req.get("created_at")
        if not created_str:
            continue
        try:
            created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except Exception:
            continue

        if created_dt <= threshold and not req.get("escalated"):
            # Mark escalated
            req_id = req["id"]
            if supabase is not None:
                try:
                    supabase.table("leave_requests").update({"escalated": True}).eq("id", req_id).execute()
                except Exception:
                    pass

            conn = _get_sqlite_conn()
            with conn:
                conn.execute("UPDATE leave_requests SET escalated = 1 WHERE id = ?", (req_id,))
            conn.close()

            req["escalated"] = True
            escalated_items.append(req)

            # Trigger Escalation notification to admins
            type_label = "Off-Campus Duty" if req.get("request_type") == "duty" else "Leave"
            staff_id = req.get("staff_id", "Unknown")
            hours_pending = int((now - created_dt).total_seconds() / 3600)
            
            create_notification(
                supabase,
                recipient_id="ALL_ADMINS",
                recipient_role="admin",
                title=f"⚠️ ESCALATED: Pending {type_label} ({staff_id})",
                message=f"Request {req_id} from {staff_id} has been pending for {hours_pending} hours (exceeds {deadline_hours}h SLA). Immediate action required.",
                n_type="escalation",
                reference_id=req_id,
            )

            log_audit_event(
                supabase,
                actor_id="SYSTEM",
                actor_role="system",
                action="REQUEST_ESCALATED",
                target_type="leave_request",
                target_id=req_id,
                details={"hours_pending": hours_pending, "staff_id": staff_id, "deadline_hours": deadline_hours}
            )

    return escalated_items


# ------------------------------------------------------------------------------
# CSV Export Utilities
# ------------------------------------------------------------------------------

def _sanitize_csv_cell(value: Any) -> str:
    """Sanitize cell to prevent formula injection in Excel/Sheets."""
    if value is None:
        return ""
    text = str(value)
    if text.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{text}"
    return text


def export_attendance_csv(records: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Staff ID", "Check In (UTC)", "Check Out (UTC)", "Check In (IST)", "Check Out (IST)", "Duration (Hours)", "Status"])

    for r in records:
        cin = r.get("check_in")
        cout = r.get("check_out")
        
        cin_ist = "—"
        cout_ist = "—"
        duration_hrs = "—"

        if cin:
            try:
                dt_in = datetime.fromisoformat(cin.replace("Z", "+00:00"))
                cin_ist = dt_in.astimezone(INDIA_TIMEZONE).strftime("%Y-%m-%d %I:%M %p")
            except Exception:
                cin_ist = cin

        if cout:
            try:
                dt_out = datetime.fromisoformat(cout.replace("Z", "+00:00"))
                cout_ist = dt_out.astimezone(INDIA_TIMEZONE).strftime("%Y-%m-%d %I:%M %p")
                if cin:
                    diff = (dt_out - dt_in).total_seconds() / 3600
                    duration_hrs = f"{diff:.2f}"
            except Exception:
                cout_ist = cout

        raw_status = determine_attendance_status(cin, cout, r.get("status"))
        if raw_status == "half_day":
            status = "Half Day"
        elif cout:
            status = "Present"
        else:
            status = "Checked In (Open)"

        writer.writerow([
            _sanitize_csv_cell(r.get("id")),
            _sanitize_csv_cell(r.get("staff_id")),
            _sanitize_csv_cell(cin),
            _sanitize_csv_cell(cout),
            _sanitize_csv_cell(cin_ist),
            _sanitize_csv_cell(cout_ist),
            _sanitize_csv_cell(duration_hrs),
            _sanitize_csv_cell(status),
        ])

    return output.getvalue()


def export_audit_logs_csv(records: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Log ID", "Timestamp (UTC)", "Timestamp (IST)", "Actor ID", "Actor Role", "Action", "Target Type", "Target ID", "Details"])

    for r in records:
        ts = r.get("created_at")
        ts_ist = "—"
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                ts_ist = dt.astimezone(INDIA_TIMEZONE).strftime("%Y-%m-%d %I:%M %p")
            except Exception:
                ts_ist = ts

        details_str = json.dumps(r.get("details", {})) if isinstance(r.get("details"), (dict, list)) else str(r.get("details") or "")

        writer.writerow([
            _sanitize_csv_cell(r.get("id")),
            _sanitize_csv_cell(ts),
            _sanitize_csv_cell(ts_ist),
            _sanitize_csv_cell(r.get("actor_id")),
            _sanitize_csv_cell(r.get("actor_role")),
            _sanitize_csv_cell(r.get("action")),
            _sanitize_csv_cell(r.get("target_type")),
            _sanitize_csv_cell(r.get("target_id")),
            _sanitize_csv_cell(details_str),
        ])

    return output.getvalue()


def export_leave_requests_csv(records: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Request ID", "Staff ID", "Request Type", "Start Date", "End Date", "Status", "Escalated", "Reason", "Reviewer ID", "Review Comment", "Created At (IST)", "Updated At (IST)"])

    for r in records:
        c_at = r.get("created_at")
        u_at = r.get("updated_at")
        c_ist = "—"
        u_ist = "—"
        if c_at:
            try:
                c_ist = datetime.fromisoformat(c_at.replace("Z", "+00:00")).astimezone(INDIA_TIMEZONE).strftime("%Y-%m-%d %I:%M %p")
            except Exception:
                c_ist = c_at
        if u_at:
            try:
                u_ist = datetime.fromisoformat(u_at.replace("Z", "+00:00")).astimezone(INDIA_TIMEZONE).strftime("%Y-%m-%d %I:%M %p")
            except Exception:
                u_ist = u_at

        writer.writerow([
            _sanitize_csv_cell(r.get("id")),
            _sanitize_csv_cell(r.get("staff_id")),
            _sanitize_csv_cell(r.get("request_type")),
            _sanitize_csv_cell(r.get("start_date")),
            _sanitize_csv_cell(r.get("end_date")),
            _sanitize_csv_cell(r.get("status")),
            _sanitize_csv_cell("Yes" if r.get("escalated") else "No"),
            _sanitize_csv_cell(r.get("reason")),
            _sanitize_csv_cell(r.get("reviewer_id")),
            _sanitize_csv_cell(r.get("review_comment")),
            _sanitize_csv_cell(c_ist),
            _sanitize_csv_cell(u_ist),
        ])

    return output.getvalue()


# ------------------------------------------------------------------------------
# Phase 4: Absence Alerts & Staff Profile Management
# ------------------------------------------------------------------------------

def get_staff_profiles_map() -> dict[str, dict[str, Any]]:
    """Return dict of {staff_id: {'full_name': ..., 'phone': ...}} from local SQLite cache."""
    try:
        conn = _get_sqlite_conn()
        rows = conn.execute("SELECT staff_id, full_name, phone FROM staff_profiles").fetchall()
        conn.close()
        return {r["staff_id"]: {"full_name": r["full_name"], "phone": r["phone"]} for r in rows}
    except Exception:
        return {}


def save_staff_profile(
    supabase: Optional[Client],
    staff_id: str,
    full_name: Optional[str] = None,
    phone: Optional[str] = None,
) -> dict[str, Any]:
    """Save staff profile to local SQLite and attempt Supabase update if columns exist."""
    normalized_id = staff_id.strip().upper()
    now_iso = _now_utc_iso()

    # Update local SQLite
    curr_name = full_name
    curr_phone = phone
    try:
        conn = _get_sqlite_conn()
        with conn:
            existing = conn.execute(
                "SELECT full_name, phone FROM staff_profiles WHERE staff_id = ?",
                (normalized_id,),
            ).fetchone()
            if existing:
                curr_name = full_name if full_name is not None else existing["full_name"]
                curr_phone = phone if phone is not None else existing["phone"]
            conn.execute(
                """
                INSERT OR REPLACE INTO staff_profiles (staff_id, full_name, phone, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (normalized_id, curr_name, curr_phone, now_iso),
            )
        conn.close()
    except Exception as e:
        print(f"Error saving profile in local DB: {e}")

    # Attempt Supabase update (safe; if columns are absent, it will catch and ignore)
    if supabase is not None:
        try:
            update_payload = {}
            if full_name is not None:
                update_payload["full_name"] = full_name.strip() or None
            if phone is not None:
                update_payload["phone"] = phone.strip() or None
            if update_payload:
                supabase.table("staff_users").update(update_payload).eq("staff_id", normalized_id).execute()
        except Exception:
            pass

    return {"staff_id": normalized_id, "full_name": curr_name, "phone": curr_phone}


def delete_staff_profile(supabase: Optional[Client], staff_id: str) -> None:
    """Remove staff profile from local SQLite cache."""
    normalized_id = staff_id.strip().upper()
    try:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute("DELETE FROM staff_profiles WHERE staff_id = ?", (normalized_id,))
        conn.close()
    except Exception as e:
        print(f"Error removing profile from local DB: {e}")


def get_staff_list_with_profiles(supabase: Optional[Client]) -> list[dict[str, Any]]:
    """Fetch staff users safely and merge with profile names & phone numbers."""
    profiles = get_staff_profiles_map()
    staff_list: list[dict[str, Any]] = []

    if supabase is not None:
        # First attempt: query including full_name, phone (if migration 02 is applied)
        try:
            res = (
                supabase.table("staff_users")
                .select("staff_id, role, is_active, full_name, phone, created_at")
                .eq("role", "staff")
                .order("staff_id")
                .execute()
            )
            data = res.data or []
            for item in data:
                sid = item.get("staff_id", "")
                p = profiles.get(sid, {})
                if not item.get("full_name") and p.get("full_name"):
                    item["full_name"] = p["full_name"]
                if not item.get("phone") and p.get("phone"):
                    item["phone"] = p["phone"]
            return data
        except Exception:
            # Fall back to base columns that always exist in staff_users
            try:
                res = (
                    supabase.table("staff_users")
                    .select("staff_id, role, is_active, created_at")
                    .eq("role", "staff")
                    .order("staff_id")
                    .execute()
                )
                data = res.data or []
                for item in data:
                    sid = item.get("staff_id", "")
                    p = profiles.get(sid, {})
                    item["full_name"] = p.get("full_name") or sid
                    item["phone"] = p.get("phone") or None
                return data
            except Exception as e:
                print(f"Supabase staff fetch error: {e}")

    # Local SQLite fallback
    try:
        conn = _get_sqlite_conn()
        rows = conn.execute(
            "SELECT staff_id, role, is_active, created_at FROM staff_users WHERE role='staff'"
        ).fetchall()
        conn.close()
        for r in rows:
            sid = r["staff_id"]
            p = profiles.get(sid, {})
            staff_list.append({
                "staff_id": sid,
                "role": r["role"],
                "is_active": bool(r["is_active"]),
                "full_name": p.get("full_name") or sid,
                "phone": p.get("phone") or None,
                "created_at": r["created_at"],
            })
    except Exception:
        pass
    return staff_list


def _is_working_day(d: "date_type", holiday_dates: set) -> bool:
    """Return True if d is Mon–Fri and not a college holiday."""
    return d.weekday() < 5 and d not in holiday_dates


def get_college_holidays(supabase: Optional[Client], year: int) -> set:
    """Return a set of date objects for all holidays in the given year."""
    from datetime import date as DT
    holidays: set = set()

    if supabase is not None:
        try:
            start = f"{year}-01-01"
            end   = f"{year}-12-31"
            res = (
                supabase.table("college_holidays")
                .select("holiday_date")
                .gte("holiday_date", start)
                .lte("holiday_date", end)
                .execute()
            )
            for row in (res.data or []):
                try:
                    holidays.add(DT.fromisoformat(row["holiday_date"]))
                except Exception:
                    pass
            if holidays:
                return holidays
        except Exception:
            pass

    # Local SQLite fallback
    try:
        conn = _get_sqlite_conn()
        rows = conn.execute(
            "SELECT holiday_date FROM college_holidays WHERE holiday_date BETWEEN ? AND ?",
            (f"{year}-01-01", f"{year}-12-31"),
        ).fetchall()
        conn.close()
        for r in rows:
            try:
                holidays.add(DT.fromisoformat(r["holiday_date"]))
            except Exception:
                pass
    except Exception:
        pass
    return holidays


def get_college_holidays_records(supabase: Optional[Client], year: int) -> list[dict[str, Any]]:
    """Return a list of holiday records for the admin calendar."""
    holidays_dict: dict[str, str] = {}

    if supabase is not None:
        try:
            start = f"{year}-01-01"
            end   = f"{year}-12-31"
            res = (
                supabase.table("college_holidays")
                .select("holiday_date, description")
                .gte("holiday_date", start)
                .lte("holiday_date", end)
                .execute()
            )
            for row in (res.data or []):
                holidays_dict[row["holiday_date"]] = row.get("description") or ""
        except Exception:
            pass

    try:
        conn = _get_sqlite_conn()
        rows = conn.execute(
            "SELECT holiday_date, description FROM college_holidays WHERE holiday_date BETWEEN ? AND ?",
            (f"{year}-01-01", f"{year}-12-31"),
        ).fetchall()
        conn.close()
        for r in rows:
            if r["holiday_date"] not in holidays_dict:
                holidays_dict[r["holiday_date"]] = r["description"] or ""
    except Exception:
        pass

    return [{"holiday_date": d, "description": desc} for d, desc in sorted(holidays_dict.items())]


def add_college_holiday(
    supabase: Optional[Client],
    holiday_date: str,
    description: str = "",
) -> dict[str, Any]:
    """Add a holiday. holiday_date must be YYYY-MM-DD."""
    record = {
        "holiday_date": holiday_date,
        "description": description.strip() or None,
        "created_at": _now_utc_iso(),
    }
    if supabase is not None:
        try:
            res = supabase.table("college_holidays").upsert(record, on_conflict="holiday_date").execute()
            if res.data:
                return res.data[0]
        except Exception:
            pass
    # Local fallback
    try:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO college_holidays (holiday_date, description, created_at) VALUES (?,?,?)",
                (holiday_date, record["description"], record["created_at"]),
            )
        conn.close()
    except Exception as e:
        raise RuntimeError(f"Could not save holiday: {e}")
    return record


def delete_college_holiday(supabase: Optional[Client], holiday_date: str) -> bool:
    if supabase is not None:
        try:
            supabase.table("college_holidays").delete().eq("holiday_date", holiday_date).execute()
        except Exception:
            pass
    try:
        conn = _get_sqlite_conn()
        with conn:
            conn.execute("DELETE FROM college_holidays WHERE holiday_date = ?", (holiday_date,))
        conn.close()
        return True
    except Exception:
        return False


def get_absence_alerts(
    supabase: Optional[Client],
    threshold_days: int = 2,
    lookback_days: int = 30,
) -> list[dict[str, Any]]:
    """
    Detect active staff who have been absent for *more than* threshold_days
    consecutive working days (IST).

    Staff who are present today or on approved leave today are NOT considered absent.
    Working days before a staff member's account was created are not counted against them.

    Returns a list of alert dicts:
      { staff_id, full_name, phone, consecutive_absent_days, absent_since }
    """
    from datetime import date as DT, timedelta

    now_ist = datetime.now(INDIA_TIMEZONE)
    today_ist = now_ist.date()

    # Collect all holiday dates across the years covered by lookback
    holiday_years = {(today_ist - timedelta(days=i)).year for i in range(lookback_days + 10)}
    holiday_dates: set = set()
    for yr in holiday_years:
        holiday_dates |= get_college_holidays(supabase, yr)

    # Build the list of working days to check (newest first, up to lookback_days)
    working_days = []
    d = today_ist
    while len(working_days) < lookback_days:
        if _is_working_day(d, holiday_dates):
            working_days.append(d)
        d -= timedelta(days=1)

    # Fetch all active staff safely (merging profiles)
    all_staff = get_staff_list_with_profiles(supabase)
    staff_list = [s for s in all_staff if s.get("is_active", True)]

    # Fetch attendance records for the lookback window (converting UTC timestamps to IST dates)
    window_start_date = working_days[-1] if working_days else today_ist
    start_ist = datetime.combine(window_start_date, time.min, tzinfo=INDIA_TIMEZONE)
    end_ist = datetime.combine(today_ist, time.max, tzinfo=INDIA_TIMEZONE)
    start_utc = start_ist.astimezone(timezone.utc).isoformat()
    end_utc = end_ist.astimezone(timezone.utc).isoformat()

    attendance_by_staff: dict[str, set] = {}  # staff_id -> set of IST date objects present
    if supabase is not None:
        try:
            res = (
                supabase.table("attendance")
                .select("staff_id, check_in")
                .gte("check_in", start_utc)
                .lte("check_in", end_utc)
                .execute()
            )
            for row in (res.data or []):
                sid = row.get("staff_id", "")
                ci  = row.get("check_in", "")
                if sid and ci:
                    try:
                        dt = datetime.fromisoformat(ci.replace("Z", "+00:00"))
                        ist_date = dt.astimezone(INDIA_TIMEZONE).date()
                        attendance_by_staff.setdefault(sid, set()).add(ist_date)
                    except Exception:
                        pass
        except Exception:
            pass

    # Fetch approved leave requests in the window
    window_start_str = window_start_date.isoformat()
    window_end_str   = today_ist.isoformat()

    approved_leave_by_staff: dict[str, list[tuple]] = {}  # staff_id -> [(start, end), ...]
    if supabase is not None:
        try:
            res = (
                supabase.table("leave_requests")
                .select("staff_id, start_date, end_date")
                .eq("status", "approved")
                .lte("start_date", window_end_str)
                .gte("end_date", window_start_str)
                .execute()
            )
            for row in (res.data or []):
                sid = row.get("staff_id", "")
                if sid:
                    try:
                        s = DT.fromisoformat(row["start_date"])
                        e = DT.fromisoformat(row["end_date"])
                        approved_leave_by_staff.setdefault(sid, []).append((s, e))
                    except Exception:
                        pass
        except Exception:
            pass

    # Check local SQLite for approved leave requests as well
    try:
        conn = _get_sqlite_conn()
        rows = conn.execute(
            """
            SELECT staff_id, start_date, end_date FROM leave_requests
            WHERE status='approved' AND start_date <= ? AND end_date >= ?
            """,
            (window_end_str, window_start_str),
        ).fetchall()
        conn.close()
        for r in rows:
            sid = r["staff_id"]
            if sid:
                try:
                    s = DT.fromisoformat(r["start_date"])
                    e = DT.fromisoformat(r["end_date"])
                    approved_leave_by_staff.setdefault(sid, []).append((s, e))
                except Exception:
                    pass
    except Exception:
        pass

    def _is_excused(staff_id: str, day: "DT") -> bool:
        """True if this day is covered by an approved leave/duty."""
        for (s, e) in approved_leave_by_staff.get(staff_id, []):
            if s <= day <= e:
                return True
        return False

    alerts = []
    for staff in staff_list:
        sid = staff.get("staff_id", "")
        if not sid:
            continue

        present_days = attendance_by_staff.get(sid, set())

        # If staff is present today or excused today, they are not currently absent!
        if today_ist in present_days or _is_excused(sid, today_ist):
            continue

        # Account creation date: do not count working days before staff joined
        created_date: Optional[DT] = None
        c_at = staff.get("created_at")
        if c_at:
            try:
                dt_c = datetime.fromisoformat(c_at.replace("Z", "+00:00")).astimezone(INDIA_TIMEZONE)
                created_date = dt_c.date()
            except Exception:
                pass

        # Walk newest-first: count consecutive absent (not present, not excused) working days
        consecutive = 0
        absent_since: Optional[str] = None
        for day in working_days:
            # If the working day is before this staff member's account was created, stop streak
            if created_date and day < created_date:
                break

            if day in present_days or _is_excused(sid, day):
                break  # streak ends

            consecutive += 1
            absent_since = day.isoformat()

        if consecutive > threshold_days:
            alerts.append({
                "staff_id": sid,
                "full_name": staff.get("full_name") or sid,
                "phone": staff.get("phone") or "",
                "consecutive_absent_days": consecutive,
                "absent_since": absent_since,
            })

    # Sort most-absent first
    alerts.sort(key=lambda x: x["consecutive_absent_days"], reverse=True)
    return alerts

