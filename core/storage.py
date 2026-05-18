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
    "activities": [],
    "wa_daily_report": {},
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


def load_db():
    if not DB_FILE.exists():
        save_db(DEFAULT_DB)
        return DEFAULT_DB
    with open(DB_FILE, "r") as f:
        return json.load(f)


def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=2)


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


def create_sr(title, description, priority, pipeline_id, route_id, created_by, customer_name="", customer_contact=""):
    db = load_db()
    counter = db["settings"]["sr_counter"] + 1
    prefix = db["settings"]["sr_prefix"]
    db["settings"]["sr_counter"] = counter

    sr = {
        "id": _uid(),
        "sr_number": f"{prefix}-{counter}",
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


# ---------- ROUTES ----------

def get_routes():
    db = load_db()
    return db["routes"]


def create_route(name, description, steps, created_by):
    db = load_db()
    route = {
        "id": _uid(),
        "name": name,
        "description": description,
        "steps": steps,  # list of step dicts
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
    }


def get_settings():
    db = load_db()
    return db["settings"]


def update_settings(**kwargs):
    db = load_db()
    for k, v in kwargs.items():
        db["settings"][k] = v
    save_db(db)
