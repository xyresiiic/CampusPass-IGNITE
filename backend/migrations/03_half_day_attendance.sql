-- ==============================================================================
-- CampusPass Migration 03 — Half-Day Attendance
-- Paste into Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- Add status column to attendance table if not already present
ALTER TABLE public.attendance
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';

-- Index status for fast filtering in history and reports
CREATE INDEX IF NOT EXISTS idx_attendance_status
    ON public.attendance(status);
