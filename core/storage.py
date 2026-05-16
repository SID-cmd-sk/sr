"""
SR Manager - Local Storage Engine (Phase 1 - Offline)
JSON-based local storage with full CRUD operations
"""

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = BASE_DIR / "cache"

DATA_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

DB_FILE = DATA_DIR / "sr_manager.json"
SESSION_FILE = CACHE_DIR / "session_cache.json"


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _uid():
    return str(uuid.uuid4())[:8].upper()


# ---------- DB INIT ----------

DEFAULT_DB = {
    "users": [],
    "roles": [
        {"id": "r1", "name": "Admin", "permissions": ["all"]},
        {"id": "r2", "name": "Manager", "permissions": ["sr", "routes", "team", "reports"]},
        {"id": "r3", "name": "Technical", "permissions": ["sr", "update_sr", "upload"]},
        {"id": "r4", "name": "User", "permissions": ["create_sr", "view_sr"]},
        {"id": "r5", "name": "Viewer", "permissions": ["view_sr"]},
    ],
    "sr_entries": [],
    "routes": [],
    "pipelines": [],
    "mail_templates": [],
    "whatsapp_templates": [],
    "activity_logs": [],
    "settings": {
        "company_name": "SR Manager Enterprise",
        "year": datetime.now().year,
        "sr_prefix": "SR",
        "sr_counter": 1000,
    },
}

MASTER_ADMIN = {
    "id": "MASTER",
    "name": "Master Admin",
    "email": "admin@srmanager.local",
    "password": "admin123",
    "role": "Admin",
    "role_id": "r1",
    "status": "active",
    "created_at": _now(),
    "team": None,
}


def _default_copy():
    return json.loads(json.dumps(DEFAULT_DB))


def _migrate_db(db):
    changed = False
    defaults = _default_copy()
    for key, value in defaults.items():
        if key not in db:
            db[key] = value
            changed = True
    settings = db.setdefault("settings", {})
    for key, value in defaults["settings"].items():
        if key not in settings:
            settings[key] = value
            changed = True

    # Workflow/automation additions are migrated in-place to preserve existing JSON data.
    for key, value in {
        "route_templates": [],
        "report_templates": [],
        "automation_logs": [],
        "communication_logs": [],
        "daily_reports": [],
        "activities": [],
    }.items():
        if key not in db:
            db[key] = value
            changed = True

    for key, value in {
        "email": {
            "sender_email": "", "password": "", "smtp_host": "smtp.gmail.com",
            "smtp_port": 465, "use_ssl": True, "use_tls": False, "display_name": ""
        },
        "whatsapp": {
            "target_group_id": "", "target_group_name": "", "last_connected_session": "", "auto_reconnect": True
        },
        "daily_report": {
            "enabled": False, "time": "18:00", "template_id": "",
            "include_total_sr": True, "include_pending_sr": True, "include_completed_sr": True,
            "include_user_activity": True, "include_failed_tasks": True
        },
    }.items():
        if key not in settings:
            settings[key] = value
            changed = True

    for tmpl_key in ("mail_templates", "whatsapp_templates", "route_templates", "report_templates"):
        for tmpl in db.get(tmpl_key, []):
            if "enabled" not in tmpl:
                tmpl["enabled"] = True
                changed = True
            if "category" not in tmpl:
                tmpl["category"] = tmpl_key
                changed = True

    for route in db.get("routes", []):
        if "connections" not in route:
            route["connections"] = []
            steps = route.get("steps", [])
            for i in range(len(steps) - 1):
                route["connections"].append({"from": steps[i].get("id", str(i)), "to": steps[i + 1].get("id", str(i + 1))})
            changed = True
        for i, step in enumerate(route.get("steps", [])):
            if "id" not in step:
                step["id"] = str(i)
                changed = True
            step.setdefault("x", 40 + i * 190)
            step.setdefault("y", 60)
            step.setdefault("email_template_id", step.get("mail_template_id", ""))
            step.setdefault("whatsapp_template_id", step.get("wa_template_id", ""))
            step.setdefault("auto_send", bool(step.get("triggers_mail") or step.get("triggers_whatsapp")))
            step.setdefault("delay_minutes", 0)
    return db, changed


def load_db():
    if not DB_FILE.exists():
        db = _default_copy()
        save_db(db)
        return db
    with open(DB_FILE, "r", encoding="utf-8") as f:
        db = json.load(f)
    db, changed = _migrate_db(db)
    if changed:
        save_db(db)
    return db


def save_db(db):
    tmp = DB_FILE.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)
    os.replace(tmp, DB_FILE)


def get_session():
    if SESSION_FILE.exists():
        with open(SESSION_FILE, "r") as f:
            return json.load(f)
    return None


def save_session(user):
    with open(SESSION_FILE, "w") as f:
        json.dump(user, f, indent=2)


def clear_session():
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()


# ---------- AUTH ----------

def login(email, password):
    if email == MASTER_ADMIN["email"] and password == MASTER_ADMIN["password"]:
        save_session(MASTER_ADMIN)
        log_activity("LOGIN", "Master Admin logged in", MASTER_ADMIN["id"])
        return MASTER_ADMIN
    db = load_db()
    for user in db["users"]:
        if user["email"] == email and user["password"] == password:
            if user["status"] != "active":
                return None
            save_session(user)
            log_activity("LOGIN", f"{user['name']} logged in", user["id"])
            return user
    return None


def logout():
    session = get_session()
    if session:
        log_activity("LOGOUT", f"{session['name']} logged out", session["id"])
    clear_session()


# ---------- USERS ----------

def get_users():
    db = load_db()
    return db["users"]


def create_user(name, email, password, role_id, team=None):
    db = load_db()
    roles = {r["id"]: r["name"] for r in db["roles"]}
    user = {
        "id": _uid(),
        "name": name,
        "email": email,
        "password": password,
        "role_id": role_id,
        "role": roles.get(role_id, "User"),
        "status": "pending",
        "team": team,
        "created_at": _now(),
    }
    db["users"].append(user)
    save_db(db)
    log_activity("USER_CREATE", f"User {name} created", "SYSTEM")
    return user


def update_user_status(user_id, status):
    db = load_db()
    for u in db["users"]:
        if u["id"] == user_id:
            u["status"] = status
            break
    save_db(db)


def delete_user(user_id):
    db = load_db()
    db["users"] = [u for u in db["users"] if u["id"] != user_id]
    save_db(db)


# ---------- SR ----------

def get_all_sr():
    db = load_db()
    return db["sr_entries"]


def get_sr_by_user(user_id, role):
    db = load_db()
    if role in ["Admin", "Manager"]:
        return db["sr_entries"]
    return [s for s in db["sr_entries"] if s.get("created_by") == user_id or s.get("assigned_to") == user_id]


def create_sr(title, description, priority, pipeline_id, route_id, created_by, customer_name="", customer_contact="", activity_type="SR Mandatory"):
    db = load_db()
    counter = db["settings"]["sr_counter"] + 1
    prefix = db["settings"]["sr_prefix"]
    db["settings"]["sr_counter"] = counter

    sr = {
        "id": _uid(),
        "sr_number": f"{prefix}-{counter}",
        "activity_type": activity_type,
        "title": title,
        "description": description,
        "priority": priority,
        "status": "Open",
        "pipeline_id": pipeline_id,
        "route_id": route_id,
        "current_stage": 0,
        "created_by": created_by,
        "assigned_to": None,
        "customer_name": customer_name,
        "customer_contact": customer_contact,
        "created_at": _now(),
        "updated_at": _now(),
        "closed_at": None,
        "comments": [],
        "attachments": [],
        "stage_history": [],
    }
    db["sr_entries"].append(sr)
    save_db(db)
    log_activity("SR_CREATE", f"SR {sr['sr_number']} created: {title}", created_by)
    try:
        from core import automation
        automation.trigger_current_step(sr["id"], created_by, event="create")
    except Exception as exc:
        log_automation("ERROR", f"Initial automation failed for {sr['sr_number']}: {exc}", created_by, sr["id"])
    return sr


def update_sr(sr_id, **kwargs):
    db = load_db()
    for sr in db["sr_entries"]:
        if sr["id"] == sr_id:
            for k, v in kwargs.items():
                sr[k] = v
            sr["updated_at"] = _now()
            break
    save_db(db)


def close_sr(sr_id, user_id):
    db = load_db()
    for sr in db["sr_entries"]:
        if sr["id"] == sr_id:
            sr["status"] = "Closed"
            sr["closed_at"] = _now()
            sr["updated_at"] = _now()
            sr["stage_history"].append({"stage": "CLOSED", "by": user_id, "at": _now()})
            break
    save_db(db)
    log_activity("SR_CLOSE", f"SR {sr_id} closed", user_id)


def add_comment(sr_id, user_id, comment):
    db = load_db()
    for sr in db["sr_entries"]:
        if sr["id"] == sr_id:
            sr["comments"].append({"by": user_id, "text": comment, "at": _now()})
            sr["updated_at"] = _now()
            break
    save_db(db)


def advance_sr_stage(sr_id, user_id):
    db = load_db()
    for sr in db["sr_entries"]:
        if sr["id"] == sr_id:
            sr["current_stage"] += 1
            sr["updated_at"] = _now()
            sr["stage_history"].append({"stage": sr["current_stage"], "by": user_id, "at": _now()})
            break
    save_db(db)
    log_activity("ROUTE_ADVANCE", f"SR {sr_id} advanced", user_id)
    try:
        from core import automation
        automation.trigger_current_step(sr_id, user_id, event="advance")
    except Exception as exc:
        log_automation("ERROR", f"Automation failed for SR {sr_id}: {exc}", user_id, sr_id)


# ---------- ROUTES ----------

def get_routes():
    db = load_db()
    return db["routes"]


def create_route(name, description, steps, created_by, connections=None):
    db = load_db()
    route = {
        "id": _uid(),
        "name": name,
        "description": description,
        "steps": steps,  # list of step dicts
        "connections": connections or [],
        "created_by": created_by,
        "created_at": _now(),
        "active": True,
    }
    db["routes"].append(route)
    save_db(db)
    log_activity("ROUTE_CREATE", f"Route '{name}' created", created_by)
    return route


def update_route(route_id, **kwargs):
    db = load_db()
    for r in db["routes"]:
        if r["id"] == route_id:
            for k, v in kwargs.items():
                r[k] = v
            break
    save_db(db)


def delete_route(route_id):
    db = load_db()
    db["routes"] = [r for r in db["routes"] if r["id"] != route_id]
    save_db(db)


# ---------- PIPELINES ----------

def get_pipelines():
    db = load_db()
    return db["pipelines"]


def create_pipeline(name, stages, created_by):
    db = load_db()
    pipeline = {
        "id": _uid(),
        "name": name,
        "stages": stages,
        "created_by": created_by,
        "created_at": _now(),
        "active": True,
    }
    db["pipelines"].append(pipeline)
    save_db(db)
    log_activity("PIPELINE_CREATE", f"Pipeline '{name}' created", created_by)
    return pipeline


# ---------- TEMPLATES ----------

def get_mail_templates():
    db = load_db()
    return db["mail_templates"]


def create_mail_template(name, subject, body, created_by):
    db = load_db()
    t = {
        "id": _uid(),
        "name": name,
        "subject": subject,
        "body": body,
        "created_by": created_by,
        "created_at": _now(),
    }
    db["mail_templates"].append(t)
    save_db(db)
    return t


def get_whatsapp_templates():
    db = load_db()
    return db["whatsapp_templates"]


def create_whatsapp_template(name, message, created_by):
    db = load_db()
    t = {
        "id": _uid(),
        "name": name,
        "message": message,
        "created_by": created_by,
        "created_at": _now(),
    }
    db["whatsapp_templates"].append(t)
    save_db(db)
    return t


# ---------- ACTIVITY LOG ----------

def log_activity(action, description, user_id):
    db = load_db()
    db["activity_logs"].append({
        "id": _uid(),
        "action": action,
        "description": description,
        "user_id": user_id,
        "at": _now(),
    })
    # Keep last 500 logs
    db["activity_logs"] = db["activity_logs"][-500:]
    save_db(db)


def get_activity_logs(limit=100):
    db = load_db()
    return db["activity_logs"][-limit:][::-1]


# ---------- ANALYTICS ----------

def get_dashboard_stats():
    db = load_db()
    srs = db["sr_entries"]
    return {
        "total_sr": len(srs),
        "open_sr": len([s for s in srs if s["status"] == "Open"]),
        "closed_sr": len([s for s in srs if s["status"] == "Closed"]),
        "in_progress_sr": len([s for s in srs if s["status"] == "In Progress"]),
        "total_users": len(db["users"]),
        "active_users": len([u for u in db["users"] if u["status"] == "active"]),
        "total_routes": len(db["routes"]),
        "total_pipelines": len(db["pipelines"]),
        "high_priority": len([s for s in srs if s.get("priority") == "High" and s["status"] != "Closed"]),
        "active_workflows": len([s for s in srs if s.get("route_id") and s.get("status") != "Closed"]),
        "pending_approvals": len([s for s in srs if s.get("status") == "Pending"]),
        "emails_sent_today": _count_comm_today(db, "email", True),
        "whatsapp_sent_today": _count_comm_today(db, "whatsapp", True),
        "failed_automations": len([l for l in db.get("automation_logs", []) if l.get("status") == "ERROR"]),
        "no_sr_activities": len([a for a in db.get("activities", []) if a.get("activity_type") == "No SR Required"]),
    }


def get_settings():
    db = load_db()
    return db["settings"]


def update_settings(**kwargs):
    db = load_db()
    for k, v in kwargs.items():
        db["settings"][k] = v
    save_db(db)


# ---------- WORKFLOW / AUTOMATION STORAGE ----------

def _count_comm_today(db, channel, success=True):
    today = datetime.now().strftime("%Y-%m-%d")
    return len([l for l in db.get("communication_logs", [])
                if l.get("channel") == channel and l.get("success") is success and l.get("at", "").startswith(today)])


def get_email_settings():
    return load_db()["settings"].get("email", {})


def update_email_settings(settings):
    db = load_db()
    db["settings"]["email"] = settings
    save_db(db)


def get_whatsapp_settings():
    return load_db()["settings"].get("whatsapp", {})


def update_whatsapp_settings(settings):
    db = load_db()
    db["settings"]["whatsapp"] = settings
    save_db(db)


def get_report_settings():
    return load_db()["settings"].get("daily_report", {})


def update_report_settings(settings):
    db = load_db()
    db["settings"]["daily_report"] = settings
    save_db(db)


def update_template(kind, template_id, **kwargs):
    key = {"email": "mail_templates", "whatsapp": "whatsapp_templates", "route": "route_templates", "report": "report_templates"}[kind]
    db = load_db()
    for t in db[key]:
        if t["id"] == template_id:
            t.update(kwargs)
            break
    save_db(db)


def duplicate_template(kind, template_id, user_id):
    key = {"email": "mail_templates", "whatsapp": "whatsapp_templates", "route": "route_templates", "report": "report_templates"}[kind]
    db = load_db()
    src = next((t for t in db[key] if t["id"] == template_id), None)
    if not src:
        return None
    dup = dict(src)
    dup["id"] = _uid()
    dup["name"] = f"{src.get('name', 'Template')} Copy"
    dup["created_by"] = user_id
    dup["created_at"] = _now()
    db[key].append(dup)
    save_db(db)
    log_activity("TEMPLATE_DUP", f"Duplicated {kind} template", user_id)
    return dup


def create_report_template(name, body, created_by):
    db = load_db()
    t = {"id": _uid(), "name": name, "body": body, "enabled": True,
         "category": "report_templates", "created_by": created_by, "created_at": _now()}
    db["report_templates"].append(t)
    save_db(db)
    return t


def get_report_templates():
    return load_db().get("report_templates", [])


def create_activity(title, description, activity_type, created_by, sr_number=""):
    if activity_type == "SR Mandatory" and not sr_number.strip():
        raise ValueError("SR number is required for SR Mandatory activities")
    db = load_db()
    activity = {"id": _uid(), "title": title, "description": description,
                "activity_type": activity_type, "sr_number": sr_number.strip(),
                "created_by": created_by, "status": "Open", "created_at": _now(), "updated_at": _now()}
    db["activities"].append(activity)
    save_db(db)
    log_activity("ACTIVITY_CREATE", f"{activity_type}: {title}", created_by)
    return activity


def get_activities(user_id=None, role="User"):
    acts = load_db().get("activities", [])
    if role in ["Admin", "Manager"] or not user_id:
        return acts
    return [a for a in acts if a.get("created_by") == user_id]


def log_communication(channel, target, template_id, subject, body, success, error, user_id, sr_id=None):
    db = load_db()
    db["communication_logs"].append({"id": _uid(), "channel": channel, "target": target,
        "template_id": template_id, "subject": subject, "body": body, "success": bool(success),
        "error": error, "user_id": user_id, "sr_id": sr_id, "at": _now()})
    db["communication_logs"] = db["communication_logs"][-1000:]
    save_db(db)


def log_automation(status, description, user_id, sr_id=None, route_id=None, step_id=None):
    db = load_db()
    db["automation_logs"].append({"id": _uid(), "status": status, "description": description,
        "user_id": user_id, "sr_id": sr_id, "route_id": route_id, "step_id": step_id, "at": _now()})
    db["automation_logs"] = db["automation_logs"][-1000:]
    save_db(db)


def get_logs(kind="activity", limit=200):
    db = load_db()
    key = {"activity": "activity_logs", "communication": "communication_logs", "automation": "automation_logs"}.get(kind, "activity_logs")
    return db.get(key, [])[-limit:][::-1]


def find_template(kind, template_id):
    key = {"email": "mail_templates", "whatsapp": "whatsapp_templates", "report": "report_templates"}.get(kind)
    if not key or not template_id:
        return None
    return next((t for t in load_db().get(key, []) if t.get("id") == template_id and t.get("enabled", True)), None)
