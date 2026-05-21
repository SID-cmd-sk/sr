-- ============================================================
-- SR PLATFORM  —  Seed Data
-- Run AFTER 02_rls.sql
-- ============================================================
-- NOTE: The admin user must be created via Supabase Auth first,
-- then their UUID pasted into the INSERT below.

-- ────────────────────────────────────────────────────────────
-- DEFAULT SETTINGS
-- ────────────────────────────────────────────────────────────
INSERT INTO public.settings (key, value) VALUES
  ('general', '{
    "company_name": "SR Manager Enterprise",
    "sr_prefix": "SR",
    "timezone": "Asia/Kolkata",
    "date_format": "DD-MM-YYYY"
  }'::jsonb),
  ('email', '{
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_from": "",
    "smtp_from_name": "SR System"
  }'::jsonb),
  ('drive', '{
    "root_folder_id": "",
    "sr_folder_id": "",
    "activities_folder_id": "",
    "apps_script_url": ""
  }'::jsonb),
  ('whatsapp', '{
    "bridge_url": "http://localhost:3001",
    "session_active": false
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- DEFAULT EMAIL TEMPLATES
-- ────────────────────────────────────────────────────────────
INSERT INTO public.templates (name, type, subject, body, placeholders) VALUES
(
  'SR Created - Customer Acknowledgement',
  'email',
  'Your Service Request {{sr_number}} has been received',
  'Dear {{customer_name}},

Thank you for reaching out to us. Your service request has been registered successfully.

Service Request Details:
━━━━━━━━━━━━━━━━━━━━━━━
SR Number    : {{sr_number}}
Issue Type   : {{issue_type}}
Priority     : {{priority}}
Status       : {{status}}
Assigned To  : {{owner_name}}

Description:
{{issue_description}}

Our team will review your request and get back to you shortly. You can track your request status using the link below:

{{sr_url}}

Regards,
{{company_name}}',
  ARRAY['{{sr_number}}','{{customer_name}}','{{issue_type}}','{{priority}}','{{status}}','{{owner_name}}','{{issue_description}}','{{sr_url}}','{{company_name}}']
),
(
  'SR Closed - Resolution Notification',
  'email',
  'Service Request {{sr_number}} has been resolved',
  'Dear {{customer_name}},

We are pleased to inform you that your service request has been successfully resolved.

Service Request : {{sr_number}}
Resolved By     : {{owner_name}}
Resolved On     : {{resolved_date}}

Resolution:
{{resolution}}

If you have any further questions or if the issue persists, please do not hesitate to contact us.

Regards,
{{company_name}}',
  ARRAY['{{sr_number}}','{{customer_name}}','{{owner_name}}','{{resolved_date}}','{{resolution}}','{{company_name}}']
),
(
  'SR Follow-up',
  'email',
  'Follow-up on Service Request {{sr_number}}',
  'Dear {{customer_name}},

This is a follow-up regarding your service request {{sr_number}}.

Current Status : {{status}}
Owner          : {{owner_name}}

We wanted to update you that we are actively working on your request. Please let us know if you have any additional information to share.

{{sr_url}}

Regards,
{{company_name}}',
  ARRAY['{{sr_number}}','{{customer_name}}','{{status}}','{{owner_name}}','{{sr_url}}','{{company_name}}']
),
(
  'SR Escalation Notice',
  'email',
  'ESCALATION: Service Request {{sr_number}} - Action Required',
  'Dear {{owner_name}},

This is an automated escalation notice. The following service request requires immediate attention.

SR Number  : {{sr_number}}
Account    : {{account}}
Priority   : {{priority}}
Opened     : {{reported_date}}
SLA Breach : {{sla_breach_time}}

Please take action immediately.

{{sr_url}}

Regards,
SR Platform',
  ARRAY['{{sr_number}}','{{owner_name}}','{{account}}','{{priority}}','{{reported_date}}','{{sla_breach_time}}','{{sr_url}}']
);

-- ────────────────────────────────────────────────────────────
-- DEFAULT WHATSAPP TEMPLATES
-- ────────────────────────────────────────────────────────────
INSERT INTO public.templates (name, type, body, placeholders) VALUES
(
  'WA: SR Created',
  'whatsapp',
  'Hello {{customer_name}}, your service request *{{sr_number}}* has been registered. Our team will contact you shortly. Track here: {{sr_url}}',
  ARRAY['{{customer_name}}','{{sr_number}}','{{sr_url}}']
),
(
  'WA: SR Resolved',
  'whatsapp',
  'Hello {{customer_name}}, your service request *{{sr_number}}* has been resolved. Resolution: {{resolution}}. Please let us know if you need further assistance.',
  ARRAY['{{customer_name}}','{{sr_number}}','{{resolution}}']
),
(
  'WA: Follow-up Reminder',
  'whatsapp',
  'Hi {{customer_name}}, following up on SR *{{sr_number}}*. Current status: {{status}}. Is there anything else you need from our end?',
  ARRAY['{{customer_name}}','{{sr_number}}','{{status}}']
);

-- ────────────────────────────────────────────────────────────
-- DEFAULT ROUTE: Standard Support Flow
-- ────────────────────────────────────────────────────────────
WITH new_route AS (
  INSERT INTO public.routes (name, description)
  VALUES (
    'Standard Support Flow',
    'Default 5-step support route: intake → analysis → follow-up → resolution → closure'
  )
  RETURNING id
)
INSERT INTO public.route_steps (route_id, step_order, name, description, assigned_role, is_required, sla_hours)
SELECT
  id,
  s.step_order,
  s.name,
  s.description,
  s.assigned_role::user_role,
  s.is_required,
  s.sla_hours
FROM new_route,
(VALUES
  (1, 'Initial Contact',  'Acknowledge receipt and collect full details',    'Technical', TRUE,  4),
  (2, 'Analysis',         'Diagnose the issue and identify root cause',       'Technical', TRUE,  8),
  (3, 'Follow-up',        'Update customer on progress, request more info',   'Technical', FALSE, 24),
  (4, 'Resolution',       'Apply fix / provide solution to customer',         'Technical', TRUE,  48),
  (5, 'Closure',          'Confirm resolution with customer and close SR',    'Manager',  TRUE,  72)
) AS s(step_order, name, description, assigned_role, is_required, sla_hours);
