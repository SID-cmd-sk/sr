-- Step email automation configuration
ALTER TABLE public.route_steps
  ADD COLUMN IF NOT EXISTS email_trigger_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_recipients TEXT,
  ADD COLUMN IF NOT EXISTS email_subject_override TEXT,
  ADD COLUMN IF NOT EXISTS email_body_override TEXT,
  ADD COLUMN IF NOT EXISTS email_attachment_urls TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_notification_logs_sr_channel_subject
  ON public.notification_logs(sr_id, channel, subject);
