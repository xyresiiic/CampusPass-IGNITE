-- ==============================================================================
-- CampusPass Migration 02 — Absence Alerts
-- Paste into Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- Add full_name and phone to staff_users (safe, idempotent)
ALTER TABLE public.staff_users
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS phone     TEXT;

-- College holidays table (admin-managed list of non-working days)
CREATE TABLE IF NOT EXISTS public.college_holidays (
    id           BIGSERIAL PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_college_holidays_date
    ON public.college_holidays(holiday_date);

ALTER TABLE public.college_holidays DISABLE ROW LEVEL SECURITY;
