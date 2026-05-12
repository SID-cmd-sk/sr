"""
SR Manager - Route Management Page
Create/edit routes with configurable steps (mail, approval, skip options)
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QTextEdit, QComboBox, QMessageBox, QSplitter,
    QScrollArea, QCheckBox, QSpinBox, QGroupBox, QListWidget,
    QListWidgetItem, QAbstractItemView
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor
import sys, json
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage


STEP_TYPES = ["Approval", "Mail Trigger", "WhatsApp Trigger", "Upload Required",
              "Customer Signoff", "Engineer Visit", "Manager Review", "Auto Close"]


class StepEditorDialog(QDialog):
    def __init__(self, step=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("STEP EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(420)
        self.step = step or {}
        self._build_ui()
        if step:
            self._load_step(step)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        title_bar = QLabel("  CONFIGURE STEP")
        title_bar.setObjectName("DialogTitle")
        layout.addWidget(title_bar)

        form = QWidget()
        form.setContentsMargins(16, 14, 16, 14)
        fl = QVBoxLayout(form)
        fl.setSpacing(8)

        def row(label, widget):
            r = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(120)
            r.addWidget(lbl)
            r.addWidget(widget)
            fl.addLayout(r)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Step name")
        row("STEP NAME", self.name_input)

        self.type_combo = QComboBox()
        self.type_combo.addItems(STEP_TYPES)
        row("TYPE", self.type_combo)

        self.required_cb = QCheckBox("Required (cannot be skipped)")
        fl.addWidget(self.required_cb)

        self.skippable_cb = QCheckBox("Skippable by Manager")
        fl.addWidget(self.skippable_cb)

        self.mail_cb = QCheckBox("Triggers Mail on completion")
        fl.addWidget(self.mail_cb)

        self.whatsapp_cb = QCheckBox("Triggers WhatsApp on completion")
        fl.addWidget(self.whatsapp_cb)

        self.approval_cb = QCheckBox("Requires Approval before advancing")
        fl.addWidget(self.approval_cb)

        self.approval_role = QComboBox()
        self.approval_role.addItems(["Manager", "Admin", "Any"])
        row("APPROVED BY", self.approval_role)

        self.notes_input = QTextEdit()
        self.notes_input.setFixedHeight(50)
        self.notes_input.setPlaceholderText("Step notes / instructions...")

        notes_lbl = QLabel("NOTES")
        notes_lbl.setObjectName("FormLabel")
        fl.addWidget(notes_lbl)
        fl.addWidget(self.notes_input)

        layout.addWidget(form)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        ok = QPushButton("SAVE STEP")
        ok.setObjectName("PrimaryBtn")
        ok.clicked.connect(self._save)
        btns.addWidget(ok)
        layout.addLayout(btns)

    def _load_step(self, step):
        self.name_input.setText(step.get("name", ""))
        idx = self.type_combo.findText(step.get("type", "Approval"))
        if idx >= 0:
            self.type_combo.setCurrentIndex(idx)
        self.required_cb.setChecked(step.get("required", False))
        self.skippable_cb.setChecked(step.get("skippable", False))
        self.mail_cb.setChecked(step.get("triggers_mail", False))
        self.whatsapp_cb.setChecked(step.get("triggers_whatsapp", False))
        self.approval_cb.setChecked(step.get("needs_approval", False))
        idx2 = self.approval_role.findText(step.get("approval_role", "Manager"))
        if idx2 >= 0:
            self.approval_role.setCurrentIndex(idx2)
        self.notes_input.setPlainText(step.get("notes", ""))

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Error", "Step name is required.")
            return
        self.result_step = {
            "name": name,
            "type": self.type_combo.currentText(),
            "required": self.required_cb.isChecked(),
            "skippable": self.skippable_cb.isChecked(),
            "triggers_mail": self.mail_cb.isChecked(),
            "triggers_whatsapp": self.whatsapp_cb.isChecked(),
            "needs_approval": self.approval_cb.isChecked(),
            "approval_role": self.approval_role.currentText(),
            "notes": self.notes_input.toPlainText().strip(),
        }
        self.accept()


class RouteEditorDialog(QDialog):
    def __init__(self, user, route=None, parent=None):
        super().__init__(parent)
        self.user = user
        self.route = route
        self.steps = list(route["steps"]) if route else []
        self.setWindowTitle("ROUTE EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(600)
        self.setMinimumHeight(500)
        self._build_ui()
        if route:
            self._load_route(route)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        title_bar = QLabel("  ROUTE EDITOR")
        title_bar.setObjectName("DialogTitle")
        layout.addWidget(title_bar)

        content = QWidget()
        cl = QVBoxLayout(content)
        cl.setContentsMargins(16, 14, 16, 14)
        cl.setSpacing(8)

        # Name & desc
        name_row = QHBoxLayout()
        lbl_name = QLabel("ROUTE NAME")
        lbl_name.setObjectName("FormLabel")
        lbl_name.setFixedWidth(100)
        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Route name")
        name_row.addWidget(lbl_name)
        name_row.addWidget(self.name_input)
        cl.addLayout(name_row)

        desc_row = QHBoxLayout()
        lbl_desc = QLabel("DESCRIPTION")
        lbl_desc.setObjectName("FormLabel")
        lbl_desc.setFixedWidth(100)
        self.desc_input = QLineEdit()
        self.desc_input.setPlaceholderText("Optional description")
        desc_row.addWidget(lbl_desc)
        desc_row.addWidget(self.desc_input)
        cl.addLayout(desc_row)

        # Steps section
        step_hdr = QHBoxLayout()
        steps_lbl = QLabel("STEPS")
        steps_lbl.setObjectName("FormLabel")
        step_hdr.addWidget(steps_lbl)
        step_hdr.addStretch()

        btn_add_step = QPushButton("+ ADD STEP")
        btn_add_step.setObjectName("PrimaryBtn")
        btn_add_step.clicked.connect(self._add_step)
        step_hdr.addWidget(btn_add_step)

        btn_edit_step = QPushButton("✎ EDIT")
        btn_edit_step.clicked.connect(self._edit_step)
        step_hdr.addWidget(btn_edit_step)

        btn_del_step = QPushButton("✕ REMOVE")
        btn_del_step.setObjectName("DangerBtn")
        btn_del_step.clicked.connect(self._remove_step)
        step_hdr.addWidget(btn_del_step)

        btn_up = QPushButton("↑")
        btn_up.setFixedWidth(30)
        btn_up.clicked.connect(self._move_up)
        step_hdr.addWidget(btn_up)

        btn_dn = QPushButton("↓")
        btn_dn.setFixedWidth(30)
        btn_dn.clicked.connect(self._move_down)
        step_hdr.addWidget(btn_dn)

        cl.addLayout(step_hdr)

        # Step list
        self.step_list = QTableWidget()
        self.step_list.setColumnCount(7)
        self.step_list.setHorizontalHeaderLabels(["#", "NAME", "TYPE", "REQ", "SKIP", "MAIL", "APPROVAL"])
        self.step_list.setColumnWidth(0, 28)
        self.step_list.setColumnWidth(1, 140)
        self.step_list.setColumnWidth(2, 120)
        self.step_list.setColumnWidth(3, 35)
        self.step_list.setColumnWidth(4, 38)
        self.step_list.setColumnWidth(5, 38)
        self.step_list.setColumnWidth(6, 70)
        self.step_list.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.step_list.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.step_list.verticalHeader().setVisible(False)
        self.step_list.setMinimumHeight(200)
        cl.addWidget(self.step_list)

        layout.addWidget(content)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = QPushButton("SAVE ROUTE")
        save.setObjectName("PrimaryBtn")
        save.clicked.connect(self._save)
        btns.addWidget(save)
        layout.addLayout(btns)

        self._refresh_steps()

    def _load_route(self, route):
        self.name_input.setText(route["name"])
        self.desc_input.setText(route.get("description", ""))

    def _refresh_steps(self):
        self.step_list.setRowCount(len(self.steps))
        for i, step in enumerate(self.steps):
            self.step_list.setRowHeight(i, 22)
            self.step_list.setItem(i, 0, QTableWidgetItem(str(i + 1)))
            self.step_list.setItem(i, 1, QTableWidgetItem(step["name"]))
            self.step_list.setItem(i, 2, QTableWidgetItem(step["type"]))
            self.step_list.setItem(i, 3, QTableWidgetItem("✓" if step.get("required") else ""))
            self.step_list.setItem(i, 4, QTableWidgetItem("✓" if step.get("skippable") else ""))
            mail_item = QTableWidgetItem("✓" if step.get("triggers_mail") else "")
            if step.get("triggers_mail"):
                mail_item.setForeground(QColor("#00D4AA"))
            self.step_list.setItem(i, 5, mail_item)
            self.step_list.setItem(i, 6, QTableWidgetItem(step.get("approval_role", "") if step.get("needs_approval") else ""))

    def _add_step(self):
        dlg = StepEditorDialog(parent=self)
        if dlg.exec():
            self.steps.append(dlg.result_step)
            self._refresh_steps()

    def _edit_step(self):
        row = self.step_list.currentRow()
        if row < 0:
            return
        dlg = StepEditorDialog(step=self.steps[row], parent=self)
        if dlg.exec():
            self.steps[row] = dlg.result_step
            self._refresh_steps()

    def _remove_step(self):
        row = self.step_list.currentRow()
        if row < 0:
            return
        self.steps.pop(row)
        self._refresh_steps()

    def _move_up(self):
        row = self.step_list.currentRow()
        if row > 0:
            self.steps[row], self.steps[row - 1] = self.steps[row - 1], self.steps[row]
            self._refresh_steps()
            self.step_list.selectRow(row - 1)

    def _move_down(self):
        row = self.step_list.currentRow()
        if row < len(self.steps) - 1:
            self.steps[row], self.steps[row + 1] = self.steps[row + 1], self.steps[row]
            self._refresh_steps()
            self.step_list.selectRow(row + 1)

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Error", "Route name is required.")
            return
        if self.route:
            storage.update_route(self.route["id"], name=name,
                                  description=self.desc_input.text().strip(),
                                  steps=self.steps)
            storage.log_activity("ROUTE_UPDATE", f"Route '{name}' updated", self.user["id"])
        else:
            storage.create_route(name, self.desc_input.text().strip(), self.steps, self.user["id"])
        self.accept()


class RouteDetailPanel(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self.current_route = None
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        hdr = QLabel("  ROUTE DETAILS")
        hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;")
        layout.addWidget(hdr)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        self.inner = QWidget()
        il = QVBoxLayout(self.inner)
        il.setContentsMargins(10, 10, 10, 10)
        il.setSpacing(6)

        self.name_lbl = QLabel("Select a route")
        self.name_lbl.setStyleSheet("color:#00D4AA; font-size:13px; font-weight:bold;")
        il.addWidget(self.name_lbl)

        self.desc_lbl = QLabel("")
        self.desc_lbl.setStyleSheet("color:#888; font-size:10px;")
        il.addWidget(self.desc_lbl)

        self.meta_lbl = QLabel("")
        self.meta_lbl.setStyleSheet("color:#555; font-size:10px;")
        il.addWidget(self.meta_lbl)

        sep = QFrame(); sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("color:#1E1E28;"); il.addWidget(sep)

        steps_lbl = QLabel("STEPS")
        steps_lbl.setObjectName("FormLabel")
        il.addWidget(steps_lbl)

        self.steps_widget = QWidget()
        self.steps_layout = QVBoxLayout(self.steps_widget)
        self.steps_layout.setContentsMargins(0, 0, 0, 0)
        self.steps_layout.setSpacing(3)
        il.addWidget(self.steps_widget)

        il.addStretch()
        scroll.setWidget(self.inner)
        layout.addWidget(scroll)

    def load_route(self, route):
        self.current_route = route
        self.name_lbl.setText(route["name"])
        self.desc_lbl.setText(route.get("description", ""))
        self.meta_lbl.setText(f"ID: {route['id']}  |  Steps: {len(route['steps'])}  |  Created: {route['created_at'][:10]}")

        for i in reversed(range(self.steps_layout.count())):
            w = self.steps_layout.itemAt(i).widget()
            if w:
                w.deleteLater()

        for i, step in enumerate(route["steps"]):
            flags = []
            if step.get("required"):
                flags.append("REQ")
            if step.get("skippable"):
                flags.append("SKIP")
            if step.get("triggers_mail"):
                flags.append("MAIL")
            if step.get("triggers_whatsapp"):
                flags.append("WA")
            if step.get("needs_approval"):
                flags.append(f"APPR:{step.get('approval_role','')}")

            flag_str = "  [" + " | ".join(flags) + "]" if flags else ""
            step_lbl = QLabel(f"  {i+1}. {step['name']}  •  {step['type']}{flag_str}")
            color = "#00D4AA" if step.get("triggers_mail") else "#888"
            step_lbl.setStyleSheet(
                f"color:{color}; font-size:10px; padding:3px 6px; "
                f"border-left:2px solid #252530; background:#111116; margin:1px 0;"
            )
            self.steps_layout.addWidget(step_lbl)

            if step.get("notes"):
                note_lbl = QLabel(f"    ↳ {step['notes']}")
                note_lbl.setStyleSheet("color:#444; font-size:9px; padding:1px 6px;")
                self.steps_layout.addWidget(note_lbl)


class RoutePage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build_ui()
        self._load_routes()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)

        toolbar = QHBoxLayout()
        title = QLabel("ROUTE MANAGEMENT")
        title.setObjectName("PageTitle")
        toolbar.addWidget(title)
        toolbar.addStretch()

        self.search_bar = QLineEdit()
        self.search_bar.setObjectName("SearchBar")
        self.search_bar.setPlaceholderText("Search routes...")
        self.search_bar.textChanged.connect(self._filter)
        toolbar.addWidget(self.search_bar)

        btn_new = QPushButton("+ NEW ROUTE")
        btn_new.setObjectName("PrimaryBtn")
        btn_new.clicked.connect(self._new_route)
        toolbar.addWidget(btn_new)

        layout.addLayout(toolbar)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Route table
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        ll.setSpacing(4)

        self.table = QTableWidget()
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(["NAME", "STEPS", "ACTIVE", "CREATED"])
        self.table.setColumnWidth(0, 180)
        self.table.setColumnWidth(1, 55)
        self.table.setColumnWidth(2, 50)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setStyleSheet("alternate-background-color: #13131A;")
        self.table.itemSelectionChanged.connect(self._on_select)
        ll.addWidget(self.table)

        # Action buttons
        act_row = QHBoxLayout()
        btn_edit = QPushButton("✎ EDIT")
        btn_edit.clicked.connect(self._edit_route)
        act_row.addWidget(btn_edit)

        btn_toggle = QPushButton("⏸ TOGGLE")
        btn_toggle.setObjectName("WarningBtn")
        btn_toggle.clicked.connect(self._toggle_active)
        act_row.addWidget(btn_toggle)

        btn_del = QPushButton("✕ DELETE")
        btn_del.setObjectName("DangerBtn")
        btn_del.clicked.connect(self._delete_route)
        act_row.addWidget(btn_del)
        ll.addLayout(act_row)

        splitter.addWidget(left)

        self.detail_panel = RouteDetailPanel(self.user)
        splitter.addWidget(self.detail_panel)
        splitter.setSizes([420, 300])

        layout.addWidget(splitter)

        self.status_lbl = QLabel("0 routes")
        self.status_lbl.setStyleSheet("color:#555; font-size:10px;")
        layout.addWidget(self.status_lbl)

        self.all_routes = []

    def _load_routes(self):
        self.all_routes = storage.get_routes()
        self._render(self.all_routes)

    def _filter(self):
        q = self.search_bar.text().strip().lower()
        filtered = [r for r in self.all_routes if q in r["name"].lower()] if q else self.all_routes
        self._render(filtered)

    def _render(self, routes):
        self.table.setRowCount(len(routes))
        for row, r in enumerate(routes):
            self.table.setRowHeight(row, 22)
            name_item = QTableWidgetItem(r["name"])
            name_item.setData(Qt.ItemDataRole.UserRole, r["id"])
            name_item.setForeground(QColor("#C0C0C0"))
            self.table.setItem(row, 0, name_item)
            self.table.setItem(row, 1, QTableWidgetItem(str(len(r["steps"]))))
            active_item = QTableWidgetItem("✓" if r.get("active", True) else "✗")
            active_item.setForeground(QColor("#00D4AA" if r.get("active", True) else "#555"))
            self.table.setItem(row, 2, active_item)
            self.table.setItem(row, 3, QTableWidgetItem(r["created_at"][:10]))
        self.status_lbl.setText(f"{len(routes)} routes")

    def _on_select(self):
        row = self.table.currentRow()
        if row < 0:
            return
        route_id = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        route = next((r for r in self.all_routes if r["id"] == route_id), None)
        if route:
            self.detail_panel.load_route(route)

    def _get_selected_route(self):
        row = self.table.currentRow()
        if row < 0:
            return None
        route_id = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        return next((r for r in self.all_routes if r["id"] == route_id), None)

    def _new_route(self):
        dlg = RouteEditorDialog(self.user, parent=self)
        if dlg.exec():
            self._load_routes()

    def _edit_route(self):
        route = self._get_selected_route()
        if not route:
            QMessageBox.information(self, "Select Route", "Select a route to edit.")
            return
        dlg = RouteEditorDialog(self.user, route=route, parent=self)
        if dlg.exec():
            self._load_routes()

    def _toggle_active(self):
        route = self._get_selected_route()
        if not route:
            return
        storage.update_route(route["id"], active=not route.get("active", True))
        self._load_routes()

    def _delete_route(self):
        route = self._get_selected_route()
        if not route:
            return
        r = QMessageBox.question(self, "Delete", f"Delete route '{route['name']}'?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            storage.delete_route(route["id"])
            storage.log_activity("ROUTE_DELETE", f"Route '{route['name']}' deleted", self.user["id"])
            self._load_routes()
