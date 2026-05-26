-- ============================================================
-- SR PLATFORM — Seed Data (pre-filled with your credentials)
-- ============================================================

-- Pre-fill all settings so nothing needs manual entry in the app
INSERT INTO public.settings (key, value) VALUES

('general', '{
  "company_name": "SKS 3D",
  "sr_prefix":    "SR",
  "timezone":     "Asia/Kolkata",
  "date_format":  "DD-MM-YYYY"
}'),

('drive', '{
  "sr_folder_id":        "1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV",
  "activities_folder_id":"1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV",
  "spreadsheet_id":      "10k6weyGqYVEsUNf4DUe1fFGrBaB2sfOBIskhn2pFWGQ",
  "sr_sheet_name":       "SR Register",
  "activity_sheet_name": "Activity Log",
   "apps_script_url":     "https://script.google.com/macros/s/AKfycby0QMUhOBk0hwYed1dmTIEPPNwdyy-MCM9DD3RlkkLPtdqJMdZbLqKFzFI2zeBzixEPeQ/exec",
  "apps_script_token":   "SR_PLATFORM_2026_SECRET"
}'),

('whatsapp', '{
  "bridge_url":     "http://localhost:3001",
  "session_active": false
}')

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Default email templates
INSERT INTO public.templates (name, type, subject, body, is_active) VALUES

('SR Update', 'email',
 'Update on Service Request {{sr_number}}',
 'Dear {{customer_name}},

Your service request {{sr_number}} has been updated.

Status   : {{status}}
Priority : {{priority}}
Issue    : {{issue_type}}

If you have any questions, please reply to this email.

Regards,
{{company_name}}',
 true),

('SR Closed', 'email',
 'Service Request {{sr_number}} — Resolved',
 'Dear {{customer_name}},

We are pleased to inform you that your service request {{sr_number}} has been resolved.

Resolution:
{{resolution}}

Thank you for your patience.

Regards,
{{company_name}}',
 true),

('SR Opened', 'email',
 'Service Request {{sr_number}} Received',
 'Dear {{customer_name}},

We have received your service request and assigned it reference number {{sr_number}}.

Issue    : {{issue_type}}
Priority : {{priority}}

Our team will be in touch shortly.

Regards,
{{company_name}}',
 true),

('WA Update', 'whatsapp',
 NULL,
 'Hello {{customer_name}}, your service request *{{sr_number}}* status is now: *{{status}}*. For queries, reply to this message. — {{company_name}}',
 true),

('WA Closed', 'whatsapp',
 NULL,
 'Hello {{customer_name}}, your service request *{{sr_number}}* has been *resolved*. Thank you for your patience. — {{company_name}}',
 true)

ON CONFLICT DO NOTHING;
