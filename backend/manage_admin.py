import os
import secrets
import hashlib
import argparse
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

def hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    ).hex()

def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in backend/.env")
    return create_client(url, key)

def create_or_update_admin(staff_id: str, pin: str) -> dict:
    client = get_supabase_client()
    normalized_id = staff_id.strip().upper()
    
    salt = secrets.token_hex(16)
    pin_hash = hash_pin(pin, salt)
    
    existing = (
        client.table("staff_users")
        .select("staff_id, role")
        .eq("staff_id", normalized_id)
        .limit(1)
        .execute()
    )
    
    if existing.data:
        client.table("staff_users").update({
            "role": "admin",
            "pin_salt": salt,
            "pin_hash": pin_hash,
            "is_active": True,
        }).eq("staff_id", normalized_id).execute()
        action = "updated"
    else:
        client.table("staff_users").insert({
            "staff_id": normalized_id,
            "role": "admin",
            "pin_salt": salt,
            "pin_hash": pin_hash,
            "is_active": True,
        }).execute()
        action = "created"
        
    return {
        "action": action,
        "staff_id": normalized_id,
        "role": "admin",
        "pin": pin,
        "is_active": True
    }

def decommission_demo_accounts() -> list[dict]:
    client = get_supabase_client()
    demo_ids = ["ADM001", "STF001"]
    results = []
    
    for demo_id in demo_ids:
        # Generate random dummy salt and hash so old default PINs (000000, 1234) can never work
        random_pin = "".join(secrets.choice("0123456789") for _ in range(16))
        salt = secrets.token_hex(16)
        
        updated = (
            client.table("staff_users")
            .update({
                "pin_salt": salt,
                "pin_hash": hash_pin(random_pin, salt),
                "is_active": False,
            })
            .eq("staff_id", demo_id)
            .execute()
        )
        results.append({
            "staff_id": demo_id,
            "deactivated": True,
            "pin_scrambled": True,
            "found": bool(updated.data)
        })
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage CampusPass administrator accounts")
    parser.add_argument("--create", action="store_true", help="Create or update an admin account")
    parser.add_argument("--id", type=str, default="ADMIN_ROOT", help="Admin Staff ID")
    parser.add_argument("--pin", type=str, default=None, help="Admin PIN (generated if omitted)")
    parser.add_argument("--decommission-demo", action="store_true", help="Decommission demo accounts (ADM001, STF001)")
    
    args = parser.parse_args()
    
    if args.create:
        pin = args.pin or "".join(secrets.choice("0123456789") for _ in range(8))
        res = create_or_update_admin(args.id, pin)
        print(f"SUCCESS: Admin account {res['action']}:")
        print(f"  Staff ID: {res['staff_id']}")
        print(f"  Role:     {res['role']}")
        print(f"  PIN:      {res['pin']}")
        print(f"  Active:   {res['is_active']}")
        
    if args.decommission_demo:
        demo_res = decommission_demo_accounts()
        print("\nSUCCESS: Demo accounts decommissioned:")
        for d in demo_res:
            print(f"  {d['staff_id']}: deactivated={d['deactivated']}, pin_scrambled={d['pin_scrambled']}")
