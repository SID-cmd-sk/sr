-- ============================================================
-- SR PLATFORM — Migration: Step Email Automation & Logging
-- Run this in Supabase SQL Editor to enable email automation.
-- ============================================================

-- 1. Add email configuration columns to route_steps table
ALTER TABLE public.route_steps
  ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_recipients TEXT DEFAULT 'customer', -- customer, owner, creator, or comma-separated emails
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_body TEXT,
  ADD COLUMN IF NOT EXISTS email_attachments TEXT;

COMMENT ON COLUMN public.route_steps.email_enabled      IS 'Toggle to trigger automated email on step completion';
COMMENT ON COLUMN public.route_steps.email_recipients   IS 'Target recipients: customer, owner, creator, or custom comma-separated emails';
COMMENT ON COLUMN public.route_steps.email_subject      IS 'Custom subject template override for this step';
COMMENT ON COLUMN public.route_steps.email_body         IS 'Custom body template override for this step';
COMMENT ON COLUMN public.route_steps.email_attachments  IS 'Optional attachments config';

-- 2. Create step_email_logs table to track delivery, block duplicates, and handle retries
CREATE TABLE IF NOT EXISTS public.step_email_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sr_id           UUID NOT NULL REFERENCES public.sr(id) ON DELETE CASCADE,
  step_id         UUID NOT NULL REFERENCES public.route_steps(id) ON DELETE CASCADE,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'sent' | 'failed' | 'pending'
  attempts        INTEGER NOT NULL DEFAULT 0,
  error_msg       TEXT,
  last_attempt_at TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sr_step_email UNIQUE (sr_id, step_id)
);

COMMENT ON TABLE public.step_email_logs IS 'Tracks automated workflow email executions to prevent duplicates and enable safe retries';

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.step_email_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for step_email_logs (Any authenticated user can read/write/update log records)
CREATE POLICY "step_email_logs_select" ON public.step_email_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "step_email_logs_insert" ON public.step_email_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "step_email_logs_update" ON public.step_email_logs
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
