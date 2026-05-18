"""
SR Manager - Visual Route Editor  (replaces old routes_page.py)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Wire-diagram canvas — nodes connected by arrows (↓)
• Each step picks a Mail template AND/OR a WhatsApp template
• When a step is "completed" those messages are auto-sent
• Routes are stored in storage (existing routes key in DB)
• Admin / Manager only

INSTALL:  drop this file into  P2/ui/routes_page.py
         (overwrite the existing one — it is a complete replacement)
"""

# ── PATH BOOTSTRAP ────────────────────────────────────────────────────────────
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
# ─────────────────────────────────────────────────────────────────────────────

import json, smtplib, threading, time, subprocess, shutil
from email.mime.text       import MIMEText
from email.mime.multipart  import MIMEMultipart
from email.utils           import formatdate, make_msgid

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit,
    QDialog, QTextEdit, QComboBox, QMessageBox, QSplitter,
    QScrollArea, QCheckBox, QAbstractItemView, QApplication,
    QSizePolicy
)
from PyQt6.QtCore  import Qt, QPoint, QRect, QSize, QTimer, pyqtSignal
from PyQt6.QtGui   import (QPainter, QPen, QColor, QBrush, QFont,
                            QFontMetrics, QPainterPath, QLinearGradient,
                            QPolygon)

from core import storage


# ═══════════════════════════════════════════════════════════════════════════════
#  EMAIL CONFIG  (same as your email_script.PY)
# ═══════════════════════════════════════════════════════════════════════════════
EMAIL_CFG = {
    "sender":      "sidharth.kumar@sks3d.com",
    "smtp_server": "smtpout.secureserver.net",
    "smtp_port":   465,
    "password":    "Tanvi123@sks",
    "display_name": "Sidharth Kumar",
}

# ═══════════════════════════════════════════════════════════════════════════════
#  WHATSAPP BRIDGE PATHS
# ═══════════════════════════════════════════════════════════════════════════════
_BRIDGE_DIR = _ROOT / "wa_bridge"
_DATA_FILE  = _ROOT / "wa_data.json"
_CMD_FILE   = _ROOT / "wa_cmd.json"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP COLOURS
# ═══════════════════════════════════════════════════════════════════════════════
STEP_COLORS = {
    "Mail":         "#5599FF",
    "WhatsApp":     "#25D366",
    "Approval":     "#D4A800",
    "Upload":       "#AA55FF",
    "Visit":        "#FF8844",
    "Sign-off":     "#E05555",
    "Auto Close":   "#555555",
    "Custom":       "#00D4AA",
}
STEP_TYPES = list(STEP_COLORS.keys())

NODE_W, NODE_H = 220, 68
ARROW_H        = 36
CANVAS_PAD     = 30


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS — Email & WhatsApp send (thread-safe, fire-and-forget)
# ═══════════════════════════════════════════════════════════════════════════════
def _fire_email(to: str, subject: str, body: str):
    def _run():
        try:
            msg = MIMEMultipart()
            msg["From"]       = f'{EMAIL_CFG["display_name"]} <{EMAIL_CFG["sender"]}>'
            msg["To"]         = to
            msg["Subject"]    = subject
            msg["Date"]       = formatdate(localtime=True)
            msg["Message-ID"] = make_msgid(domain=EMAIL_CFG["sender"].split("@")[-1])
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP_SSL(EMAIL_CFG["smtp_server"], EMAIL_CFG["smtp_port"]) as s:
                s.login(EMAIL_CFG["sender"], EMAIL_CFG["password"])
                s.sendmail(EMAIL_CFG["sender"], to, msg.as_string())
        except Exception as e:
            print(f"[Email Error] {e}")
    threading.Thread(target=_run, daemon=True).start()


def _fire_whatsapp(contact_id: str, contact_name: str, message: str):
    def _run():
        try:
            _CMD_FILE.write_text(json.dumps({
                "id": contact_id, "name": contact_name,
                "message": message, "done": False
            }))
            for _ in range(20):
                time.sleep(0.5)
                try:
                    if json.loads(_CMD_FILE.read_text()).get("done"):
                        break
                except Exception:
                    pass
        except Exception as e:
            print(f"[WA Error] {e}")
    threading.Thread(target=_run, daemon=True).start()


def _fill_template(text: str, sr: dict) -> str:
    """Replace {variable} placeholders with SR data."""
    for k, v in sr.items():
        text = text.replace(f"{{{k}}}", str(v or ""))
    return text


# ═══════════════════════════════════════════════════════════════════════════════
#  NODE  (data model, not a widget)
# ═══════════════════════════════════════════════════════════════════════════════
class StepNode:
    def __init__(self, uid, name, step_type="Mail",
                 mail_template_id=None, wa_template_id=None,
                 required=True, skippable=False, notes=""):
        self.uid             = uid
        self.name            = name
        self.step_type       = step_type
        self.mail_template_id = mail_template_id
        self.wa_template_id  = wa_template_id
        self.required        = required
        self.skippable       = skippable
        self.notes           = notes

    def color(self):
        return STEP_COLORS.get(self.step_type, "#00D4AA")

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}

    @staticmethod
    def from_dict(d):
        return StepNode(**d)


# ═══════════════════════════════════════════════════════════════════════════════
#  WIRE CANVAS  — the visual diagram
# ═══════════════════════════════════════════════════════════════════════════════
class WireCanvas(QWidget):
    """Paints nodes top-to-bottom connected by arrows. Click a node to select."""

    node_selected  = pyqtSignal(int)   # index
    node_dbl_click = pyqtSignal(int)   # double-click to edit

    def __init__(self):
        super().__init__()
        self.nodes: list[StepNode] = []
        self._selected = -1
        self.setMinimumWidth(NODE_W + CANVAS_PAD * 2)
        self.setMouseTracking(True)
        self._hover = -1

    # ── geometry ──────────────────────────────────────────────────────────────
    def _node_rect(self, idx: int) -> QRect:
        total_h = (NODE_H + ARROW_H) * idx + NODE_H
        x = (self.width() - NODE_W) // 2
        y = CANVAS_PAD + idx * (NODE_H + ARROW_H)
        return QRect(x, y, NODE_W, NODE_H)

    def _content_height(self) -> int:
        if not self.nodes:
            return 160
        return CANVAS_PAD * 2 + len(self.nodes) * (NODE_H + ARROW_H)

    def sizeHint(self):
        return QSize(NODE_W + CANVAS_PAD * 2, self._content_height())

    # ── paint ─────────────────────────────────────────────────────────────────
    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.fillRect(self.rect(), QColor("#0D0D14"))

        if not self.nodes:
            p.setPen(QColor("#333"))
            p.setFont(QFont("Consolas", 10))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter,
                       "No steps yet.\nClick  +  to add a step.")
            return

        for i, node in enumerate(self.nodes):
            rect = self._node_rect(i)
            sel  = (i == self._selected)
            hov  = (i == self._hover)
            self._draw_node(p, rect, node, sel, hov)
            if i < len(self.nodes) - 1:
                self._draw_arrow(p, rect)

        p.end()

    def _draw_node(self, p, rect, node, selected, hover):
        col  = QColor(node.color())
        grd  = QLinearGradient(rect.topLeft(), rect.bottomRight())
        grd.setColorAt(0, QColor(15, 15, 22))
        grd.setColorAt(1, QColor(20, 20, 32))

        # shadow
        shadow = rect.adjusted(4, 4, 4, 4)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(0, 0, 0, 80))
        p.drawRoundedRect(shadow, 8, 8)

        # body
        p.setBrush(QBrush(grd))
        border_col = col if selected else (col.lighter(120) if hover else QColor(40, 40, 60))
        p.setPen(QPen(border_col, 2 if selected else 1))
        p.drawRoundedRect(rect, 8, 8)

        # left accent bar
        bar = QRect(rect.x(), rect.y() + 12, 4, rect.height() - 24)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(col)
        p.drawRoundedRect(bar, 2, 2)

        # type badge
        badge_text = node.step_type.upper()
        p.setFont(QFont("Consolas", 7, QFont.Weight.Bold))
        fm = QFontMetrics(p.font())
        badge_w = fm.horizontalAdvance(badge_text) + 10
        badge_r = QRect(rect.right() - badge_w - 8, rect.y() + 8, badge_w, 16)
        p.setBrush(col.darker(150))
        p.drawRoundedRect(badge_r, 3, 3)
        p.setPen(col)
        p.drawText(badge_r, Qt.AlignmentFlag.AlignCenter, badge_text)

        # step number
        p.setFont(QFont("Consolas", 9, QFont.Weight.Bold))
        p.setPen(QColor("#444"))
        num_r = QRect(rect.x() + 12, rect.y() + 8, 24, 16)
        p.drawText(num_r, Qt.AlignmentFlag.AlignCenter,
                   str(self.nodes.index(node) + 1))

        # name
        p.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
        p.setPen(QColor("#E0E0E0"))
        name_r = QRect(rect.x() + 18, rect.y() + 26, rect.width() - 26, 20)
        p.drawText(name_r, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
                   node.name)

        # sub-info: template badges
        icons = []
        if node.mail_template_id:
            icons.append("✉ Mail")
        if node.wa_template_id:
            icons.append("💬 WA")
        if node.required:
            icons.append("● Required")

        p.setFont(QFont("Consolas", 8))
        p.setPen(QColor("#5599FF") if icons else QColor("#333"))
        info_r = QRect(rect.x() + 18, rect.y() + 46, rect.width() - 30, 16)
        p.drawText(info_r, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
                   "  ".join(icons) if icons else "no triggers set")

    def _draw_arrow(self, p, above_rect):
        cx   = above_rect.center().x()
        top  = above_rect.bottom() + 1
        bot  = top + ARROW_H - 1

        p.setPen(QPen(QColor("#333"), 1, Qt.PenStyle.DashLine))
        p.drawLine(cx, top, cx, bot - 10)

        # arrowhead
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor("#444"))
        poly = QPolygon([
            QPoint(cx,      bot),
            QPoint(cx - 7, bot - 10),
            QPoint(cx + 7, bot - 10),
        ])
        p.drawPolygon(poly)

    # ── mouse ─────────────────────────────────────────────────────────────────
    def _hit(self, pos):
        for i in range(len(self.nodes)):
            if self._node_rect(i).contains(pos):
                return i
        return -1

    def mousePressEvent(self, e):
        i = self._hit(e.pos())
        self._selected = i
        self.update()
        if i >= 0:
            self.node_selected.emit(i)

    def mouseDoubleClickEvent(self, e):
        i = self._hit(e.pos())
        if i >= 0:
            self.node_dbl_click.emit(i)

    def mouseMoveEvent(self, e):
        h = self._hit(e.pos())
        if h != self._hover:
            self._hover = h
            self.update()

    # ── public ────────────────────────────────────────────────────────────────
    def set_nodes(self, nodes: list):
        self.nodes     = nodes
        self._selected = -1
        self.setMinimumHeight(self._content_height())
        self.update()

    def select(self, idx: int):
        self._selected = idx
        self.update()


# ═══════════════════════════════════════════════════════════════════════════════
#  STEP EDITOR DIALOG
# ═══════════════════════════════════════════════════════════════════════════════
class StepDialog(QDialog):
    def __init__(self, node: StepNode = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("STEP EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(480)
        self.result_node = None
        self._mail_templates = storage.load_db().get("mail_templates", [])
        self._wa_templates   = storage.load_db().get("whatsapp_templates", [])
        self._build()
        if node:
            self._load(node)

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  CONFIGURE STEP")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        form = QWidget()
        fl   = QVBoxLayout(form)
        fl.setContentsMargins(16, 14, 16, 14)
        fl.setSpacing(8)

        def _row(label, widget):
            h = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(140)
            h.addWidget(lbl)
            h.addWidget(widget)
            fl.addLayout(h)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("e.g. Welcome Letter")
        _row("STEP NAME", self.name_input)

        self.type_combo = QComboBox()
        self.type_combo.addItems(STEP_TYPES)
        _row("STEP TYPE", self.type_combo)

        # Mail template
        self.mail_combo = QComboBox()
        self.mail_combo.addItem("— none —", None)
        for t in self._mail_templates:
            self.mail_combo.addItem(t.get("name", t["id"]), t["id"])
        _row("MAIL TEMPLATE", self.mail_combo)

        # WA template
        self.wa_combo = QComboBox()
        self.wa_combo.addItem("— none —", None)
        for t in self._wa_templates:
            self.wa_combo.addItem(t.get("name", t["id"]), t["id"])
        _row("WA TEMPLATE", self.wa_combo)

        self.required_cb  = QCheckBox("Required (cannot skip)")
        self.skip_cb      = QCheckBox("Skippable by Manager")
        fl.addWidget(self.required_cb)
        fl.addWidget(self.skip_cb)

        notes_lbl = QLabel("NOTES / INSTRUCTIONS")
        notes_lbl.setObjectName("FormLabel")
        fl.addWidget(notes_lbl)
        self.notes_input = QTextEdit()
        self.notes_input.setFixedHeight(60)
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

    def _load(self, node: StepNode):
        self.name_input.setText(node.name)
        idx = self.type_combo.findText(node.step_type)
        if idx >= 0:
            self.type_combo.setCurrentIndex(idx)
        for i in range(self.mail_combo.count()):
            if self.mail_combo.itemData(i) == node.mail_template_id:
                self.mail_combo.setCurrentIndex(i)
                break
        for i in range(self.wa_combo.count()):
            if self.wa_combo.itemData(i) == node.wa_template_id:
                self.wa_combo.setCurrentIndex(i)
                break
        self.required_cb.setChecked(node.required)
        self.skip_cb.setChecked(node.skippable)
        self.notes_input.setText(node.notes)

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Required", "Step name cannot be empty.")
            return
        import uuid
        self.result_node = StepNode(
            uid              = str(uuid.uuid4())[:8],
            name             = name,
            step_type        = self.type_combo.currentText(),
            mail_template_id = self.mail_combo.currentData(),
            wa_template_id   = self.wa_combo.currentData(),
            required         = self.required_cb.isChecked(),
            skippable        = self.skip_cb.isChecked(),
            notes            = self.notes_input.toPlainText().strip(),
        )
        self.accept()


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTE EDITOR (canvas + controls for one route)
# ═══════════════════════════════════════════════════════════════════════════════
class RouteEditorPanel(QWidget):
    """Right-hand panel: canvas + step controls."""

    changed = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.route = None
        self._nodes: list[StepNode] = []
        self._build()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Top bar
        top = QHBoxLayout()
        top.setContentsMargins(10, 6, 10, 6)

        self.route_name = QLabel("— no route selected —")
        self.route_name.setObjectName("PageTitle")
        self.route_name.setStyleSheet("font-size:13px;")
        top.addWidget(self.route_name)
        top.addStretch()

        self.add_btn = QPushButton("+ ADD STEP")
        self.add_btn.clicked.connect(self._add_step)
        self.add_btn.setEnabled(False)
        top.addWidget(self.add_btn)

        self.del_btn = QPushButton("✕ REMOVE")
        self.del_btn.clicked.connect(self._del_step)
        self.del_btn.setEnabled(False)
        top.addWidget(self.del_btn)

        self.up_btn = QPushButton("↑")
        self.up_btn.setFixedWidth(32)
        self.up_btn.clicked.connect(self._move_up)
        self.up_btn.setEnabled(False)
        top.addWidget(self.up_btn)

        self.dn_btn = QPushButton("↓")
        self.dn_btn.setFixedWidth(32)
        self.dn_btn.clicked.connect(self._move_dn)
        self.dn_btn.setEnabled(False)
        top.addWidget(self.dn_btn)

        self.save_btn = QPushButton("💾 SAVE ROUTE")
        self.save_btn.setObjectName("PrimaryBtn")
        self.save_btn.clicked.connect(self._save_route)
        self.save_btn.setEnabled(False)
        top.addWidget(self.save_btn)

        top_frame = QFrame()
        top_frame.setObjectName("StatCard")
        top_frame.setLayout(top)
        layout.addWidget(top_frame)

        # Canvas in scroll area
        self.canvas = WireCanvas()
        self.canvas.node_selected.connect(self._on_select)
        self.canvas.node_dbl_click.connect(self._edit_step)

        scroll = QScrollArea()
        scroll.setWidget(self.canvas)
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("background:#0D0D14; border:none;")
        layout.addWidget(scroll, 1)

        # Instruction footer
        foot = QLabel(
            "  Double-click a node to edit   ·   ↑↓ to reorder   ·   ✕ to remove"
        )
        foot.setStyleSheet("color:#333; font-size:9px; padding:4px 10px;")
        layout.addWidget(foot)

    # ── public ────────────────────────────────────────────────────────────────
    def load_route(self, route: dict):
        self.route = route
        self._nodes = [StepNode.from_dict(s) for s in route.get("steps", [])]
        self.route_name.setText(f"  ROUTE: {route.get('name', '').upper()}")
        self.add_btn.setEnabled(True)
        self.save_btn.setEnabled(True)
        self._sel = -1
        self._refresh()

    def clear(self):
        self.route = None
        self._nodes = []
        self.route_name.setText("— no route selected —")
        self.add_btn.setEnabled(False)
        self.save_btn.setEnabled(False)
        self.del_btn.setEnabled(False)
        self.up_btn.setEnabled(False)
        self.dn_btn.setEnabled(False)
        self._refresh()

    # ── internals ─────────────────────────────────────────────────────────────
    def _refresh(self):
        self.canvas.set_nodes(self._nodes)

    def _on_select(self, idx: int):
        self._sel = idx
        has = idx >= 0
        self.del_btn.setEnabled(has)
        self.up_btn.setEnabled(has and idx > 0)
        self.dn_btn.setEnabled(has and idx < len(self._nodes) - 1)

    def _add_step(self):
        dlg = StepDialog(parent=self)
        if dlg.exec() and dlg.result_node:
            self._nodes.append(dlg.result_node)
            self._refresh()
            self.changed.emit()

    def _edit_step(self, idx: int):
        dlg = StepDialog(node=self._nodes[idx], parent=self)
        if dlg.exec() and dlg.result_node:
            dlg.result_node.uid = self._nodes[idx].uid
            self._nodes[idx]    = dlg.result_node
            self._refresh()
            self.changed.emit()

    def _del_step(self):
        if not hasattr(self, "_sel") or self._sel < 0:
            return
        self._nodes.pop(self._sel)
        self._sel = -1
        self.del_btn.setEnabled(False)
        self.up_btn.setEnabled(False)
        self.dn_btn.setEnabled(False)
        self._refresh()
        self.changed.emit()

    def _move_up(self):
        i = self._sel
        if i > 0:
            self._nodes[i - 1], self._nodes[i] = self._nodes[i], self._nodes[i - 1]
            self._sel = i - 1
            self.canvas.select(self._sel)
            self._refresh()
            self.changed.emit()

    def _move_dn(self):
        i = self._sel
        if i < len(self._nodes) - 1:
            self._nodes[i], self._nodes[i + 1] = self._nodes[i + 1], self._nodes[i]
            self._sel = i + 1
            self.canvas.select(self._sel)
            self._refresh()
            self.changed.emit()

    def _save_route(self):
        if not self.route:
            return
        db    = storage.load_db()
        routes = db.get("routes", [])
        for r in routes:
            if r["id"] == self.route["id"]:
                r["steps"] = [n.to_dict() for n in self._nodes]
                break
        storage.save_db(db)
        storage.log_activity("UPDATE", f"Route '{self.route['name']}' updated")
        QMessageBox.information(self, "Saved", "Route saved successfully.")
        self.changed.emit()


# ═══════════════════════════════════════════════════════════════════════════════
#  NEW / EDIT ROUTE DIALOG
# ═══════════════════════════════════════════════════════════════════════════════
class RouteDialog(QDialog):
    def __init__(self, route=None, parent=None):
        super().__init__(parent)
        self.setObjectName("DialogBox")
        self.setWindowTitle("ROUTE")
        self.setMinimumWidth(380)
        self.result = None
        self._build()
        if route:
            self.name_input.setText(route.get("name", ""))
            self.desc_input.setText(route.get("description", ""))
            self.req_cb.setChecked(route.get("requires_sr", True))

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        tb = QLabel("  ROUTE DETAILS")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        form = QWidget()
        fl   = QVBoxLayout(form)
        fl.setContentsMargins(16, 14, 16, 14)
        fl.setSpacing(8)

        def _row(label, widget):
            h = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(110)
            h.addWidget(lbl)
            h.addWidget(widget)
            fl.addLayout(h)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("e.g. New Customer Onboarding")
        _row("ROUTE NAME", self.name_input)

        self.desc_input = QLineEdit()
        self.desc_input.setPlaceholderText("Short description")
        _row("DESCRIPTION", self.desc_input)

        self.req_cb = QCheckBox("Requires an SR to trigger")
        fl.addWidget(self.req_cb)
        self.req_cb.setChecked(True)

        layout.addWidget(form)

        btns = QHBoxLayout()
        btns.setContentsMargins(16, 8, 16, 14)
        btns.addStretch()
        cancel = QPushButton("CANCEL"); cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        ok = QPushButton("SAVE"); ok.setObjectName("PrimaryBtn"); ok.clicked.connect(self._save)
        btns.addWidget(ok)
        layout.addLayout(btns)

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Required", "Route name cannot be empty.")
            return
        import uuid
        self.result = {
            "id":          str(uuid.uuid4())[:8],
            "name":        name,
            "description": self.desc_input.text().strip(),
            "requires_sr": self.req_cb.isChecked(),
            "steps":       [],
        }
        self.accept()


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN PAGE
# ═══════════════════════════════════════════════════════════════════════════════
class RoutePage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user  = user
        self._build()
        self._load_routes()

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("ROUTES")
        title.setObjectName("PageTitle")
        hdr.addWidget(title)
        hdr.addStretch()
        new_btn = QPushButton("+ NEW ROUTE")
        new_btn.clicked.connect(self._new_route)
        hdr.addWidget(new_btn)
        del_btn = QPushButton("✕ DELETE")
        del_btn.clicked.connect(self._del_route)
        hdr.addWidget(del_btn)
        layout.addLayout(hdr)

        # Legend
        legend = QHBoxLayout()
        legend.addWidget(QLabel("Step types: "))
        for stype, col in STEP_COLORS.items():
            dot = QLabel(f"● {stype}")
            dot.setStyleSheet(f"color:{col}; font-size:9px;")
            legend.addWidget(dot)
        legend.addStretch()
        layout.addLayout(legend)

        # Split: route list | editor
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Left — route list
        left = QFrame()
        left.setObjectName("StatCard")
        left.setMinimumWidth(220)
        left.setMaximumWidth(260)
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        ll.setSpacing(0)

        hdr2 = QLabel("  ROUTE LIST")
        hdr2.setStyleSheet(
            "color:#555; font-size:9px; letter-spacing:2px;"
            "padding:6px 0; border-bottom:1px solid #1E1E28;")
        ll.addWidget(hdr2)

        self.route_table = QTableWidget()
        self.route_table.setColumnCount(2)
        self.route_table.setHorizontalHeaderLabels(["NAME", "STEPS"])
        self.route_table.horizontalHeader().setStretchLastSection(True)
        self.route_table.setColumnWidth(0, 150)
        self.route_table.verticalHeader().setVisible(False)
        self.route_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.route_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.route_table.setAlternatingRowColors(True)
        self.route_table.setStyleSheet("alternate-background-color: #13131A;")
        self.route_table.itemSelectionChanged.connect(self._on_route_select)
        ll.addWidget(self.route_table)
        splitter.addWidget(left)

        # Right — editor
        self.editor = RouteEditorPanel()
        self.editor.changed.connect(self._load_routes)
        splitter.addWidget(self.editor)
        splitter.setSizes([240, 720])

        layout.addWidget(splitter, 1)

    # ── data ──────────────────────────────────────────────────────────────────
    def _load_routes(self):
        self._routes = storage.load_db().get("routes", [])
        self.route_table.setRowCount(len(self._routes))
        for i, r in enumerate(self._routes):
            self.route_table.setRowHeight(i, 24)
            self.route_table.setItem(i, 0, QTableWidgetItem(r.get("name", "")))
            n_item = QTableWidgetItem(str(len(r.get("steps", []))))
            n_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.route_table.setItem(i, 1, n_item)

    def _on_route_select(self):
        rows = self.route_table.selectedItems()
        if not rows:
            self.editor.clear()
            return
        idx = self.route_table.currentRow()
        if 0 <= idx < len(self._routes):
            self.editor.load_route(self._routes[idx])

    def _new_route(self):
        dlg = RouteDialog(parent=self)
        if dlg.exec() and dlg.result:
            db = storage.load_db()
            db.setdefault("routes", []).append(dlg.result)
            storage.save_db(db)
            storage.log_activity("CREATE", f"Route '{dlg.result['name']}' created")
            self._load_routes()

    def _del_route(self):
        idx = self.route_table.currentRow()
        if idx < 0:
            return
        r = self._routes[idx]
        if QMessageBox.question(
            self, "Delete Route",
            f"Delete route '{r['name']}'? This cannot be undone.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        ) == QMessageBox.StandardButton.Yes:
            db = storage.load_db()
            db["routes"] = [x for x in db.get("routes", []) if x["id"] != r["id"]]
            storage.save_db(db)
            storage.log_activity("DELETE", f"Route '{r['name']}' deleted")
            self.editor.clear()
            self._load_routes()


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTE TRIGGER  — call this when an SR step is completed
# ═══════════════════════════════════════════════════════════════════════════════
def trigger_step(step: dict, sr: dict, wa_contact_id: str = None, wa_contact_name: str = None):
    """
    Call this from sr_page.py when advancing an SR through a route step.

    step           — dict from route["steps"]
    sr             — full SR dict (for template variable substitution)
    wa_contact_id  — WhatsApp chat ID of the customer (if known)
    wa_contact_name— WhatsApp display name of the customer
    """
    db = storage.load_db()
    mail_templates = {t["id"]: t for t in db.get("mail_templates", [])}
    wa_templates   = {t["id"]: t for t in db.get("whatsapp_templates", [])}

    # Email
    mid = step.get("mail_template_id")
    if mid and mid in mail_templates:
        tmpl    = mail_templates[mid]
        to_addr = sr.get("customer_contact") or sr.get("customer_email", "")
        if to_addr:
            subject = _fill_template(tmpl.get("subject", ""), sr)
            body    = _fill_template(tmpl.get("body", ""),    sr)
            _fire_email(to_addr, subject, body)

    # WhatsApp
    wid = step.get("wa_template_id")
    if wid and wid in wa_templates and wa_contact_id:
        tmpl = wa_templates[wid]
        msg  = _fill_template(tmpl.get("body", ""), sr)
        _fire_whatsapp(wa_contact_id, wa_contact_name or "", msg)


# ═══════════════════════════════════════════════════════════════════════════════
#  TEST-COMPATIBILITY ALIASES
# ═══════════════════════════════════════════════════════════════════════════════

class RouteEditorDialog(RouteDialog):
    """
    Alias for RouteDialog — accepts an optional user argument so tests can do
    RouteEditorDialog(admin) without breaking.
    """
    def __init__(self, user=None, route=None, parent=None):
        super().__init__(route=route, parent=parent)


class StepEditorDialog(QDialog):
    """
    Test-compatible step editor.
    Exposes: name_input, type_combo, required_cb, mail_cb, skip_cb,
             result_step (dict with keys name, step_type, triggers_mail,
             mail_template_id, wa_template_id, skippable, notes).
    """
    def __init__(self, node: StepNode = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("STEP EDITOR")
        self.setObjectName("DialogBox")
        self.setMinimumWidth(480)
        self.result_step = None
        self._mail_templates = storage.load_db().get("mail_templates", [])
        self._wa_templates   = storage.load_db().get("whatsapp_templates", [])
        self._build()
        if node:
            self._load(node)

    def _build(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        tb = QLabel("  CONFIGURE STEP")
        tb.setObjectName("DialogTitle")
        layout.addWidget(tb)

        form = QWidget()
        fl   = QVBoxLayout(form)
        fl.setContentsMargins(16, 14, 16, 14)
        fl.setSpacing(8)

        def _row(label, widget):
            h = QHBoxLayout()
            lbl = QLabel(label)
            lbl.setObjectName("FormLabel")
            lbl.setFixedWidth(140)
            h.addWidget(lbl)
            h.addWidget(widget)
            fl.addLayout(h)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("e.g. Welcome Letter")
        _row("STEP NAME", self.name_input)

        self.type_combo = QComboBox()
        self.type_combo.addItems(STEP_TYPES)
        _row("STEP TYPE", self.type_combo)

        self.mail_tmpl_combo = QComboBox()
        self.mail_tmpl_combo.addItem("— none —", None)
        for t in self._mail_templates:
            self.mail_tmpl_combo.addItem(t.get("name", t["id"]), t["id"])
        _row("MAIL TEMPLATE", self.mail_tmpl_combo)

        self.wa_tmpl_combo = QComboBox()
        self.wa_tmpl_combo.addItem("— none —", None)
        for t in self._wa_templates:
            self.wa_tmpl_combo.addItem(t.get("name", t["id"]), t["id"])
        _row("WA TEMPLATE", self.wa_tmpl_combo)

        # mail_cb / wa_cb — whether to trigger mail/WA for this step
        self.mail_cb = QCheckBox("Trigger mail on this step")
        self.wa_cb   = QCheckBox("Trigger WhatsApp on this step")
        fl.addWidget(self.mail_cb)
        fl.addWidget(self.wa_cb)

        self.required_cb = QCheckBox("Required (cannot skip)")
        self.skip_cb     = QCheckBox("Skippable by Manager")
        fl.addWidget(self.required_cb)
        fl.addWidget(self.skip_cb)

        notes_lbl = QLabel("NOTES / INSTRUCTIONS")
        notes_lbl.setObjectName("FormLabel")
        fl.addWidget(notes_lbl)
        self.notes_input = QTextEdit()
        self.notes_input.setFixedHeight(60)
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

    def _load(self, node: StepNode):
        self.name_input.setText(node.name)
        idx = self.type_combo.findText(node.step_type)
        if idx >= 0:
            self.type_combo.setCurrentIndex(idx)
        for i in range(self.mail_tmpl_combo.count()):
            if self.mail_tmpl_combo.itemData(i) == node.mail_template_id:
                self.mail_tmpl_combo.setCurrentIndex(i)
                break
        for i in range(self.wa_tmpl_combo.count()):
            if self.wa_tmpl_combo.itemData(i) == node.wa_template_id:
                self.wa_tmpl_combo.setCurrentIndex(i)
                break
        self.mail_cb.setChecked(bool(node.mail_template_id))
        self.wa_cb.setChecked(bool(node.wa_template_id))
        self.required_cb.setChecked(node.required)
        self.skip_cb.setChecked(node.skippable)
        self.notes_input.setText(node.notes)

    def _save(self):
        name = self.name_input.text().strip()
        if not name:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "Required", "Step name cannot be empty.")
            return
        import uuid
        mail_tid = self.mail_tmpl_combo.currentData() if self.mail_cb.isChecked() else None
        wa_tid   = self.wa_tmpl_combo.currentData()   if self.wa_cb.isChecked()   else None
        self.result_step = {
            "uid":              str(uuid.uuid4())[:8],
            "name":             name,
            "step_type":        self.type_combo.currentText(),
            "mail_template_id": mail_tid,
            "wa_template_id":   wa_tid,
            "triggers_mail":    self.mail_cb.isChecked(),
            "triggers_wa":      self.wa_cb.isChecked(),
            "required":         self.required_cb.isChecked(),
            "skippable":        self.skip_cb.isChecked(),
            "notes":            self.notes_input.toPlainText().strip(),
        }
        self.accept()
