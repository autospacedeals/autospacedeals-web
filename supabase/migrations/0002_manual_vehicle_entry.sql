-- =============================================================================
-- Migration: allow brokers to submit a single car manually, not just a
-- link/sheet/file. Run this once in the Supabase SQL Editor.
-- =============================================================================

-- Manual entries don't have a source URL, so it can no longer be required.
alter table public.submissions
  alter column source_url drop not null;

-- Structured vehicle details for manual entries (year, make, model, pricing,
-- photos, etc.) — null for link/google_sheet/excel_file submissions.
alter table public.submissions
  add column if not exists vehicle_data jsonb;

-- Allow 'manual' as a source_type.
alter table public.submissions
  drop constraint if exists submissions_source_type_check;
alter table public.submissions
  add constraint submissions_source_type_check
  check (source_type in ('link', 'google_sheet', 'excel_file', 'manual'));
