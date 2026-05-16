"""
SR Manager - Settings Page
Company settings, roles management, backup/restore, activity log viewer
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QComboBox, QMessageBox, QTabWidget, QTextEdit,
    QScrollArea, QSpinBox, QCheckBox, QGroupBox, QFileDialog
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor
import sys, json, shutil
from datetime import datetime
from pathlib import Path
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage
import email_sender


class SettingsPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)

        title = QLabel("SETTINGS & ADMINISTRATION")
        title.setObjectName("PageTitle")
        layout.addWidget(title)

        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        self._build_general_tab()
        self._build_email_tab()
        self._build_report_tab()
        self._build_log_tab()
        if self.user.get("role") == "Admin":
            self._build_roles_tab()
            self._build_backup_tab()
            self._build_db_tab()

    # ── GENERAL ──────────────────────────────────────────────────────────────
    def _build_general_tab(self):
        tab = QWidget()
        tl = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(10)

        settings = storage.get_settings()

        def setting_row(label, widget):
            row = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(160)
            row.addWidget(lbl)
            row.addWidget(widget)
            tl.addLayout(row)

        self.company_name_input = QLineEdit(settings.get("company_name", ""))
        setting_row("COMPANY NAME", self.company_name_input)

        self.sr_prefix_input = QLineEdit(settings.get("sr_prefix", "SR"))
        self.sr_prefix_input.setFixedWidth(80)
        setting_row("SR NUMBER PREFIX", self.sr_prefix_input)

        self.sr_counter_input = QLineEdit(str(settings.get("sr_counter", 1000)))
        self.sr_counter_input.setFixedWidth(100)
        setting_row("SR COUNTER (current)", self.sr_counter_input)

        self.year_input = QLineEdit(str(settings.get("year", datetime.now().year)))
        self.year_input.setFixedWidth(80)
        setting_row("ACTIVE YEAR", self.year_input)

        tl.addSpacing(8)
        save_btn = QPushButton("SAVE SETTINGS")
        save_btn.setObjectName("PrimaryBtn")
        save_btn.setFixedWidth(160)
        save_btn.clicked.connect(self._save_general)
        tl.addWidget(save_btn)

        tl.addStretch()
        self.tabs.addTab(tab, "⚙  GENERAL")

    def _save_general(self):
        try:
            counter = int(self.sr_counter_input.text())
            year = int(self.year_input.text())
        except ValueError:
            QMessageBox.warning(self, "Error", "Counter and year must be numbers.")
            return
        storage.update_settings(
            company_name=self.company_name_input.text().strip(),
            sr_prefix=self.sr_prefix_input.text().strip() or "SR",
            sr_counter=counter,
            year=year,
        )
        storage.log_activity("SETTINGS_SAVE", "General settings updated", self.user["id"])
        QMessageBox.information(self, "Saved", "Settings saved successfully.")


    # ── EMAIL SETUP ──────────────────────────────────────────────────────────
    def _build_email_tab(self):
        tab = QWidget(); tl = QVBoxLayout(tab); tl.setContentsMargins(14, 14, 14, 14); tl.setSpacing(10)
        cfg = storage.get_email_settings()
        def row(label, widget):
            r = QHBoxLayout(); lbl = QLabel(label); lbl.setObjectName("FormLabel"); lbl.setFixedWidth(160); r.addWidget(lbl); r.addWidget(widget); tl.addLayout(r)
        self.email_sender_input = QLineEdit(cfg.get("sender_email", "")); row("SENDER EMAIL", self.email_sender_input)
        self.email_password_input = QLineEdit(cfg.get("password", "")); self.email_password_input.setEchoMode(QLineEdit.EchoMode.Password); row("APP PASSWORD", self.email_password_input)
        self.email_host_input = QLineEdit(cfg.get("smtp_host", "smtp.gmail.com")); row("SMTP HOST", self.email_host_input)
        self.email_port_input = QLineEdit(str(cfg.get("smtp_port", 465))); row("SMTP PORT", self.email_port_input)
        self.email_ssl_cb = QCheckBox("Use SSL"); self.email_ssl_cb.setChecked(cfg.get("use_ssl", True)); row("SSL", self.email_ssl_cb)
        self.email_tls_cb = QCheckBox("Use STARTTLS"); self.email_tls_cb.setChecked(cfg.get("use_tls", False)); row("TLS", self.email_tls_cb)
        self.email_display_input = QLineEdit(cfg.get("display_name", "")); row("DISPLAY NAME", self.email_display_input)
        self.email_test_input = QLineEdit(); self.email_test_input.setPlaceholderText("recipient@example.com"); row("TEST RECIPIENT", self.email_test_input)
        btns = QHBoxLayout(); save = QPushButton("SAVE EMAIL SETTINGS"); save.setObjectName("PrimaryBtn"); save.clicked.connect(self._save_email); btns.addWidget(save); test = QPushButton("SEND TEST EMAIL"); test.clicked.connect(self._test_email); btns.addWidget(test); btns.addStretch(); tl.addLayout(btns); tl.addStretch()
        self.tabs.addTab(tab, "✉  EMAIL SETUP")

    def _email_cfg_from_ui(self):
        return {"sender_email": self.email_sender_input.text().strip(), "password": self.email_password_input.text(),
                "smtp_host": self.email_host_input.text().strip() or "smtp.gmail.com", "smtp_port": int(self.email_port_input.text() or 465),
                "use_ssl": self.email_ssl_cb.isChecked(), "use_tls": self.email_tls_cb.isChecked(),
                "display_name": self.email_display_input.text().strip()}

    def _save_email(self):
        try: cfg = self._email_cfg_from_ui()
        except ValueError: QMessageBox.warning(self, "Error", "SMTP port must be numeric."); return
        storage.update_email_settings(cfg); storage.log_activity("EMAIL_SETTINGS", "Email settings updated", self.user["id"]); QMessageBox.information(self, "Saved", "Email settings saved.")

    def _test_email(self):
        try: cfg = self._email_cfg_from_ui()
        except ValueError: QMessageBox.warning(self, "Error", "SMTP port must be numeric."); return
        storage.update_email_settings(cfg)
        result = email_sender.send_email(cfg, self.email_test_input.text().strip(), "SR Manager test email", "This is a test email from SR Manager.")
        storage.log_communication("email", self.email_test_input.text().strip(), "TEST", "SR Manager test email", "This is a test email from SR Manager.", result.get("success"), result.get("error", ""), self.user["id"])
        if result.get("success"): QMessageBox.information(self, "Sent", "Test email sent successfully.")
        else: QMessageBox.warning(self, "Failed", result.get("error", "Unknown error"))

    # ── DAILY REPORT SETUP ───────────────────────────────────────────────────
    def _build_report_tab(self):
        tab = QWidget(); tl = QVBoxLayout(tab); tl.setContentsMargins(14, 14, 14, 14); tl.setSpacing(10)
        cfg = storage.get_report_settings()
        self.report_enabled_cb = QCheckBox("Enable daily WhatsApp report"); self.report_enabled_cb.setChecked(cfg.get("enabled", False)); tl.addWidget(self.report_enabled_cb)
        row = QHBoxLayout(); lbl = QLabel("SEND TIME"); lbl.setObjectName("FormLabel"); lbl.setFixedWidth(160); self.report_time_input = QLineEdit(cfg.get("time", "18:00")); row.addWidget(lbl); row.addWidget(self.report_time_input); tl.addLayout(row)
        row2 = QHBoxLayout(); lbl2 = QLabel("REPORT TEMPLATE"); lbl2.setObjectName("FormLabel"); lbl2.setFixedWidth(160); self.report_template_combo = QComboBox(); self.report_template_combo.addItem("-- Default report --", "")
        for t in storage.get_report_templates(): self.report_template_combo.addItem(t.get("name", ""), t.get("id"))
        idx = self.report_template_combo.findData(cfg.get("template_id", "")); self.report_template_combo.setCurrentIndex(idx if idx >= 0 else 0); row2.addWidget(lbl2); row2.addWidget(self.report_template_combo); tl.addLayout(row2)
        save = QPushButton("SAVE REPORT SETTINGS"); save.setObjectName("PrimaryBtn"); save.clicked.connect(self._save_report); tl.addWidget(save); tl.addStretch(); self.tabs.addTab(tab, "☷  DAILY REPORTS")

    def _save_report(self):
        storage.update_report_settings({"enabled": self.report_enabled_cb.isChecked(), "time": self.report_time_input.text().strip() or "18:00", "template_id": self.report_template_combo.currentData(), "include_total_sr": True, "include_pending_sr": True, "include_completed_sr": True, "include_user_activity": True, "include_failed_tasks": True})
        storage.log_activity("REPORT_SETTINGS", "Daily report settings updated", self.user["id"]); QMessageBox.information(self, "Saved", "Daily report settings saved.")

    # ── ROLES ─────────────────────────────────────────────────────────────────
    def _build_roles_tab(self):
        tab = QWidget()
        tl = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(8)

        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("SYSTEM ROLES"))
        toolbar.addStretch()

        btn_add = QPushButton("+ ADD ROLE")
        btn_add.setObjectName("PrimaryBtn")
        btn_add.clicked.connect(self._add_role)
        toolbar.addWidget(btn_add)

        btn_del = QPushButton("✕ DELETE")
        btn_del.setObjectName("DangerBtn")
        btn_del.clicked.connect(self._del_role)
        toolbar.addWidget(btn_del)
        tl.addLayout(toolbar)

        self.roles_table = QTableWidget()
        self.roles_table.setColumnCount(3)
        self.roles_table.setHorizontalHeaderLabels(["ID", "NAME", "PERMISSIONS"])
        self.roles_table.setColumnWidth(0, 60)
        self.roles_table.setColumnWidth(1, 120)
        self.roles_table.horizontalHeader().setStretchLastSection(True)
        self.roles_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.roles_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.roles_table.verticalHeader().setVisible(False)
        self.roles_table.setAlternatingRowColors(True)
        self.roles_table.setStyleSheet("alternate-background-color: #13131A;")
        tl.addWidget(self.roles_table)

        note = QLabel("Note: Default roles (Admin, Manager, Technical, User, Viewer) cannot be deleted.")
        note.setStyleSheet("color:#444; font-size:9px;")
        tl.addWidget(note)

        self._load_roles()
        self.tabs.addTab(tab, "🔐  ROLES")

    def _load_roles(self):
        db = storage.load_db()
        roles = db["roles"]
        self.roles_table.setRowCount(len(roles))
        default_ids = {"r1","r2","r3","r4","r5"}
        for row, r in enumerate(roles):
            self.roles_table.setRowHeight(row, 22)
            id_item = QTableWidgetItem(r["id"])
            id_item.setData(Qt.ItemDataRole.UserRole, r["id"])
            id_item.setForeground(QColor("#555"))
            self.roles_table.setItem(row, 0, id_item)
            name_item = QTableWidgetItem(r["name"])
            color = "#E05555" if r["id"] == "r1" else "#D4A800" if r["id"] == "r2" else "#5599FF" if r["id"] == "r3" else "#888"
            name_item.setForeground(QColor(color))
            self.roles_table.setItem(row, 1, name_item)
            perms = ", ".join(r.get("permissions", []))
            self.roles_table.setItem(row, 2, QTableWidgetItem(perms))

    def _add_role(self):
        dlg = QDialog(self)
        dlg.setWindowTitle("ADD ROLE")
        dlg.setObjectName("DialogBox")
        dlg.setMinimumWidth(380)
        layout = QVBoxLayout(dlg)
        layout.setContentsMargins(0, 0, 0, 0)
        tb = QLabel("  ADD CUSTOM ROLE")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)
        form = QWidget()
        fl = QVBoxLayout(form)
        fl.setContentsMargins(16, 14, 16, 14)
        fl.setSpacing(8)

        name_row = QHBoxLayout()
        name_lbl = QLabel("ROLE NAME")
        name_lbl.setObjectName("FormLabel")
        name_lbl.setFixedWidth(120)
        name_input = QLineEdit()
        name_input.setPlaceholderText("e.g. Field Engineer")
        name_row.addWidget(name_lbl)
        name_row.addWidget(name_input)
        fl.addLayout(name_row)

        perm_lbl = QLabel("PERMISSIONS (comma-separated)")
        perm_lbl.setObjectName("FormLabel")
        fl.addWidget(perm_lbl)
        perm_input = QLineEdit()
        perm_input.setPlaceholderText("sr, view_sr, update_sr, upload")
        fl.addWidget(perm_input)

        layout.addWidget(form)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(dlg.reject)
        btns.addWidget(cancel)
        save = QPushButton("CREATE ROLE")
        save.setObjectName("PrimaryBtn")
        layout.addLayout(btns)

        def do_save():
            name = name_input.text().strip()
            if not name:
                QMessageBox.warning(dlg, "Error", "Role name required.")
                return
            perms = [p.strip() for p in perm_input.text().split(",") if p.strip()]
            db = storage.load_db()
            db["roles"].append({
                "id": storage._uid(),
                "name": name,
                "permissions": perms,
            })
            storage.save_db(db)
            storage.log_activity("ROLE_CREATE", f"Role '{name}' created", self.user["id"])
            dlg.accept()

        save.clicked.connect(do_save)
        btns.addWidget(save)
        if dlg.exec():
            self._load_roles()

    def _del_role(self):
        row = self.roles_table.currentRow()
        if row < 0:
            return
        rid = self.roles_table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        if rid in {"r1","r2","r3","r4","r5"}:
            QMessageBox.warning(self, "Cannot Delete", "Default system roles cannot be deleted.")
            return
        r = QMessageBox.question(self, "Delete Role", "Delete this role?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            db = storage.load_db()
            db["roles"] = [x for x in db["roles"] if x["id"] != rid]
            storage.save_db(db)
            self._load_roles()

    # ── ACTIVITY LOG ──────────────────────────────────────────────────────────
    def _build_log_tab(self):
        tab = QWidget()
        tl = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(8)

        toolbar = QHBoxLayout()
        toolbar.addStretch()
        btn_refresh = QPushButton("↻ REFRESH")
        btn_refresh.clicked.connect(self._load_log)
        toolbar.addWidget(btn_refresh)
        btn_clear = QPushButton("🗑 CLEAR LOG")
        btn_clear.setObjectName("DangerBtn")
        btn_clear.clicked.connect(self._clear_log)
        toolbar.addWidget(btn_clear)
        tl.addLayout(toolbar)

        self.log_table = QTableWidget()
        self.log_table.setColumnCount(4)
        self.log_table.setHorizontalHeaderLabels(["TIME", "ACTION", "USER", "DESCRIPTION"])
        self.log_table.setColumnWidth(0, 90)
        self.log_table.setColumnWidth(1, 120)
        self.log_table.setColumnWidth(2, 80)
        self.log_table.horizontalHeader().setStretchLastSection(True)
        self.log_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.log_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.log_table.verticalHeader().setVisible(False)
        self.log_table.setAlternatingRowColors(True)
        self.log_table.setStyleSheet("alternate-background-color: #13131A;")
        tl.addWidget(self.log_table)

        self._load_log()
        self.tabs.addTab(tab, "📋  ACTIVITY LOG")

    def _load_log(self):
        logs = storage.get_activity_logs(200)
        self.log_table.setRowCount(len(logs))
        action_colors = {
            "LOGIN": "#00D4AA", "LOGOUT": "#555", "SR_CREATE": "#5599FF",
            "SR_CLOSE": "#D4A800", "SR_UPDATE": "#888", "USER_CREATE": "#D4A800",
            "USER_DELETE": "#E05555", "ROUTE_CREATE": "#AA55FF",
        }
        for row, log in enumerate(logs):
            self.log_table.setRowHeight(row, 20)
            self.log_table.setItem(row, 0, QTableWidgetItem(log["at"][11:19]))
            action_item = QTableWidgetItem(log["action"])
            action_item.setForeground(QColor(action_colors.get(log["action"], "#888")))
            self.log_table.setItem(row, 1, action_item)
            self.log_table.setItem(row, 2, QTableWidgetItem(log["user_id"]))
            self.log_table.setItem(row, 3, QTableWidgetItem(log["description"]))

    def _clear_log(self):
        r = QMessageBox.question(self, "Clear Log", "Clear all activity logs?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            db = storage.load_db()
            db["activity_logs"] = []
            storage.save_db(db)
            self._load_log()

    # ── BACKUP/RESTORE ────────────────────────────────────────────────────────
    def _build_backup_tab(self):
        tab = QWidget()
        tl = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(12)

        tl.addWidget(QLabel("BACKUP & RESTORE"))

        grp_backup = QGroupBox("BACKUP")
        bl = QVBoxLayout(grp_backup)
        bl.setSpacing(8)
        backup_desc = QLabel("Export the entire database to a JSON backup file.")
        backup_desc.setStyleSheet("color:#666; font-size:10px;")
        bl.addWidget(backup_desc)
        btn_backup = QPushButton("📦 EXPORT BACKUP")
        btn_backup.setObjectName("PrimaryBtn")
        btn_backup.setFixedWidth(180)
        btn_backup.clicked.connect(self._do_backup)
        bl.addWidget(btn_backup)
        tl.addWidget(grp_backup)

        grp_restore = QGroupBox("RESTORE")
        rl = QVBoxLayout(grp_restore)
        rl.setSpacing(8)
        restore_desc = QLabel("Import a previously exported backup file. Current data will be replaced.")
        restore_desc.setStyleSheet("color:#666; font-size:10px;")
        rl.addWidget(restore_desc)
        btn_restore = QPushButton("📂 IMPORT BACKUP")
        btn_restore.setObjectName("WarningBtn")
        btn_restore.setFixedWidth(180)
        btn_restore.clicked.connect(self._do_restore)
        rl.addWidget(btn_restore)
        tl.addWidget(grp_restore)

        tl.addStretch()
        self.tabs.addTab(tab, "💾  BACKUP")

    def _do_backup(self):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Backup", f"srmanager_backup_{ts}.json", "JSON Files (*.json)"
        )
        if path:
            db = storage.load_db()
            with open(path, "w") as f:
                json.dump(db, f, indent=2)
            storage.log_activity("BACKUP", f"Backup exported to {path}", self.user["id"])
            QMessageBox.information(self, "Backup", f"Backup saved to:\n{path}")

    def _do_restore(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Open Backup", "", "JSON Files (*.json)"
        )
        if not path:
            return
        r = QMessageBox.question(
            self, "Restore",
            "This will REPLACE all current data with the backup.\nAre you sure?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if r == QMessageBox.StandardButton.Yes:
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                storage.save_db(data)
                QMessageBox.information(self, "Restored", "Backup restored. Please restart the app.")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to restore: {e}")

    # ── DATABASE VIEWER ───────────────────────────────────────────────────────
    def _build_db_tab(self):
        tab = QWidget()
        tl = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(8)

        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("RAW DATABASE VIEWER"))
        toolbar.addStretch()

        btn_refresh = QPushButton("↻ REFRESH")
        btn_refresh.clicked.connect(self._load_db_view)
        toolbar.addWidget(btn_refresh)

        btn_reset = QPushButton("⚠ RESET DATABASE")
        btn_reset.setObjectName("DangerBtn")
        btn_reset.clicked.connect(self._reset_db)
        toolbar.addWidget(btn_reset)
        tl.addLayout(toolbar)

        self.db_view = QTextEdit()
        self.db_view.setReadOnly(True)
        self.db_view.setStyleSheet("font-family: Consolas; font-size:10px; color:#888; background:#0D0D12;")
        tl.addWidget(self.db_view)

        self._load_db_view()
        self.tabs.addTab(tab, "🗄  DATABASE")

    def _load_db_view(self):
        db = storage.load_db()
        # Summary only — not full raw dump (too large)
        summary = {
            "users": len(db["users"]),
            "sr_entries": len(db["sr_entries"]),
            "routes": len(db["routes"]),
            "pipelines": len(db["pipelines"]),
            "mail_templates": len(db["mail_templates"]),
            "whatsapp_templates": len(db["whatsapp_templates"]),
            "activity_logs": len(db["activity_logs"]),
            "roles": len(db["roles"]),
            "settings": db["settings"],
        }
        self.db_view.setPlainText(json.dumps(summary, indent=2))

    def _reset_db(self):
        r = QMessageBox.question(
            self, "RESET DATABASE",
            "⚠ WARNING: This will DELETE ALL DATA including users, SRs, routes, and templates.\n\n"
            "Are you absolutely sure?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if r != QMessageBox.StandardButton.Yes:
            return
        r2 = QMessageBox.question(
            self, "CONFIRM RESET",
            "Last chance — all data will be lost forever.\nProceed?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if r2 == QMessageBox.StandardButton.Yes:
            storage.save_db(storage.DEFAULT_DB)
            storage.log_activity("DB_RESET", "Database was reset to default", self.user["id"])
            QMessageBox.information(self, "Reset", "Database reset. Please restart the app.")
            self._load_db_view()
