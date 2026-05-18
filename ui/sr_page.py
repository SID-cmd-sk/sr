"""
SR Manager - SR Page (Updated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGES vs original:
  • "No-SR Activities" tab — any user can raise a task without an SR number
  • SR-mandated activities still get a proper SR-XXXX number
  • When a route step is advanced, mail + WA templates fire automatically
  • WA contact picker uses the live bridge contacts (if bridge is connected)

INSTALL:  drop into  P2/ui/sr_page.py  (replaces original)
"""

# ── PATH BOOTSTRAP ─────────────────────────────────────────────────────────
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
# ─────────────────────────────────────────────────────────────────────────────

import json, uuid
from datetime import datetime

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QFormLayout, QTextEdit, QComboBox, QMessageBox,
    QSplitter, QScrollArea, QHeaderView, QTabWidget, QCheckBox
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor

from core import storage

# Route trigger (from updated routes_page)
try:
    from ui.routes_page import trigger_step
except ImportError:
    def trigger_step(*a, **kw): pass


PRIORITY_COLORS = {"High": "#E05555", "Medium": "#D4A800", "Low": "#5599FF"}
STATUS_COLORS   = {
    "Open": "#5599FF", "Closed": "#555555",
    "In Progress": "#00D4AA", "Pending": "#D4A800"
}

# ─── helpers ─────────────────────────────────────────────────────────────────
def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def _lbl(text):
    l = QLabel(text)
    l.setObjectName("FormLabel")
    return l

def _section(text):
    l = QLabel(f"  {text}")
    l.setStyleSheet(
        "color:#555; font-size:9px; letter-spacing:2px;"
        "padding:6px 0; border-bottom:1px solid #1E1E28;"
    )
    return l


# ═══════════════════════════════════════════════════════════════════════════════
#  WA CONTACT PICKER  — pulls live contacts from wa_data.json if available
# ═══════════════════════════════════════════════════════════════════════════════
_WA_DATA = _ROOT / "wa_data.json"

def _wa_contacts():
    try:
        if _WA_DATA.exists():
            d = json.loads(_WA_DATA.read_text())
            if d.get("status") == "ready":
                all_c = d.get("contacts", []) + d.get("groups", [])
                return [(c["id"], c["name"]) for c in all_c]
    except Exception:
        pass
    return []


# ═══════════════════════════════════════════════════════════════════════════════
#  CREATE SR DIALOG  (SR-mandated — generates SR number)
# ═══════════════════════════════════════════════════════════════════════════════
class CreateSRDialog(QDialog):
    """
    Admin + Manager + User can open this dialog.
    Generates a proper SR-XXXX number.
    """
    def __init__(self, user, parent=None):
        super().__init__(parent)
        self.user = user
        self.setWindowTitle("NEW SERVICE REQUEST")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(500)
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  NEW SERVICE REQUEST")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        fw = QWidget()
        fw.setContentsMargins(16, 14, 16, 14)
        form = QFormLayout(fw)
        form.setSpacing(8)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        self.title_input = QLineEdit()
        self.title_input.setPlaceholderText("Short title for the SR")
        form.addRow(_lbl("TITLE"), self.title_input)

        self.customer_name = QLineEdit()
        self.customer_name.setPlaceholderText("Customer / Client name")
        form.addRow(_lbl("CUSTOMER"), self.customer_name)

        self.customer_contact = QLineEdit()
        self.customer_contact.setPlaceholderText("Email or phone for mail / WA")
        form.addRow(_lbl("CONTACT"), self.customer_contact)

        # WA contact picker (live if bridge is up)
        self.wa_combo = QComboBox()
        self.wa_combo.addItem("— none —", None)
        for cid, cname in _wa_contacts():
            self.wa_combo.addItem(cname, (cid, cname))
        form.addRow(_lbl("WA RECIPIENT"), self.wa_combo)

        self.priority_combo = QComboBox()
        self.priority_combo.addItems(["High", "Medium", "Low"])
        self.priority_combo.setCurrentIndex(1)
        form.addRow(_lbl("PRIORITY"), self.priority_combo)

        self.route_combo = QComboBox()
        self.route_combo.addItem("-- None --", None)
        for r in storage.get_routes():
            req = " (requires SR)" if r.get("requires_sr", True) else ""
            self.route_combo.addItem(r["name"] + req, r["id"])
        form.addRow(_lbl("ROUTE"), self.route_combo)

        self.desc_input = QTextEdit()
        self.desc_input.setPlaceholderText("Description, issue details…")
        self.desc_input.setFixedHeight(80)
        form.addRow(_lbl("DESCRIPTION"), self.desc_input)

        layout.addWidget(fw)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL"); cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        create = QPushButton("CREATE SR")
        create.setObjectName("PrimaryBtn"); create.clicked.connect(self._create)
        btns.addWidget(create)
        layout.addLayout(btns)

    def _create(self):
        title = self.title_input.text().strip()
        if not title:
            QMessageBox.warning(self, "Error", "Title is required.")
            return

        wa_data = self.wa_combo.currentData()   # (id, name) or None
        storage.create_sr(
            title            = title,
            description      = self.desc_input.toPlainText().strip(),
            priority         = self.priority_combo.currentText(),
            pipeline_id      = None,
            route_id         = self.route_combo.currentData(),
            created_by       = self.user["id"],
            customer_name    = self.customer_name.text().strip(),
            customer_contact = self.customer_contact.text().strip(),
        )
        # Attach wa contact to the newly created SR
        if wa_data:
            db = storage.load_db()
            newest = db["sr_entries"][-1] if db.get("sr_entries") else None
            if newest:
                newest["wa_contact_id"]   = wa_data[0]
                newest["wa_contact_name"] = wa_data[1]
                storage.save_db(db)

        # Fire first route step if route is assigned
        self._fire_first_step()
        self.accept()

    def _fire_first_step(self):
        """Auto-fire the first step of the route on SR creation."""
        try:
            db     = storage.load_db()
            sr     = db["sr_entries"][-1]
            rid    = sr.get("route_id")
            if not rid:
                return
            route  = next((r for r in db.get("routes", []) if r["id"] == rid), None)
            if not route or not route.get("steps"):
                return
            step = route["steps"][0]
            trigger_step(
                step,
                sr,
                wa_contact_id   = sr.get("wa_contact_id"),
                wa_contact_name = sr.get("wa_contact_name"),
            )
        except Exception as e:
            print(f"[Route auto-fire error] {e}")


# ═══════════════════════════════════════════════════════════════════════════════
#  NO-SR ACTIVITY DIALOG  (no SR number, no route — simple task)
# ═══════════════════════════════════════════════════════════════════════════════
class CreateActivityDialog(QDialog):
    """
    Any user can create a free-form activity (no SR number generated).
    Optionally fires a Route that is marked  requires_sr = False.
    """
    def __init__(self, user, parent=None):
        super().__init__(parent)
        self.user = user
        self.setWindowTitle("NEW ACTIVITY")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(460)
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  NEW ACTIVITY  (no SR number)")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        fw = QWidget()
        fw.setContentsMargins(16, 14, 16, 14)
        form = QFormLayout(fw)
        form.setSpacing(8)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        self.title_input = QLineEdit()
        self.title_input.setPlaceholderText("Activity title")
        form.addRow(_lbl("TITLE"), self.title_input)

        self.contact_input = QLineEdit()
        self.contact_input.setPlaceholderText("Email or phone (optional)")
        form.addRow(_lbl("CONTACT"), self.contact_input)

        # Only show routes that do NOT require an SR
        self.route_combo = QComboBox()
        self.route_combo.addItem("-- None --", None)
        for r in storage.get_routes():
            if not r.get("requires_sr", True):
                self.route_combo.addItem(r["name"], r["id"])
        form.addRow(_lbl("ROUTE"), self.route_combo)

        self.desc_input = QTextEdit()
        self.desc_input.setPlaceholderText("Notes / details…")
        self.desc_input.setFixedHeight(70)
        form.addRow(_lbl("NOTES"), self.desc_input)

        layout.addWidget(fw)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL"); cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        ok = QPushButton("CREATE ACTIVITY")
        ok.setObjectName("PrimaryBtn"); ok.clicked.connect(self._create)
        btns.addWidget(ok)
        layout.addLayout(btns)

        self._saved_activity = None

    def _create(self):
        title = self.title_input.text().strip()
        if not title:
            QMessageBox.warning(self, "Error", "Title is required.")
            return

        # Store as a lightweight activity (no SR prefix) in activity_logs
        db  = storage.load_db()
        act = {
            "id":          str(uuid.uuid4())[:8].upper(),
            "type":        "activity",
            "title":       title,
            "contact":     self.contact_input.text().strip(),
            "notes":       self.desc_input.toPlainText().strip(),
            "route_id":    self.route_combo.currentData(),
            "created_by":  self.user["id"],
            "created_at":  _now(),
            "status":      "Open",
        }
        db.setdefault("activities", []).append(act)
        storage.save_db(db)
        self._saved_activity = act

        # Fire first route step if a no-SR route is selected
        rid = act.get("route_id")
        if rid:
            route = next((r for r in db.get("routes", []) if r["id"] == rid), None)
            if route and route.get("steps"):
                trigger_step(route["steps"][0], act)

        self.accept()

    def get_activity(self):
        return self._saved_activity


# ═══════════════════════════════════════════════════════════════════════════════
#  SR DETAIL PANEL  (right-hand side)
# ═══════════════════════════════════════════════════════════════════════════════
class SRDetailPanel(QWidget):
    sr_updated = pyqtSignal()

    def __init__(self, user):
        super().__init__()
        self.user       = user
        self.current_sr = None
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(_section("SR DETAILS"))

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        self.inner = QWidget()
        il = QVBoxLayout(self.inner)
        il.setContentsMargins(10, 10, 10, 10)
        il.setSpacing(6)

        # Info grid
        info_frame = QFrame()
        info_frame.setObjectName("StatCard")
        info_grid = QFormLayout(info_frame)
        info_grid.setSpacing(5)
        info_grid.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        def _info_row(label):
            lbl_w = _lbl(label)
            val_w = QLabel("—")
            info_grid.addRow(lbl_w, val_w)
            return val_w

        self.lbl_id       = _info_row("SR NUMBER")
        self.lbl_title    = _info_row("TITLE")
        self.lbl_customer = _info_row("CUSTOMER")
        self.lbl_contact  = _info_row("CONTACT")
        self.lbl_priority = _info_row("PRIORITY")
        self.lbl_status   = _info_row("STATUS")
        self.lbl_route    = _info_row("ROUTE")
        self.lbl_step     = _info_row("CURRENT STEP")
        self.lbl_created  = _info_row("CREATED")
        il.addWidget(info_frame)

        # Route step progress
        step_frame = QFrame()
        step_frame.setObjectName("StatCard")
        sl = QVBoxLayout(step_frame)
        sl.addWidget(_section("ROUTE PROGRESS"))
        self.step_table = QTableWidget()
        self.step_table.setColumnCount(3)
        self.step_table.setHorizontalHeaderLabels(["#", "STEP", "STATUS"])
        self.step_table.setColumnWidth(0, 30)
        self.step_table.setColumnWidth(1, 160)
        self.step_table.horizontalHeader().setStretchLastSection(True)
        self.step_table.verticalHeader().setVisible(False)
        self.step_table.setFixedHeight(140)
        self.step_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.step_table.setAlternatingRowColors(True)
        self.step_table.setStyleSheet("alternate-background-color: #13131A;")
        sl.addWidget(self.step_table)

        adv_row = QHBoxLayout()
        adv_row.addStretch()
        self.adv_btn = QPushButton("▶  ADVANCE TO NEXT STEP")
        self.adv_btn.setObjectName("PrimaryBtn")
        self.adv_btn.clicked.connect(self._advance_step)
        adv_row.addWidget(self.adv_btn)
        sl.addLayout(adv_row)
        il.addWidget(step_frame)

        # Comment
        comm_frame = QFrame()
        comm_frame.setObjectName("StatCard")
        cl = QVBoxLayout(comm_frame)
        cl.addWidget(_section("ADD COMMENT"))
        self.comment_input = QTextEdit()
        self.comment_input.setFixedHeight(60)
        self.comment_input.setPlaceholderText("Type a comment…")
        cl.addWidget(self.comment_input)
        comm_row = QHBoxLayout()
        comm_row.addStretch()
        comm_btn = QPushButton("POST COMMENT")
        comm_btn.clicked.connect(self._post_comment)
        comm_row.addWidget(comm_btn)
        cl.addLayout(comm_row)
        il.addWidget(comm_frame)

        # Close SR
        role = self.user.get("role", "")
        if role in ("Admin", "Manager", "Technical"):
            close_frame = QFrame()
            close_frame.setObjectName("StatCard")
            kl = QHBoxLayout(close_frame)
            kl.addStretch()
            close_btn = QPushButton("✓  CLOSE SR")
            close_btn.setObjectName("DangerBtn")
            close_btn.clicked.connect(self._close_sr)
            kl.addWidget(close_btn)
            il.addWidget(close_frame)

        il.addStretch()
        scroll.setWidget(self.inner)
        layout.addWidget(scroll, 1)

    # ── load ──────────────────────────────────────────────────────────────────
    def load_sr(self, sr: dict):
        self.current_sr = sr
        db = storage.load_db()

        self.lbl_id.setText(sr.get("sr_number", sr.get("id", "—")))
        self.lbl_title.setText(sr.get("title", "—"))
        self.lbl_customer.setText(sr.get("customer_name", "—"))
        self.lbl_contact.setText(sr.get("customer_contact", "—"))

        pri = sr.get("priority", "—")
        self.lbl_priority.setText(pri)
        self.lbl_priority.setStyleSheet(f"color:{PRIORITY_COLORS.get(pri,'#888')};")

        sta = sr.get("status", "—")
        self.lbl_status.setText(sta)
        self.lbl_status.setStyleSheet(f"color:{STATUS_COLORS.get(sta,'#888')};")

        self.lbl_created.setText(sr.get("created_at", "—")[:16])

        # Route info
        rid = sr.get("route_id")
        route = next((r for r in db.get("routes", []) if r["id"] == rid), None) if rid else None
        self.lbl_route.setText(route["name"] if route else "—")

        # Step progress
        steps = route.get("steps", []) if route else []
        cur   = sr.get("current_step", 0)
        self.lbl_step.setText(steps[cur]["name"] if steps and cur < len(steps) else "—")

        self.step_table.setRowCount(len(steps))
        for i, s in enumerate(steps):
            self.step_table.setRowHeight(i, 22)
            self.step_table.setItem(i, 0, QTableWidgetItem(str(i + 1)))
            self.step_table.setItem(i, 1, QTableWidgetItem(s["name"]))
            if i < cur:
                sta_item = QTableWidgetItem("✓ Done")
                sta_item.setForeground(QColor("#00D4AA"))
            elif i == cur:
                sta_item = QTableWidgetItem("→ Current")
                sta_item.setForeground(QColor("#D4A800"))
            else:
                sta_item = QTableWidgetItem("Pending")
                sta_item.setForeground(QColor("#444"))
            self.step_table.setItem(i, 2, sta_item)

        # Disable advance if closed or no route
        is_closed = sr.get("status") == "Closed"
        self.adv_btn.setEnabled(bool(steps) and not is_closed and cur < len(steps))

    # ── actions ───────────────────────────────────────────────────────────────
    def _advance_step(self):
        if not self.current_sr:
            return
        db    = storage.load_db()
        sr    = next((x for x in db["sr_entries"]
                      if x["id"] == self.current_sr["id"]), None)
        if not sr:
            return

        rid   = sr.get("route_id")
        route = next((r for r in db.get("routes", []) if r["id"] == rid), None) if rid else None
        steps = route.get("steps", []) if route else []
        cur   = sr.get("current_step", 0)

        if cur >= len(steps):
            QMessageBox.information(self, "Complete", "All route steps are done.")
            return

        # Fire the CURRENT step triggers
        trigger_step(
            steps[cur], sr,
            wa_contact_id   = sr.get("wa_contact_id"),
            wa_contact_name = sr.get("wa_contact_name"),
        )

        # Advance
        sr["current_step"]  = cur + 1
        sr["updated_at"]    = _now()
        if sr["current_step"] >= len(steps):
            sr["status"] = "In Progress"   # optionally auto-close here

        storage.save_db(db)
        self.current_sr = sr
        self.load_sr(sr)
        self.sr_updated.emit()

    def _post_comment(self):
        if not self.current_sr:
            return
        txt = self.comment_input.toPlainText().strip()
        if not txt:
            return
        storage.add_comment(self.current_sr["id"], self.user["id"], txt)
        self.comment_input.clear()
        self.sr_updated.emit()

    def _close_sr(self):
        if not self.current_sr:
            return
        if QMessageBox.question(
            self, "Close SR",
            f"Close SR {self.current_sr.get('sr_number', '')}?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        ) == QMessageBox.StandardButton.Yes:
            storage.close_sr(self.current_sr["id"], self.user["id"])
            self.sr_updated.emit()


# ═══════════════════════════════════════════════════════════════════════════════
#  ACTIVITY DETAIL PANEL (for no-SR activities)
# ═══════════════════════════════════════════════════════════════════════════════
class ActivityDetailPanel(QWidget):
    updated = pyqtSignal()

    def __init__(self, user):
        super().__init__()
        self.user    = user
        self.current = None
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(_section("ACTIVITY DETAILS"))

        self.lbl_title   = QLabel("—")
        self.lbl_contact = QLabel("—")
        self.lbl_status  = QLabel("—")
        self.lbl_notes   = QLabel("—")
        self.lbl_notes.setWordWrap(True)
        self.lbl_created = QLabel("—")

        frame = QFrame()
        frame.setObjectName("StatCard")
        fl = QFormLayout(frame)
        fl.setSpacing(5)
        fl.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        fl.addRow(_lbl("TITLE"),   self.lbl_title)
        fl.addRow(_lbl("CONTACT"), self.lbl_contact)
        fl.addRow(_lbl("STATUS"),  self.lbl_status)
        fl.addRow(_lbl("NOTES"),   self.lbl_notes)
        fl.addRow(_lbl("CREATED"), self.lbl_created)
        layout.addWidget(frame)

        # Close activity button
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        self.close_btn = QPushButton("✓  MARK DONE")
        self.close_btn.setObjectName("PrimaryBtn")
        self.close_btn.clicked.connect(self._close_activity)
        btn_row.addWidget(self.close_btn)
        layout.addLayout(btn_row)
        layout.addStretch()

    def load_activity(self, act: dict):
        self.current = act
        self.lbl_title.setText(act.get("title", "—"))
        self.lbl_contact.setText(act.get("contact", "—") or "—")
        self.lbl_status.setText(act.get("status", "—"))
        self.lbl_notes.setText(act.get("notes", "—") or "—")
        self.lbl_created.setText(act.get("created_at", "—")[:16])
        self.close_btn.setEnabled(act.get("status") != "Closed")

    def _close_activity(self):
        if not self.current:
            return
        db = storage.load_db()
        for a in db.get("activities", []):
            if a["id"] == self.current["id"]:
                a["status"]     = "Closed"
                a["updated_at"] = _now()
                break
        storage.save_db(db)
        self.current["status"] = "Closed"
        self.load_activity(self.current)
        self.updated.emit()


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN SR PAGE
# ═══════════════════════════════════════════════════════════════════════════════
class SRPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build()
        self._load()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("SERVICE REQUESTS")
        title.setObjectName("PageTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        # All roles can create
        self.new_sr_btn = QPushButton("+ NEW SR")
        self.new_sr_btn.clicked.connect(self._new_sr)
        hdr.addWidget(self.new_sr_btn)

        self.new_act_btn = QPushButton("+ ACTIVITY (no SR)")
        self.new_act_btn.clicked.connect(self._new_activity)
        hdr.addWidget(self.new_act_btn)

        layout.addLayout(hdr)

        # Tabs: SR | Activities
        self.tabs = QTabWidget()

        # ── Tab 1: SR ──
        sr_tab = QWidget()
        sr_layout = QVBoxLayout(sr_tab)
        sr_layout.setContentsMargins(0, 6, 0, 0)
        sr_layout.setSpacing(4)

        sr_splitter = QSplitter(Qt.Orientation.Horizontal)

        # SR list
        sr_list_frame = QFrame()
        sr_list_frame.setObjectName("StatCard")
        sll = QVBoxLayout(sr_list_frame)
        sll.setContentsMargins(0, 0, 0, 0)
        sll.addWidget(_section("ALL SERVICE REQUESTS"))

        self.search_sr = QLineEdit()
        self.search_sr.setPlaceholderText("Search SR…")
        self.search_sr.textChanged.connect(self._filter_sr)
        self.search_sr.setContentsMargins(6, 4, 6, 4)
        sll.addWidget(self.search_sr)

        self.sr_table = self._make_sr_table(
            ["SR#", "TITLE", "CUSTOMER", "PRIORITY", "STATUS", "CREATED"])
        self.sr_table.itemSelectionChanged.connect(self._on_sr_select)
        sll.addWidget(self.sr_table)
        sr_splitter.addWidget(sr_list_frame)

        # SR detail
        self.sr_detail = SRDetailPanel(self.user)
        self.sr_detail.sr_updated.connect(self._load)
        sr_splitter.addWidget(self.sr_detail)
        sr_splitter.setSizes([480, 380])

        sr_layout.addWidget(sr_splitter)
        self.tabs.addTab(sr_tab, "📋  SERVICE REQUESTS")

        # ── Tab 2: Activities ──
        act_tab = QWidget()
        act_layout = QVBoxLayout(act_tab)
        act_layout.setContentsMargins(0, 6, 0, 0)

        act_splitter = QSplitter(Qt.Orientation.Horizontal)

        act_list_frame = QFrame()
        act_list_frame.setObjectName("StatCard")
        all = QVBoxLayout(act_list_frame)
        all.setContentsMargins(0, 0, 0, 0)
        all.addWidget(_section("ACTIVITIES (NO SR NUMBER)"))

        self.act_table = self._make_sr_table(
            ["ID", "TITLE", "CONTACT", "STATUS", "CREATED"])
        self.act_table.itemSelectionChanged.connect(self._on_act_select)
        all.addWidget(self.act_table)
        act_splitter.addWidget(act_list_frame)

        self.act_detail = ActivityDetailPanel(self.user)
        self.act_detail.updated.connect(self._load)
        act_splitter.addWidget(self.act_detail)
        act_splitter.setSizes([480, 380])

        act_layout.addWidget(act_splitter)
        self.tabs.addTab(act_tab, "⚡  ACTIVITIES")

        layout.addWidget(self.tabs, 1)

        self._sr_data  = []
        self._act_data = []

        # ── test-compatibility aliases ─────────────────────────────────────
        self.table      = self.sr_table
        self.search_bar = self.search_sr

    @staticmethod
    def _make_sr_table(headers):
        t = QTableWidget()
        t.setColumnCount(len(headers))
        t.setHorizontalHeaderLabels(headers)
        t.horizontalHeader().setStretchLastSection(True)
        t.verticalHeader().setVisible(False)
        t.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        t.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        t.setAlternatingRowColors(True)
        t.setStyleSheet("alternate-background-color: #13131A;")
        return t

    # ── data ──────────────────────────────────────────────────────────────────
    def _load(self):
        role = self.user.get("role", "")
        if role in ("Admin", "Manager", "Technical"):
            srs = storage.get_all_sr()
        else:
            srs = storage.get_sr_by_user(self.user["id"], role)
        self._sr_data = srs
        self._render_sr(srs)

        db = storage.load_db()
        acts = db.get("activities", [])
        if role not in ("Admin", "Manager"):
            acts = [a for a in acts if a.get("created_by") == self.user["id"]]
        self._act_data = acts
        self._render_acts(acts)

    def _render_sr(self, srs):
        self.sr_table.setRowCount(len(srs))
        for i, sr in enumerate(srs):
            self.sr_table.setRowHeight(i, 22)
            vals = [
                sr.get("sr_number", ""),
                sr.get("title", ""),
                sr.get("customer_name", ""),
                sr.get("priority", ""),
                sr.get("status", ""),
                sr.get("created_at", "")[:10],
            ]
            for j, v in enumerate(vals):
                item = QTableWidgetItem(v)
                if j == 3 and v in PRIORITY_COLORS:
                    item.setForeground(QColor(PRIORITY_COLORS[v]))
                if j == 4 and v in STATUS_COLORS:
                    item.setForeground(QColor(STATUS_COLORS[v]))
                self.sr_table.setItem(i, j, item)

    def _render_acts(self, acts):
        self.act_table.setRowCount(len(acts))
        for i, a in enumerate(acts):
            self.act_table.setRowHeight(i, 22)
            sta = a.get("status", "")
            vals = [
                a.get("id", ""),
                a.get("title", ""),
                a.get("contact", ""),
                sta,
                a.get("created_at", "")[:10],
            ]
            for j, v in enumerate(vals):
                item = QTableWidgetItem(v)
                if j == 3:
                    item.setForeground(QColor(
                        "#00D4AA" if sta == "Closed" else "#D4A800"))
                self.act_table.setItem(i, j, item)

    def _filter(self):
        """Alias for test compatibility — filters using current search_bar text."""
        self._filter_sr(self.search_sr.text())

    def _filter_sr(self, txt):
        q = txt.lower()
        filtered = [sr for sr in self._sr_data
                    if q in sr.get("title", "").lower()
                    or q in sr.get("sr_number", "").lower()
                    or q in sr.get("customer_name", "").lower()]
        self._render_sr(filtered)

    # ── selection ─────────────────────────────────────────────────────────────
    def _on_sr_select(self):
        row = self.sr_table.currentRow()
        if 0 <= row < len(self._sr_data):
            self.sr_detail.load_sr(self._sr_data[row])

    def _on_act_select(self):
        row = self.act_table.currentRow()
        if 0 <= row < len(self._act_data):
            self.act_detail.load_activity(self._act_data[row])

    # ── create ────────────────────────────────────────────────────────────────
    def _new_sr(self):
        dlg = CreateSRDialog(self.user, parent=self)
        if dlg.exec():
            self._load()

    def _new_activity(self):
        dlg = CreateActivityDialog(self.user, parent=self)
        if dlg.exec():
            self._load()
