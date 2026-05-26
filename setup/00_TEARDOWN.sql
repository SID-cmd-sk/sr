-- ============================================================
-- SR PLATFORM — FULL TEARDOWN
-- Run this ONCE in Supabase SQL Editor to wipe everything.
-- Then run: 01 → 02 → 03 → 04 in order.
-- ============================================================

-- ── 1. Drop auth trigger first (sits on auth.users) ─────────
DROP TRIGGER  IF EXISTS on_auth_user_created  ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

-- ── 2. Drop all views ────────────────────────────────────────
DROP VIEW IF EXISTS public.sr_list         CASCADE;
DROP VIEW IF EXISTS public.dashboard_stats CASCADE;
DROP VIEW IF EXISTS public.activities_list CASCADE;

-- ── 3. Drop all tables (CASCADE cleans FKs automatically) ───
DROP TABLE IF EXISTS public.audit_log          CASCADE;
DROP TABLE IF EXISTS public.notification_logs  CASCADE;
DROP TABLE IF EXISTS public.sr_stage_history   CASCADE;
DROP TABLE IF EXISTS public.sr_attachments     CASCADE;
DROP TABLE IF EXISTS public.sr_comments        CASCADE;
DROP TABLE IF EXISTS public.activities         CASCADE;
DROP TABLE IF EXISTS public.sr                 CASCADE;
DROP TABLE IF EXISTS public.route_steps        CASCADE;
DROP TABLE IF EXISTS public.templates          CASCADE;
DROP TABLE IF EXISTS public.routes             CASCADE;
DROP TABLE IF EXISTS public.settings           CASCADE;
DROP TABLE IF EXISTS public.users              CASCADE;

-- ── 4. Drop all functions ────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_updated_at()        CASCADE;
DROP FUNCTION IF EXISTS public.generate_sr_number()       CASCADE;
DROP FUNCTION IF EXISTS public.generate_activity_number() CASCADE;
DROP FUNCTION IF EXISTS public.set_sr_number()            CASCADE;
DROP FUNCTION IF EXISTS public.set_activity_number()      CASCADE;

-- ── 5. Drop sequences ────────────────────────────────────────
DROP SEQUENCE IF EXISTS public.sr_counter       CASCADE;
DROP SEQUENCE IF EXISTS public.activity_counter CASCADE;

-- ── 6. Drop all custom enum types ────────────────────────────
DROP TYPE IF EXISTS public.log_action      CASCADE;
DROP TYPE IF EXISTS public.template_type   CASCADE;
DROP TYPE IF EXISTS public.activity_type   CASCADE;
DROP TYPE IF EXISTS public.activity_status CASCADE;
DROP TYPE IF EXISTS public.sr_priority     CASCADE;
DROP TYPE IF EXISTS public.sr_status       CASCADE;
DROP TYPE IF EXISTS public.user_status     CASCADE;
DROP TYPE IF EXISTS public.user_role       CASCADE;

-- ── Done ─────────────────────────────────────────────────────
SELECT 'Teardown complete. Run 01_schema.sql next.' AS status;
