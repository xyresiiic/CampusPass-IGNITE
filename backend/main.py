import os
import hashlib
import hmac
import secrets
import math
import base64
import binascii
import uuid

import numpy as np
import cv2
from deepface import DeepFace
from deepface.modules.exceptions import SpoofDetected

from datetime import datetime, timedelta, timezone, date as Date
from contextlib import asynccontextmanager

import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from supabase import create_client, Client
import services


load_dotenv()

supabase: Client | None = None

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 480

CAMPUS_LATITUDE = float(os.getenv("CAMPUS_LATITUDE", "26.822625"))
CAMPUS_LONGITUDE = float(os.getenv("CAMPUS_LONGITUDE", "75.866351"))
CAMPUS_RADIUS_METERS = float(os.getenv("CAMPUS_RADIUS_METERS", "200"))
MAX_GPS_ACCURACY_METERS = float(
    os.getenv("MAX_GPS_ACCURACY_METERS", "50")
)

FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "Facenet512")
FACE_DISTANCE_THRESHOLD = float(
    os.getenv("FACE_DISTANCE_THRESHOLD", "0.30")
)
FACE_PROOF_VALID_SECONDS = 90
MAX_FACE_IMAGE_BYTES = 1_500_000
ANTI_SPOOFING_ENABLED = (
    os.getenv("ANTI_SPOOFING_ENABLED", "false").lower() in ("true", "1", "yes")
)
ENVIRONMENT = os.getenv("ENVIRONMENT", "production").lower()
ENABLE_DEMO_SEEDING = (
    os.getenv("ENABLE_DEMO_SEEDING", "false").lower() in ("true", "1", "yes")
)
ESCALATION_DEADLINE_HOURS = int(os.getenv("ESCALATION_DEADLINE_HOURS", "24"))

INDIA_TIMEZONE = timezone(timedelta(hours=5, minutes=30))
bearer_scheme = HTTPBearer(auto_error=False)


# ---------------- SECURITY HELPERS ----------------

def hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    ).hex()


def haversine_distance(
    latitude1: float,
    longitude1: float,
    latitude2: float,
    longitude2: float,
) -> float:
    earth_radius = 6_371_000

    lat1 = math.radians(latitude1)
    lat2 = math.radians(latitude2)
    lat_difference = math.radians(latitude2 - latitude1)
    lon_difference = math.radians(longitude2 - longitude1)

    a = (
        math.sin(lat_difference / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(lon_difference / 2) ** 2
    )

    a = min(1.0, max(0.0, a))

    return earth_radius * 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a),
    )


class GPSLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(gt=0, le=10000)


class AttendanceRequest(GPSLocation):
    face_proof: str = Field(min_length=1, max_length=100)


class FaceImageRequest(BaseModel):
    image: str = Field(min_length=1)


class FaceVerifyRequest(BaseModel):
    image: str = Field(min_length=1)
    action: str


def validate_campus_location(location: GPSLocation) -> dict:
    if location.accuracy_m > MAX_GPS_ACCURACY_METERS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Your GPS accuracy is too low "
                f"({location.accuracy_m:.0f} m). "
                f"Move to an open area and try again. "
                f"Required accuracy: "
                f"{MAX_GPS_ACCURACY_METERS:.0f} m or better."
            ),
        )

    distance = haversine_distance(
        location.latitude,
        location.longitude,
        CAMPUS_LATITUDE,
        CAMPUS_LONGITUDE,
    )

    if distance > CAMPUS_RADIUS_METERS:
        raise HTTPException(
            status_code=403,
            detail=(
                "You are outside the campus attendance area. "
                f"Distance from campus pin: {distance:.0f} metres. "
                f"Allowed distance: {CAMPUS_RADIUS_METERS:.0f} metres."
            ),
        )

    return {
        "distance_m": round(distance, 1),
        "accuracy_m": round(location.accuracy_m, 1),
    }


# ---------------- FACE RECOGNITION HELPERS ----------------

# Minimum short-edge size (pixels) fed to MiniFASNet.  The model works best
# at >= 480 px; too-small inputs confuse the depth-texture classifier and
# produce false "spoof" readings on real webcam frames.
_LIVENESS_MIN_EDGE = 480


def preprocess_for_liveness(frame: np.ndarray) -> np.ndarray:
    """Return a contrast-normalised, adequately-sized copy of *frame*.

    MiniFASNet (the anti-spoofing backbone used by DeepFace) analyses fine
    skin-texture patterns.  Compressed webcam/phone JPEG frames frequently
    arrive with low contrast or at small resolution, which makes the model
    mistake real faces for printed photos.

    This function:
    1. Up-scales small frames so the short edge is >= _LIVENESS_MIN_EDGE.
    2. Applies per-channel CLAHE to restore local contrast lost during JPEG
       compression.
    3. Returns the result without modifying the original *frame*.
    """
    h, w = frame.shape[:2]
    short_edge = min(h, w)

    if short_edge < _LIVENESS_MIN_EDGE:
        scale = _LIVENESS_MIN_EDGE / short_edge
        new_w = max(int(round(w * scale)), 1)
        new_h = max(int(round(h * scale)), 1)
        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    # CLAHE on the luminance channel (LAB colour space) – avoids shifting hue.
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_ch = clahe.apply(l_ch)
    lab = cv2.merge([l_ch, a_ch, b_ch])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    return enhanced


def _run_represent(
    img: np.ndarray,
    anti_spoofing: bool,
) -> list[dict]:
    """Thin wrapper around DeepFace.represent – raises raw exceptions."""
    return DeepFace.represent(
        img_path=img,
        model_name=FACE_MODEL_NAME,
        detector_backend="opencv",
        enforce_detection=True,
        align=True,
        anti_spoofing=anti_spoofing,
    )


def decode_face_image(image_data: str) -> np.ndarray:
    """Decode a base64 image and validate its dimensions."""

    if image_data.startswith("data:"):
        parts = image_data.split(",", 1)

        if len(parts) != 2:
            raise HTTPException(400, "Invalid image data.")

        image_data = parts[1]

    # Reject excessively long encoded data before decoding.
    if len(image_data) > (MAX_FACE_IMAGE_BYTES * 2):
        raise HTTPException(
            413,
            "Image must be smaller than 1.5 MB.",
        )

    try:
        image_bytes = base64.b64decode(
            image_data,
            validate=True,
        )
    except (binascii.Error, ValueError):
        raise HTTPException(400, "Invalid base64 image.")

    if not image_bytes:
        raise HTTPException(400, "Image is empty.")

    if len(image_bytes) > MAX_FACE_IMAGE_BYTES:
        raise HTTPException(
            413,
            "Image must be smaller than 1.5 MB.",
        )

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(400, "Unable to read the image.")

    height, width = frame.shape[:2]

    if width < 160 or height < 160:
        raise HTTPException(
            400,
            "Image resolution must be at least 160 x 160 pixels.",
        )

    return frame


def extract_face_embedding(
    image_data: str,
    enforce_anti_spoofing: bool = False,
) -> list[float]:
    """Extract one face embedding using DeepFace with optional anti-spoofing.

    When anti-spoofing is enabled the function uses a two-pass strategy to
    minimise false positives caused by JPEG compression artefacts, low
    brightness, or small frame sizes that are common in webcam and phone
    camera captures:

    Pass 1 — raw decoded frame.
    Pass 2 — contrast-normalised, resolution-upscaled variant.

    Only if *both* passes raise SpoofDetected is the request rejected as a
    genuine replay attack.  Real photographs / screen replays will reliably
    fail both passes.
    """

    frame = decode_face_image(image_data)
    representations = None

    if not enforce_anti_spoofing:
        # Fast path – skip anti-spoofing machinery entirely.
        try:
            representations = _run_represent(frame, anti_spoofing=False)
        except HTTPException:
            raise
        except Exception as error:
            print(f"Face extraction error: {error}")
            raise HTTPException(
                status_code=400,
                detail=(
                    "No clear face detected. Face the camera in good "
                    "lighting and try again."
                ),
            )
    else:
        # ---- Pass 1: raw frame with anti-spoofing ----
        spoof_pass1 = False
        try:
            representations = _run_represent(frame, anti_spoofing=True)
        except SpoofDetected as e1:
            spoof_pass1 = True
            print(f"Anti-spoofing pass-1 rejected (will retry with preprocessing): {e1}")
        except HTTPException:
            raise
        except Exception as error:
            print(f"Face extraction error (pass 1): {error}")
            raise HTTPException(
                status_code=400,
                detail=(
                    "No clear face detected. Face the camera in good "
                    "lighting and try again."
                ),
            )

        if spoof_pass1:
            # ---- Pass 2: pre-processed (CLAHE + upscale) with anti-spoofing ----
            enhanced = preprocess_for_liveness(frame)
            try:
                representations = _run_represent(enhanced, anti_spoofing=True)
                print("Anti-spoofing pass-2 (enhanced frame) accepted – real face confirmed.")
            except SpoofDetected as e2:
                print(f"Anti-spoofing pass-2 also rejected – treating as spoof: {e2}")
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Liveness check failed: the system could not confirm a "
                        "live face. Please face the camera directly in natural "
                        "lighting and try again."
                    ),
                )
            except HTTPException:
                raise
            except Exception as error:
                print(f"Face extraction error (pass 2): {error}")
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "No clear face detected. Ensure you are in good lighting "
                        "and your face fills the oval guide."
                    ),
                )

    if not representations:
        raise HTTPException(
            status_code=400,
            detail="No clear face detected. Face the camera in good lighting and try again.",
        )

    # When multiple faces are visible (e.g. classmates, colleagues, or bystanders in the background),
    # select the primary foreground face closest to the camera and centered in the frame.
    h_frame, w_frame = frame.shape[:2]

    def face_prominence(item: dict) -> float:
        box = item.get("facial_area") or {}
        w = float(box.get("w", 0))
        h = float(box.get("h", 0))
        area = w * h

        # Center distance penalty: the user is centered in the oval guide
        cx = float(box.get("x", 0)) + (w / 2.0)
        cy = float(box.get("y", 0)) + (h / 2.0)
        dx = cx - (w_frame / 2.0)
        dy = cy - (h_frame / 2.0)
        dist_from_center = math.hypot(dx, dy)
        center_factor = 1.0 / (1.0 + (dist_from_center / max(w_frame, 1)))

        return area * center_factor

    primary_face = max(representations, key=face_prominence)
    box = primary_face.get("facial_area") or {}

    if box.get("w", 0) < 40 or box.get("h", 0) < 40:
        raise HTTPException(
            status_code=400,
            detail="Face is too far away. Please move closer to the camera.",
        )

    embedding = primary_face.get("embedding")

    if embedding is None:
        raise HTTPException(
            status_code=400,
            detail="Unable to extract face features.",
        )

    vector = np.asarray(embedding, dtype=np.float64)

    if vector.ndim != 1 or not np.all(np.isfinite(vector)):
        raise HTTPException(
            status_code=400,
            detail="Invalid face features detected.",
        )

    return vector.tolist()


def cosine_distance(
    first_embedding: list[float],
    second_embedding: list[float],
) -> float:
    first = np.asarray(first_embedding, dtype=np.float64)
    second = np.asarray(second_embedding, dtype=np.float64)

    if first.shape != second.shape:
        raise HTTPException(
            status_code=409,
            detail="Face model mismatch. Please enroll the face again.",
        )

    denominator = np.linalg.norm(first) * np.linalg.norm(second)

    if denominator == 0:
        raise HTTPException(
            status_code=400,
            detail="Unable to compare face features.",
        )

    similarity = float(np.dot(first, second) / denominator)
    similarity = max(-1.0, min(1.0, similarity))

    return 1.0 - similarity


def consume_face_proof(
    proof_id: str,
    staff_id: str,
    action: str,
) -> None:
    """Validate and consume a short-lived face verification proof."""

    assert supabase is not None

    now = datetime.now(timezone.utc)

    try:
        result = (
            supabase.table("attendance_face_proofs")
            .select(
                "proof_id, staff_id, action, expires_at, used_at"
            )
            .eq("proof_id", proof_id)
            .eq("staff_id", staff_id)
            .eq("action", action)
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=403,
                detail="Face verification required. Verify your face again.",
            )

        proof = result.data[0]

        if proof.get("used_at") is not None:
            raise HTTPException(
                status_code=403,
                detail="This face verification has already been used.",
            )

        expiry = datetime.fromisoformat(
            proof["expires_at"].replace("Z", "+00:00")
        )

        if expiry <= now:
            raise HTTPException(
                status_code=403,
                detail="Face verification expired. Please verify again.",
            )

        # Conditional update prevents ordinary reuse of an already-used proof.
        consumed = (
            supabase.table("attendance_face_proofs")
            .update({"used_at": now.isoformat()})
            .eq("proof_id", proof_id)
            .eq("staff_id", staff_id)
            .eq("action", action)
            .is_("used_at", "null")
            .execute()
        )

        if not consumed.data:
            raise HTTPException(
                status_code=403,
                detail="This face verification has already been used.",
            )

    except HTTPException:
        raise
    except Exception as error:
        print(f"Face proof validation error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to validate face verification.",
        )


# ---------------- DATABASE INITIALIZATION ----------------

def seed_demo_users():
    """Create demo accounts only when explicitly enabled in non-production environments."""

    assert supabase is not None

    if ENVIRONMENT == "production" or not ENABLE_DEMO_SEEDING:
        print("Demo seeding is disabled for production.")
        return

    demo_users = [
        {"staff_id": "STF001", "pin": "1234", "role": "staff"},
        {"staff_id": "ADM001", "pin": "000000", "role": "admin"},
    ]

    for demo in demo_users:
        existing = (
            supabase.table("staff_users")
            .select("staff_id")
            .eq("staff_id", demo["staff_id"])
            .limit(1)
            .execute()
        )

        if existing.data:
            continue

        salt = secrets.token_hex(16)

        supabase.table("staff_users").insert({
            "staff_id": demo["staff_id"],
            "role": demo["role"],
            "pin_salt": salt,
            "pin_hash": hash_pin(demo["pin"], salt),
            "is_active": True,
        }).execute()


def enforce_demo_accounts_disabled():
    """Keep known unused admin demo accounts disabled in production."""

    assert supabase is not None

    demo_ids = ["ADM001"]

    for demo_id in demo_ids:
        try:
            supabase.table("staff_users").update({
                "is_active": False,
            }).eq("staff_id", demo_id).execute()
        except Exception as error:
            print(f"Notice: unable to deactivate demo account {demo_id}: {error}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY")

    if not url or not key or not JWT_SECRET_KEY:
        raise RuntimeError(
            "Check SUPABASE_URL, SUPABASE_SECRET_KEY, "
            "and JWT_SECRET_KEY in backend/.env"
        )

    if CAMPUS_RADIUS_METERS <= 0 or MAX_GPS_ACCURACY_METERS <= 0:
        raise RuntimeError(
            "Campus radius and maximum GPS accuracy must be positive."
        )

    if FACE_DISTANCE_THRESHOLD <= 0 or FACE_DISTANCE_THRESHOLD >= 2:
        raise RuntimeError(
            "FACE_DISTANCE_THRESHOLD must be greater than 0 and less than 2."
        )

    supabase = create_client(url, key)

    if ENABLE_DEMO_SEEDING and ENVIRONMENT != "production":
        seed_demo_users()
    else:
        enforce_demo_accounts_disabled()

    # Ensure STF001 is active
    try:
        supabase.table("staff_users").update({"is_active": True}).eq("staff_id", "STF001").execute()
    except Exception as error:
        print(f"Notice: unable to ensure STF001 is active: {error}")

    # Verify at least one active administrator exists to avoid lockout
    admin_check = (
        supabase.table("staff_users")
        .select("staff_id")
        .eq("role", "admin")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )

    if not admin_check.data:
        print(
            "CRITICAL WARNING: No active administrator account found in staff_users! "
            "Run 'python manage_admin.py --create' to provision an admin."
        )
    else:
        print(
            f"Active administrator account confirmed: {admin_check.data[0]['staff_id']}"
        )

    print(
        "CampusPass geofence enabled: "
        f"latitude={CAMPUS_LATITUDE}, "
        f"longitude={CAMPUS_LONGITUDE}, "
        f"radius={CAMPUS_RADIUS_METERS} metres"
    )
    print(f"Face verification enabled with model: {FACE_MODEL_NAME}")
    print(
        "Anti-spoofing liveness protection: "
        f"{'ENABLED (MiniFASNet)' if ANTI_SPOOFING_ENABLED else 'DISABLED'}"
    )

    yield


app = FastAPI(title="CampusPass API", lifespan=lifespan)



cors_origins_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [
    "https://campuspass-ignite.vercel.app",
    "http://localhost:5180",
    "http://127.0.0.1:5180",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if cors_origins_env:
    for o in cors_origins_env.split(","):
        stripped = o.strip()
        if stripped and stripped not in allowed_origins:
            allowed_origins.append(stripped)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# ---------------- BASIC ROUTES ----------------

@app.get("/")
def home():
    return {
        "message": "Welcome to CampusPass",
        "status": "running",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


# ---------------- AUTHENTICATION ----------------

class LoginRequest(BaseModel):
    staff_id: str
    pin: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Please log in first",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        staff_id = payload.get("sub")

        if not staff_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid login token",
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please log in again.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid login token",
        )

    assert supabase is not None

    try:
        result = (
            supabase.table("staff_users")
            .select("staff_id, role, is_active")
            .eq("staff_id", staff_id)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Unable to verify your account. Please try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=401,
            detail="Account not found. Please contact the administrator.",
        )

    account = result.data[0]

    if not account.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail=(
                "Your account is deactivated. "
                "Please contact the administrator."
            ),
        )

    if account.get("role") not in ("staff", "admin"):
        raise HTTPException(
            status_code=403,
            detail="This account does not have a valid role.",
        )

    return {
        "staff_id": account["staff_id"],
        "role": account["role"],
    }


@app.post("/auth/login")
def login(data: LoginRequest):
    assert supabase is not None

    try:
        result = (
            supabase.table("staff_users")
            .select("staff_id, role, pin_salt, pin_hash, is_active")
            .eq("staff_id", data.staff_id.strip().upper())
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Unable to access the database",
        )

    if not result.data:
        services.log_audit_event(
            supabase,
            actor_id=data.staff_id.strip().upper(),
            actor_role="guest",
            action="LOGIN_FAILED",
            details={"reason": "User not found"},
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid Staff ID or Security PIN",
        )

    user = result.data[0]
    submitted_hash = hash_pin(data.pin, user["pin_salt"])

    if not hmac.compare_digest(submitted_hash, user["pin_hash"]):
        services.log_audit_event(
            supabase,
            actor_id=data.staff_id.strip().upper(),
            actor_role="guest",
            action="LOGIN_FAILED",
            details={"reason": "Invalid PIN"},
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid Staff ID or Security PIN",
        )

    if not user.get("is_active", True):
        services.log_audit_event(
            supabase,
            actor_id=data.staff_id.strip().upper(),
            actor_role=user.get("role", "staff"),
            action="LOGIN_FAILED",
            details={"reason": "Account deactivated"},
        )
        raise HTTPException(
            status_code=403,
            detail=(
                "Your account is deactivated. "
                "Please contact the administrator."
            ),
        )

    now = datetime.now(timezone.utc)

    token = jwt.encode(
        {
            "sub": user["staff_id"],
            "role": user["role"],
            "iat": now,
            "exp": now + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )

    services.log_audit_event(
        supabase,
        actor_id=user["staff_id"],
        actor_role=user["role"],
        action="LOGIN_SUCCESS",
    )

    return {
        "message": "Login successful",
        "staff_id": user["staff_id"],
        "role": user["role"],
        "access_token": token,
        "token_type": "bearer",
        "expires_in": TOKEN_EXPIRE_MINUTES * 60,
    }


# ---------------- ADMIN ACCESS ----------------

def require_admin(user: dict = Depends(get_current_user)):
    """Allow only authenticated admin users."""

    if user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required.",
        )

    return user


# ---------------- ADMIN FACE ENROLLMENT ----------------

@app.post("/admin/staff/{staff_id}/face")
def enroll_staff_face(
    staff_id: str,
    data: FaceImageRequest,
    admin: dict = Depends(require_admin),
):
    """Enroll or replace a staff member's face profile."""

    assert supabase is not None
    normalized_id = staff_id.strip().upper()

    try:
        staff = (
            supabase.table("staff_users")
            .select("staff_id, role, is_active")
            .eq("staff_id", normalized_id)
            .eq("role", "staff")
            .limit(1)
            .execute()
        )

        if not staff.data:
            raise HTTPException(
                status_code=404,
                detail="Staff account not found.",
            )

        if not staff.data[0].get("is_active", True):
            raise HTTPException(
                status_code=403,
                detail="This staff account is inactive.",
            )

        embedding = extract_face_embedding(
            data.image,
            enforce_anti_spoofing=ANTI_SPOOFING_ENABLED,
        )

        existing = (
            supabase.table("staff_face_profiles")
            .select("staff_id")
            .eq("staff_id", normalized_id)
            .limit(1)
            .execute()
        )

        profile = {
            "staff_id": normalized_id,
            "embedding": embedding,
            "model_name": FACE_MODEL_NAME,
            "created_by": admin["staff_id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if existing.data:
            supabase.table("staff_face_profiles").update({
                "embedding": embedding,
                "model_name": FACE_MODEL_NAME,
                "created_by": admin["staff_id"],
                "updated_at": profile["updated_at"],
            }).eq("staff_id", normalized_id).execute()
        else:
            supabase.table("staff_face_profiles").insert(
                profile
            ).execute()

        services.log_audit_event(
            supabase,
            actor_id=admin["staff_id"],
            actor_role="admin",
            action="ENROLL_FACE",
            target_type="face_profile",
            target_id=normalized_id,
        )

        return {
            "message": "Staff face enrolled successfully.",
            "staff_id": normalized_id,
            "model": FACE_MODEL_NAME,
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Face enrollment error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to enroll the face. Please try again.",
        )


@app.get("/admin/staff/{staff_id}/face-status")
def staff_face_status(
    staff_id: str,
    admin: dict = Depends(require_admin),
):
    """Check whether a staff member has an enrolled face."""

    assert supabase is not None

    normalized_id = staff_id.strip().upper()

    try:
        result = (
            supabase.table("staff_face_profiles")
            .select("staff_id, model_name, updated_at")
            .eq("staff_id", normalized_id)
            .limit(1)
            .execute()
        )

        return {
            "staff_id": normalized_id,
            "enrolled": bool(result.data),
            "profile": result.data[0] if result.data else None,
        }

    except Exception as error:
        print(f"Face status error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to check face status.",
        )


# ---------------- FACE VERIFICATION ----------------

@app.post("/face/verify")
def verify_face(
    data: FaceVerifyRequest,
    user: dict = Depends(get_current_user),
):
    """Verify the authenticated staff member and issue a temporary proof."""

    assert supabase is not None

    if data.action not in {"check-in", "check-out"}:
        raise HTTPException(
            status_code=400,
            detail="Action must be check-in or check-out.",
        )

    try:
        result = (
            supabase.table("staff_face_profiles")
            .select("embedding, model_name")
            .eq("staff_id", user["staff_id"])
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Your face is not enrolled. "
                    "Contact the administrator."
                ),
            )

        profile = result.data[0]

        if profile["model_name"] != FACE_MODEL_NAME:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Face model changed. Ask the administrator "
                    "to enroll your face again."
                ),
            )

        current_embedding = extract_face_embedding(
            data.image,
            enforce_anti_spoofing=ANTI_SPOOFING_ENABLED,
        )

        distance = cosine_distance(
            profile["embedding"],
            current_embedding,
        )

        if distance > FACE_DISTANCE_THRESHOLD:
            raise HTTPException(
                status_code=403,
                detail="Face verification failed. Please try again.",
            )

        proof_id = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(
            seconds=FACE_PROOF_VALID_SECONDS
        )

        supabase.table("attendance_face_proofs").insert({
            "proof_id": proof_id,
            "staff_id": user["staff_id"],
            "action": data.action,
            "expires_at": expiry.isoformat(),
        }).execute()

        return {
            "verified": True,
            "proof_id": proof_id,
            "action": data.action,
            "expires_at": expiry.isoformat(),
            "message": (
                "Face verified. Complete attendance within "
                f"{FACE_PROOF_VALID_SECONDS} seconds."
            ),
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Face verification error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to verify your face. Please try again.",
        )


# ---------------- ATTENDANCE CHECK-IN ----------------

@app.post("/attendance/check-in")
def check_in(
    location: AttendanceRequest,
    user: dict = Depends(get_current_user),
):
    assert supabase is not None

    gps_result = validate_campus_location(location)
    staff_id = user["staff_id"]

    # Consume proof only after GPS validation succeeds.
    consume_face_proof(
        location.face_proof,
        staff_id,
        "check-in",
    )

    now_ist = datetime.now(INDIA_TIMEZONE)
    start_of_day = now_ist.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    end_of_day = start_of_day + timedelta(days=1)

    try:
        existing = (
            supabase.table("attendance")
            .select("id, check_in, check_out")
            .eq("staff_id", staff_id)
            .gte("check_in", start_of_day.astimezone(timezone.utc).isoformat())
            .lt("check_in", end_of_day.astimezone(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )

        if existing.data:
            record = existing.data[0]

            if record.get("check_out") is None:
                detail = "You are already checked in."
            else:
                detail = (
                    "You have already recorded attendance today. "
                    "You cannot check in again today."
                )

            raise HTTPException(status_code=409, detail=detail)

        result = (
            supabase.table("attendance")
            .insert({
                "staff_id": staff_id,
                "check_in": datetime.now(timezone.utc).isoformat(),
            })
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=503,
                detail="The attendance record could not be saved.",
            )

        services.log_audit_event(
            supabase,
            actor_id=staff_id,
            actor_role="staff",
            action="CHECK_IN",
            target_type="attendance",
            target_id=str(result.data[0]["id"]),
            details={"distance_m": gps_result["distance_m"], "accuracy_m": gps_result["accuracy_m"]},
        )

        return {
            "message": "Check-in successful. Campus location accepted.",
            "attendance": result.data[0],
            "location": gps_result,
            "face_verified": True,
        }

    except HTTPException:
        raise
    except Exception as error:
        error_text = str(error)
        print(f"Check-in error: {error_text}")

        if (
            "23505" in error_text
            or "attendance_one_session_per_staff_per_day" in error_text
            or "attendance_one_open_session_per_staff" in error_text
        ):
            raise HTTPException(
                status_code=409,
                detail="Attendance has already been recorded today.",
            )

        raise HTTPException(
            status_code=503,
            detail="Check-in failed. Please try again.",
        )


# ---------------- ATTENDANCE CHECK-OUT ----------------

@app.post("/attendance/check-out")
def check_out(
    location: AttendanceRequest,
    user: dict = Depends(get_current_user),
):
    assert supabase is not None

    gps_result = validate_campus_location(location)
    staff_id = user["staff_id"]

    consume_face_proof(
        location.face_proof,
        staff_id,
        "check-out",
    )

    try:
        active = (
            supabase.table("attendance")
            .select("id, check_in")
            .eq("staff_id", staff_id)
            .is_("check_out", "null")
            .order("check_in", desc=True)
            .limit(1)
            .execute()
        )

        if not active.data:
            raise HTTPException(
                status_code=409,
                detail="You are not currently checked in.",
            )

        record_id = active.data[0]["id"]
        check_in_str = active.data[0].get("check_in")
        check_out_time = datetime.now(timezone.utc)
        check_out_iso = check_out_time.isoformat()

        # Check if staff member has an approved leave or duty today (Asia/Kolkata date)
        now_ist = datetime.now(INDIA_TIMEZONE)
        has_leave = services.has_approved_leave_or_duty(supabase, staff_id, now_ist.date())

        # Determine attendance status under the college timings rule
        calculated_status = services.determine_attendance_status(
            check_in_str=check_in_str,
            check_out_str=check_out_iso,
            has_leave=has_leave,
        )

        # Attempt to update check_out with status column in Supabase
        try:
            result = (
                supabase.table("attendance")
                .update({
                    "check_out": check_out_iso,
                    "status": calculated_status,
                })
                .eq("id", record_id)
                .eq("staff_id", staff_id)
                .is_("check_out", "null")
                .execute()
            )
        except Exception:
            # Fall back without status column if migration has not been applied to Supabase
            result = (
                supabase.table("attendance")
                .update({
                    "check_out": check_out_iso,
                })
                .eq("id", record_id)
                .eq("staff_id", staff_id)
                .is_("check_out", "null")
                .execute()
            )

        if not result.data:
            raise HTTPException(
                status_code=409,
                detail="This attendance record is already closed.",
            )

        # Persist status in local DB and Supabase safely
        services.save_attendance_status(supabase, record_id, calculated_status)

        record_data = dict(result.data[0])
        record_data["status"] = calculated_status

        services.log_audit_event(
            supabase,
            actor_id=staff_id,
            actor_role="staff",
            action="CHECK_OUT",
            target_type="attendance",
            target_id=str(record_id),
            details={
                "distance_m": gps_result["distance_m"],
                "accuracy_m": gps_result["accuracy_m"],
                "status": calculated_status,
            },
        )

        msg = (
            "Check-out successful. Marked as half-day (late arrival after 11:00 AM & early departure before 02:00 PM)."
            if calculated_status == "half_day"
            else "Check-out successful. Campus location accepted."
        )

        return {
            "message": msg,
            "attendance": record_data,
            "location": gps_result,
            "face_verified": True,
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Check-out error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to save check-out. Please try again.",
        )


# ---------------- MY ATTENDANCE ----------------

@app.get("/attendance/me")
def my_attendance(user: dict = Depends(get_current_user)):
    assert supabase is not None

    try:
        result = (
            supabase.table("attendance")
            .select("id, staff_id, check_in, check_out, created_at")
            .eq("staff_id", user["staff_id"])
            .order("check_in", desc=True)
            .limit(100)
            .execute()
        )

        enriched_records = []
        for r in (result.data or []):
            item = dict(r)
            item["status"] = services.determine_attendance_status(item.get("check_in"), item.get("check_out"), item.get("status"))
            enriched_records.append(item)

        return {
            "staff_id": user["staff_id"],
            "records": enriched_records,
        }

    except Exception as error:
        print(f"Attendance history error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to load attendance history.",
        )


# ---------------- ADMIN DASHBOARD ----------------

@app.get("/admin/dashboard")
def admin_dashboard(user: dict = Depends(require_admin)):
    assert supabase is not None

    try:
        now_ist = datetime.now(INDIA_TIMEZONE)

        start_ist = now_ist.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        end_ist = start_ist + timedelta(days=1)

        start_utc = start_ist.astimezone(timezone.utc).isoformat()
        end_utc = end_ist.astimezone(timezone.utc).isoformat()

        staff_result = (
            supabase.table("staff_users")
            .select("staff_id, role, is_active")
            .eq("role", "staff")
            .execute()
        )

        staff_accounts = staff_result.data or []

        all_staff_ids = {
            item["staff_id"] for item in staff_accounts
        }

        active_staff_ids = {
            item["staff_id"]
            for item in staff_accounts
            if item.get("is_active", True)
        }

        total_staff = len(all_staff_ids)
        active_staff = len(active_staff_ids)
        inactive_staff = total_staff - active_staff

        today_result = (
            supabase.table("attendance")
            .select("id, staff_id, check_in, check_out")
            .gte("check_in", start_utc)
            .lt("check_in", end_utc)
            .order("check_in", desc=True)
            .execute()
        )

        today_records = today_result.data or []

        active_today_records = [
            record for record in today_records
            if record["staff_id"] in active_staff_ids
        ]

        present_ids = {
            record["staff_id"] for record in active_today_records
        }

        present_today = len(present_ids)
        absent_today = max(0, active_staff - present_today)

        open_result = (
            supabase.table("attendance")
            .select("staff_id")
            .is_("check_out", "null")
            .execute()
        )

        checked_in_ids = {
            record["staff_id"]
            for record in (open_result.data or [])
            if record["staff_id"] in active_staff_ids
        }

        # Enrich today records with status and count half_day
        half_day_today = 0
        enriched_today_records = []
        for r in today_records:
            item = dict(r)
            stat = services.determine_attendance_status(
                item.get("check_in"),
                item.get("check_out"),
                item.get("status"),
                has_leave=services.has_approved_leave_or_duty(supabase, item.get("staff_id"), now_ist.date()),
            )
            item["status"] = stat
            if stat == "half_day" and item.get("staff_id") in active_staff_ids:
                half_day_today += 1
            enriched_today_records.append(item)

        return {
            "date": now_ist.date().isoformat(),
            "total_staff": total_staff,
            "active_staff": active_staff,
            "inactive_staff": inactive_staff,
            "present_today": present_today,
            "absent_today": absent_today,
            "half_day_today": half_day_today,
            "currently_checked_in": len(checked_in_ids),
            "recent_attendance": enriched_today_records[:10],
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Admin dashboard error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to load admin dashboard data.",
        )


# ---------------- STAFF MANAGEMENT ----------------

class CreateStaffRequest(BaseModel):
    staff_id: str
    pin: str
    phone: str
    full_name: str | None = None


class ResetStaffPinRequest(BaseModel):
    pin: str


class StaffStatusRequest(BaseModel):
    is_active: bool


def validate_staff_pin(pin: str):
    if not pin.isdigit() or not 4 <= len(pin) <= 12:
        raise HTTPException(
            status_code=400,
            detail="PIN must contain 4 to 12 digits.",
        )


@app.get("/admin/staff")
def list_staff(user: dict = Depends(require_admin)):
    assert supabase is not None

    try:
        staff = services.get_staff_list_with_profiles(supabase)
        return {"staff": staff, "total": len(staff)}

    except Exception as error:
        print(f"List staff error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to load staff accounts.",
        )


@app.post("/admin/staff")
def create_staff(
    data: CreateStaffRequest,
    user: dict = Depends(require_admin),
):
    assert supabase is not None

    staff_id = data.staff_id.strip().upper()
    pin = data.pin.strip()

    if not staff_id or not all(
        character.isalnum() or character == "_"
        for character in staff_id
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Staff ID can contain only letters, numbers, "
                "and underscores."
            ),
        )

    phone = (data.phone or "").strip()
    digits_only = "".join(filter(str.isdigit, phone))
    if len(digits_only) < 10:
        raise HTTPException(
            status_code=400,
            detail="WhatsApp contact number is mandatory and must contain at least 10 digits.",
        )

    validate_staff_pin(pin)

    try:
        existing = (
            supabase.table("staff_users")
            .select("staff_id")
            .eq("staff_id", staff_id)
            .limit(1)
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=409,
                detail="This Staff ID already exists.",
            )

        salt = secrets.token_hex(16)

        base_payload: dict = {
            "staff_id": staff_id,
            "role": "staff",
            "pin_salt": salt,
            "pin_hash": hash_pin(pin, salt),
            "is_active": True,
        }
        try:
            insert_payload = dict(base_payload)
            if data.full_name and data.full_name.strip():
                insert_payload["full_name"] = data.full_name.strip()
            if data.phone and data.phone.strip():
                insert_payload["phone"] = data.phone.strip()
            supabase.table("staff_users").insert(insert_payload).execute()
        except Exception:
            # Fall back to base columns without full_name/phone in Supabase
            supabase.table("staff_users").insert(base_payload).execute()

        # Safely persist profile locally in SQLite and/or Supabase
        if (data.full_name and data.full_name.strip()) or (data.phone and data.phone.strip()):
            services.save_staff_profile(
                supabase,
                staff_id=staff_id,
                full_name=data.full_name,
                phone=data.phone,
            )

        services.log_audit_event(
            supabase,
            actor_id=user["staff_id"],
            actor_role="admin",
            action="CREATE_STAFF",
            target_type="staff",
            target_id=staff_id,
            details={"full_name": data.full_name, "phone": data.phone},
        )

        return {
            "message": "Staff account created successfully.",
            "staff_id": staff_id,
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Create staff error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to create staff account.",
        )


@app.patch("/admin/staff/{staff_id}/pin")
def reset_staff_pin(
    staff_id: str,
    data: ResetStaffPinRequest,
    user: dict = Depends(require_admin),
):
    assert supabase is not None

    pin = data.pin.strip()
    validate_staff_pin(pin)
    normalized_id = staff_id.strip().upper()

    try:
        result = (
            supabase.table("staff_users")
            .select("staff_id, role")
            .eq("staff_id", normalized_id)
            .eq("role", "staff")
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Staff account not found.",
            )

        salt = secrets.token_hex(16)

        supabase.table("staff_users").update({
            "pin_salt": salt,
            "pin_hash": hash_pin(pin, salt),
        }).eq("staff_id", normalized_id).execute()

        services.log_audit_event(
            supabase,
            actor_id=user["staff_id"],
            actor_role="admin",
            action="RESET_PIN",
            target_type="staff",
            target_id=normalized_id,
        )

        return {
            "message": "Staff PIN reset successfully.",
            "staff_id": normalized_id,
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Reset staff PIN error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to reset staff PIN.",
        )


@app.patch("/admin/staff/{staff_id}/status")
def update_staff_status(
    staff_id: str,
    data: StaffStatusRequest,
    user: dict = Depends(require_admin),
):
    assert supabase is not None
    normalized_id = staff_id.strip().upper()

    try:
        existing = (
            supabase.table("staff_users")
            .select("staff_id, role")
            .eq("staff_id", normalized_id)
            .eq("role", "staff")
            .limit(1)
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=404,
                detail="Staff account not found.",
            )

        supabase.table("staff_users").update({
            "is_active": data.is_active,
        }).eq("staff_id", normalized_id).execute()

        services.log_audit_event(
            supabase,
            actor_id=user["staff_id"],
            actor_role="admin",
            action="ACTIVATE_STAFF" if data.is_active else "DEACTIVATE_STAFF",
            target_type="staff",
            target_id=normalized_id,
        )

        return {
            "message": (
                "Staff account activated successfully."
                if data.is_active
                else "Staff account deactivated successfully."
            ),
            "staff_id": normalized_id,
            "is_active": data.is_active,
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Update staff status error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to update staff status.",
        )


@app.delete("/admin/staff/{staff_id}")
def delete_staff(
    staff_id: str,
    user: dict = Depends(require_admin),
):
    assert supabase is not None
    normalized_id = staff_id.strip().upper()

    if normalized_id == user["staff_id"].strip().upper():
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own logged-in admin account.",
        )

    try:
        existing = (
            supabase.table("staff_users")
            .select("staff_id, role")
            .eq("staff_id", normalized_id)
            .limit(1)
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=404,
                detail="Staff account not found.",
            )

        if existing.data[0].get("role") == "admin":
            raise HTTPException(
                status_code=403,
                detail="Administrator accounts cannot be deleted from here.",
            )

        # Delete staff user from Supabase
        supabase.table("staff_users").delete().eq("staff_id", normalized_id).execute()

        # Delete from local SQLite profiles
        services.delete_staff_profile(supabase, normalized_id)

        services.log_audit_event(
            supabase,
            actor_id=user["staff_id"],
            actor_role="admin",
            action="DELETE_STAFF",
            target_type="staff",
            target_id=normalized_id,
        )

        return {
            "message": f"Staff account {normalized_id} deleted successfully.",
            "staff_id": normalized_id,
        }

    except HTTPException:
        raise
    except Exception as error:
        print(f"Delete staff error: {error}")
        raise HTTPException(
            status_code=503,
            detail="Unable to delete staff account.",
        )


# ---------------- ADMIN ATTENDANCE HISTORY ----------------

@app.get("/admin/attendance/history")
def get_attendance_history(
    selected_date: Date = Query(
        ...,
        description="Attendance date in YYYY-MM-DD format",
    ),
    staff_id: str | None = Query(default=None),
    status: str = Query(default="all"),
    current_user: dict = Depends(get_current_user),
):
    require_admin(current_user)
    assert supabase is not None

    if status not in {"all", "present", "absent", "checked_in", "half_day"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Use all, present, absent, checked_in, or half_day.",
        )

    start_of_day = datetime(
        selected_date.year,
        selected_date.month,
        selected_date.day,
        tzinfo=INDIA_TIMEZONE,
    )
    end_of_day = start_of_day + timedelta(days=1)

    staff_response = (
        supabase.table("staff_users")
        .select("staff_id, role, is_active")
        .execute()
    )

    staff_members = [
        staff
        for staff in (staff_response.data or [])
        if staff.get("role") == "staff"
        and staff.get("is_active", True)
    ]

    if staff_id and staff_id.strip():
        normalized_id = staff_id.strip().upper()
        staff_members = [
            staff for staff in staff_members
            if staff["staff_id"].upper() == normalized_id
        ]

    attendance_response = (
        supabase.table("attendance")
        .select("id, staff_id, check_in, check_out")
        .gte(
            "check_in",
            start_of_day.astimezone(timezone.utc).isoformat(),
        )
        .lt(
            "check_in",
            end_of_day.astimezone(timezone.utc).isoformat(),
        )
        .order("check_in", desc=True)
        .execute()
    )

    attendance_by_staff = {}

    for record in attendance_response.data or []:
        attendance_by_staff.setdefault(record["staff_id"], record)

    results = []

    for staff in staff_members:
        record = attendance_by_staff.get(staff["staff_id"])

        if record:
            has_leave = services.has_approved_leave_or_duty(supabase, staff["staff_id"], selected_date)
            record_status = services.determine_attendance_status(
                record.get("check_in"),
                record.get("check_out"),
                record.get("status"),
                has_leave=has_leave,
            )
        else:
            record_status = "absent"

        if status != "all" and record_status != status:
            continue

        results.append({
            "staff_id": staff["staff_id"],
            "status": record_status,
            "check_in": record.get("check_in") if record else None,
            "check_out": record.get("check_out") if record else None,
        })

    return {
        "date": selected_date.isoformat(),
        "total": len(results),
        "records": results,
    }


# ---------------- PHASE 1: AUDIT & EXPORT ENDPOINTS ----------------

@app.get("/admin/audit-logs")
def get_audit_logs(
    action: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    user: dict = Depends(require_admin),
):
    logs = services.get_audit_logs(supabase, action=action, actor_id=actor_id, limit=limit)
    return {"total": len(logs), "logs": logs}


def require_admin_or_token(
    token: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise HTTPException(
            status_code=401,
            detail="Admin login token required to export CSV.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(
            raw_token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        staff_id = payload.get("sub")
        role = payload.get("role")
        if not staff_id or role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Admin access required.",
            )
        return {"staff_id": staff_id, "role": role}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid login token.")


@app.get("/admin/export/attendance")
def export_attendance_csv(
    start_date: Date | None = Query(default=None),
    end_date: Date | None = Query(default=None),
    user: dict = Depends(require_admin_or_token),
):
    assert supabase is not None
    records = []
    try:
        query = supabase.table("attendance").select("id, staff_id, check_in, check_out, created_at").order("check_in", desc=True)
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=INDIA_TIMEZONE)
            query = query.gte("check_in", start_dt.astimezone(timezone.utc).isoformat())
        if end_date:
            end_dt = datetime(end_date.year, end_date.month, end_date.day, tzinfo=INDIA_TIMEZONE) + timedelta(days=1)
            query = query.lt("check_in", end_dt.astimezone(timezone.utc).isoformat())

        res = query.limit(1000).execute()
        records = res.data or []
    except Exception as e:
        print(f"Export attendance Supabase query error: {e}")

    csv_data = services.export_attendance_csv(records)
    filename = f"attendance_export_{Date.today().isoformat()}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/admin/export/audit-logs")
def export_audit_logs_csv(
    action: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    user: dict = Depends(require_admin_or_token),
):
    logs = services.get_audit_logs(supabase, action=action, actor_id=actor_id, limit=1000)
    csv_data = services.export_audit_logs_csv(logs)
    filename = f"audit_logs_{Date.today().isoformat()}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/admin/export/requests")
def export_requests_csv(
    status: str = Query(default="all"),
    user: dict = Depends(require_admin_or_token),
):
    requests_list = services.get_all_requests(supabase, status=status)
    csv_data = services.export_leave_requests_csv(requests_list)
    filename = f"leave_duty_requests_{Date.today().isoformat()}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------- PHASE 2: LEAVE & OFF-CAMPUS DUTY APPROVALS ----------------

class CreateLeaveRequestModel(BaseModel):
    request_type: str = Field(..., pattern="^(leave|duty)$")
    start_date: str
    end_date: str
    reason: str = Field(..., min_length=3, max_length=500)


class ReviewLeaveRequestModel(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")
    review_comment: str | None = None


@app.post("/requests")
def submit_request(
    data: CreateLeaveRequestModel,
    user: dict = Depends(get_current_user),
):
    try:
        start_d = Date.fromisoformat(data.start_date)
        end_d = Date.fromisoformat(data.end_date)
    except ValueError:
        raise HTTPException(400, "Dates must be in YYYY-MM-DD format.")

    if start_d > end_d:
        raise HTTPException(400, "Start date cannot be after end date.")

    req = services.create_leave_request(
        supabase,
        staff_id=user["staff_id"],
        request_type=data.request_type,
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
    )
    return {"message": "Request submitted successfully", "request": req}


@app.get("/requests/me")
def list_my_requests(user: dict = Depends(get_current_user)):
    items = services.get_staff_requests(supabase, user["staff_id"])
    return {"requests": items}


@app.get("/admin/requests")
def list_all_requests(
    status: str = Query(default="all"),
    request_type: str = Query(default="all"),
    staff_id: str | None = Query(default=None),
    user: dict = Depends(require_admin),
):
    # Auto-check and flag escalations during request review
    services.check_and_escalate_pending_requests(supabase, deadline_hours=ESCALATION_DEADLINE_HOURS)
    items = services.get_all_requests(supabase, status=status, request_type=request_type, staff_id=staff_id)
    return {"total": len(items), "requests": items}


@app.patch("/admin/requests/{request_id}/review")
def review_request(
    request_id: str,
    data: ReviewLeaveRequestModel,
    user: dict = Depends(require_admin),
):
    res = services.review_leave_request(
        supabase,
        request_id=request_id,
        reviewer_id=user["staff_id"],
        status=data.status,
        review_comment=data.review_comment,
    )
    return {"message": f"Request {data.status} successfully.", "result": res}


# ---------------- PHASE 3: NOTIFICATIONS & ESCALATION ----------------

@app.get("/notifications")
def get_user_notifications(
    limit: int = Query(default=50, le=100),
    user: dict = Depends(get_current_user),
):
    return services.get_notifications(
        supabase,
        recipient_id=user["staff_id"],
        role=user["role"],
        limit=limit,
    )


@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    user: dict = Depends(get_current_user),
):
    services.mark_notification_read(supabase, notification_id, user["staff_id"])
    return {"message": "Notification marked as read."}


@app.patch("/notifications/read-all")
def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    services.mark_all_notifications_read(supabase, user["staff_id"], user["role"])
    return {"message": "All notifications marked as read."}


@app.post("/admin/requests/check-escalations")
def trigger_escalation_check(user: dict = Depends(require_admin)):
    escalated = services.check_and_escalate_pending_requests(
        supabase,
        deadline_hours=ESCALATION_DEADLINE_HOURS,
    )
    return {
        "message": f"Escalation check complete. {len(escalated)} requests escalated.",
        "escalated_count": len(escalated),
        "escalated": escalated,
    }


# ---------------- PHASE 4: ABSENCE ALERTS ----------------

ABSENCE_THRESHOLD_DAYS = int(os.getenv("ABSENCE_THRESHOLD_DAYS", "2"))
ABSENCE_LOOKBACK_DAYS  = int(os.getenv("ABSENCE_LOOKBACK_DAYS",  "30"))


@app.get("/admin/absence-alerts")
def get_absence_alerts(user: dict = Depends(require_admin)):
    """Return list of staff with more than ABSENCE_THRESHOLD_DAYS consecutive absent working days."""
    alerts = services.get_absence_alerts(
        supabase,
        threshold_days=ABSENCE_THRESHOLD_DAYS,
        lookback_days=ABSENCE_LOOKBACK_DAYS,
    )
    return {"total": len(alerts), "alerts": alerts, "threshold_days": ABSENCE_THRESHOLD_DAYS}


# -- College Holidays --

class HolidayRequest(BaseModel):
    holiday_date: str   # YYYY-MM-DD
    description: str | None = None


@app.get("/admin/holidays")
def list_holidays(
    year: int = Query(default=None),
    user: dict = Depends(require_admin),
):
    from datetime import datetime as DT
    yr = year or DT.now().year
    records = services.get_college_holidays_records(supabase, yr)
    return {"year": yr, "holidays": records}


@app.post("/admin/holidays")
def add_holiday(
    data: HolidayRequest,
    user: dict = Depends(require_admin),
):
    try:
        record = services.add_college_holiday(supabase, data.holiday_date, data.description or "")
        services.log_audit_event(
            supabase,
            actor_id=user["staff_id"],
            actor_role="admin",
            action="ADD_HOLIDAY",
            target_type="holiday",
            target_id=data.holiday_date,
        )
        return {"message": "Holiday added.", "holiday": record}
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.delete("/admin/holidays/{holiday_date}")
def remove_holiday(
    holiday_date: str,
    user: dict = Depends(require_admin),
):
    services.delete_college_holiday(supabase, holiday_date)
    services.log_audit_event(
        supabase,
        actor_id=user["staff_id"],
        actor_role="admin",
        action="REMOVE_HOLIDAY",
        target_type="holiday",
        target_id=holiday_date,
    )
    return {"message": "Holiday removed."}


# -- Update staff profile (full_name, phone) --

class UpdateStaffProfileRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None


@app.patch("/admin/staff/{staff_id}/profile")
def update_staff_profile(
    staff_id: str,
    data: UpdateStaffProfileRequest,
    user: dict = Depends(require_admin),
):
    assert supabase is not None
    normalized_id = staff_id.strip().upper()
    if data.full_name is None and data.phone is None:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    try:
        updated = services.save_staff_profile(
            supabase,
            staff_id=normalized_id,
            full_name=data.full_name,
            phone=data.phone,
        )
        services.log_audit_event(
            supabase,
            actor_id=user["staff_id"],
            actor_role="admin",
            action="UPDATE_STAFF_PROFILE",
            target_type="staff",
            target_id=normalized_id,
            details={"full_name": data.full_name, "phone": data.phone},
        )
        return {"message": "Profile updated.", "staff_id": normalized_id, "profile": updated}
    except Exception as error:
        print(f"Update staff profile error: {error}")
        raise HTTPException(status_code=503, detail="Unable to update profile.")