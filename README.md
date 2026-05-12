# SR Manager Enterprise — Phase 1 (Offline)

## Quick Start (Windows)
```
pip install PyQt6
python main.py
```

## Default Login
- Email: `admin@srmanager.local`
- Password: `admin123`

## What's in Phase 1
| Feature | Status |
|---------|--------|
| Login screen with session cache | ✅ |
| Role-based navigation (Admin/Manager/Tech/User/Viewer) | ✅ |
| Dashboard with live stats + activity log | ✅ |
| SR Management — create, assign, advance stage, close, comment | ✅ |
| Route Builder — steps with mail/WA/approval/skip flags | ✅ |
| Pipeline Builder — stages with escalation timers | ✅ |
| User Management — create, approve, reject, delete | ✅ |
| Mail + WhatsApp Templates with variable substitution | ✅ |
| Settings — company name, SR prefix, backup/restore | ✅ |
| Full offline JSON storage in `data/sr_manager.json` | ✅ |
| Activity log (last 500 entries) | ✅ |

## File Structure
```
sr_manager/
├── main.py              ← Entry point
├── core/
│   ├── storage.py       ← Local JSON database engine
│   └── styles.py        ← Dark compact stylesheet
├── ui/
│   ├── login.py
│   ├── main_window.py   ← Sidebar nav + role routing
│   ├── dashboard.py
│   ├── sr_page.py
│   ├── routes_page.py
│   ├── pipelines_page.py
│   ├── users_page.py
│   ├── templates_page.py
│   └── settings_page.py
├── data/                ← Auto-created, stores sr_manager.json
└── cache/               ← Auto-created, stores session_cache.json
```

## Phase Roadmap
- **Phase 1** ✅ Offline mode (this)
- **Phase 2** — WhatsApp via QR code
- **Phase 3** — Mail connection (SMTP)
- **Phase 4** — Login interface polish
- **Phase 5** — Supabase / free cloud DB
- **Phase 6** — User self-registration + admin approval
- **Phase 7** — Full DB sync testing
- **Phase 8** — Bug fixing + production hardening
- **Phase 9** — Deployment
