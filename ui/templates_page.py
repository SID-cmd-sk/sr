"""
SR Manager - Templates Page
Mail and WhatsApp template management with variable preview
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QTextEdit, QComboBox, QMessageBox, QTabWidget,
    QSplitter, QScrollArea, QCheckBox
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

MAIL_VARS = [
    "{sr_number}", "{title}", "{status}", "{priority}",
    "{customer_name}", "{customer_contact}", "{assigned_to}",
    "{created_at}", "{updated_at}", "{description}",
    "{company_name}", "{current_stage}"
]


class MailTemplateDialog(QDialog):
    def __init__(self, user, template=None, parent=None):
        super().__init__(parent)
        self.user = user
        self.template = template
        self.setWindowTitle("MAIL TEMPLATE EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(600)
        self.setMinimumHeight(480)
        self._build_ui()
        if template:
            self._load(template)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  MAIL TEMPLATE EDITOR")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        content = QWidget()
        cl = QVBoxLayout(content)
        cl.setContentsMargins(16, 14, 16, 14)
        cl.setSpacing(8)

        def row(label, widget):
            r = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(80)
            r.addWidget(lbl)
            r.addWidget(widget)
            cl.addLayout(r)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Template name (internal)")
        row("NAME", self.name_input)

        self.subject_input = QLineEdit()
        self.subject_input.setPlaceholderText("Email subject — use {sr_number}, {title} etc.")
        row("SUBJECT", self.subject_input)

        # Variables helper
        var_row = QHBoxLayout()
        var_lbl = QLabel("VARIABLES")
        var_lbl.setObjectName("FormLabel")
        var_lbl.setFixedWidth(80)
        var_row.addWidget(var_lbl)
        for var in MAIL_VARS[:6]:
            btn = QPushButton(var)
            btn.setStyleSheet("font-size:9px; padding:1px 5px; color:#5599FF;")
            btn.clicked.connect(lambda _, v=var: self._insert_var(v))
            var_row.addWidget(btn)
        cl.addLayout(var_row)

        var_row2 = QHBoxLayout()
        var_row2.addSpacing(80)
        for var in MAIL_VARS[6:]:
            btn = QPushButton(var)
            btn.setStyleSheet("font-size:9px; padding:1px 5px; color:#5599FF;")
            btn.clicked.connect(lambda _, v=var: self._insert_var(v))
            var_row2.addWidget(btn)
        cl.addLayout(var_row2)

        body_lbl = QLabel("BODY")
        body_lbl.setObjectName("FormLabel")
        cl.addWidget(body_lbl)

        self.body_input = QTextEdit()
        self.body_input.setPlaceholderText(
            "Dear {customer_name},\n\nYour service request {sr_number} has been updated.\n\n"
            "Status: {status}\nPriority: {priority}\n\nRegards,\n{company_name}"
        )
        self.body_input.setMinimumHeight(180)
        cl.addWidget(self.body_input)

        layout.addWidget(content)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = QPushButton("SAVE TEMPLATE")
        save.setObjectName("PrimaryBtn")
        save.clicked.connect(self._save)
        btns.addWidget(save)
        layout.addLayout(btns)

    def _load(self, t):
        self.name_input.setText(t.get("name", ""))
        self.subject_input.setText(t.get("subject", ""))
        self.body_input.setPlainText(t.get("body", ""))

    def _insert_var(self, var):
        cursor = self.body_input.textCursor()
        cursor.insertText(var)

    def _save(self):
        name    = self.name_input.text().strip()
        subject = self.subject_input.text().strip()
        body    = self.body_input.toPlainText().strip()
        if not name or not subject:
            QMessageBox.warning(self, "Error", "Name and subject are required.")
            return
        if self.template:
            db = storage.load_db()
            for t in db["mail_templates"]:
                if t["id"] == self.template["id"]:
                    t["name"] = name
                    t["subject"] = subject
                    t["body"] = body
                    break
            storage.save_db(db)
            storage.log_activity("TEMPLATE_EDIT", f"Mail template '{name}' updated", self.user["id"])
        else:
            storage.create_mail_template(name, subject, body, self.user["id"])
        self.accept()


class WATemplateDialog(QDialog):
    def __init__(self, user, template=None, parent=None):
        super().__init__(parent)
        self.user = user
        self.template = template
        self.setWindowTitle("WHATSAPP TEMPLATE EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(520)
        self._build_ui()
        if template:
            self._load(template)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  WHATSAPP TEMPLATE EDITOR")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        content = QWidget()
        cl = QVBoxLayout(content)
        cl.setContentsMargins(16, 14, 16, 14)
        cl.setSpacing(8)

        def row(label, widget):
            r = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(80)
            r.addWidget(lbl)
            r.addWidget(widget)
            cl.addLayout(r)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Template name")
        row("NAME", self.name_input)

        var_row = QHBoxLayout()
        var_lbl = QLabel("VARIABLES")
        var_lbl.setObjectName("FormLabel")
        var_lbl.setFixedWidth(80)
        var_row.addWidget(var_lbl)
        for var in ["{sr_number}", "{title}", "{status}", "{customer_name}", "{priority}"]:
            btn = QPushButton(var)
            btn.setStyleSheet("font-size:9px; padding:1px 5px; color:#25D366;")
            btn.clicked.connect(lambda _, v=var: self._insert_var(v))
            var_row.addWidget(btn)
        cl.addLayout(var_row)

        msg_lbl = QLabel("MESSAGE")
        msg_lbl.setObjectName("FormLabel")
        cl.addWidget(msg_lbl)

        self.msg_input = QTextEdit()
        self.msg_input.setPlaceholderText(
            "🔔 *SR UPDATE*\n\nSR: {sr_number}\nTitle: {title}\nStatus: {status}\nPriority: {priority}\n\nCustomer: {customer_name}"
        )
        self.msg_input.setMinimumHeight(140)
        cl.addWidget(self.msg_input)

        layout.addWidget(content)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = QPushButton("SAVE TEMPLATE")
        save.setObjectName("PrimaryBtn")
        save.clicked.connect(self._save)
        btns.addWidget(save)
        layout.addLayout(btns)

    def _load(self, t):
        self.name_input.setText(t.get("name", ""))
        self.msg_input.setPlainText(t.get("message", ""))

    def _insert_var(self, var):
        cursor = self.msg_input.textCursor()
        cursor.insertText(var)

    def _save(self):
        name = self.name_input.text().strip()
        msg  = self.msg_input.toPlainText().strip()
        if not name or not msg:
            QMessageBox.warning(self, "Error", "Name and message are required.")
            return
        if self.template:
            db = storage.load_db()
            for t in db["whatsapp_templates"]:
                if t["id"] == self.template["id"]:
                    t["name"] = name
                    t["message"] = msg
                    break
            storage.save_db(db)
            storage.log_activity("TEMPLATE_EDIT", f"WA template '{name}' updated", self.user["id"])
        else:
            storage.create_whatsapp_template(name, msg, self.user["id"])
        self.accept()


class TemplatesPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build_ui()
        self._load_all()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)

        title = QLabel("TEMPLATES")
        title.setObjectName("PageTitle")
        layout.addWidget(title)

        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        # Mail templates tab
        mail_tab = QWidget()
        ml = QVBoxLayout(mail_tab)
        ml.setContentsMargins(0, 8, 0, 0)
        ml.setSpacing(6)

        mail_toolbar = QHBoxLayout()
        mail_toolbar.addStretch()
        btn_new_mail = QPushButton("+ NEW MAIL TEMPLATE")
        btn_new_mail.setObjectName("PrimaryBtn")
        btn_new_mail.clicked.connect(self._new_mail)
        mail_toolbar.addWidget(btn_new_mail)
        ml.addLayout(mail_toolbar)

        self.mail_table = self._make_template_table(["NAME", "SUBJECT", "CREATED"])
        ml.addWidget(self.mail_table)

        mail_act = QHBoxLayout()
        btn_edit_mail = QPushButton("✎ EDIT")
        btn_edit_mail.clicked.connect(self._edit_mail)
        mail_act.addWidget(btn_edit_mail)
        btn_preview_mail = QPushButton("👁 PREVIEW")
        btn_preview_mail.clicked.connect(self._preview_mail)
        mail_act.addWidget(btn_preview_mail)
        btn_dup_mail = QPushButton("⧉ DUPLICATE")
        btn_dup_mail.clicked.connect(lambda: self._duplicate_template("email"))
        mail_act.addWidget(btn_dup_mail)
        btn_toggle_mail = QPushButton("⏻ ENABLE/DISABLE")
        btn_toggle_mail.clicked.connect(lambda: self._toggle_template("email"))
        mail_act.addWidget(btn_toggle_mail)
        btn_del_mail = QPushButton("✕ DELETE")
        btn_del_mail.setObjectName("DangerBtn")
        btn_del_mail.clicked.connect(self._delete_mail)
        mail_act.addWidget(btn_del_mail)
        mail_act.addStretch()
        ml.addLayout(mail_act)

        # Preview pane
        mail_preview_lbl = QLabel("PREVIEW")
        mail_preview_lbl.setObjectName("FormLabel")
        ml.addWidget(mail_preview_lbl)
        self.mail_preview = QTextEdit()
        self.mail_preview.setReadOnly(True)
        self.mail_preview.setFixedHeight(120)
        self.mail_preview.setStyleSheet("color:#888; font-size:10px;")
        ml.addWidget(self.mail_preview)

        self.mail_table.itemSelectionChanged.connect(self._on_mail_select)
        self.tabs.addTab(mail_tab, "✉  MAIL TEMPLATES")

        # WhatsApp templates tab
        wa_tab = QWidget()
        wl = QVBoxLayout(wa_tab)
        wl.setContentsMargins(0, 8, 0, 0)
        wl.setSpacing(6)

        wa_toolbar = QHBoxLayout()
        wa_toolbar.addStretch()
        btn_new_wa = QPushButton("+ NEW WHATSAPP TEMPLATE")
        btn_new_wa.setObjectName("PrimaryBtn")
        btn_new_wa.clicked.connect(self._new_wa)
        wa_toolbar.addWidget(btn_new_wa)
        wl.addLayout(wa_toolbar)

        self.wa_table = self._make_template_table(["NAME", "MESSAGE PREVIEW", "CREATED"])
        wl.addWidget(self.wa_table)

        wa_act = QHBoxLayout()
        btn_edit_wa = QPushButton("✎ EDIT")
        btn_edit_wa.clicked.connect(self._edit_wa)
        wa_act.addWidget(btn_edit_wa)
        btn_dup_wa = QPushButton("⧉ DUPLICATE")
        btn_dup_wa.clicked.connect(lambda: self._duplicate_template("whatsapp"))
        wa_act.addWidget(btn_dup_wa)
        btn_toggle_wa = QPushButton("⏻ ENABLE/DISABLE")
        btn_toggle_wa.clicked.connect(lambda: self._toggle_template("whatsapp"))
        wa_act.addWidget(btn_toggle_wa)
        btn_del_wa = QPushButton("✕ DELETE")
        btn_del_wa.setObjectName("DangerBtn")
        btn_del_wa.clicked.connect(self._delete_wa)
        wa_act.addWidget(btn_del_wa)
        wa_act.addStretch()
        wl.addLayout(wa_act)

        wa_preview_lbl = QLabel("PREVIEW")
        wa_preview_lbl.setObjectName("FormLabel")
        wl.addWidget(wa_preview_lbl)
        self.wa_preview = QTextEdit()
        self.wa_preview.setReadOnly(True)
        self.wa_preview.setFixedHeight(120)
        self.wa_preview.setStyleSheet("color:#25D366; font-size:10px; background:#0a1a0a;")
        wl.addWidget(self.wa_preview)

        self.wa_table.itemSelectionChanged.connect(self._on_wa_select)
        self.tabs.addTab(wa_tab, "💬  WHATSAPP TEMPLATES")

        # Route templates tab (read/manage saved workflow routes as templates)
        route_tab = QWidget(); rl = QVBoxLayout(route_tab); rl.setContentsMargins(0, 8, 0, 0)
        self.route_table = self._make_template_table(["NAME", "STEPS", "ACTIVE"])
        rl.addWidget(self.route_table)
        route_act = QHBoxLayout()
        btn_dup_route = QPushButton("⧉ DUPLICATE ROUTE")
        btn_dup_route.clicked.connect(self._duplicate_route)
        route_act.addWidget(btn_dup_route)
        route_act.addStretch(); rl.addLayout(route_act)
        self.tabs.addTab(route_tab, "⟲  ROUTE TEMPLATES")

        # Daily report templates tab
        report_tab = QWidget(); rpl = QVBoxLayout(report_tab); rpl.setContentsMargins(0, 8, 0, 0)
        rpt_toolbar = QHBoxLayout(); rpt_toolbar.addStretch(); btn_new_report = QPushButton("+ NEW REPORT TEMPLATE"); btn_new_report.setObjectName("PrimaryBtn"); btn_new_report.clicked.connect(self._new_report); rpt_toolbar.addWidget(btn_new_report); rpl.addLayout(rpt_toolbar)
        self.report_table = self._make_template_table(["NAME", "PREVIEW", "CREATED"])
        rpl.addWidget(self.report_table)
        report_act = QHBoxLayout()
        btn_edit_report = QPushButton("✎ EDIT"); btn_edit_report.clicked.connect(self._edit_report); report_act.addWidget(btn_edit_report)
        btn_dup_report = QPushButton("⧉ DUPLICATE"); btn_dup_report.clicked.connect(lambda: self._duplicate_template("report")); report_act.addWidget(btn_dup_report)
        btn_toggle_report = QPushButton("⏻ ENABLE/DISABLE"); btn_toggle_report.clicked.connect(lambda: self._toggle_template("report")); report_act.addWidget(btn_toggle_report)
        report_act.addStretch(); rpl.addLayout(report_act)
        self.report_preview = QTextEdit(); self.report_preview.setReadOnly(True); self.report_preview.setFixedHeight(100); rpl.addWidget(self.report_preview)
        self.report_table.itemSelectionChanged.connect(self._on_report_select)
        self.tabs.addTab(report_tab, "☷  DAILY REPORT TEMPLATES")

        self.mail_templates = []
        self.wa_templates   = []
        self.report_templates = []

    def _make_template_table(self, headers):
        t = QTableWidget()
        t.setColumnCount(len(headers))
        t.setHorizontalHeaderLabels(headers)
        t.setColumnWidth(0, 160)
        t.setColumnWidth(1, 260)
        t.horizontalHeader().setStretchLastSection(True)
        t.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        t.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        t.verticalHeader().setVisible(False)
        t.setAlternatingRowColors(True)
        t.setStyleSheet("alternate-background-color: #13131A;")
        return t

    def _load_all(self):
        self.mail_templates = storage.get_mail_templates()
        self.mail_table.setRowCount(len(self.mail_templates))
        for row, t in enumerate(self.mail_templates):
            self.mail_table.setRowHeight(row, 22)
            name_item = QTableWidgetItem(t["name"])
            name_item.setData(Qt.ItemDataRole.UserRole, t["id"])
            name_item.setForeground(QColor("#C0C0C0"))
            self.mail_table.setItem(row, 0, name_item)
            self.mail_table.setItem(row, 1, QTableWidgetItem(t.get("subject", "")[:50]))
            self.mail_table.setItem(row, 2, QTableWidgetItem(("✓ " if t.get("enabled", True) else "✗ ") + t.get("created_at", "")[:10]))

        self.wa_templates = storage.get_whatsapp_templates()
        self.wa_table.setRowCount(len(self.wa_templates))
        for row, t in enumerate(self.wa_templates):
            self.wa_table.setRowHeight(row, 22)
            name_item = QTableWidgetItem(t["name"])
            name_item.setData(Qt.ItemDataRole.UserRole, t["id"])
            name_item.setForeground(QColor("#25D366"))
            self.wa_table.setItem(row, 0, name_item)
            preview = t.get("message", "").replace("\n", " ")[:60]
            self.wa_table.setItem(row, 1, QTableWidgetItem(preview))
            self.wa_table.setItem(row, 2, QTableWidgetItem(("✓ " if t.get("enabled", True) else "✗ ") + t.get("created_at", "")[:10]))

        routes = storage.get_routes()
        self.route_table.setRowCount(len(routes))
        for row, r in enumerate(routes):
            item = QTableWidgetItem(r.get("name", "")); item.setData(Qt.ItemDataRole.UserRole, r.get("id"))
            self.route_table.setItem(row, 0, item)
            self.route_table.setItem(row, 1, QTableWidgetItem(str(len(r.get("steps", [])))))
            self.route_table.setItem(row, 2, QTableWidgetItem("✓" if r.get("active", True) else "✗"))

        self.report_templates = storage.get_report_templates()
        self.report_table.setRowCount(len(self.report_templates))
        for row, t in enumerate(self.report_templates):
            item = QTableWidgetItem(t.get("name", "")); item.setData(Qt.ItemDataRole.UserRole, t.get("id"))
            self.report_table.setItem(row, 0, item)
            self.report_table.setItem(row, 1, QTableWidgetItem(t.get("body", "").replace("\n", " ")[:60]))
            self.report_table.setItem(row, 2, QTableWidgetItem(("✓ " if t.get("enabled", True) else "✗ ") + t.get("created_at", "")[:10]))

    def _on_mail_select(self):
        row = self.mail_table.currentRow()
        if row < 0: return
        tid = self.mail_table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        t = next((x for x in self.mail_templates if x["id"] == tid), None)
        if t:
            self.mail_preview.setPlainText(f"Subject: {t.get('subject','')}\n\n{t.get('body','')}")

    def _on_wa_select(self):
        row = self.wa_table.currentRow()
        if row < 0: return
        tid = self.wa_table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        t = next((x for x in self.wa_templates if x["id"] == tid), None)
        if t:
            self.wa_preview.setPlainText(t.get("message", ""))

    def _get_selected_mail(self):
        row = self.mail_table.currentRow()
        if row < 0: return None
        tid = self.mail_table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        return next((x for x in self.mail_templates if x["id"] == tid), None)

    def _get_selected_wa(self):
        row = self.wa_table.currentRow()
        if row < 0: return None
        tid = self.wa_table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        return next((x for x in self.wa_templates if x["id"] == tid), None)

    def _new_mail(self):
        dlg = MailTemplateDialog(self.user, parent=self)
        if dlg.exec(): self._load_all()

    def _edit_mail(self):
        t = self._get_selected_mail()
        if not t:
            QMessageBox.information(self, "Select", "Select a template first.")
            return
        dlg = MailTemplateDialog(self.user, template=t, parent=self)
        if dlg.exec(): self._load_all()

    def _preview_mail(self):
        t = self._get_selected_mail()
        if not t: return
        sample = {
            "{sr_number}": "SR-1001", "{title}": "Sample SR",
            "{status}": "In Progress", "{priority}": "High",
            "{customer_name}": "John Doe", "{customer_contact}": "+1 555-0100",
            "{assigned_to}": "Tech User", "{created_at}": "2026-01-01 10:00",
            "{updated_at}": "2026-01-02 14:30", "{description}": "Sample description",
            "{company_name}": "SR Manager Co.", "{current_stage}": "2",
        }
        body = t.get("body", "")
        for k, v in sample.items():
            body = body.replace(k, v)
        self.mail_preview.setPlainText(f"Subject: {t.get('subject','')}\n\n{body}")

    def _delete_mail(self):
        t = self._get_selected_mail()
        if not t: return
        r = QMessageBox.question(self, "Delete", f"Delete template '{t['name']}'?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            db = storage.load_db()
            db["mail_templates"] = [x for x in db["mail_templates"] if x["id"] != t["id"]]
            storage.save_db(db)
            self._load_all()

    def _new_wa(self):
        dlg = WATemplateDialog(self.user, parent=self)
        if dlg.exec(): self._load_all()

    def _edit_wa(self):
        t = self._get_selected_wa()
        if not t:
            QMessageBox.information(self, "Select", "Select a template first.")
            return
        dlg = WATemplateDialog(self.user, template=t, parent=self)
        if dlg.exec(): self._load_all()

    def _delete_wa(self):
        t = self._get_selected_wa()
        if not t: return
        r = QMessageBox.question(self, "Delete", f"Delete template '{t['name']}'?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            db = storage.load_db()
            db["whatsapp_templates"] = [x for x in db["whatsapp_templates"] if x["id"] != t["id"]]
            storage.save_db(db)
            self._load_all()


class ReportTemplateDialog(QDialog):
    def __init__(self, user, template=None, parent=None):
        super().__init__(parent); self.user=user; self.template=template; self.setWindowTitle("REPORT TEMPLATE EDITOR"); self.setObjectName("DialogBox"); self.setMinimumWidth(520); self._build_ui();
        if template: self.name_input.setText(template.get("name", "")); self.body_input.setPlainText(template.get("body", ""))
    def _build_ui(self):
        layout=QVBoxLayout(self); title=QLabel("  DAILY REPORT TEMPLATE EDITOR"); title.setObjectName("DialogTitle"); layout.addWidget(title)
        self.name_input=QLineEdit(); self.name_input.setPlaceholderText("Template name"); layout.addWidget(self.name_input)
        self.body_input=QTextEdit(); self.body_input.setPlaceholderText("Daily report body with {date}, {total_sr}, {pending_sr}, {completed_sr}, {failed_tasks}"); self.body_input.setMinimumHeight(180); layout.addWidget(self.body_input)
        row=QHBoxLayout(); row.addStretch(); cancel=QPushButton("CANCEL"); cancel.clicked.connect(self.reject); row.addWidget(cancel); save=QPushButton("SAVE"); save.setObjectName("PrimaryBtn"); save.clicked.connect(self._save); row.addWidget(save); layout.addLayout(row)
    def _save(self):
        name=self.name_input.text().strip(); body=self.body_input.toPlainText().strip()
        if not name or not body: QMessageBox.warning(self,"Error","Name and body are required."); return
        if self.template: storage.update_template("report", self.template["id"], name=name, body=body)
        else: storage.create_report_template(name, body, self.user["id"])
        self.accept()

def _templates_get_selected_report(self):
    row=self.report_table.currentRow()
    if row<0: return None
    tid=self.report_table.item(row,0).data(Qt.ItemDataRole.UserRole)
    return next((x for x in self.report_templates if x["id"]==tid), None)

def _templates_on_report_select(self):
    t=self._get_selected_report()
    if t: self.report_preview.setPlainText(t.get("body", ""))

def _templates_new_report(self):
    dlg=ReportTemplateDialog(self.user, parent=self)
    if dlg.exec(): self._load_all()

def _templates_edit_report(self):
    t=self._get_selected_report()
    if not t: return
    dlg=ReportTemplateDialog(self.user, t, self)
    if dlg.exec(): self._load_all()

def _templates_duplicate_template(self, kind):
    t = self._get_selected_mail() if kind=="email" else self._get_selected_wa() if kind=="whatsapp" else self._get_selected_report()
    if t: storage.duplicate_template(kind, t["id"], self.user["id"]); self._load_all()

def _templates_toggle_template(self, kind):
    t = self._get_selected_mail() if kind=="email" else self._get_selected_wa() if kind=="whatsapp" else self._get_selected_report()
    if t: storage.update_template(kind, t["id"], enabled=not t.get("enabled", True)); self._load_all()

def _templates_duplicate_route(self):
    row=self.route_table.currentRow()
    if row<0: return
    rid=self.route_table.item(row,0).data(Qt.ItemDataRole.UserRole)
    route=next((r for r in storage.get_routes() if r.get("id")==rid), None)
    if route:
        storage.create_route(route.get("name", "Route") + " Copy", route.get("description", ""), [dict(s) for s in route.get("steps", [])], self.user["id"], connections=[dict(c) for c in route.get("connections", [])])
        self._load_all()

TemplatesPage._get_selected_report = _templates_get_selected_report
TemplatesPage._on_report_select = _templates_on_report_select
TemplatesPage._new_report = _templates_new_report
TemplatesPage._edit_report = _templates_edit_report
TemplatesPage._duplicate_template = _templates_duplicate_template
TemplatesPage._toggle_template = _templates_toggle_template
TemplatesPage._duplicate_route = _templates_duplicate_route
