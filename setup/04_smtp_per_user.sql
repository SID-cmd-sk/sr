-- ============================================================
-- SR PLATFORM — Migration: Per-user SMTP credentials
-- Run this in Supabase SQL Editor after 01_schema.sql
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS smtp_email    TEXT,
  ADD COLUMN IF NOT EXISTS smtp_password TEXT;

COMMENT ON COLUMN public.users.smtp_email    IS 'User SMTP login email (e.g. user@sks3d.com)';
COMMENT ON COLUMN public.users.smtp_password IS 'User SMTP password — stored encrypted at rest by Supabase';
