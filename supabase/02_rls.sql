-- ============================================================
-- SR PLATFORM  —  Row Level Security (RLS)
-- ============================================================
-- Run AFTER 01_schema.sql

-- Enable RLS on all tables
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings         ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- Helper: get current user's role
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- USERS TABLE
-- ────────────────────────────────────────────────────────────
-- Everyone can read users (needed for assignee dropdowns)
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admin can insert / update / delete
CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (auth.user_role() = 'Admin');

CREATE POLICY "users_update" ON public.users
  FOR UPDATE USING (
    auth.user_role() = 'Admin'
    OR id = auth.uid()            -- users can update own profile
  );

CREATE POLICY "users_delete" ON public.users
  FOR DELETE USING (auth.user_role() = 'Admin');

-- ────────────────────────────────────────────────────────────
-- SR TABLE
-- ────────────────────────────────────────────────────────────
CREATE POLICY "sr_select" ON public.sr FOR SELECT USING (
  auth.user_role() IN ('Admin', 'Manager')
  OR owner_id = auth.uid()
  OR creator_id = auth.uid()
);

CREATE POLICY "sr_insert" ON public.sr FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager', 'Technical', 'User'));

CREATE POLICY "sr_update" ON public.sr FOR UPDATE USING (
  auth.user_role() IN ('Admin', 'Manager')
  OR owner_id = auth.uid()
  OR creator_id = auth.uid()
);

-- Only admin can hard-delete (normally we archive)
CREATE POLICY "sr_delete" ON public.sr FOR DELETE
  USING (auth.user_role() = 'Admin');

-- ────────────────────────────────────────────────────────────
-- SR COMMENTS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "sr_comments_select" ON public.sr_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sr s WHERE s.id = sr_id AND (
      auth.user_role() IN ('Admin', 'Manager')
      OR s.owner_id = auth.uid()
      OR s.creator_id = auth.uid()
    )
  )
);

CREATE POLICY "sr_comments_insert" ON public.sr_comments FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager', 'Technical', 'User'));

CREATE POLICY "sr_comments_delete" ON public.sr_comments FOR DELETE
  USING (user_id = auth.uid() OR auth.user_role() = 'Admin');

-- ────────────────────────────────────────────────────────────
-- SR ATTACHMENTS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "sr_attachments_select" ON public.sr_attachments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sr s WHERE s.id = sr_id AND (
      auth.user_role() IN ('Admin', 'Manager')
      OR s.owner_id = auth.uid()
      OR s.creator_id = auth.uid()
    )
  )
);

CREATE POLICY "sr_attachments_insert" ON public.sr_attachments FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager', 'Technical', 'User'));

-- ────────────────────────────────────────────────────────────
-- SR STAGE HISTORY
-- ────────────────────────────────────────────────────────────
CREATE POLICY "sr_stage_history_select" ON public.sr_stage_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sr s WHERE s.id = sr_id AND (
      auth.user_role() IN ('Admin', 'Manager')
      OR s.owner_id = auth.uid()
      OR s.creator_id = auth.uid()
    )
  )
);

CREATE POLICY "sr_stage_history_insert" ON public.sr_stage_history FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager', 'Technical'));

-- ────────────────────────────────────────────────────────────
-- ACTIVITIES
-- ────────────────────────────────────────────────────────────
CREATE POLICY "activities_select" ON public.activities FOR SELECT USING (
  auth.user_role() IN ('Admin', 'Manager')
  OR owner_id = auth.uid()
  OR creator_id = auth.uid()
);

CREATE POLICY "activities_insert" ON public.activities FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager', 'Technical', 'User'));

CREATE POLICY "activities_update" ON public.activities FOR UPDATE USING (
  auth.user_role() IN ('Admin', 'Manager')
  OR owner_id = auth.uid()
);

CREATE POLICY "activities_delete" ON public.activities FOR DELETE
  USING (auth.user_role() = 'Admin');

-- ────────────────────────────────────────────────────────────
-- ROUTES  (read by all, write by Admin/Manager)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "routes_select" ON public.routes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "routes_insert" ON public.routes FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager'));

CREATE POLICY "routes_update" ON public.routes FOR UPDATE
  USING (auth.user_role() IN ('Admin', 'Manager'));

CREATE POLICY "routes_delete" ON public.routes FOR DELETE
  USING (auth.user_role() = 'Admin');

-- Route Steps inherit route policy
CREATE POLICY "route_steps_select" ON public.route_steps FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "route_steps_insert" ON public.route_steps FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager'));

CREATE POLICY "route_steps_update" ON public.route_steps FOR UPDATE
  USING (auth.user_role() IN ('Admin', 'Manager'));

CREATE POLICY "route_steps_delete" ON public.route_steps FOR DELETE
  USING (auth.user_role() IN ('Admin', 'Manager'));

-- ────────────────────────────────────────────────────────────
-- TEMPLATES
-- ────────────────────────────────────────────────────────────
CREATE POLICY "templates_select" ON public.templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "templates_insert" ON public.templates FOR INSERT
  WITH CHECK (auth.user_role() IN ('Admin', 'Manager'));

CREATE POLICY "templates_update" ON public.templates FOR UPDATE
  USING (auth.user_role() IN ('Admin', 'Manager'));

-- ────────────────────────────────────────────────────────────
-- NOTIFICATION LOGS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "notif_select" ON public.notification_logs FOR SELECT
  USING (auth.user_role() IN ('Admin', 'Manager', 'Technical'));

CREATE POLICY "notif_insert" ON public.notification_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- AUDIT LOG  (read-only for non-admin)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "audit_select" ON public.audit_log FOR SELECT
  USING (
    auth.user_role() = 'Admin'
    OR user_id = auth.uid()
  );

CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────────────────
-- SETTINGS  (admin only write, all read)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "settings_select" ON public.settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "settings_upsert" ON public.settings FOR ALL
  USING (auth.user_role() = 'Admin');
