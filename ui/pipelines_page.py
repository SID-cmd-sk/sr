"""
SR Manager - Pipeline Management Page
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QTextEdit, QComboBox, QMessageBox, QSplitter,
    QScrollArea, QCheckBox
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


STAGE_COLORS = ["#5599FF", "#00D4AA", "#D4A800", "#E05555", "#AA55FF", "#FF8844"]


class StageEditorDialog(QDialog):
    def __init__(self, stage=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("STAGE EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(400)
        self._build_ui()
        if stage:
            self._load(stage)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  CONFIGURE PIPELINE STAGE")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        form = QWidget()
        fl = QVBoxLayout(form)
        fl.setContentsMargins(16, 14, 16, 14)
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
        self.name_input.setPlaceholderText("Stage name (e.g. Initial Review)")
        row("STAGE NAME", self.name_input)

        self.desc_input = QLineEdit()
        self.desc_input.setPlaceholderText("Short description")
        row("DESCRIPTION", self.desc_input)

        self.assignee_combo = QComboBox()
        self.assignee_combo.addItems(["Manager", "Admin", "Technical", "Any"])
        row("HANDLED BY", self.assignee_combo)

        self.approval_cb = QCheckBox("Requires approval to proceed")
        fl.addWidget(self.approval_cb)

        self.mail_cb = QCheckBox("Send mail on enter")
        fl.addWidget(self.mail_cb)

        self.wa_cb = QCheckBox("Send WhatsApp on enter")
        fl.addWidget(self.wa_cb)

        self.escalation_cb = QCheckBox("Has escalation timer")
        fl.addWidget(self.escalation_cb)

        self.timer_spin = QWidget()
        timer_row = QHBoxLayout(self.timer_spin)
        timer_row.setContentsMargins(0, 0, 0, 0)
        timer_lbl = QLabel("ESCALATE AFTER (hrs)")
        timer_lbl.setObjectName("FormLabel")
        timer_lbl.setFixedWidth(150)
        self.timer_hours = QLineEdit()
        self.timer_hours.setText("24")
        self.timer_hours.setFixedWidth(60)
        timer_row.addWidget(timer_lbl)
        timer_row.addWidget(self.timer_hours)
        timer_row.addStretch()
        fl.addWidget(self.timer_spin)

        layout.addWidget(form)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = QPushButton("SAVE STAGE")
        save.setObjectName("PrimaryBtn")
        save.clicked.connect(self._save)
        btns.addWidget(save)
        layout.addLayout(btns)

    def _load(self, stage):
        self.name_input.setText(stage.get("name", ""))
        self.desc_input.setText(stage.get("description", ""))
        idx = self.assignee_combo.findText(stage.get("handled_by", "Manager"))
        if idx >= 0:
            self.assignee_combo.setCurrentIndex(idx)
        self.approval_cb.setChecked(stage.get("needs_approval", False))
        self.mail_cb.setChecked(stage.get("send_mail", False))
        self.wa_cb.setChecked(stage.get("send_whatsapp", False))
        self.escalation_cb.setChecked(stage.get("has_escalation", False))
        self.timer_hours.setText(str(stage.get("escalation_hours", 24)))

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Error", "Stage name is required.")
            return
        try:
            hours = int(self.timer_hours.text())
        except ValueError:
            hours = 24
        self.result_stage = {
            "name": name,
            "description": self.desc_input.text().strip(),
            "handled_by": self.assignee_combo.currentText(),
            "needs_approval": self.approval_cb.isChecked(),
            "send_mail": self.mail_cb.isChecked(),
            "send_whatsapp": self.wa_cb.isChecked(),
            "has_escalation": self.escalation_cb.isChecked(),
            "escalation_hours": hours,
        }
        self.accept()

    # Need to import QSpinBox - fix by using QLineEdit for hours above


class PipelineEditorDialog(QDialog):
    def __init__(self, user, pipeline=None, parent=None):
        super().__init__(parent)
        self.user = user
        self.pipeline = pipeline
        self.stages = list(pipeline["stages"]) if pipeline else []
        self.setWindowTitle("PIPELINE EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(600)
        self.setMinimumHeight(480)
        self._build_ui()
        if pipeline:
            self.name_input.setText(pipeline["name"])

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  PIPELINE EDITOR")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        content = QWidget()
        cl = QVBoxLayout(content)
        cl.setContentsMargins(16, 14, 16, 14)
        cl.setSpacing(8)

        name_row = QHBoxLayout()
        lbl = QLabel("PIPELINE NAME")
        lbl.setObjectName("FormLabel")
        lbl.setFixedWidth(120)
        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Pipeline name")
        name_row.addWidget(lbl)
        name_row.addWidget(self.name_input)
        cl.addLayout(name_row)

        stage_hdr = QHBoxLayout()
        stage_hdr.addWidget(QLabel("STAGES"))
        stage_hdr.addStretch()

        for label, obj_name, handler in [
            ("+ ADD", "PrimaryBtn", self._add_stage),
            ("✎ EDIT", "", self._edit_stage),
            ("✕ DEL", "DangerBtn", self._del_stage),
            ("↑", "", self._move_up),
            ("↓", "", self._move_down),
        ]:
            btn = QPushButton(label)
            if obj_name:
                btn.setObjectName(obj_name)
            if label in ["↑", "↓"]:
                btn.setFixedWidth(30)
            btn.clicked.connect(handler)
            stage_hdr.addWidget(btn)
        cl.addLayout(stage_hdr)

        self.stage_table = QTableWidget()
        self.stage_table.setColumnCount(6)
        self.stage_table.setHorizontalHeaderLabels(["#", "NAME", "BY", "APPR", "MAIL", "WA"])
        self.stage_table.setColumnWidth(0, 28)
        self.stage_table.setColumnWidth(1, 160)
        self.stage_table.setColumnWidth(2, 90)
        self.stage_table.setColumnWidth(3, 45)
        self.stage_table.setColumnWidth(4, 40)
        self.stage_table.setColumnWidth(5, 35)
        self.stage_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.stage_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.stage_table.verticalHeader().setVisible(False)
        self.stage_table.setMinimumHeight(200)
        cl.addWidget(self.stage_table)

        layout.addWidget(content)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 16)
        btns.addStretch()
        cancel = QPushButton("CANCEL")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        save = QPushButton("SAVE PIPELINE")
        save.setObjectName("PrimaryBtn")
        save.clicked.connect(self._save)
        btns.addWidget(save)
        layout.addLayout(btns)

        self._refresh_stages()

    def _refresh_stages(self):
        self.stage_table.setRowCount(len(self.stages))
        for i, stage in enumerate(self.stages):
            self.stage_table.setRowHeight(i, 22)
            self.stage_table.setItem(i, 0, QTableWidgetItem(str(i + 1)))
            name_item = QTableWidgetItem(stage["name"])
            name_item.setForeground(QColor(STAGE_COLORS[i % len(STAGE_COLORS)]))
            self.stage_table.setItem(i, 1, name_item)
            self.stage_table.setItem(i, 2, QTableWidgetItem(stage.get("handled_by", "")))
            self.stage_table.setItem(i, 3, QTableWidgetItem("✓" if stage.get("needs_approval") else ""))
            mail_item = QTableWidgetItem("✓" if stage.get("send_mail") else "")
            if stage.get("send_mail"):
                mail_item.setForeground(QColor("#00D4AA"))
            self.stage_table.setItem(i, 4, mail_item)
            wa_item = QTableWidgetItem("✓" if stage.get("send_whatsapp") else "")
            if stage.get("send_whatsapp"):
                wa_item.setForeground(QColor("#25D366"))
            self.stage_table.setItem(i, 5, wa_item)

    def _add_stage(self):
        dlg = StageEditorDialog(parent=self)
        if dlg.exec():
            self.stages.append(dlg.result_stage)
            self._refresh_stages()

    def _edit_stage(self):
        row = self.stage_table.currentRow()
        if row < 0:
            return
        dlg = StageEditorDialog(stage=self.stages[row], parent=self)
        if dlg.exec():
            self.stages[row] = dlg.result_stage
            self._refresh_stages()

    def _del_stage(self):
        row = self.stage_table.currentRow()
        if row >= 0:
            self.stages.pop(row)
            self._refresh_stages()

    def _move_up(self):
        row = self.stage_table.currentRow()
        if row > 0:
            self.stages[row], self.stages[row-1] = self.stages[row-1], self.stages[row]
            self._refresh_stages()
            self.stage_table.selectRow(row - 1)

    def _move_down(self):
        row = self.stage_table.currentRow()
        if row < len(self.stages) - 1:
            self.stages[row], self.stages[row+1] = self.stages[row+1], self.stages[row]
            self._refresh_stages()
            self.stage_table.selectRow(row + 1)

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Error", "Pipeline name required.")
            return
        if self.pipeline:
            db = storage.load_db()
            for p in db["pipelines"]:
                if p["id"] == self.pipeline["id"]:
                    p["name"] = name
                    p["stages"] = self.stages
                    break
            storage.save_db(db)
            storage.log_activity("PIPELINE_UPDATE", f"Pipeline '{name}' updated", self.user["id"])
        else:
            storage.create_pipeline(name, self.stages, self.user["id"])
        self.accept()


class PipelinePage(QWidget):
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
        title = QLabel("PIPELINE MANAGEMENT")
        title.setObjectName("PageTitle")
        toolbar.addWidget(title)
        toolbar.addStretch()

        btn_new = QPushButton("+ NEW PIPELINE")
        btn_new.setObjectName("PrimaryBtn")
        btn_new.clicked.connect(self._new_pipeline)
        toolbar.addWidget(btn_new)
        layout.addLayout(toolbar)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Left table
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        ll.setSpacing(4)

        self.table = QTableWidget()
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["NAME", "STAGES", "CREATED"])
        self.table.setColumnWidth(0, 200)
        self.table.setColumnWidth(1, 60)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setStyleSheet("alternate-background-color: #13131A;")
        self.table.itemSelectionChanged.connect(self._on_select)
        ll.addWidget(self.table)

        act = QHBoxLayout()
        btn_edit = QPushButton("✎ EDIT")
        btn_edit.clicked.connect(self._edit_pipeline)
        act.addWidget(btn_edit)
        btn_del = QPushButton("✕ DELETE")
        btn_del.setObjectName("DangerBtn")
        btn_del.clicked.connect(self._delete_pipeline)
        act.addWidget(btn_del)
        ll.addLayout(act)
        splitter.addWidget(left)

        # Right detail
        right = QFrame()
        right.setObjectName("StatCard")
        rl = QVBoxLayout(right)
        rl.setContentsMargins(0, 0, 0, 0)

        hdr = QLabel("  PIPELINE STAGES")
        hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;")
        rl.addWidget(hdr)

        self.detail_scroll = QScrollArea()
        self.detail_scroll.setWidgetResizable(True)
        self.detail_scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.detail_inner = QWidget()
        self.detail_layout = QVBoxLayout(self.detail_inner)
        self.detail_layout.setContentsMargins(10, 10, 10, 10)
        self.detail_layout.setSpacing(4)
        self.detail_layout.addStretch()
        self.detail_scroll.setWidget(self.detail_inner)
        rl.addWidget(self.detail_scroll)

        splitter.addWidget(right)
        splitter.setSizes([380, 300])
        layout.addWidget(splitter)

        self.all_pipelines = []

    def _load(self):
        self.all_pipelines = storage.get_pipelines()
        self.table.setRowCount(len(self.all_pipelines))
        for row, p in enumerate(self.all_pipelines):
            self.table.setRowHeight(row, 22)
            name_item = QTableWidgetItem(p["name"])
            name_item.setData(Qt.ItemDataRole.UserRole, p["id"])
            name_item.setForeground(QColor("#C0C0C0"))
            self.table.setItem(row, 0, name_item)
            self.table.setItem(row, 1, QTableWidgetItem(str(len(p["stages"]))))
            self.table.setItem(row, 2, QTableWidgetItem(p["created_at"][:10]))

    def _on_select(self):
        row = self.table.currentRow()
        if row < 0:
            return
        pid = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        pipeline = next((p for p in self.all_pipelines if p["id"] == pid), None)
        if not pipeline:
            return

        for i in reversed(range(self.detail_layout.count())):
            w = self.detail_layout.itemAt(i).widget()
            if w:
                w.deleteLater()

        for i, stage in enumerate(pipeline["stages"]):
            color = STAGE_COLORS[i % len(STAGE_COLORS)]
            flags = []
            if stage.get("needs_approval"):
                flags.append("APPROVAL")
            if stage.get("send_mail"):
                flags.append("MAIL")
            if stage.get("send_whatsapp"):
                flags.append("WA")
            if stage.get("has_escalation"):
                flags.append(f"ESC:{stage.get('escalation_hours',24)}h")
            flag_str = "  " + " · ".join(flags) if flags else ""
            lbl = QLabel(f"  STAGE {i+1}: {stage['name']}  [{stage.get('handled_by','')}]{flag_str}")
            lbl.setStyleSheet(
                f"color:{color}; font-size:10px; padding:4px 8px; "
                f"border-left:3px solid {color}; background:#111116; margin:1px 0;"
            )
            self.detail_layout.addWidget(lbl)
            if stage.get("description"):
                desc_lbl = QLabel(f"     {stage['description']}")
                desc_lbl.setStyleSheet("color:#555; font-size:9px; padding:1px 8px;")
                self.detail_layout.addWidget(desc_lbl)

        self.detail_layout.addStretch()

    def _get_selected(self):
        row = self.table.currentRow()
        if row < 0:
            return None
        pid = self.table.item(row, 0).data(Qt.ItemDataRole.UserRole)
        return next((p for p in self.all_pipelines if p["id"] == pid), None)

    def _new_pipeline(self):
        dlg = PipelineEditorDialog(self.user, parent=self)
        if dlg.exec():
            self._load()

    def _edit_pipeline(self):
        p = self._get_selected()
        if not p:
            QMessageBox.information(self, "Select", "Select a pipeline first.")
            return
        dlg = PipelineEditorDialog(self.user, pipeline=p, parent=self)
        if dlg.exec():
            self._load()

    def _delete_pipeline(self):
        p = self._get_selected()
        if not p:
            return
        r = QMessageBox.question(self, "Delete", f"Delete pipeline '{p['name']}'?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            db = storage.load_db()
            db["pipelines"] = [x for x in db["pipelines"] if x["id"] != p["id"]]
            storage.save_db(db)
            storage.log_activity("PIPELINE_DELETE", f"Pipeline '{p['name']}' deleted", self.user["id"])
            self._load()
