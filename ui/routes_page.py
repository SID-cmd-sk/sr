"""SR Manager - visual workflow route builder."""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame, QTableWidget,
    QTableWidgetItem, QPushButton, QLineEdit, QDialog, QTextEdit, QComboBox,
    QMessageBox, QSplitter, QScrollArea, QCheckBox, QSpinBox, QGraphicsView,
    QGraphicsScene, QGraphicsRectItem, QGraphicsTextItem, QGraphicsLineItem,
    QTabWidget
)
from PyQt6.QtCore import Qt, QRectF, QPointF
from PyQt6.QtGui import QColor, QPen, QBrush
import sys
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
from core import storage

STEP_TYPES = ["Approval", "Email", "WhatsApp", "Activation", "Engineer Visit", "Manager Review", "Done"]


class StepEditorDialog(QDialog):
    def __init__(self, step=None, parent=None):
        super().__init__(parent)
        self.step = step or {}
        self.setWindowTitle("STEP EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(460)
        self._build_ui()
        if step:
            self._load_step(step)

    def _build_ui(self):
        layout = QVBoxLayout(self); layout.setContentsMargins(0,0,0,0)
        title_bar = QLabel("  CONFIGURE WORKFLOW NODE"); title_bar.setObjectName("DialogTitle"); layout.addWidget(title_bar)
        form = QWidget(); form.setContentsMargins(16,14,16,14); fl = QVBoxLayout(form); fl.setSpacing(8)
        def row(label, widget):
            r=QHBoxLayout(); lbl=QLabel(label); lbl.setObjectName("FormLabel"); lbl.setFixedWidth(140); r.addWidget(lbl); r.addWidget(widget); fl.addLayout(r)
        self.name_input=QLineEdit(); self.name_input.setPlaceholderText("Welcome Letter / Activation / Done"); row("STEP NAME", self.name_input)
        self.type_combo=QComboBox(); self.type_combo.addItems(STEP_TYPES); row("TYPE", self.type_combo)
        self.email_combo=QComboBox(); self.email_combo.addItem("-- No email template --", "")
        for t in storage.get_mail_templates():
            if t.get("enabled", True): self.email_combo.addItem(t["name"], t["id"])
        row("EMAIL TEMPLATE", self.email_combo)
        self.wa_combo=QComboBox(); self.wa_combo.addItem("-- No WhatsApp template --", "")
        for t in storage.get_whatsapp_templates():
            if t.get("enabled", True): self.wa_combo.addItem(t["name"], t["id"])
        row("WA TEMPLATE", self.wa_combo)
        self.auto_send_cb=QCheckBox("Auto-send selected communication templates when step triggers"); fl.addWidget(self.auto_send_cb)
        self.approval_cb=QCheckBox("Requires approval before advancing"); fl.addWidget(self.approval_cb)
        self.delay_spin=QSpinBox(); self.delay_spin.setRange(0, 1440); self.delay_spin.setSuffix(" min"); row("DELAY/TIMER", self.delay_spin)
        self.next_combo=QComboBox(); self.next_combo.addItem("-- sequential/default --", ""); row("NEXT NODE", self.next_combo)
        self.notes_input=QTextEdit(); self.notes_input.setFixedHeight(55); self.notes_input.setPlaceholderText("Step notes / instructions..."); fl.addWidget(QLabel("NOTES")); fl.addWidget(self.notes_input)
        layout.addWidget(form)
        btns=QHBoxLayout(); btns.setContentsMargins(16,8,16,16); btns.addStretch(); cancel=QPushButton("CANCEL"); cancel.clicked.connect(self.reject); btns.addWidget(cancel); ok=QPushButton("SAVE STEP"); ok.setObjectName("PrimaryBtn"); ok.clicked.connect(self._save); btns.addWidget(ok); layout.addLayout(btns)

    def _load_step(self, step):
        self.name_input.setText(step.get("name", "")); self.type_combo.setCurrentText(step.get("type", "Approval"))
        for combo, key in [(self.email_combo,"email_template_id"),(self.wa_combo,"whatsapp_template_id")]:
            idx=combo.findData(step.get(key,"")); combo.setCurrentIndex(idx if idx>=0 else 0)
        self.auto_send_cb.setChecked(step.get("auto_send", bool(step.get("triggers_mail") or step.get("triggers_whatsapp"))))
        self.approval_cb.setChecked(step.get("needs_approval", step.get("requires_approval", False)))
        self.delay_spin.setValue(int(step.get("delay_minutes",0) or 0)); self.notes_input.setPlainText(step.get("notes", ""))

    def _save(self):
        name=self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self,"Error","Step name is required."); return
        sid=self.step.get("id") or storage._uid()
        self.result_step={"id":sid,"name":name,"type":self.type_combo.currentText(),
            "email_template_id":self.email_combo.currentData(),"whatsapp_template_id":self.wa_combo.currentData(),
            "triggers_mail":bool(self.email_combo.currentData()),"triggers_whatsapp":bool(self.wa_combo.currentData()),
            "auto_send":self.auto_send_cb.isChecked(),"needs_approval":self.approval_cb.isChecked(),
            "requires_approval":self.approval_cb.isChecked(),"delay_minutes":self.delay_spin.value(),
            "x":self.step.get("x",40),"y":self.step.get("y",60),"notes":self.notes_input.toPlainText().strip()}
        self.accept()


class WorkflowScene(QGraphicsScene):
    def __init__(self, owner):
        super().__init__(owner); self.owner=owner; self.node_items={}; self.line_items=[]; self.setSceneRect(0,0,1400,500)
    def render_workflow(self, steps, connections):
        self.clear(); self.node_items={}; self.line_items=[]
        for i, step in enumerate(steps):
            x=float(step.get("x",40+i*190)); y=float(step.get("y",80))
            rect=QGraphicsRectItem(QRectF(x,y,145,70)); rect.setBrush(QBrush(QColor("#111116"))); rect.setPen(QPen(QColor("#00D4AA" if step.get("auto_send") else "#252530"),2)); rect.setFlag(QGraphicsRectItem.GraphicsItemFlag.ItemIsMovable); rect.setData(0, step.get("id")); self.addItem(rect)
            txt=QGraphicsTextItem(f"{step.get('name','Step')}\n{step.get('type','')}" ); txt.setDefaultTextColor(QColor("#D4D4D4")); txt.setPos(x+8,y+8); txt.setParentItem(rect)
            self.node_items[step.get("id")]=rect
        for c in connections:
            a=self.node_items.get(c.get("from")); b=self.node_items.get(c.get("to"))
            if a and b:
                ar=a.sceneBoundingRect(); br=b.sceneBoundingRect(); line=QGraphicsLineItem(ar.right(), ar.center().y(), br.left(), br.center().y()); line.setPen(QPen(QColor("#5599FF"),2)); self.addItem(line); line.setZValue(-1)
    def sync_positions(self):
        for step in self.owner.steps:
            item=self.node_items.get(step.get("id"))
            if item:
                p=item.pos(); base=item.rect().topLeft(); step["x"]=base.x()+p.x(); step["y"]=base.y()+p.y()


class RouteEditorDialog(QDialog):
    def __init__(self, user, route=None, parent=None):
        super().__init__(parent); self.user=user; self.route=route
        self.steps=[dict(s) for s in route.get("steps", [])] if route else []
        self.connections=[dict(c) for c in route.get("connections", [])] if route else []
        if not self.connections and len(self.steps)>1:
            self.connections=[{"from":self.steps[i].get("id",str(i)),"to":self.steps[i+1].get("id",str(i+1))} for i in range(len(self.steps)-1)]
        self.setWindowTitle("VISUAL ROUTE BUILDER"); self.setObjectName("DialogBox"); self.setMinimumSize(860,620); self._build_ui();
        if route: self._load_route(route)
        self._refresh_all()

    def _build_ui(self):
        layout=QVBoxLayout(self); layout.setContentsMargins(0,0,0,0)
        tb=QLabel("  VISUAL WORKFLOW ROUTE BUILDER"); tb.setObjectName("DialogTitle"); layout.addWidget(tb)
        content=QWidget(); cl=QVBoxLayout(content); cl.setContentsMargins(16,14,16,14); cl.setSpacing(8)
        nr=QHBoxLayout(); lbl=QLabel("ROUTE NAME"); lbl.setObjectName("FormLabel"); lbl.setFixedWidth(100); self.name_input=QLineEdit(); nr.addWidget(lbl); nr.addWidget(self.name_input); cl.addLayout(nr)
        dr=QHBoxLayout(); dl=QLabel("DESCRIPTION"); dl.setObjectName("FormLabel"); dl.setFixedWidth(100); self.desc_input=QLineEdit(); dr.addWidget(dl); dr.addWidget(self.desc_input); cl.addLayout(dr)
        self.tabs=QTabWidget(); cl.addWidget(self.tabs)
        visual=QWidget(); vl=QVBoxLayout(visual); tools=QHBoxLayout()
        for text, fn in [("+ NODE",self._add_step),("✎ EDIT NODE",self._edit_step),("✕ REMOVE NODE",self._remove_step),("CONNECT",self._connect_nodes),("REMOVE CONNECTION",self._remove_connection)]:
            b=QPushButton(text); b.clicked.connect(fn); tools.addWidget(b)
        tools.addStretch(); vl.addLayout(tools)
        self.scene=WorkflowScene(self); self.view=QGraphicsView(self.scene); self.view.setStyleSheet("background:#0B0B0F; border:1px solid #1E1E28;"); vl.addWidget(self.view); self.tabs.addTab(visual,"WIRE DIAGRAM")
        data=QWidget(); dl=QVBoxLayout(data); self.step_list=QTableWidget(); self.step_list.setColumnCount(6); self.step_list.setHorizontalHeaderLabels(["#","NAME","EMAIL","WA","AUTO","APPROVAL"]); self.step_list.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers); self.step_list.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows); self.step_list.setSelectionMode(QTableWidget.SelectionMode.ExtendedSelection); self.step_list.verticalHeader().setVisible(False); dl.addWidget(self.step_list); self.tabs.addTab(data,"NODE LIST")
        layout.addWidget(content)
        btns=QHBoxLayout(); btns.setContentsMargins(16,8,16,16); btns.addStretch(); cancel=QPushButton("CANCEL"); cancel.clicked.connect(self.reject); btns.addWidget(cancel); save=QPushButton("SAVE ROUTE"); save.setObjectName("PrimaryBtn"); save.clicked.connect(self._save); btns.addWidget(save); layout.addLayout(btns)

    def _load_route(self, route): self.name_input.setText(route.get("name","")); self.desc_input.setText(route.get("description",""))
    def _refresh_all(self):
        self.scene.render_workflow(self.steps, self.connections); self.step_list.setRowCount(len(self.steps))
        for i,s in enumerate(self.steps):
            self.step_list.setRowHeight(i,22)
            vals=[str(i+1),s.get("name",""),"✓" if s.get("email_template_id") else "","✓" if s.get("whatsapp_template_id") else "","✓" if s.get("auto_send") else "","✓" if s.get("needs_approval") else ""]
            for col,val in enumerate(vals): self.step_list.setItem(i,col,QTableWidgetItem(val))
    def _selected_index(self): return self.step_list.currentRow()
    def _add_step(self):
        dlg=StepEditorDialog(parent=self)
        if dlg.exec():
            step=dlg.result_step; step["x"]=40+len(self.steps)*190; step["y"]=80; self.steps.append(step)
            if len(self.steps)>1: self.connections.append({"from":self.steps[-2]["id"],"to":step["id"]})
            self._refresh_all()
    def _edit_step(self):
        row=self._selected_index()
        if row<0 and self.steps: row=0
        if row<0: return
        dlg=StepEditorDialog(self.steps[row], self)
        if dlg.exec(): self.steps[row]=dlg.result_step; self._refresh_all()
    def _remove_step(self):
        row=self._selected_index();
        if row<0: return
        sid=self.steps[row].get("id"); self.steps.pop(row); self.connections=[c for c in self.connections if c.get("from")!=sid and c.get("to")!=sid]; self._refresh_all()
    def _connect_nodes(self):
        rows=self.step_list.selectionModel().selectedRows()
        if len(rows)!=2:
            QMessageBox.information(self,"Connect","Select exactly two rows in NODE LIST, then click CONNECT."); return
        a=self.steps[rows[0].row()]["id"]; b=self.steps[rows[1].row()]["id"]
        if not any(c.get("from")==a and c.get("to")==b for c in self.connections): self.connections.append({"from":a,"to":b})
        self._refresh_all()
    def _remove_connection(self):
        rows=self.step_list.selectionModel().selectedRows()
        if len(rows)!=2: QMessageBox.information(self,"Remove","Select two connected rows."); return
        ids={self.steps[rows[0].row()]["id"], self.steps[rows[1].row()]["id"]}; self.connections=[c for c in self.connections if {c.get("from"),c.get("to")}!=ids]; self._refresh_all()
    def _save(self):
        self.scene.sync_positions(); name=self.name_input.text().strip()
        if not name: QMessageBox.warning(self,"Error","Route name is required."); return
        if self.route:
            storage.update_route(self.route["id"], name=name, description=self.desc_input.text().strip(), steps=self.steps, connections=self.connections); storage.log_activity("ROUTE_UPDATE", f"Route '{name}' updated", self.user["id"])
        else:
            storage.create_route(name, self.desc_input.text().strip(), self.steps, self.user["id"], connections=self.connections)
        self.accept()


class RouteDetailPanel(QWidget):
    def __init__(self, user): super().__init__(); self.user=user; self._build_ui()
    def _build_ui(self):
        layout=QVBoxLayout(self); layout.setContentsMargins(0,0,0,0); hdr=QLabel("  ROUTE DETAILS"); hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;"); layout.addWidget(hdr)
        scroll=QScrollArea(); scroll.setWidgetResizable(True); scroll.setFrameShape(QFrame.Shape.NoFrame); self.inner=QWidget(); il=QVBoxLayout(self.inner); il.setContentsMargins(10,10,10,10); self.name_lbl=QLabel("Select a route"); self.name_lbl.setStyleSheet("color:#00D4AA; font-size:13px; font-weight:bold;"); il.addWidget(self.name_lbl); self.desc_lbl=QLabel(""); self.desc_lbl.setStyleSheet("color:#888; font-size:10px;"); il.addWidget(self.desc_lbl); self.meta_lbl=QLabel(""); self.meta_lbl.setStyleSheet("color:#555; font-size:10px;"); il.addWidget(self.meta_lbl); self.steps_layout=QVBoxLayout(); il.addLayout(self.steps_layout); il.addStretch(); scroll.setWidget(self.inner); layout.addWidget(scroll)
    def load_route(self, route):
        self.name_lbl.setText(route.get("name","")); self.desc_lbl.setText(route.get("description","")); self.meta_lbl.setText(f"ID: {route.get('id')} | Steps: {len(route.get('steps',[]))} | Connections: {len(route.get('connections',[]))}")
        while self.steps_layout.count():
            item=self.steps_layout.takeAt(0); w=item.widget();
            if w: w.deleteLater()
        for i,step in enumerate(route.get("steps", [])):
            flags=[]
            if step.get("email_template_id"): flags.append("EMAIL")
            if step.get("whatsapp_template_id"): flags.append("WA")
            if step.get("auto_send"): flags.append("AUTO")
            if step.get("needs_approval"): flags.append("APPROVAL")
            lbl=QLabel(f"  {i+1}. {step.get('name')} • {step.get('type')}" + (" ["+" | ".join(flags)+"]" if flags else "")); lbl.setStyleSheet("color:#888; font-size:10px; padding:3px 6px; border-left:2px solid #252530; background:#111116; margin:1px 0;"); self.steps_layout.addWidget(lbl)


class RoutePage(QWidget):
    def __init__(self, user): super().__init__(); self.user=user; self._build_ui(); self._load_routes()
    def _build_ui(self):
        layout=QVBoxLayout(self); layout.setContentsMargins(14,10,14,10); layout.setSpacing(8); toolbar=QHBoxLayout(); title=QLabel("ROUTE MANAGEMENT"); title.setObjectName("PageTitle"); toolbar.addWidget(title); toolbar.addStretch(); self.search_bar=QLineEdit(); self.search_bar.setObjectName("SearchBar"); self.search_bar.setPlaceholderText("Search routes..."); self.search_bar.textChanged.connect(self._filter); toolbar.addWidget(self.search_bar); btn_new=QPushButton("+ NEW ROUTE"); btn_new.setObjectName("PrimaryBtn"); btn_new.clicked.connect(self._new_route); toolbar.addWidget(btn_new); layout.addLayout(toolbar)
        splitter=QSplitter(Qt.Orientation.Horizontal); left=QWidget(); ll=QVBoxLayout(left); ll.setContentsMargins(0,0,0,0); self.table=QTableWidget(); self.table.setColumnCount(4); self.table.setHorizontalHeaderLabels(["NAME","STEPS","ACTIVE","CREATED"]); self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers); self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows); self.table.verticalHeader().setVisible(False); self.table.itemSelectionChanged.connect(self._on_select); ll.addWidget(self.table); act=QHBoxLayout();
        for text,fn,obj in [("✎ EDIT",self._edit_route,""),("⏸ TOGGLE",self._toggle_active,"WarningBtn"),("✕ DELETE",self._delete_route,"DangerBtn")]:
            b=QPushButton(text); b.clicked.connect(fn); 
            if obj: b.setObjectName(obj)
            act.addWidget(b)
        ll.addLayout(act); splitter.addWidget(left); self.detail_panel=RouteDetailPanel(self.user); splitter.addWidget(self.detail_panel); splitter.setSizes([420,300]); layout.addWidget(splitter); self.status_lbl=QLabel("0 routes"); self.status_lbl.setStyleSheet("color:#555; font-size:10px;"); layout.addWidget(self.status_lbl); self.all_routes=[]
    def _load_routes(self): self.all_routes=storage.get_routes(); self._render(self.all_routes)
    def _filter(self):
        q=self.search_bar.text().strip().lower(); self._render([r for r in self.all_routes if q in r.get("name","").lower()] if q else self.all_routes)
    def _render(self,routes):
        self.table.setRowCount(len(routes))
        for row,r in enumerate(routes):
            self.table.setRowHeight(row,22); item=QTableWidgetItem(r.get("name","")); item.setData(Qt.ItemDataRole.UserRole,r.get("id")); item.setForeground(QColor("#C0C0C0")); self.table.setItem(row,0,item); self.table.setItem(row,1,QTableWidgetItem(str(len(r.get("steps",[]))))); active=QTableWidgetItem("✓" if r.get("active",True) else "✗"); active.setForeground(QColor("#00D4AA" if r.get("active",True) else "#555")); self.table.setItem(row,2,active); self.table.setItem(row,3,QTableWidgetItem(r.get("created_at","")[:10]))
        self.status_lbl.setText(f"{len(routes)} routes")
    def _on_select(self):
        route=self._get_selected_route();
        if route: self.detail_panel.load_route(route)
    def _get_selected_route(self):
        row=self.table.currentRow();
        if row<0: return None
        rid=self.table.item(row,0).data(Qt.ItemDataRole.UserRole); return next((r for r in self.all_routes if r.get("id")==rid),None)
    def _new_route(self):
        dlg=RouteEditorDialog(self.user,parent=self)
        if dlg.exec(): self._load_routes()
    def _edit_route(self):
        route=self._get_selected_route()
        if not route: QMessageBox.information(self,"Select Route","Select a route to edit."); return
        dlg=RouteEditorDialog(self.user,route=route,parent=self)
        if dlg.exec(): self._load_routes()
    def _toggle_active(self):
        route=self._get_selected_route();
        if route: storage.update_route(route["id"], active=not route.get("active",True)); self._load_routes()
    def _delete_route(self):
        route=self._get_selected_route();
        if not route: return
        if QMessageBox.question(self,"Delete",f"Delete route '{route.get('name')}'?", QMessageBox.StandardButton.Yes|QMessageBox.StandardButton.No)==QMessageBox.StandardButton.Yes:
            storage.delete_route(route["id"]); storage.log_activity("ROUTE_DELETE", f"Route '{route.get('name')}' deleted", self.user["id"]); self._load_routes()
