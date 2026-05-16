"""Backend-only SMTP delivery engine for SR Manager.

UI code supplies credentials, recipients and rendered content. This module does
not store credentials and does not contain message templates.
"""

import smtplib
from email.message import EmailMessage
from email.utils import formataddr


def send_email(config, to_email, subject, body):
    """Send one email and return a structured status dict."""
    try:
        sender = (config or {}).get("sender_email", "").strip()
        password = (config or {}).get("password", "")
        host = (config or {}).get("smtp_host", "").strip() or "smtp.gmail.com"
        port = int((config or {}).get("smtp_port", 465) or 465)
        display = (config or {}).get("display_name", "").strip()
        use_ssl = bool((config or {}).get("use_ssl", True))
        use_tls = bool((config or {}).get("use_tls", False))
        if not sender or not password:
            return {"success": False, "error": "Sender email and password are required."}
        if not to_email:
            return {"success": False, "error": "Recipient email is required."}

        msg = EmailMessage()
        msg["From"] = formataddr((display, sender)) if display else sender
        msg["To"] = to_email
        msg["Subject"] = subject or "SR Manager Notification"
        msg.set_content(body or "")

        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
                smtp.login(sender, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=30) as smtp:
                if use_tls:
                    smtp.starttls()
                smtp.login(sender, password)
                smtp.send_message(msg)
        return {"success": True, "error": ""}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
