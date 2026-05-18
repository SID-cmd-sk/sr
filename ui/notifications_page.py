"""
SR Manager - Notifications Page  (fixed: template variable substitution)
Integrates Email (SMTP) + WhatsApp (wa_bridge) into the P2 dashboard.

Drop this file into:  P2/ui/notifications_page.py

Then in P2/ui/main_window.py:
  1. Add import:   from ui.notifications_page import NotificationsPage
  2. Add nav item: ("Notifications", "notifications", "▪")  inside NAV_ITEMS
  3. Add permission: "notifications": ["Admin", "Manager", "Technical"]  inside NAV_PERMISSIONS
  4. In the section that creates pages:
       self.pages["notifications"] = NotificationsPage(user)
       self.stack.addWidget(self.pages["notifications"])
"""

# ── PATH BOOTSTRAP ────────────────────────────────────────────────────────────
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
# ─────────────────────────────────────────────────────────────────────────────

import smtplib
import json
import threading
import time
import subprocess
import shutil
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate, make_msgid

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QLineEdit, QTextEdit, QPushButton, QComboBox,
    QTableWidget, QTableWidgetItem, QSplitter,
    QTabWidget, QMessageBox, QProgressBar, QCheckBox,
    QScrollArea, QGridLayout, QGroupBox
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QObject
from PyQt6.QtGui import QColor, QFont

# ── Try to import storage (graceful fallback if path differs) ─────────────────
try:
    from core.storage import load_db as _load_db
    _HAS_STORAGE = True
except ImportError:
    _HAS_STORAGE = False


# ═══════════════════════════════════════════════════════════════════════════════
#  EMAIL CONFIG  — edit these to match your SMTP settings
# ═══════════════════════════════════════════════════════════════════════════════
EMAIL_CONFIG = {
    "sender":       "sidharth.kumar@sks3d.com",
    "smtp_server":  "smtpout.secureserver.net",
    "smtp_port":    465,
    "password":     "Tanvi123@sks",          # ⚠ move to env-var in production
    "display_name": "Sidharth Kumar",
}

# ═══════════════════════════════════════════════════════════════════════════════
#  WHATSAPP BRIDGE PATHS  — pointing to the existing wa_bridge inside P2
# ═══════════════════════════════════════════════════════════════════════════════
_BRIDGE_DIR = _ROOT / "wa_bridge"
_DATA_FILE  = _ROOT / "wa_data.json"
_CMD_FILE   = _ROOT / "wa_cmd.json"
_SEL_FILE   = _ROOT / "wa_sel.json"

# All supported template variables (for reference / docs)
_ALL_VARS = [
    "sr_number", "title", "status", "priority",
    "customer_name", "customer_contact", "assigned_to",
    "created_at", "updated_at", "description",
    "company_name", "current_stage",
]


# ═══════════════════════════════════════════════════════════════════════════════
#  SIGNAL RELAY  (keeps thread-safe UI updates simple)
# ═══════════════════════════════════════════════════════════════════════════════
class _Relay(QObject):
    log_signal = pyqtSignal(str, str)   # (message, level)  level: info|ok|error

_relay = _Relay()


# ═══════════════════════════════════════════════════════════════════════════════
#  VARIABLE SUBSTITUTION  — shared by Email + WhatsApp tabs
# ═══════════════════════════════════════════════════════════════════════════════
def substitute_vars(text: str, sr: dict) -> str:
    """
    Replace {placeholder} tokens in `text` with values from the SR dict.

    Supported placeholders:
        {sr_number}  {title}           {status}        {priority}
        {customer_name}  {customer_contact}  {assigned_to}
        {created_at}  {updated_at}  {description}
        {company_name}  {current_stage}
    """
    mapping = {
        "sr_number":        sr.get("sr_number",        sr.get("id",           "—")),
        "title":            sr.get("title",             "—"),
        "status":           sr.get("status",            "—"),
        "priority":         sr.get("priority",          "—"),
        "customer_name":    sr.get("customer_name",     sr.get("customer",     "—")),
        "customer_contact": sr.get("customer_contact",  sr.get("phone",        "—")),
        "assigned_to":      sr.get("assigned_to",       sr.get("technician",   "—")),
        "created_at":       sr.get("created_at",        sr.get("date",         "—")),
        "updated_at":       sr.get("updated_at",        "—"),
        "description":      sr.get("description",       "—"),
        "company_name":     sr.get("company_name",      sr.get("company",      "—")),
        "current_stage":    sr.get("current_stage",     sr.get("stage",        "—")),
    }
    for key, value in mapping.items():
        text = text.replace(f"{{{key}}}", str(value) if value else "—")
    return text


def _has_unresolved_vars(text: str) -> list[str]:
    """Return a list of {placeholder} tokens still present in text."""
    import re
    return re.findall(r"\{[a-z_]+\}", text)


def _get_sr_list() -> list[dict]:
    """Load SR list from storage.  Returns [] if storage unavailable."""
    if not _HAS_STORAGE:
        return []
    try:
        db = _load_db()
        return db.get("service_requests", [])
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════════════════════════
#  EMAIL SERVICE
# ═══════════════════════════════════════════════════════════════════════════════
def _send_email_thread(to_addr: str, subject: str, body: str, callback):
    cfg = EMAIL_CONFIG
    msg = MIMEMultipart()
    msg["From"]       = f'{cfg["display_name"]} <{cfg["sender"]}>'
    msg["To"]         = to_addr
    msg["Subject"]    = subject
    msg["Date"]       = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=cfg["sender"].split("@")[-1])
    msg["Reply-To"]   = cfg["sender"]
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL(cfg["smtp_server"], cfg["smtp_port"]) as server:
            server.login(cfg["sender"], cfg["password"])
            server.sendmail(cfg["sender"], to_addr, msg.as_string())
        callback(True,  f"Email sent → {to_addr}")
    except Exception as exc:
        callback(False, f"Email failed: {exc}")


def send_email(to_addr: str, subject: str, body: str, on_done=None):
    """
    Public API.  Call from anywhere in the app:
        from ui.notifications_page import send_email
        send_email("someone@example.com", "Subject", "Body text")
    """
    def _cb(ok, msg):
        level = "ok" if ok else "error"
        _relay.log_signal.emit(msg, level)
        if on_done:
            on_done(ok, msg)

    t = threading.Thread(target=_send_email_thread,
                         args=(to_addr, subject, body, _cb), daemon=True)
    t.start()


# ═══════════════════════════════════════════════════════════════════════════════
#  WHATSAPP SERVICE  (wraps the existing wa_bridge / bridge.js)
# ═══════════════════════════════════════════════════════════════════════════════
def _wa_ready() -> bool:
    if not _DATA_FILE.exists():
        return False
    try:
        d = json.loads(_DATA_FILE.read_text())
        return d.get("status") == "ready"
    except Exception:
        return False


def _wa_contacts():
    if not _DATA_FILE.exists():
        return [], []
    try:
        d = json.loads(_DATA_FILE.read_text())
        return d.get("contacts", []), d.get("groups", [])
    except Exception:
        return [], []


def _wa_send(contact_id: str, contact_name: str, message: str, on_done=None):
    """Write a send-command and wait for Node to confirm (non-blocking)."""
    def _run():
        cmd = {"id": contact_id, "name": contact_name,
               "message": message, "done": False}
        _CMD_FILE.write_text(json.dumps(cmd))

        sent = False
        for _ in range(20):
            time.sleep(0.5)
            try:
                c = json.loads(_CMD_FILE.read_text())
                if c.get("done"):
                    sent = True
                    break
            except Exception:
                pass

        ok  = sent
        msg = (f"WhatsApp sent → {contact_name}" if ok
               else "WhatsApp: no confirmation (message may or may not have sent)")
        _relay.log_signal.emit(msg, "ok" if ok else "info")
        if on_done:
            on_done(ok, msg)

    threading.Thread(target=_run, daemon=True).start()


# ═══════════════════════════════════════════════════════════════════════════════
#  LOG TABLE WIDGET
# ═══════════════════════════════════════════════════════════════════════════════
class _LogTable(QTableWidget):
    LEVEL_COLORS = {
        "ok":    "#00D4AA",
        "error": "#E05555",
        "info":  "#D4A800",
    }

    def __init__(self):
        super().__init__()
        self.setColumnCount(3)
        self.setHorizontalHeaderLabels(["TIME", "STATUS", "MESSAGE"])
        self.horizontalHeader().setStretchLastSection(True)
        self.setColumnWidth(0, 75)
        self.setColumnWidth(1, 65)
        self.verticalHeader().setVisible(False)
        self.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.setAlternatingRowColors(True)
        self.setStyleSheet("alternate-background-color: #13131A;")

    def add_entry(self, message: str, level: str = "info"):
        from datetime import datetime
        row = self.rowCount()
        self.insertRow(row)
        self.setRowHeight(row, 22)

        time_str = datetime.now().strftime("%H:%M:%S")
        color    = self.LEVEL_COLORS.get(level, "#888")

        for col, text in enumerate([time_str, level.upper(), message]):
            item = QTableWidgetItem(text)
            if col <= 1:
                item.setForeground(QColor(color))
            self.setItem(row, col, item)
        self.scrollToBottom()


# ═══════════════════════════════════════════════════════════════════════════════
#  SR SELECTOR WIDGET  — shared by both tabs
# ═══════════════════════════════════════════════════════════════════════════════
class _SRSelector(QWidget):
    """
    A combo that lets the user pick an SR so template variables can be
    substituted.  Emits sr_changed(sr_dict | None) when selection changes.
    """
    sr_changed = pyqtSignal(object)   # dict or None

    def __init__(self, parent=None):
        super().__init__(parent)
        self._srs: list[dict] = []
        h = QHBoxLayout(self)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(6)

        lbl = QLabel("SR CONTEXT")
        lbl.setObjectName("FormLabel")
        lbl.setFixedWidth(90)
        h.addWidget(lbl)

        self.combo = QComboBox()
        self.combo.addItem("— none (no substitution) —")
        self.combo.currentIndexChanged.connect(self._on_change)
        h.addWidget(self.combo, 1)

        refresh_btn = QPushButton("↻")
        refresh_btn.setFixedWidth(28)
        refresh_btn.setToolTip("Reload SR list")
        refresh_btn.clicked.connect(self.reload)
        h.addWidget(refresh_btn)

        self.reload()

    def reload(self):
        current_idx = self.combo.currentIndex()
        self.combo.blockSignals(True)
        self.combo.clear()
        self.combo.addItem("— none (no substitution) —")
        self._srs = _get_sr_list()
        for sr in self._srs:
            label = f"{sr.get('sr_number', sr.get('id', '?'))}  ·  {sr.get('title', '')[:40]}  [{sr.get('status', '')}]"
            self.combo.addItem(label)
        # try to restore previous selection
        idx = min(current_idx, self.combo.count() - 1)
        self.combo.setCurrentIndex(idx)
        self.combo.blockSignals(False)
        self._on_change(self.combo.currentIndex())

    def _on_change(self, idx: int):
        if idx <= 0 or idx - 1 >= len(self._srs):
            self.sr_changed.emit(None)
        else:
            self.sr_changed.emit(self._srs[idx - 1])

    def current_sr(self) -> dict | None:
        idx = self.combo.currentIndex()
        if idx <= 0 or idx - 1 >= len(self._srs):
            return None
        return self._srs[idx - 1]


# ═══════════════════════════════════════════════════════════════════════════════
#  EMAIL TAB
# ═══════════════════════════════════════════════════════════════════════════════
class _EmailTab(QWidget):
    def __init__(self, log_table: _LogTable):
        super().__init__()
        self.log = log_table
        self._active_sr: dict | None = None
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(8)

        def _label(text):
            lbl = QLabel(text)
            lbl.setObjectName("FormLabel")
            return lbl

        def _row(label, widget):
            h = QHBoxLayout()
            lbl = _label(label)
            lbl.setFixedWidth(90)
            h.addWidget(lbl)
            h.addWidget(widget)
            return h

        # SR context selector
        self.sr_selector = _SRSelector()
        self.sr_selector.sr_changed.connect(self._on_sr_changed)
        layout.addWidget(self.sr_selector)

        # To
        self.to_input = QLineEdit()
        self.to_input.setPlaceholderText("recipient@example.com")
        layout.addLayout(_row("TO", self.to_input))

        # Subject
        self.subject_input = QLineEdit()
        self.subject_input.setPlaceholderText("Email subject — use {sr_number} etc.")
        layout.addLayout(_row("SUBJECT", self.subject_input))

        # Quick templates
        tmpl_row = QHBoxLayout()
        tmpl_lbl = _label("TEMPLATE")
        tmpl_lbl.setFixedWidth(90)
        self.tmpl_combo = QComboBox()
        self.tmpl_combo.addItems([
            "— none —",
            "SR Created",
            "SR Resolved",
            "Approval Required",
            "Site Visit Scheduled",
        ])
        self.tmpl_combo.currentTextChanged.connect(self._apply_template)
        tmpl_row.addWidget(tmpl_lbl)
        tmpl_row.addWidget(self.tmpl_combo)
        layout.addLayout(tmpl_row)

        # Body
        body_lbl = _label("BODY")
        layout.addWidget(body_lbl)
        self.body_input = QTextEdit()
        self.body_input.setPlaceholderText(
            "Type your message.\n"
            "Supported variables: {sr_number} {title} {status} {priority}\n"
            "{customer_name} {customer_contact} {assigned_to}\n"
            "{created_at} {updated_at} {description} {company_name} {current_stage}"
        )
        self.body_input.setFixedHeight(140)
        layout.addWidget(self.body_input)

        # Config info (read-only)
        cfg_box = QFrame()
        cfg_box.setObjectName("StatCard")
        cfg_layout = QGridLayout(cfg_box)
        cfg_layout.setContentsMargins(8, 6, 8, 6)
        cfg_layout.setSpacing(4)
        cfg_layout.addWidget(_label("SMTP"), 0, 0)
        cfg_layout.addWidget(QLabel(f"{EMAIL_CONFIG['smtp_server']}:{EMAIL_CONFIG['smtp_port']}"), 0, 1)
        cfg_layout.addWidget(_label("FROM"), 1, 0)
        cfg_layout.addWidget(QLabel(f"{EMAIL_CONFIG['display_name']} <{EMAIL_CONFIG['sender']}>"), 1, 1)
        layout.addWidget(cfg_box)

        # Send button
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        self.send_btn = QPushButton("✉  SEND EMAIL")
        self.send_btn.setFixedWidth(160)
        self.send_btn.clicked.connect(self._send)
        btn_row.addWidget(self.send_btn)
        layout.addLayout(btn_row)

        layout.addStretch()

    def _on_sr_changed(self, sr):
        self._active_sr = sr

    def _apply_template(self, name: str):
        # Templates now USE {variable} placeholders — substituted at send time
        templates = {
            "SR Created": (
                "Service Request Created — {sr_number}",
                "Dear Team,\n\n"
                "A new Service Request has been created.\n\n"
                "SR Number  : {sr_number}\n"
                "Title      : {title}\n"
                "Priority   : {priority}\n"
                "Customer   : {customer_name}\n"
                "Company    : {company_name}\n\n"
                "Please review and assign accordingly.\n\n"
                "Regards,\nSR Manager System"
            ),
            "SR Resolved": (
                "SR Resolved — {sr_number}",
                "Dear {customer_name},\n\n"
                "Your Service Request {sr_number} has been resolved.\n\n"
                "If you require further assistance please reply to this email.\n\n"
                "Thank you."
            ),
            "Approval Required": (
                "Approval Required — {sr_number}",
                "Dear Manager,\n\n"
                "Approval is required for SR {sr_number} — {title}.\n\n"
                "Priority   : {priority}\n"
                "Customer   : {customer_name}\n\n"
                "Please log in to the SR Manager to review and approve.\n\n"
                "Regards"
            ),
            "Site Visit Scheduled": (
                "Site Visit Scheduled — {sr_number}",
                "Dear {customer_name},\n\n"
                "A site visit has been scheduled for SR {sr_number}.\n\n"
                "Our engineer will contact you to confirm the date and time.\n\n"
                "Thank you."
            ),
        }
        if name in templates:
            subj, body = templates[name]
            self.subject_input.setText(subj)
            self.body_input.setText(body)

    def _send(self):
        to      = self.to_input.text().strip()
        subject = self.subject_input.text().strip()
        body    = self.body_input.toPlainText().strip()

        if not to or not subject or not body:
            QMessageBox.warning(self, "Missing Fields",
                                "Please fill in To, Subject, and Body.")
            return

        # ── Variable substitution ──────────────────────────────────────────
        if self._active_sr:
            subject = substitute_vars(subject, self._active_sr)
            body    = substitute_vars(body,    self._active_sr)
        else:
            # Warn if the text still contains {placeholders}
            leftover = _has_unresolved_vars(subject + body)
            if leftover:
                reply = QMessageBox.question(
                    self, "Variables Not Substituted",
                    f"Your message contains {leftover} but no SR is selected.\n\n"
                    "Variables will be sent as-is. Continue?",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                if reply == QMessageBox.StandardButton.No:
                    return
        # ──────────────────────────────────────────────────────────────────

        self.send_btn.setEnabled(False)
        self.send_btn.setText("Sending…")

        def _done(ok, msg):
            self.send_btn.setEnabled(True)
            self.send_btn.setText("✉  SEND EMAIL")

        self.log.add_entry(f"Sending email to {to}…", "info")
        send_email(to, subject, body, on_done=_done)


# ═══════════════════════════════════════════════════════════════════════════════
#  WHATSAPP TAB
# ═══════════════════════════════════════════════════════════════════════════════
class _WhatsAppTab(QWidget):
    def __init__(self, log_table: _LogTable):
        super().__init__()
        self.log = log_table
        self._contacts:    list = []
        self._groups:      list = []
        self._selected:    tuple | None = None   # (id, name)
        self._active_sr:   dict  | None = None
        self._bridge_proc               = None
        self._build()
        self._poll_timer = QTimer()
        self._poll_timer.timeout.connect(self._poll_wa)
        self._poll_timer.start(2000)

    # ── UI ────────────────────────────────────────────────────────────────────
    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(8)

        # Status bar
        status_row = QHBoxLayout()
        self.status_dot = QLabel("●")
        self.status_dot.setStyleSheet("color:#E05555; font-size:14px;")
        self.status_lbl = QLabel("Not connected")
        self.status_lbl.setObjectName("FormLabel")
        self.connect_btn = QPushButton("▶  Start WA Bridge")
        self.connect_btn.setFixedWidth(160)
        self.connect_btn.clicked.connect(self._start_bridge)
        status_row.addWidget(self.status_dot)
        status_row.addWidget(self.status_lbl)
        status_row.addStretch()
        status_row.addWidget(self.connect_btn)
        layout.addLayout(status_row)

        # Splitter: contact list | compose
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # ── Left: contact/group list ─────────────────────────────────────────
        left = QFrame()
        left.setObjectName("StatCard")
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        ll.setSpacing(0)
        ll.addWidget(self._section_header("CONTACTS & GROUPS"))

        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search…")
        self.search_box.textChanged.connect(self._filter)
        self.search_box.setContentsMargins(6, 4, 6, 4)
        ll.addWidget(self.search_box)

        self.tab_row = QHBoxLayout()
        self.tab_row.setSpacing(0)
        self._tab_all = QPushButton("All")
        self._tab_c   = QPushButton("Contacts")
        self._tab_g   = QPushButton("Groups")
        for btn in [self._tab_all, self._tab_c, self._tab_g]:
            btn.setCheckable(True)
            btn.setFixedHeight(24)
            self.tab_row.addWidget(btn)
        self._tab_all.setChecked(True)
        self._tab_all.clicked.connect(lambda: self._set_tab("all"))
        self._tab_c.clicked.connect(lambda:   self._set_tab("contacts"))
        self._tab_g.clicked.connect(lambda:   self._set_tab("groups"))
        self._active_tab = "all"
        tab_w = QWidget()
        tab_w.setLayout(self.tab_row)
        ll.addWidget(tab_w)

        self.contact_table = QTableWidget()
        self.contact_table.setColumnCount(2)
        self.contact_table.setHorizontalHeaderLabels(["NAME", "TYPE"])
        self.contact_table.horizontalHeader().setStretchLastSection(True)
        self.contact_table.setColumnWidth(0, 160)
        self.contact_table.verticalHeader().setVisible(False)
        self.contact_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.contact_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.contact_table.setAlternatingRowColors(True)
        self.contact_table.setStyleSheet("alternate-background-color: #13131A;")
        self.contact_table.itemSelectionChanged.connect(self._on_select)
        ll.addWidget(self.contact_table)
        splitter.addWidget(left)

        # ── Right: compose ───────────────────────────────────────────────────
        right = QFrame()
        right.setObjectName("StatCard")
        rl = QVBoxLayout(right)
        rl.setContentsMargins(10, 8, 10, 10)
        rl.setSpacing(8)
        rl.addWidget(self._section_header("COMPOSE MESSAGE"))

        self.sel_label = QLabel("No contact selected")
        self.sel_label.setObjectName("FormLabel")
        self.sel_label.setStyleSheet("color:#D4A800; padding:4px 0;")
        rl.addWidget(self.sel_label)

        # ── SR context selector (NEW) ─────────────────────────────────────
        self.sr_selector = _SRSelector()
        self.sr_selector.sr_changed.connect(self._on_sr_changed)
        rl.addWidget(self.sr_selector)

        # ── Message body
        self.wa_body = QTextEdit()
        self.wa_body.setPlaceholderText(
            "Type your WhatsApp message.\n"
            "Variables: {sr_number} {status} {customer_name} {priority}\n"
            "{assigned_to} {title} {company_name} {current_stage} etc."
        )
        rl.addWidget(self.wa_body)

        # ── Quick WA templates (now use {variables}) ──────────────────────
        tmpl_row = QHBoxLayout()
        self.wa_tmpl = QComboBox()
        self.wa_tmpl.addItems([
            "— quick template —",
            "SR Created",
            "SR Resolved",
            "Appointment Reminder",
            "Escalation Alert",
        ])
        self.wa_tmpl.currentTextChanged.connect(self._apply_wa_template)
        tmpl_row.addWidget(QLabel("Template:"))
        tmpl_row.addWidget(self.wa_tmpl, 1)
        rl.addLayout(tmpl_row)

        send_row = QHBoxLayout()
        send_row.addStretch()
        self.wa_send_btn = QPushButton("💬  SEND WHATSAPP")
        self.wa_send_btn.setFixedWidth(180)
        self.wa_send_btn.clicked.connect(self._wa_send_click)
        send_row.addWidget(self.wa_send_btn)
        rl.addLayout(send_row)

        splitter.addWidget(right)
        splitter.setSizes([300, 420])
        layout.addWidget(splitter, 1)

    @staticmethod
    def _section_header(text):
        lbl = QLabel(f"  {text}")
        lbl.setStyleSheet(
            "color:#555; font-size:9px; letter-spacing:2px;"
            "padding:6px 0; border-bottom:1px solid #1E1E28;"
        )
        return lbl

    # ── SR context ────────────────────────────────────────────────────────────
    def _on_sr_changed(self, sr):
        self._active_sr = sr

    # ── WA Bridge ─────────────────────────────────────────────────────────────
    def _start_bridge(self):
        node = shutil.which("node")
        if not node:
            QMessageBox.critical(self, "Node.js Missing",
                                 "Node.js not found. Install from https://nodejs.org")
            return
        bridge_js = _BRIDGE_DIR / "bridge.js"
        if not bridge_js.exists():
            QMessageBox.critical(self, "Bridge Missing",
                                 f"Cannot find {bridge_js}\n"
                                 "Make sure P2/wa_bridge/bridge.js exists.")
            return

        if self._bridge_proc and self._bridge_proc.poll() is None:
            self.log.add_entry("Bridge already running", "info")
            return

        for f in [_DATA_FILE, _CMD_FILE, _SEL_FILE]:
            if f.exists():
                f.unlink()

        self.connect_btn.setEnabled(False)
        self.connect_btn.setText("Starting…")
        self.log.add_entry("Starting WhatsApp bridge — scan QR in terminal…", "info")

        self._bridge_proc = subprocess.Popen(
            [node, str(bridge_js)],
            cwd=str(_BRIDGE_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def _poll_wa(self):
        if _wa_ready():
            contacts, groups = _wa_contacts()
            if (contacts or groups) and len(contacts) != len(self._contacts):
                self._contacts = contacts
                self._groups   = groups
                self._render_contacts()
                self.log.add_entry(
                    f"WhatsApp ready — {len(contacts)} contacts, {len(groups)} groups", "ok")

            self.status_dot.setStyleSheet("color:#00D4AA; font-size:14px;")
            self.status_lbl.setText(
                f"Connected · {len(self._contacts)} contacts · {len(self._groups)} groups")
            self.connect_btn.setText("✓ Connected")
        else:
            if self._bridge_proc and self._bridge_proc.poll() is None:
                self.status_dot.setStyleSheet("color:#D4A800; font-size:14px;")
                self.status_lbl.setText("Bridge running — waiting for QR scan…")
            else:
                self.status_dot.setStyleSheet("color:#E05555; font-size:14px;")
                self.status_lbl.setText("Not connected")
                self.connect_btn.setEnabled(True)
                self.connect_btn.setText("▶  Start WA Bridge")

    def _set_tab(self, tab):
        self._active_tab = tab
        self._tab_all.setChecked(tab == "all")
        self._tab_c.setChecked(tab == "contacts")
        self._tab_g.setChecked(tab == "groups")
        self._render_contacts()

    def _filter(self):
        self._render_contacts()

    def _render_contacts(self):
        q   = self.search_box.text().lower()
        tab = self._active_tab
        rows = []
        if tab in ("all", "contacts"):
            rows += [(c, "contact") for c in self._contacts if q in c["name"].lower()]
        if tab in ("all", "groups"):
            rows += [(c, "group")   for c in self._groups   if q in c["name"].lower()]

        self.contact_table.setRowCount(len(rows))
        for i, (c, ctype) in enumerate(rows):
            self.contact_table.setRowHeight(i, 22)
            name_item = QTableWidgetItem(c["name"])
            type_item = QTableWidgetItem("👥 Group" if ctype == "group" else "👤 Contact")
            type_item.setForeground(QColor("#AA55FF" if ctype == "group" else "#5599FF"))
            name_item.setData(Qt.ItemDataRole.UserRole, (c["id"], c["name"]))
            self.contact_table.setItem(i, 0, name_item)
            self.contact_table.setItem(i, 1, type_item)

    def _on_select(self):
        rows = self.contact_table.selectedItems()
        if not rows:
            return
        data = self.contact_table.item(
            self.contact_table.currentRow(), 0
        ).data(Qt.ItemDataRole.UserRole)
        if data:
            self._selected = data   # (id, name)
            self.sel_label.setText(f"→ {data[1]}")

    def _apply_wa_template(self, name: str):
        # ── Templates now use {variable} placeholders ──────────────────────
        # Variables are substituted at send time using the selected SR context.
        templates = {
            "SR Created": (
                "🔔 SR: {sr_number}\n"
                "Status: {status}\n"
                "Customer: {customer_name}\n"
                "Priority: {priority}\n\n"
                "A new Service Request has been created. Our team will be in touch shortly."
            ),
            "SR Resolved": (
                "✅ SR {sr_number} has been resolved.\n"
                "Customer: {customer_name}\n\n"
                "Please let us know if you need further assistance."
            ),
            "Appointment Reminder": (
                "📅 Reminder for SR {sr_number}\n"
                "Customer: {customer_name}\n\n"
                "Our engineer is scheduled to visit. Please ensure access is available. Thank you."
            ),
            "Escalation Alert": (
                "⚠️ Escalation: SR {sr_number} — {title}\n"
                "Status: {status} | Priority: {priority}\n"
                "Customer: {customer_name}\n"
                "Assigned to: {assigned_to}\n\n"
                "Please review immediately."
            ),
        }
        if name in templates:
            self.wa_body.setText(templates[name])

    def _wa_send_click(self):
        if not _wa_ready():
            QMessageBox.warning(self, "Not Connected",
                                "WhatsApp bridge is not ready.\nClick 'Start WA Bridge' first.")
            return
        if not self._selected:
            QMessageBox.warning(self, "No Recipient",
                                "Please select a contact or group from the list.")
            return

        raw_msg = self.wa_body.toPlainText().strip()
        if not raw_msg:
            QMessageBox.warning(self, "Empty Message", "Please type a message.")
            return

        # ── Variable substitution (THE FIX) ───────────────────────────────
        if self._active_sr:
            final_msg = substitute_vars(raw_msg, self._active_sr)
        else:
            leftover = _has_unresolved_vars(raw_msg)
            if leftover:
                reply = QMessageBox.question(
                    self, "Variables Not Substituted",
                    f"Your message contains {leftover}\nbut no SR is selected in 'SR CONTEXT'.\n\n"
                    "Variables will be sent literally.  Continue?",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
                )
                if reply == QMessageBox.StandardButton.No:
                    return
            final_msg = raw_msg
        # ──────────────────────────────────────────────────────────────────

        cid, cname = self._selected
        self.log.add_entry(f"Sending WA to {cname}…", "info")
        self.wa_send_btn.setEnabled(False)
        self.wa_send_btn.setText("Sending…")

        def _done(ok, log_msg):
            self.wa_send_btn.setEnabled(True)
            self.wa_send_btn.setText("💬  SEND WHATSAPP")

        _wa_send(cid, cname, final_msg, on_done=_done)


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN NOTIFICATIONS PAGE
# ═══════════════════════════════════════════════════════════════════════════════
class NotificationsPage(QWidget):
    """
    Drop-in page for the P2 dashboard.
    Adds Email + WhatsApp sending with a unified activity log.
    """

    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build()
        _relay.log_signal.connect(self._on_log)

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("NOTIFICATIONS")
        title.setObjectName("PageTitle")
        hdr.addWidget(title)
        hdr.addStretch()
        layout.addLayout(hdr)

        # Tabs: Email | WhatsApp
        self.log_table = _LogTable()
        tabs = QTabWidget()
        tabs.addTab(_EmailTab(self.log_table),    "✉  EMAIL")
        tabs.addTab(_WhatsAppTab(self.log_table), "💬  WHATSAPP")
        layout.addWidget(tabs, 3)

        # Activity log
        log_frame = QFrame()
        log_frame.setObjectName("StatCard")
        lfl = QVBoxLayout(log_frame)
        lfl.setContentsMargins(0, 0, 0, 0)
        lfl.setSpacing(0)

        log_hdr = QLabel("  SEND LOG")
        log_hdr.setStyleSheet(
            "color:#555; font-size:9px; letter-spacing:2px;"
            "padding:6px 0; border-bottom:1px solid #1E1E28;"
        )
        lfl.addWidget(log_hdr)
        lfl.addWidget(self.log_table)
        layout.addWidget(log_frame, 1)

    def _on_log(self, message: str, level: str):
        self.log_table.add_entry(message, level)


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS  for other parts of the app
#  e.g. auto-notify on SR creation / route step completion
# ═══════════════════════════════════════════════════════════════════════════════
def notify_sr_created(sr: dict, email_to: str = None):
    """
    Call from sr_page.py after saving a new SR.
    Sends an email with real SR data substituted in.
    """
    if not email_to:
        return
    subject = f"Service Request Created — {sr.get('sr_number', '')}"
    body_tmpl = (
        "A new Service Request has been created.\n\n"
        "SR Number  : {sr_number}\n"
        "Title      : {title}\n"
        "Priority   : {priority}\n"
        "Status     : {status}\n"
        "Customer   : {customer_name}\n\n"
        "Please log in to SR Manager to review.\n"
    )
    send_email(email_to, subject, substitute_vars(body_tmpl, sr))


def notify_step_complete(step_name: str, sr: dict, email_to: str = None):
    """
    Call from routes_page.py / pipelines_page.py when a step is completed.
    Pass the full SR dict so variables are substituted.
    """
    if not email_to:
        return
    sr_number = sr.get("sr_number", "")
    subject   = f"Step Completed — {step_name} | SR {sr_number}"
    body_tmpl = (
        f"The step '{step_name}' has been completed for SR {{sr_number}}.\n\n"
        "Customer : {customer_name}\n"
        "Status   : {status}\n\n"
        "Please log in to SR Manager to view details and proceed.\n"
    )
    send_email(email_to, subject, substitute_vars(body_tmpl, sr))


def wa_notify_sr(sr: dict, contact_id: str, contact_name: str,
                 template: str = None, on_done=None):
    """
    Send a WhatsApp notification for an SR from code (e.g. from sr_page.py).

        from ui.notifications_page import wa_notify_sr
        wa_notify_sr(sr_dict, contact_id, contact_name)

    Variables in `template` are automatically substituted from `sr`.
    """
    if template is None:
        template = (
            "🔔 SR: {sr_number}\n"
            "Status: {status}\n"
            "Customer: {customer_name}\n"
            "Priority: {priority}"
        )
    final_msg = substitute_vars(template, sr)
    _wa_send(contact_id, contact_name, final_msg, on_done=on_done)
