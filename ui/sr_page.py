"""
SR Manager - SR Management Page
Full SR CRUD: create, view, update, close, comment, advance stage
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QFormLayout, QTextEdit, QComboBox, QMessageBox,
    QSplitter, QScrollArea, QHeaderView
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor
import sys
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage


PRIORITY_COLORS = {"High": "#E05555", "Medium": "#D4A800", "Low": "#5599FF"}
STATUS_COLORS = {"Open": "#5599FF", "Closed": "#555555", "In Progress": "#00D4AA", "Pending": "#D4A800"}


class CreateSRDialog(QDialog):
    def __init__(self, user, parent=None):
        super().__init__(parent)
        self.user = user
        self.setWindowTitle("NEW SERVICE REQUEST")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(480)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        title_bar = QLabel("  NEW SERVICE REQUEST")
        title_bar.setObjectName("DialogTitle")
        layout.addWidget(title_bar)

        form_widget = QWidget()
        form_widget.setContentsMargins(16, 16, 16, 16)
        form = QFormLayout(form_widget)
        form.setSpacing(8)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        def lbl(t):
            l = QLabel(t)
            l.setObjectName("FormLabel")
            return l

        self.title_input = QLineEdit()
        self.title_input.setPlaceholderText("Short title for the SR")
        form.addRow(lbl("TITLE"), self.title_input)

        self.customer_name = QLineEdit()
        self.customer_name.setPlaceholderText("Customer / Client name")
        form.addRow(lbl("CUSTOMER"), self.customer_name)

        self.customer_contact = QLineEdit()
        self.customer_contact.setPlaceholderText("Phone / Email")
        form.addRow(lbl("CONTACT"), self.customer_contact)

        self.priority_combo = QComboBox()
        self.priority_combo.addItems(["High", "Medium", "Low"])
        self.priority_combo.setCurrentIndex(1)
        form.addRow(lbl("PRIORITY"), self.priority_combo)

        # Pipeline
        self.pipeline_combo = QComboBox()
        self.pipeline_combo.addItem("-- None --", None)
        for p in storage.get_pipelines():
            self.pipeline_combo.addItem(p["name"], p["id"])
        form.addRow(lbl("PIPELINE"), self.pipeline_combo)

        # Route
        self.route_combo = QComboBox()
        self.route_combo.addItem("-- None --", None)
        for r in storage.get_routes():
            self.route_combo.addItem(r["name"], r["id"])
        form.addRow(lbl("ROUTE"), self.route_combo)

        self.desc_input = QTextEdit()
        self.desc_input.setPlaceholderText("Description, issue details, notes...")
        self.desc_input.setFixedHeight(80)
        form.addRow(lbl("DESCRIPTION"), self.desc_input)

        layout.addWidget(form_widget)

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.setContentsMargins(16, 8, 16, 16)
        btn_row.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btn_row.addWidget(cancel)
        create = QPushButton("CREATE SR")
        create.setObjectName("PrimaryBtn")
        create.clicked.connect(self._create)
        btn_row.addWidget(create)
        layout.addLayout(btn_row)

    def _create(self):
        title = self.title_input.text().strip()
        if not title:
            QMessageBox.warning(self, "Error", "Title is required.")
            return
        storage.create_sr(
            title=title,
            description=self.desc_input.toPlainText().strip(),
            priority=self.priority_combo.currentText(),
            pipeline_id=self.pipeline_combo.currentData(),
            route_id=self.route_combo.currentData(),
            created_by=self.user["id"],
            customer_name=self.customer_name.text().strip(),
            customer_contact=self.customer_contact.text().strip(),
        )
        self.accept()


class SRDetailPanel(QWidget):
    sr_updated = pyqtSignal()

    def __init__(self, user):
        super().__init__()
        self.user = user
        self.current_sr = None
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        hdr = QLabel("  SR DETAILS")
        hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;")
        layout.addWidget(hdr)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        self.inner = QWidget()
        inner_layout = QVBoxLayout(self.inner)
        inner_layout.setContentsMargins(10, 10, 10, 10)
        inner_layout.setSpacing(6)

        # SR info section
        self.sr_number_lbl = QLabel("Select an SR")
        self.sr_number_lbl.setStyleSheet("color:#00D4AA; font-size:14px; font-weight:bold;")
        inner_layout.addWidget(self.sr_number_lbl)

        self.title_lbl = QLabel("")
        self.title_lbl.setStyleSheet("color:#D4D4D4; font-size:12px;")
        self.title_lbl.setWordWrap(True)
        inner_layout.addWidget(self.title_lbl)

        # Status row
        status_row = QHBoxLayout()
        self.status_lbl = QLabel("")
        self.status_lbl.setStyleSheet("font-size:10px;")
        self.priority_lbl = QLabel("")
        self.priority_lbl.setStyleSheet("font-size:10px;")
        status_row.addWidget(self.status_lbl)
        status_row.addWidget(self.priority_lbl)
        status_row.addStretch()
        inner_layout.addLayout(status_row)

        # Meta info
        self.meta_lbl = QLabel("")
        self.meta_lbl.setStyleSheet("color:#555; font-size:10px;")
        self.meta_lbl.setWordWrap(True)
        inner_layout.addWidget(self.meta_lbl)

        self.desc_lbl = QLabel("")
        self.desc_lbl.setStyleSheet("color:#888; font-size:11px; background:#111116; padding:6px; border:1px solid #1E1E28;")
        self.desc_lbl.setWordWrap(True)
        inner_layout.addWidget(self.desc_lbl)

        # Action buttons
        sep1 = QFrame(); sep1.setFrameShape(QFrame.Shape.HLine)
        sep1.setStyleSheet("color:#1E1E28;"); inner_layout.addWidget(sep1)

        action_grid = QHBoxLayout()
        action_grid.setSpacing(4)
        self.btn_inprog = QPushButton("▶ IN PROGRESS")
        self.btn_inprog.clicked.connect(lambda: self._set_status("In Progress"))
        action_grid.addWidget(self.btn_inprog)

        self.btn_advance = QPushButton("→ ADVANCE STAGE")
        self.btn_advance.clicked.connect(self._advance_stage)
        action_grid.addWidget(self.btn_advance)

        inner_layout.addLayout(action_grid)

        action_grid2 = QHBoxLayout()
        action_grid2.setSpacing(4)
        self.btn_close = QPushButton("✓ CLOSE SR")
        self.btn_close.setObjectName("PrimaryBtn")
        self.btn_close.clicked.connect(self._close_sr)
        action_grid2.addWidget(self.btn_close)

        self.btn_reopen = QPushButton("↩ REOPEN")
        self.btn_reopen.setObjectName("WarningBtn")
        self.btn_reopen.clicked.connect(lambda: self._set_status("Open"))
        action_grid2.addWidget(self.btn_reopen)
        inner_layout.addLayout(action_grid2)

        # Assign to
        sep2 = QFrame(); sep2.setFrameShape(QFrame.Shape.HLine)
        sep2.setStyleSheet("color:#1E1E28;"); inner_layout.addWidget(sep2)

        assign_row = QHBoxLayout()
        assign_lbl = QLabel("ASSIGN TO")
        assign_lbl.setObjectName("FormLabel")
        assign_row.addWidget(assign_lbl)
        self.assign_combo = QComboBox()
        self._refresh_users()
        assign_row.addWidget(self.assign_combo)
        btn_assign = QPushButton("SET")
        btn_assign.clicked.connect(self._assign)
        assign_row.addWidget(btn_assign)
        inner_layout.addLayout(assign_row)

        # Stage history
        self.stage_lbl = QLabel("")
        self.stage_lbl.setStyleSheet("color:#555; font-size:10px;")
        inner_layout.addWidget(self.stage_lbl)

        # Comment section
        sep3 = QFrame(); sep3.setFrameShape(QFrame.Shape.HLine)
        sep3.setStyleSheet("color:#1E1E28;"); inner_layout.addWidget(sep3)

        comment_lbl = QLabel("ADD COMMENT")
        comment_lbl.setObjectName("FormLabel")
        inner_layout.addWidget(comment_lbl)

        self.comment_input = QTextEdit()
        self.comment_input.setFixedHeight(50)
        self.comment_input.setPlaceholderText("Type comment here...")
        inner_layout.addWidget(self.comment_input)

        btn_comment = QPushButton("POST COMMENT")
        btn_comment.clicked.connect(self._add_comment)
        inner_layout.addWidget(btn_comment)

        # Comments display
        self.comments_widget = QWidget()
        self.comments_layout = QVBoxLayout(self.comments_widget)
        self.comments_layout.setContentsMargins(0, 0, 0, 0)
        self.comments_layout.setSpacing(2)
        inner_layout.addWidget(self.comments_widget)

        inner_layout.addStretch()
        scroll.setWidget(self.inner)
        layout.addWidget(scroll)

    def _refresh_users(self):
        self.assign_combo.clear()
        self.assign_combo.addItem("-- Unassigned --", None)
        for u in storage.get_users():
            if u["status"] == "active":
                self.assign_combo.addItem(f"{u['name']} ({u['role']})", u["id"])

    def load_sr(self, sr):
        self.current_sr = sr
        self.sr_number_lbl.setText(sr["sr_number"])
        self.title_lbl.setText(sr["title"])

        sc = STATUS_COLORS.get(sr["status"], "#888")
        self.status_lbl.setText(f"● {sr['status']}")
        self.status_lbl.setStyleSheet(f"color:{sc}; font-size:10px;")

        pc = PRIORITY_COLORS.get(sr.get("priority", "Medium"), "#888")
        self.priority_lbl.setText(f"[{sr.get('priority','Medium')}]")
        self.priority_lbl.setStyleSheet(f"color:{pc}; font-size:10px;")

        meta = f"Created: {sr['created_at'][:16]}  |  Stage: {sr['current_stage']}"
        if sr.get("customer_name"):
            meta += f"\nCustomer: {sr['customer_name']}"
            if sr.get("customer_contact"):
                meta += f"  |  {sr['customer_contact']}"
        if sr.get("assigned_to"):
            meta += f"\nAssigned: {sr['assigned_to']}"
        self.meta_lbl.setText(meta)

        desc = sr.get("description", "")
        self.desc_lbl.setText(desc if desc else "(no description)")

        # Stage history
        hist = sr.get("stage_history", [])
        if hist:
            self.stage_lbl.setText("Stage history: " + " → ".join([f"S{h['stage']}" for h in hist]))
        else:
            self.stage_lbl.setText("No stage transitions yet")

        # Comments
        for i in reversed(range(self.comments_layout.count())):
            w = self.comments_layout.itemAt(i).widget()
            if w:
                w.deleteLater()

        for c in sr.get("comments", []):
            c_lbl = QLabel(f"  {c['at'][11:16]}  {c['by']}: {c['text']}")
            c_lbl.setStyleSheet("color:#666; font-size:10px; padding:2px 0; border-bottom:1px solid #1A1A22;")
            c_lbl.setWordWrap(True)
            self.comments_layout.addWidget(c_lbl)

        is_closed = sr["status"] == "Closed"
        self.btn_close.setEnabled(not is_closed)
        self.btn_inprog.setEnabled(not is_closed)
        self.btn_advance.setEnabled(not is_closed)
        self.btn_reopen.setEnabled(is_closed)

    def _set_status(self, status):
        if not self.current_sr:
            return
        storage.update_sr(self.current_sr["id"], status=status)
        storage.log_activity("SR_UPDATE", f"SR {self.current_sr['sr_number']} → {status}", self.user["id"])
        self.sr_updated.emit()

    def _close_sr(self):
        if not self.current_sr:
            return
        r = QMessageBox.question(self, "Close SR", f"Close {self.current_sr['sr_number']}?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            storage.close_sr(self.current_sr["id"], self.user["id"])
            self.sr_updated.emit()

    def _advance_stage(self):
        if not self.current_sr:
            return
        storage.advance_sr_stage(self.current_sr["id"], self.user["id"])
        self.sr_updated.emit()

    def _assign(self):
        if not self.current_sr:
            return
        uid = self.assign_combo.currentData()
        storage.update_sr(self.current_sr["id"], assigned_to=uid)
        storage.log_activity("SR_ASSIGN", f"SR {self.current_sr['sr_number']} assigned", self.user["id"])
        self.sr_updated.emit()

    def _add_comment(self):
        if not self.current_sr:
            return
        text = self.comment_input.toPlainText().strip()
        if not text:
            return
        storage.add_comment(self.current_sr["id"], self.user["id"], text)
        self.comment_input.clear()
        self.sr_updated.emit()


class SRPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build_ui()
        self._load_sr()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)

        # Toolbar
        toolbar = QHBoxLayout()
        title = QLabel("SERVICE REQUESTS")
        title.setObjectName("PageTitle")
        toolbar.addWidget(title)
        toolbar.addStretch()

        self.search_bar = QLineEdit()
        self.search_bar.setObjectName("SearchBar")
        self.search_bar.setPlaceholderText("Search SR#, title, customer...")
        self.search_bar.textChanged.connect(self._filter)
        toolbar.addWidget(self.search_bar)

        self.filter_combo = QComboBox()
        self.filter_combo.addItems(["All Status", "Open", "In Progress", "Closed", "Pending"])
        self.filter_combo.currentTextChanged.connect(self._filter)
        toolbar.addWidget(self.filter_combo)

        self.priority_filter = QComboBox()
        self.priority_filter.addItems(["All Priority", "High", "Medium", "Low"])
        self.priority_filter.currentTextChanged.connect(self._filter)
        toolbar.addWidget(self.priority_filter)

        btn_new = QPushButton("+ NEW SR")
        btn_new.setObjectName("PrimaryBtn")
        btn_new.clicked.connect(self._new_sr)
        toolbar.addWidget(btn_new)

        layout.addLayout(toolbar)

        # Splitter
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # SR Table
        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels(["SR#", "TITLE", "CUSTOMER", "PRIORITY", "STATUS", "CREATED"])
        self.table.setColumnWidth(0, 85)
        self.table.setColumnWidth(1, 180)
        self.table.setColumnWidth(2, 110)
        self.table.setColumnWidth(3, 75)
        self.table.setColumnWidth(4, 80)
        self.table.setColumnWidth(5, 88)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setStyleSheet("alternate-background-color: #13131A;")
        self.table.itemSelectionChanged.connect(self._on_select)
        splitter.addWidget(self.table)

        # Detail panel
        self.detail_panel = SRDetailPanel(self.user)
        self.detail_panel.sr_updated.connect(self._load_sr)
        splitter.addWidget(self.detail_panel)

        splitter.setSizes([560, 300])
        layout.addWidget(splitter)

        # Status bar
        self.status_lbl = QLabel("0 records")
        self.status_lbl.setStyleSheet("color:#555; font-size:10px;")
        layout.addWidget(self.status_lbl)

        self.all_sr = []

    def _load_sr(self):
        self.all_sr = storage.get_sr_by_user(self.user["id"], self.user["role"])
        self.all_sr = sorted(self.all_sr, key=lambda x: x["created_at"], reverse=True)
        self._render(self.all_sr)

        # Reload selected if any
        if self.detail_panel.current_sr:
            updated = next((s for s in self.all_sr if s["id"] == self.detail_panel.current_sr["id"]), None)
            if updated:
                self.detail_panel.load_sr(updated)

    def _filter(self):
        query = self.search_bar.text().strip().lower()
        status_f = self.filter_combo.currentText()
        priority_f = self.priority_filter.currentText()

        filtered = self.all_sr
        if query:
            filtered = [s for s in filtered if
                        query in s["sr_number"].lower() or
                        query in s["title"].lower() or
                        query in s.get("customer_name", "").lower()]
        if status_f != "All Status":
            filtered = [s for s in filtered if s["status"] == status_f]
        if priority_f != "All Priority":
            filtered = [s for s in filtered if s.get("priority") == priority_f]

        self._render(filtered)

    def _render(self, srs):
        self.table.setRowCount(len(srs))
        for row, sr in enumerate(srs):
            self.table.setRowHeight(row, 22)
            pr_color = PRIORITY_COLORS.get(sr.get("priority", "Medium"), "#888")
            st_color = STATUS_COLORS.get(sr["status"], "#888")

            items = [
                (sr["sr_number"], "#00D4AA"),
                (sr["title"][:28], "#C0C0C0"),
                (sr.get("customer_name", "")[:18], "#888"),
                (sr.get("priority", "Medium"), pr_color),
                (sr["status"], st_color),
                (sr["created_at"][:10], "#555"),
            ]
            for col, (val, color) in enumerate(items):
                item = QTableWidgetItem(val)
                item.setData(Qt.ItemDataRole.UserRole, sr["id"])
                item.setForeground(QColor(color))
                self.table.setItem(row, col, item)

        self.status_lbl.setText(f"{len(srs)} records")

    def _on_select(self):
        row = self.table.currentRow()
        if row < 0:
            return
        sr_id = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        sr = next((s for s in self.all_sr if s["id"] == sr_id), None)
        if sr:
            self.detail_panel.load_sr(sr)

    def _new_sr(self):
        dlg = CreateSRDialog(self.user, self)
        if dlg.exec():
            self._load_sr()
