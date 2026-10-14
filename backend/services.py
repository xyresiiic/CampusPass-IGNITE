import os
import io
import csv
import json
import uuid
import sqlite3
from datetime import datetime, timezone, timedelta
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
    return conn


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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

        status = "Present" if cout else "Checked In (Open)"
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
