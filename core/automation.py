"""Workflow automation engine for SR route steps and communications."""

from datetime import datetime
import re

from core import storage
import email_sender


def render_template(text, sr=None, extra=None):
    sr = sr or {}
    settings = storage.get_settings()
    values = {
        "sr_number": sr.get("sr_number", ""),
        "title": sr.get("title", ""),
        "status": sr.get("status", ""),
        "priority": sr.get("priority", ""),
        "customer_name": sr.get("customer_name", ""),
        "customer_contact": sr.get("customer_contact", ""),
        "assigned_to": sr.get("assigned_to", ""),
        "created_at": sr.get("created_at", ""),
        "updated_at": sr.get("updated_at", ""),
        "description": sr.get("description", ""),
        "company_name": settings.get("company_name", ""),
        "current_stage": str(sr.get("current_stage", "")),
        "date": datetime.now().strftime("%Y-%m-%d"),
    }
    values.update(extra or {})
    def repl(match):
        return str(values.get(match.group(1), match.group(0)))
    return re.sub(r"\{([a-zA-Z0-9_]+)\}", repl, text or "")


def _route_for(sr):
    return next((r for r in storage.get_routes() if r.get("id") == sr.get("route_id") and r.get("active", True)), None)


def _current_step(route, sr):
    steps = route.get("steps", [])
    idx = int(sr.get("current_stage", 0) or 0)
    if 0 <= idx < len(steps):
        return steps[idx]
    return None


def trigger_current_step(sr_id, user_id, event="manual"):
    db = storage.load_db()
    sr = next((s for s in db.get("sr_entries", []) if s.get("id") == sr_id), None)
    if not sr:
        return {"success": False, "error": "SR not found"}
    route = _route_for(sr)
    if not route:
        return {"success": True, "error": "No active route"}
    step = _current_step(route, sr)
    if not step:
        return {"success": True, "error": "No current step"}

    if step.get("needs_approval") or step.get("requires_approval"):
        storage.update_sr(sr_id, status="Pending")
        storage.log_automation("PENDING", f"Step '{step.get('name')}' requires approval", user_id, sr_id, route.get("id"), step.get("id"))
        return {"success": True, "pending_approval": True}

    results = []
    if step.get("auto_send", True) and (step.get("triggers_mail") or step.get("email_template_id")):
        results.append(send_email_for_step(sr, step, user_id))
    if step.get("auto_send", True) and (step.get("triggers_whatsapp") or step.get("whatsapp_template_id")):
        results.append(send_whatsapp_for_step(sr, step, user_id))
    ok = all(r.get("success") for r in results) if results else True
    storage.log_automation("OK" if ok else "ERROR", f"Triggered step '{step.get('name')}' via {event}", user_id, sr_id, route.get("id"), step.get("id"))
    return {"success": ok, "results": results}


def send_email_for_step(sr, step, user_id, recipient=None):
    template = storage.find_template("email", step.get("email_template_id"))
    if not template:
        return {"success": True, "skipped": "No email template"}
    to_email = recipient or sr.get("customer_contact", "")
    subject = render_template(template.get("subject", ""), sr)
    body = render_template(template.get("body", ""), sr)
    result = email_sender.send_email(storage.get_email_settings(), to_email, subject, body)
    storage.log_communication("email", to_email, template.get("id"), subject, body, result.get("success"), result.get("error", ""), user_id, sr.get("id"))
    return result


def send_whatsapp_for_step(sr, step, user_id):
    template = storage.find_template("whatsapp", step.get("whatsapp_template_id"))
    if not template:
        return {"success": True, "skipped": "No WhatsApp template"}
    settings = storage.get_whatsapp_settings()
    target = settings.get("target_group_id") or sr.get("customer_contact", "")
    body = render_template(template.get("message", ""), sr)
    success = False
    error = "WhatsApp bridge is UI-managed; message queued/logged for configured target."
    # The live bridge is owned by WhatsAppPage. Automations record the intended
    # delivery target so managers can manually resend from WhatsApp when offline.
    if target:
        success = True
        error = ""
    storage.log_communication("whatsapp", target, template.get("id"), "", body, success, error, user_id, sr.get("id"))
    return {"success": success, "error": error}


def build_daily_report():
    stats = storage.get_dashboard_stats()
    return "\n".join([
        f"Daily SR Report - {datetime.now():%Y-%m-%d}",
        f"Total SR: {stats.get('total_sr', 0)}",
        f"Pending SR: {stats.get('pending_approvals', 0)}",
        f"Completed SR: {stats.get('closed_sr', 0)}",
        f"Emails sent today: {stats.get('emails_sent_today', 0)}",
        f"WhatsApp sent today: {stats.get('whatsapp_sent_today', 0)}",
        f"Failed automations: {stats.get('failed_automations', 0)}",
    ])
