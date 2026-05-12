"""
SR Manager - Users Management Page
Admin: full CRUD. Manager: view team only.
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QComboBox, QMessageBox, QSplitter, QScrollArea,
    QFormLayout
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor
import sys
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage

STATUS_COLORS = {"active": "#00D4AA", "pending": "#D4A800", "inactive": "#555555", "rejected": "#E05555"}
ROLE_COLORS   = {"Admin": "#E05555", "Manager": "#D4A800", "Technical": "#5599FF", "User": "#888", "Viewer": "#555"}


class UserDialog(QDialog):
    def __init__(self, user_session, edit_user=None, parent=None):
        super().__init__(parent)
        self.user_session = user_session
        self.edit_user = edit_user
        self.setWindowTitle("EDIT USER" if edit_user else "CREATE USER")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(420)
        self._build_ui()
        if edit_user:
            self._load(edit_user)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        tb = QLabel("  " + ("EDIT USER" if self.edit_user else "CREATE USER"))
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        form_w = QWidget()
        form_w.setContentsMargins(16, 14, 16, 14)
        fl = QFormLayout(form_w)
        fl.setSpacing(8)
        fl.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        def lbl(t):
            l = QLabel(t)
            l.setObjectName("FormLabel")
            return l

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Full name")
        fl.addRow(lbl("NAME"), self.name_input)

        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText("user@company.com")
        fl.addRow(lbl("EMAIL"), self.email_input)

        self.pass_input = QLineEdit()
        self.pass_input.setPlaceholderText("Password (min 4 chars)")
        self.pass_input.setEchoMode(QLineEdit.EchoMode.Password)
        fl.addRow(lbl("PASSWORD"), self.pass_input)

        db = storage.load_db()
        self.role_combo = QComboBox()
        self.role_map = {}
        for r in db["roles"]:
            self.role_combo.addItem(r["name"], r["id"])
            self.role_map[r["id"]] = r["name"]
        fl.addRow(lbl("ROLE"), self.role_combo)

        self.status_combo = QComboBox()
        self.status_combo.addItems(["active", "pending", "inactive", "rejected"])
        fl.addRow(lbl("STATUS"), self.status_combo)

        self.team_input = QLineEdit()
        self.team_input.setPlaceholderText("Team / Department (optional)")
        fl.addRow(lbl("TEAM"), self.team_input)

        layout.addWidget(form_w)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = QPushButton("SAVE USER" if self.edit_user else "CREATE USER")
        save.setObjectName("PrimaryBtn")
        save.clicked.connect(self._save)
        btns.addWidget(save)
        layout.addLayout(btns)

    def _load(self, u):
        self.name_input.setText(u.get("name", ""))
        self.email_input.setText(u.get("email", ""))
        self.pass_input.setPlaceholderText("Leave blank to keep current")
        idx = self.role_combo.findData(u.get("role_id", ""))
        if idx >= 0:
            self.role_combo.setCurrentIndex(idx)
        idx2 = self.status_combo.findText(u.get("status", "active"))
        if idx2 >= 0:
            self.status_combo.setCurrentIndex(idx2)
        self.team_input.setText(u.get("team", "") or "")

    def _save(self):
        name  = self.name_input.text().strip()
        email = self.email_input.text().strip()
        pw    = self.pass_input.text().strip()
        role_id = self.role_combo.currentData()
        status  = self.status_combo.currentText()
        team    = self.team_input.text().strip() or None

        if not name or not email:
            QMessageBox.warning(self, "Error", "Name and email are required.")
            return

        if self.edit_user:
            db = storage.load_db()
            for u in db["users"]:
                if u["id"] == self.edit_user["id"]:
                    u["name"]    = name
                    u["email"]   = email
                    u["role_id"] = role_id
                    u["role"]    = self.role_map.get(role_id, "User")
                    u["status"]  = status
                    u["team"]    = team
                    if pw and len(pw) >= 4:
                        u["password"] = pw
                    break
            storage.save_db(db)
            storage.log_activity("USER_EDIT", f"User {name} updated", self.user_session["id"])
        else:
            if not pw or len(pw) < 4:
                QMessageBox.warning(self, "Error", "Password must be at least 4 characters.")
                return
            # check duplicate email
            existing = [u for u in storage.get_users() if u["email"] == email]
            if existing:
                QMessageBox.warning(self, "Error", "Email already exists.")
                return
            storage.create_user(name, email, pw, role_id, team)
            storage.update_user_status(
                storage.get_users()[-1]["id"], status
            )

        self.accept()


class UserDetailPanel(QWidget):
    def __init__(self, user_session):
        super().__init__()
        self.user_session = user_session
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        hdr = QLabel("  USER DETAILS")
        hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;")
        layout.addWidget(hdr)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        inner = QWidget()
        il = QVBoxLayout(inner)
        il.setContentsMargins(12, 12, 12, 12)
        il.setSpacing(6)

        self.name_lbl    = QLabel("Select a user")
        self.name_lbl.setStyleSheet("color:#D4D4D4; font-size:13px; font-weight:bold;")
        il.addWidget(self.name_lbl)

        self.role_lbl    = QLabel("")
        self.role_lbl.setStyleSheet("font-size:10px;")
        il.addWidget(self.role_lbl)

        self.status_lbl  = QLabel("")
        self.status_lbl.setStyleSheet("font-size:10px;")
        il.addWidget(self.status_lbl)

        self.email_lbl   = QLabel("")
        self.email_lbl.setStyleSheet("color:#888; font-size:10px;")
        il.addWidget(self.email_lbl)

        self.team_lbl    = QLabel("")
        self.team_lbl.setStyleSheet("color:#555; font-size:10px;")
        il.addWidget(self.team_lbl)

        self.created_lbl = QLabel("")
        self.created_lbl.setStyleSheet("color:#444; font-size:10px;")
        il.addWidget(self.created_lbl)

        sep = QFrame(); sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("color:#1E1E28;"); il.addWidget(sep)

        # Quick status buttons
        ql = QLabel("QUICK STATUS")
        ql.setObjectName("FormLabel")
        il.addWidget(ql)

        status_row = QHBoxLayout()
        for status, color in [("active","#00D4AA"), ("pending","#D4A800"),
                               ("inactive","#555"), ("rejected","#E05555")]:
            btn = QPushButton(status.upper())
            btn.setStyleSheet(f"color:{color}; border:1px solid {color}; background:#111116; padding:3px 8px;")
            btn.clicked.connect(lambda _, s=status: self._set_status(s))
            status_row.addWidget(btn)
        il.addLayout(status_row)

        il.addStretch()
        scroll.setWidget(inner)
        layout.addWidget(scroll)
        self.current_user_data = None

    def load_user(self, u):
        self.current_user_data = u
        self.name_lbl.setText(u["name"])
        rc = ROLE_COLORS.get(u.get("role","User"), "#888")
        self.role_lbl.setText(f"[{u.get('role','User')}]")
        self.role_lbl.setStyleSheet(f"color:{rc}; font-size:10px;")
        sc = STATUS_COLORS.get(u.get("status","pending"), "#888")
        self.status_lbl.setText(f"● {u.get('status','pending').upper()}")
        self.status_lbl.setStyleSheet(f"color:{sc}; font-size:10px;")
        self.email_lbl.setText(u.get("email",""))
        self.team_lbl.setText(f"Team: {u.get('team','—') or '—'}")
        self.created_lbl.setText(f"Created: {u.get('created_at','')[:16]}")

    def _set_status(self, status):
        if not self.current_user_data:
            return
        storage.update_user_status(self.current_user_data["id"], status)
        storage.log_activity("USER_STATUS", f"User {self.current_user_data['name']} → {status}",
                              self.user_session["id"])
        # reload self
        db = storage.load_db()
        updated = next((u for u in db["users"] if u["id"] == self.current_user_data["id"]), None)
        if updated:
            self.load_user(updated)


class UsersPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build_ui()
        self._load()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)

        toolbar = QHBoxLayout()
        title = QLabel("USER MANAGEMENT")
        title.setObjectName("PageTitle")
        toolbar.addWidget(title)
        toolbar.addStretch()

        self.search_bar = QLineEdit()
        self.search_bar.setObjectName("SearchBar")
        self.search_bar.setPlaceholderText("Search name, email, team...")
        self.search_bar.textChanged.connect(self._filter)
        toolbar.addWidget(self.search_bar)

        self.role_filter = QComboBox()
        self.role_filter.addItems(["All Roles", "Admin", "Manager", "Technical", "User", "Viewer"])
        self.role_filter.currentTextChanged.connect(self._filter)
        toolbar.addWidget(self.role_filter)

        self.status_filter = QComboBox()
        self.status_filter.addItems(["All Status", "active", "pending", "inactive", "rejected"])
        self.status_filter.currentTextChanged.connect(self._filter)
        toolbar.addWidget(self.status_filter)

        if self.user["role"] == "Admin":
            btn_new = QPushButton("+ CREATE USER")
            btn_new.setObjectName("PrimaryBtn")
            btn_new.clicked.connect(self._create_user)
            toolbar.addWidget(btn_new)

        layout.addLayout(toolbar)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        ll.setSpacing(4)

        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels(["NAME", "EMAIL", "ROLE", "TEAM", "STATUS", "CREATED"])
        self.table.setColumnWidth(0, 130)
        self.table.setColumnWidth(1, 160)
        self.table.setColumnWidth(2, 80)
        self.table.setColumnWidth(3, 80)
        self.table.setColumnWidth(4, 70)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setStyleSheet("alternate-background-color: #13131A;")
        self.table.itemSelectionChanged.connect(self._on_select)
        ll.addWidget(self.table)

        act_row = QHBoxLayout()
        act_row.setSpacing(4)
        if self.user["role"] == "Admin":
            btn_edit = QPushButton("✎ EDIT")
            btn_edit.clicked.connect(self._edit_user)
            act_row.addWidget(btn_edit)

            btn_approve = QPushButton("✓ APPROVE")
            btn_approve.setObjectName("PrimaryBtn")
            btn_approve.clicked.connect(lambda: self._quick_status("active"))
            act_row.addWidget(btn_approve)

            btn_reject = QPushButton("✕ REJECT")
            btn_reject.setObjectName("DangerBtn")
            btn_reject.clicked.connect(lambda: self._quick_status("rejected"))
            act_row.addWidget(btn_reject)

            btn_del = QPushButton("🗑 DELETE")
            btn_del.setObjectName("DangerBtn")
            btn_del.clicked.connect(self._delete_user)
            act_row.addWidget(btn_del)

        self.count_lbl = QLabel("0 users")
        self.count_lbl.setStyleSheet("color:#555; font-size:10px;")
        act_row.addStretch()
        act_row.addWidget(self.count_lbl)
        ll.addLayout(act_row)
        splitter.addWidget(left)

        self.detail = UserDetailPanel(self.user)
        splitter.addWidget(self.detail)
        splitter.setSizes([560, 260])
        layout.addWidget(splitter)

        self.all_users = []

    def _load(self):
        self.all_users = storage.get_users()
        self._render(self.all_users)

    def _filter(self):
        q = self.search_bar.text().strip().lower()
        rf = self.role_filter.currentText()
        sf = self.status_filter.currentText()

        filtered = self.all_users
        if q:
            filtered = [u for u in filtered if
                        q in u.get("name","").lower() or
                        q in u.get("email","").lower() or
                        q in (u.get("team","") or "").lower()]
        if rf != "All Roles":
            filtered = [u for u in filtered if u.get("role","") == rf]
        if sf != "All Status":
            filtered = [u for u in filtered if u.get("status","") == sf]

        self._render(filtered)

    def _render(self, users):
        self.table.setRowCount(len(users))
        for row, u in enumerate(users):
            self.table.setRowHeight(row, 22)
            rc = ROLE_COLORS.get(u.get("role","User"), "#888")
            sc = STATUS_COLORS.get(u.get("status","pending"), "#888")

            name_item = QTableWidgetItem(u.get("name",""))
            name_item.setData(Qt.ItemDataRole.UserRole, u["id"])
            name_item.setForeground(QColor("#C0C0C0"))
            self.table.setItem(row, 0, name_item)

            self.table.setItem(row, 1, QTableWidgetItem(u.get("email","")))

            role_item = QTableWidgetItem(u.get("role",""))
            role_item.setForeground(QColor(rc))
            self.table.setItem(row, 2, role_item)

            self.table.setItem(row, 3, QTableWidgetItem(u.get("team","") or "—"))

            status_item = QTableWidgetItem(u.get("status",""))
            status_item.setForeground(QColor(sc))
            self.table.setItem(row, 4, status_item)

            self.table.setItem(row, 5, QTableWidgetItem(u.get("created_at","")[:10]))

        self.count_lbl.setText(f"{len(users)} users")

    def _on_select(self):
        row = self.table.currentRow()
        if row < 0:
            return
        uid = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        u = next((x for x in self.all_users if x["id"] == uid), None)
        if u:
            self.detail.load_user(u)

    def _get_selected(self):
        row = self.table.currentRow()
        if row < 0:
            return None
        uid = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        return next((x for x in self.all_users if x["id"] == uid), None)

    def _create_user(self):
        dlg = UserDialog(self.user, parent=self)
        if dlg.exec():
            self._load()

    def _edit_user(self):
        u = self._get_selected()
        if not u:
            QMessageBox.information(self, "Select", "Select a user first.")
            return
        dlg = UserDialog(self.user, edit_user=u, parent=self)
        if dlg.exec():
            self._load()

    def _quick_status(self, status):
        u = self._get_selected()
        if not u:
            return
        storage.update_user_status(u["id"], status)
        storage.log_activity("USER_STATUS", f"User {u['name']} → {status}", self.user["id"])
        self._load()

    def _delete_user(self):
        u = self._get_selected()
        if not u:
            return
        r = QMessageBox.question(self, "Delete User", f"Permanently delete '{u['name']}'?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            storage.delete_user(u["id"])
            storage.log_activity("USER_DELETE", f"User {u['name']} deleted", self.user["id"])
            self._load()
