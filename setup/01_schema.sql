-- ============================================================
-- SR PLATFORM  —  Supabase Schema
-- Run in order: 01_schema → 02_rls → 03_seed
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Technical', 'User', 'Viewer');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'pending');
CREATE TYPE sr_status AS ENUM ('Open', 'In Progress', 'Pending', 'Closed', 'Archived');
CREATE TYPE sr_priority AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE activity_status AS ENUM ('Open', 'In Progress', 'Done', 'Cancelled');
CREATE TYPE activity_type AS ENUM (
  'Call', 'Follow-up', 'Site Visit', 'Internal Reminder',
  'Coordination', 'Pre-Sales', 'Support Note', 'Other'
);
CREATE TYPE template_type AS ENUM ('email', 'whatsapp', 'closure', 'escalation', 'reminder');
CREATE TYPE log_action AS ENUM (
  'LOGIN', 'LOGOUT',
  'SR_CREATE', 'SR_EDIT', 'SR_ASSIGN', 'SR_CLOSE', 'SR_REOPEN', 'SR_ARCHIVE',
  'SR_STAGE_ADVANCE', 'SR_COMMENT',
  'ACTIVITY_CREATE', 'ACTIVITY_UPDATE', 'ACTIVITY_CLOSE',
  'ROUTE_CREATE', 'ROUTE_EDIT', 'ROUTE_DELETE',
  'TEMPLATE_CREATE', 'TEMPLATE_EDIT',
  'USER_CREATE', 'USER_EDIT', 'USER_DELETE',
  'DRIVE_FOLDER_CREATE', 'SHEET_ROW_WRITE',
  'EMAIL_SENT', 'WHATSAPP_SENT',
  'SETTINGS_CHANGE', 'ROLE_CHANGE'
);

-- ────────────────────────────────────────────────────────────
-- USERS  (extends Supabase auth.users)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          user_role NOT NULL DEFAULT 'User',
  status        user_status NOT NULL DEFAULT 'pending',
  team          TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role   ON public.users(role);
CREATE INDEX idx_users_status ON public.users(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- SETTINGS  (global app config)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.settings (
  key           TEXT PRIMARY KEY,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES public.users(id)
);

-- ────────────────────────────────────────────────────────────
-- ROUTES  (workflow engine)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.routes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE public.route_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id        UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  assigned_role   user_role,
  is_required     BOOLEAN NOT NULL DEFAULT TRUE,
  sla_hours       INTEGER,                          -- SLA in hours
  email_template  UUID,                             -- FK added after templates table
  wa_template     UUID,                             -- FK added after templates table
  escalation_hours INTEGER,                         -- hours before escalation
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_route_steps_route ON public.route_steps(route_id, step_order);

-- ────────────────────────────────────────────────────────────
-- TEMPLATES  (email + whatsapp)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  type          template_type NOT NULL,
  subject       TEXT,                               -- email only
  body          TEXT NOT NULL,
  placeholders  TEXT[] DEFAULT '{}',                -- e.g. {{sr_number}}
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Back-fill FK on route_steps now that templates exists
ALTER TABLE public.route_steps
  ADD CONSTRAINT fk_step_email_template
    FOREIGN KEY (email_template) REFERENCES public.templates(id),
  ADD CONSTRAINT fk_step_wa_template
    FOREIGN KEY (wa_template) REFERENCES public.templates(id);

-- ────────────────────────────────────────────────────────────
-- SERVICE REQUESTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.sr (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sr_number         TEXT NOT NULL UNIQUE,           -- SR-2026-1001
  title             TEXT NOT NULL,

  -- Customer info
  account           TEXT,
  customer_name     TEXT,
  customer_contact  TEXT,
  customer_email    TEXT,

  -- Classification
  issue_type        TEXT,
  issue_description TEXT NOT NULL,
  priority          sr_priority NOT NULL DEFAULT 'Medium',
  status            sr_status NOT NULL DEFAULT 'Open',

  -- Ownership
  creator_id        UUID NOT NULL REFERENCES public.users(id),
  owner_id          UUID NOT NULL REFERENCES public.users(id),

  -- Workflow
  route_id          UUID REFERENCES public.routes(id),
  current_step      INTEGER NOT NULL DEFAULT 0,

  -- Resolution
  resolution        TEXT,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES public.users(id),

  -- Drive
  drive_folder_url  TEXT,
  drive_folder_id   TEXT,

  -- Timestamps
  reported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_status       ON public.sr(status);
CREATE INDEX idx_sr_owner        ON public.sr(owner_id);
CREATE INDEX idx_sr_creator      ON public.sr(creator_id);
CREATE INDEX idx_sr_created_at   ON public.sr(created_at DESC);
CREATE INDEX idx_sr_number       ON public.sr(sr_number);

CREATE TRIGGER trg_sr_updated_at
  BEFORE UPDATE ON public.sr
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- SR Comments
CREATE TABLE public.sr_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sr_id       UUID NOT NULL REFERENCES public.sr(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_comments_sr ON public.sr_comments(sr_id, created_at DESC);

-- SR Attachments  (Drive file references)
CREATE TABLE public.sr_attachments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sr_id         UUID NOT NULL REFERENCES public.sr(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_url     TEXT NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES public.users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_attachments_sr ON public.sr_attachments(sr_id);

-- SR Stage History
CREATE TABLE public.sr_stage_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sr_id       UUID NOT NULL REFERENCES public.sr(id) ON DELETE CASCADE,
  from_step   INTEGER,
  to_step     INTEGER NOT NULL,
  notes       TEXT,
  advanced_by UUID NOT NULL REFERENCES public.users(id),
  advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_stage_sr ON public.sr_stage_history(sr_id);

-- ────────────────────────────────────────────────────────────
-- ACTIVITIES  (work without SR)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.activities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_no   TEXT NOT NULL UNIQUE,               -- ACT-2026-0001
  title         TEXT NOT NULL,
  type          activity_type NOT NULL DEFAULT 'Other',
  status        activity_status NOT NULL DEFAULT 'Open',
  notes         TEXT,

  -- Optional links
  linked_sr     UUID REFERENCES public.sr(id),
  account       TEXT,
  contact_name  TEXT,
  contact_phone TEXT,

  -- Ownership
  owner_id      UUID NOT NULL REFERENCES public.users(id),
  creator_id    UUID NOT NULL REFERENCES public.users(id),

  -- Drive
  drive_folder_url TEXT,

  -- Timestamps
  due_date      TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_owner    ON public.activities(owner_id);
CREATE INDEX idx_activities_status   ON public.activities(status);
CREATE INDEX idx_activities_created  ON public.activities(created_at DESC);

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- NOTIFICATION LOGS  (email + whatsapp sent records)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.notification_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel         TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  sr_id           UUID REFERENCES public.sr(id),
  activity_id     UUID REFERENCES public.activities(id),
  recipient       TEXT NOT NULL,                    -- email or phone/jid
  subject         TEXT,
  body            TEXT NOT NULL,
  template_id     UUID REFERENCES public.templates(id),
  status          TEXT NOT NULL DEFAULT 'sent',     -- sent | failed
  error_msg       TEXT,
  sent_by         UUID REFERENCES public.users(id),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_sr       ON public.notification_logs(sr_id);
CREATE INDEX idx_notif_sent_at  ON public.notification_logs(sent_at DESC);

-- ────────────────────────────────────────────────────────────
-- AUDIT LOG  (immutable event trail)
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      log_action NOT NULL,
  user_id     UUID REFERENCES public.users(id),
  target_id   TEXT,                                 -- sr_id / user_id / etc.
  target_type TEXT,                                 -- 'sr' | 'user' | 'route'
  description TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user       ON public.audit_log(user_id);
CREATE INDEX idx_audit_target     ON public.audit_log(target_id);
CREATE INDEX idx_audit_created_at ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_action     ON public.audit_log(action);

-- ────────────────────────────────────────────────────────────
-- SR NUMBER AUTO-GENERATOR
-- ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS sr_counter START 1001;
CREATE SEQUENCE IF NOT EXISTS activity_counter START 1;

CREATE OR REPLACE FUNCTION generate_sr_number()
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  year   INT;
  num    INT;
BEGIN
  SELECT COALESCE((value->>'sr_prefix')::TEXT, 'SR')
    INTO prefix FROM public.settings WHERE key = 'general';
  year := EXTRACT(YEAR FROM NOW());
  num  := nextval('sr_counter');
  RETURN prefix || '-' || year || '-' || LPAD(num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION generate_activity_number()
RETURNS TEXT AS $$
DECLARE year INT;
BEGIN
  year := EXTRACT(YEAR FROM NOW());
  RETURN 'ACT-' || year || '-' || LPAD(nextval('activity_counter')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-set SR number and activity number on insert
CREATE OR REPLACE FUNCTION set_sr_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sr_number IS NULL OR NEW.sr_number = '' THEN
    NEW.sr_number := generate_sr_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sr_number
  BEFORE INSERT ON public.sr
  FOR EACH ROW EXECUTE FUNCTION set_sr_number();

CREATE OR REPLACE FUNCTION set_activity_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.activity_no IS NULL OR NEW.activity_no = '' THEN
    NEW.activity_no := generate_activity_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_number
  BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION set_activity_number();

-- ────────────────────────────────────────────────────────────
-- DASHBOARD SUMMARY VIEW  (fast reads)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
  COUNT(*) FILTER (WHERE status != 'Archived')                AS total_sr,
  COUNT(*) FILTER (WHERE status = 'Open')                     AS open_sr,
  COUNT(*) FILTER (WHERE status = 'In Progress')              AS in_progress_sr,
  COUNT(*) FILTER (WHERE status = 'Pending')                  AS pending_sr,
  COUNT(*) FILTER (WHERE status = 'Closed')                   AS closed_sr,
  COUNT(*) FILTER (WHERE status = 'Open' AND priority = 'Critical') AS critical_open,
  COUNT(*) FILTER (
    WHERE status NOT IN ('Closed','Archived')
    AND route_id IS NOT NULL
  )                                                           AS in_route
FROM public.sr;

CREATE OR REPLACE VIEW public.sr_list AS
SELECT
  s.id, s.sr_number, s.title, s.account, s.customer_name,
  s.customer_contact, s.customer_email,
  s.issue_type, s.issue_description, s.priority, s.status,
  s.reported_at, s.updated_at, s.closed_at, s.created_at,
  s.drive_folder_url, s.drive_folder_id, s.current_step,
  s.resolution, s.closed_by,
  s.owner_id, s.creator_id,
  s.route_id, r.name AS route_name,
  o.name AS owner_name, o.email AS owner_email,
  c.name AS creator_name
FROM public.sr s
LEFT JOIN public.users o ON o.id = s.owner_id
LEFT JOIN public.users c ON c.id = s.creator_id
LEFT JOIN public.routes r ON r.id = s.route_id;

-- ACTIVITIES LIST VIEW  (for sheets sync)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.activities_list AS
SELECT
  a.id, a.activity_no, a.title, a.type, a.type AS activity_type,
  a.status, a.notes, a.notes AS description,
  a.linked_sr, a.account, a.contact_name, a.contact_phone,
  a.owner_id, a.creator_id,
  a.drive_folder_url,
  a.due_date, a.closed_at, a.created_at, a.updated_at,
  o.name AS owner_name, o.email AS owner_email,
  c.name AS creator_name, c.name AS performed_by_name
FROM public.activities a
LEFT JOIN public.users o ON o.id = a.owner_id
LEFT JOIN public.users c ON c.id = a.creator_id;

-- ────────────────────────────────────────────────────────────
-- AUTO-CREATE USER PROFILE ON AUTH SIGNUP / INVITE
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'User')::user_role,
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    email  = EXCLUDED.email,
    status = CASE WHEN public.users.status = 'pending' THEN 'active' ELSE public.users.status END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
