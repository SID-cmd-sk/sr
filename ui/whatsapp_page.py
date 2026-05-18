"""
SR Manager - WhatsApp Page (Updated)
Uses CORRECT signal names from core/whatsapp.py:
  sig_qr, sig_ready, sig_disconnected, sig_logged_out,
  sig_groups, sig_sent, sig_error, sig_node_missing,
  sig_deps_needed, sig_log
"""

import sys as _sys
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))

import json, io, datetime as _dt

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QPushButton, QTextEdit, QComboBox, QTableWidget,
    QTableWidgetItem, QSplitter, QTabWidget, QLineEdit,
    QMessageBox, QCheckBox, QTimeEdit, QDialog
)
from PyQt6.QtCore  import Qt, QTimer, QTime
from PyQt6.QtGui   import QPixmap, QImage, QColor

from core import storage
from core.whatsapp import WhatsAppManager, find_node

try:
    import qrcode
    from PIL import Image
    HAS_QR = True
except ImportError:
    HAS_QR = False


# ── QR renderer ──────────────────────────────────────────────────────────────
def _qr_to_pixmap(data: str, size=260) -> QPixmap:
    if not HAS_QR or not data:
        return QPixmap()
    try:
        qr = qrcode.QRCode(version=1,
                            error_correction=qrcode.constants.ERROR_CORRECT_L,
                            box_size=6, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#00D4AA", back_color="#0D0D12")
        img = img.resize((size, size), Image.NEAREST)
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        qi = QImage(); qi.loadFromData(buf.read())
        return QPixmap.fromImage(qi)
    except Exception:
        return QPixmap()


# ── Daily report ─────────────────────────────────────────────────────────────
DEFAULT_REPORT_TEMPLATE = (
    "Daily SR Report - {date}\n\n"
    "Open       : {open_sr}\n"
    "In Progress: {in_progress}\n"
    "Pending    : {pending_sr}\n"
    "Closed     : {closed_sr}\n"
    "Total      : {total_sr}\n\n"
    "Generated at {time} by SR Manager."
)
_KEY = "wa_daily_report"

def _load_cfg():
    return storage.load_db().get(_KEY, {
        "enabled": False, "time": "09:00",
        "template": DEFAULT_REPORT_TEMPLATE, "recipients": []})

def _save_cfg(cfg):
    db = storage.load_db(); db[_KEY] = cfg; storage.save_db(db)

def _build_report(tmpl):
    s = storage.get_dashboard_stats(); n = _dt.datetime.now()
    for k,v in {"{date}":n.strftime("%d %b %Y"),"{time}":n.strftime("%H:%M"),
                "{open_sr}":str(s.get("open",0)),"{closed_sr}":str(s.get("closed",0)),
                "{in_progress}":str(s.get("in_progress",0)),
                "{total_sr}":str(s.get("total",0)),
                "{pending_sr}":str(s.get("pending",0))}.items():
        tmpl = tmpl.replace(k,v)
    return tmpl


class _Scheduler:
    def __init__(self, wa): self.wa=wa; self._last=None; self._t=None
    def start(self):
        self._t=QTimer(); self._t.timeout.connect(self._tick); self._t.start(60000)
    def _tick(self):
        cfg=_load_cfg()
        if not cfg.get("enabled"): return
        now=_dt.datetime.now()
        if now.date()==self._last: return
        try: h,m=map(int,cfg["time"].split(":"))
        except: return
        if now.hour==h and now.minute==m:
            self._do(cfg); self._last=now.date()
    def _do(self,cfg):
        body=_build_report(cfg.get("template",DEFAULT_REPORT_TEMPLATE))
        for r in cfg.get("recipients",[]): self.wa.send_to_jid(r["id"],body)
    def now(self): self._do(_load_cfg())


class DailyReportDialog(QDialog):
    def __init__(self, contacts, parent=None):
        super().__init__(parent); self.contacts=contacts
        self.setWindowTitle("DAILY REPORT"); self.setObjectName("DialogBox"); self.setMinimumWidth(500)
        self._build(); self._load()

    def _build(self):
        l=QVBoxLayout(self); l.setContentsMargins(0,0,0,0)
        tb=QLabel("  DAILY REPORT SETTINGS"); tb.setObjectName("DialogTitle"); l.addWidget(tb)
        fw=QWidget(); fl=QVBoxLayout(fw); fl.setContentsMargins(14,12,14,12); fl.setSpacing(8)
        self.cb=QCheckBox("Enable Daily Report"); fl.addWidget(self.cb)
        tr=QHBoxLayout(); lbl=QLabel("TIME"); lbl.setObjectName("FormLabel"); lbl.setFixedWidth(80)
        self.te=QTimeEdit(); self.te.setDisplayFormat("HH:mm")
        tr.addWidget(lbl); tr.addWidget(self.te); tr.addStretch(); fl.addLayout(tr)
        fl.addWidget(QLabel("RECIPIENTS:"))
        self.rt=QTableWidget(); self.rt.setColumnCount(2)
        self.rt.setHorizontalHeaderLabels(["","NAME"]); self.rt.horizontalHeader().setStretchLastSection(True)
        self.rt.setColumnWidth(0,40); self.rt.verticalHeader().setVisible(False)
        self.rt.setFixedHeight(120); self.rt.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self._cbs=[]
        self.rt.setRowCount(len(self.contacts))
        for i,c in enumerate(self.contacts):
            self.rt.setRowHeight(i,22)
            cb=QCheckBox(); w=QWidget(); wl=QHBoxLayout(w); wl.addWidget(cb)
            wl.setAlignment(Qt.AlignmentFlag.AlignCenter); wl.setContentsMargins(0,0,0,0)
            self.rt.setCellWidget(i,0,w); self.rt.setItem(i,1,QTableWidgetItem(c["name"]))
            self._cbs.append((cb,c))
        fl.addWidget(self.rt)
        fl.addWidget(QLabel("TEMPLATE  ({date} {time} {open_sr} {in_progress} {pending_sr} {closed_sr} {total_sr})"))
        self.tmpl=QTextEdit(); self.tmpl.setFixedHeight(100); fl.addWidget(self.tmpl)
        l.addWidget(fw)
        br=QHBoxLayout(); br.setContentsMargins(14,6,14,14); br.addStretch()
        cn=QPushButton("CANCEL"); cn.clicked.connect(self.reject); br.addWidget(cn)
        ok=QPushButton("SAVE"); ok.setObjectName("PrimaryBtn"); ok.clicked.connect(self._save); br.addWidget(ok)
        l.addLayout(br)

    def _load(self):
        cfg=_load_cfg(); self.cb.setChecked(cfg.get("enabled",False))
        try: h,m=map(int,cfg.get("time","09:00").split(":")); self.te.setTime(QTime(h,m))
        except: self.te.setTime(QTime(9,0))
        self.tmpl.setPlainText(cfg.get("template",DEFAULT_REPORT_TEMPLATE))
        ids={r["id"] for r in cfg.get("recipients",[])}
        for cb,c in self._cbs: cb.setChecked(c["id"] in ids)

    def _save(self):
        t=self.te.time()
        _save_cfg({"enabled":self.cb.isChecked(),
                   "time":f"{t.hour():02d}:{t.minute():02d}",
                   "template":self.tmpl.toPlainText(),
                   "recipients":[c for cb,c in self._cbs if cb.isChecked()]})
        self.accept()


# ── log helper ────────────────────────────────────────────────────────────────
def _log(table, to, preview, status):
    row=table.rowCount(); table.insertRow(row); table.setRowHeight(row,22)
    now=_dt.datetime.now().strftime("%H:%M:%S")
    table.setItem(row,0,QTableWidgetItem(now))
    table.setItem(row,1,QTableWidgetItem(to))
    table.setItem(row,2,QTableWidgetItem(preview[:50]))
    si=QTableWidgetItem(status)
    si.setForeground(QColor("#00D4AA" if status=="Sent" else "#E05555" if status=="Failed" else "#D4A800"))
    table.setItem(row,3,si); table.scrollToBottom()

def _shdr(text):
    l=QLabel(f"  {text}")
    l.setStyleSheet("color:#555;font-size:9px;letter-spacing:2px;padding:6px 0;border-bottom:1px solid #1E1E28;")
    return l


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN PAGE
# ═══════════════════════════════════════════════════════════════════════════════
class WhatsAppPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user=user
        self.wa=WhatsAppManager(self)
        self._groups=[]
        self._sel_id=None; self._sel_name=None
        self._sched=_Scheduler(self.wa)
        self._build()
        self._wire()
        self._sched.start()

    def _build(self):
        lay=QVBoxLayout(self); lay.setContentsMargins(14,10,14,10); lay.setSpacing(10)

        # header
        hdr=QHBoxLayout(); t=QLabel("WHATSAPP"); t.setObjectName("PageTitle"); hdr.addWidget(t); hdr.addStretch()
        if self.user.get("role") in ("Admin","Manager"):
            rb=QPushButton("📅 DAILY REPORT CONFIG"); rb.clicked.connect(self._rpt_cfg); hdr.addWidget(rb)
            self.snb=QPushButton("▶ SEND NOW"); self.snb.clicked.connect(self._rpt_now); hdr.addWidget(self.snb)
        lay.addLayout(hdr)

        # status bar
        sf=QFrame(); sf.setObjectName("StatCard"); sl=QHBoxLayout(sf); sl.setContentsMargins(10,6,10,6)
        self.dot=QLabel("●"); self.dot.setStyleSheet("color:#E05555;font-size:14px;")
        self.stl=QLabel("Not connected"); self.stl.setObjectName("FormLabel")
        sl.addWidget(self.dot); sl.addWidget(self.stl); sl.addStretch()
        self.cbtn=QPushButton("▶  START + CONNECT"); self.cbtn.clicked.connect(self._start)
        self.dbtn=QPushButton("■  DISCONNECT"); self.dbtn.clicked.connect(self.wa.disconnect_wa); self.dbtn.setEnabled(False)
        sl.addWidget(self.cbtn); sl.addWidget(self.dbtn)
        lay.addWidget(sf)

        # QR
        self.qr_lbl=QLabel(); self.qr_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter); self.qr_lbl.hide()
        self.qr_hint=QLabel("Scan in WhatsApp → Linked Devices → Link a Device")
        self.qr_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.qr_hint.setStyleSheet("color:#D4A800;font-size:10px;"); self.qr_hint.hide()
        lay.addWidget(self.qr_lbl); lay.addWidget(self.qr_hint)

        # splitter
        sp=QSplitter(Qt.Orientation.Horizontal)

        # left: groups
        lf=QFrame(); lf.setObjectName("StatCard"); lf.setMinimumWidth(200); lf.setMaximumWidth(260)
        ll=QVBoxLayout(lf); ll.setContentsMargins(0,0,0,0)
        ll.addWidget(_shdr("GROUPS & CONTACTS"))
        self.sb=QLineEdit(); self.sb.setPlaceholderText("Search…"); self.sb.textChanged.connect(self._filter)
        ll.addWidget(self.sb)
        self.gt=QTableWidget(); self.gt.setColumnCount(1)
        self.gt.horizontalHeader().setVisible(False); self.gt.horizontalHeader().setStretchLastSection(True)
        self.gt.verticalHeader().setVisible(False)
        self.gt.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.gt.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.gt.setAlternatingRowColors(True); self.gt.setStyleSheet("alternate-background-color:#13131A;")
        self.gt.itemSelectionChanged.connect(self._sel)
        ll.addWidget(self.gt)
        rfr=QPushButton("↺ Refresh Groups"); rfr.clicked.connect(self.wa.get_groups); ll.addWidget(rfr)
        sp.addWidget(lf)

        # right: tabs
        rw=QWidget(); rl=QVBoxLayout(rw); rl.setContentsMargins(0,0,0,0)
        self.tabs=QTabWidget()

        # compose
        cw=QWidget(); cl=QVBoxLayout(cw); cl.setContentsMargins(10,10,10,10); cl.setSpacing(8)
        self.tol=QLabel("No contact selected"); self.tol.setStyleSheet("color:#D4A800;padding:4px 0;")
        cl.addWidget(self.tol)
        tr=QHBoxLayout(); tr.addWidget(QLabel("Template:"))
        self.tc=QComboBox(); self.tc.addItem("— none —",None)
        for t in storage.get_whatsapp_templates():
            self.tc.addItem(t.get("name",t.get("id","")),t.get("message",""))
        self.tc.currentIndexChanged.connect(self._tmpl); tr.addWidget(self.tc,1); cl.addLayout(tr)
        self.mi=QTextEdit(); self.mi.setPlaceholderText("Type your message…"); cl.addWidget(self.mi,1)
        sr=QHBoxLayout(); sr.addStretch()
        self.sb2=QPushButton("💬  SEND"); self.sb2.setObjectName("PrimaryBtn"); self.sb2.setFixedWidth(120)
        self.sb2.clicked.connect(self._send); sr.addWidget(self.sb2); cl.addLayout(sr)
        self.tabs.addTab(cw,"💬  COMPOSE")

        # log
        lw=QWidget(); lll=QVBoxLayout(lw); lll.setContentsMargins(0,0,0,0)
        self.lt=QTableWidget(); self.lt.setColumnCount(4)
        self.lt.setHorizontalHeaderLabels(["TIME","TO","PREVIEW","STATUS"])
        self.lt.setColumnWidth(0,70); self.lt.setColumnWidth(1,120); self.lt.setColumnWidth(3,60)
        self.lt.horizontalHeader().setStretchLastSection(True); self.lt.verticalHeader().setVisible(False)
        self.lt.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.lt.setAlternatingRowColors(True); self.lt.setStyleSheet("alternate-background-color:#13131A;")
        lll.addWidget(self.lt); self.tabs.addTab(lw,"📋  LOG")

        # ── Tab 3: Contacts / Groups ──────────────────────────────────────
        ctw = QWidget()
        ctl = QVBoxLayout(ctw)
        ctl.setContentsMargins(10, 10, 10, 10)
        ctl.addWidget(_shdr("CONTACTS & GROUPS"))
        self.ct = QTableWidget()
        self.ct.setColumnCount(3)
        self.ct.setHorizontalHeaderLabels(["JID", "NAME", "TYPE"])
        self.ct.horizontalHeader().setStretchLastSection(True)
        self.ct.verticalHeader().setVisible(False)
        self.ct.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.ct.setAlternatingRowColors(True)
        self.ct.setStyleSheet("alternate-background-color:#13131A;")
        ctl.addWidget(self.ct, 1)
        rfr2 = QPushButton("↺ Refresh")
        rfr2.clicked.connect(self._refresh_contacts_tab)
        ctl.addWidget(rfr2)
        self.tabs.addTab(ctw, "👥  CONTACTS")

        # ── Tab 4: Daily Report ───────────────────────────────────────────
        drw = QWidget()
        drl = QVBoxLayout(drw)
        drl.setContentsMargins(10, 10, 10, 10)
        drl.addWidget(_shdr("DAILY REPORT"))
        drl.addWidget(QLabel("Configure automated daily SR summary sent to WhatsApp groups."))
        cfg_btn = QPushButton("⚙  CONFIGURE DAILY REPORT")
        cfg_btn.clicked.connect(self._rpt_cfg_tab)
        drl.addWidget(cfg_btn)
        snw_btn = QPushButton("▶  SEND NOW")
        snw_btn.clicked.connect(self._rpt_now)
        drl.addWidget(snw_btn)
        drl.addStretch()
        self.tabs.addTab(drw, "📅  DAILY REPORT")

        # ── Tab 5: Settings ───────────────────────────────────────────────
        stw = QWidget()
        stl2 = QVBoxLayout(stw)
        stl2.setContentsMargins(10, 10, 10, 10)
        stl2.addWidget(_shdr("WHATSAPP SETTINGS"))
        stl2.addWidget(QLabel("Session directory:"))
        from pathlib import Path as _P
        sess_lbl = QLabel(str(_P(__file__).resolve().parent.parent / "wa_bridge" / "wa_session"))
        sess_lbl.setStyleSheet("color:#5599FF; font-size:9px;")
        sess_lbl.setWordWrap(True)
        stl2.addWidget(sess_lbl)
        clear_btn = QPushButton("🗑  CLEAR SESSION (force re-login)")
        clear_btn.clicked.connect(self._clear_session)
        stl2.addWidget(clear_btn)
        stl2.addStretch()
        self.tabs.addTab(stw, "⚙  SETTINGS")

        rl.addWidget(self.tabs); sp.addWidget(rw); sp.setSizes([240,620]); lay.addWidget(sp,1)

    # ── wire up ACTUAL signals from core/whatsapp.py ─────────────────────────
    def _wire(self):
        self.wa.sig_qr.connect(self._qr)
        self.wa.sig_ready.connect(self._ready)
        self.wa.sig_disconnected.connect(self._disc)
        self.wa.sig_logged_out.connect(lambda: self._disc("logged out"))
        self.wa.sig_groups.connect(self._groups_recv)
        self.wa.sig_error.connect(lambda m,d: _log(self.lt,"ERR",f"{m}: {d}","Failed"))
        self.wa.sig_sent.connect(lambda jid,prev: _log(self.lt,jid,prev,"Sent"))
        self.wa.sig_node_missing.connect(lambda: QMessageBox.critical(self,"Node.js Missing","Install Node.js from https://nodejs.org"))
        self.wa.sig_deps_needed.connect(lambda: QMessageBox.warning(self,"npm install needed","Run:  cd wa_bridge && npm install"))
        self.wa.sig_log.connect(lambda m: _log(self.lt,"SYS",m,"Info"))

    def _start(self):
        self.cbtn.setEnabled(False); self.cbtn.setText("Starting…")
        self.dot.setStyleSheet("color:#D4A800;font-size:14px;"); self.stl.setText("Starting bridge…")
        self.wa.start_bridge()
        QTimer.singleShot(1500, self.wa.connect_wa)

    def _qr(self, data):
        self.stl.setText("Scan QR in WhatsApp")
        px=_qr_to_pixmap(data)
        if not px.isNull(): self.qr_lbl.setPixmap(px)
        else: self.qr_lbl.setText(f"QR: {data[:40]}…")
        self.qr_lbl.show(); self.qr_hint.show()

    def _ready(self, phone, name):
        self.qr_lbl.hide(); self.qr_hint.hide()
        self.dot.setStyleSheet("color:#00D4AA;font-size:14px;")
        self.stl.setText(f"Connected  ·  {name}  ({phone})")
        self.cbtn.setEnabled(False); self.cbtn.setText("✓ Connected"); self.dbtn.setEnabled(True)
        self.wa.get_groups()

    def _disc(self, reason=""):
        self.dot.setStyleSheet("color:#E05555;font-size:14px;")
        self.stl.setText(f"Disconnected  {reason}")
        self.cbtn.setEnabled(True); self.cbtn.setText("▶  START + CONNECT"); self.dbtn.setEnabled(False)

    def _groups_recv(self, groups):
        self._groups=[{"id":g["jid"],"name":g.get("name",g["jid"])} for g in groups]
        self._render()
        self._refresh_contacts_tab()

    def _filter(self): self._render()

    def _render(self):
        q=self.sb.text().lower()
        rows=[g for g in self._groups if q in g["name"].lower()]
        self.gt.setRowCount(len(rows))
        for i,g in enumerate(rows):
            self.gt.setRowHeight(i,22)
            item=QTableWidgetItem("👥 "+g["name"])
            item.setData(Qt.ItemDataRole.UserRole,(g["id"],g["name"]))
            item.setForeground(QColor("#AA55FF")); self.gt.setItem(i,0,item)

    def _sel(self):
        r=self.gt.currentRow()
        if r<0: return
        item=self.gt.item(r,0)
        if item:
            d=item.data(Qt.ItemDataRole.UserRole)
            if d: self._sel_id,self._sel_name=d; self.tol.setText(f"→  {self._sel_name}")

    def _tmpl(self, idx):
        b=self.tc.currentData()
        if b: self.mi.setPlainText(b)

    def _send(self):
        if not self._sel_id:
            QMessageBox.warning(self,"No Recipient","Select a group from the list.\nClick ↺ Refresh Groups after connecting."); return
        msg=self.mi.toPlainText().strip()
        if not msg: QMessageBox.warning(self,"Empty","Message cannot be empty."); return
        _log(self.lt,self._sel_name,msg,"Sending…")
        self.wa.send_to_jid(self._sel_id,msg); self.tabs.setCurrentIndex(1)

    def _rpt_cfg(self):
        if not self._groups:
            QMessageBox.information(self,"Not Connected","Connect and refresh groups first."); return
        DailyReportDialog(self._groups,parent=self).exec()

    def _rpt_cfg_tab(self):
        """Daily report config triggered from the tab."""
        self._rpt_cfg()

    def _rpt_now(self):
        cfg=_load_cfg()
        if not cfg.get("recipients"):
            QMessageBox.warning(self,"No Recipients","Configure recipients in Daily Report Config."); return
        self._sched.now(); _log(self.lt,"REPORT","Daily report sent manually","Sent")

    def _refresh_contacts_tab(self):
        """Populate the contacts tab table from current groups list."""
        self.ct.setRowCount(len(self._groups))
        for i, g in enumerate(self._groups):
            self.ct.setRowHeight(i, 22)
            self.ct.setItem(i, 0, QTableWidgetItem(g.get("id", "")))
            self.ct.setItem(i, 1, QTableWidgetItem(g.get("name", "")))
            self.ct.setItem(i, 2, QTableWidgetItem("Group"))
        self.wa.get_groups()

    def _clear_session(self):
        import shutil
        from pathlib import Path as _P
        sess = _P(__file__).resolve().parent.parent / "wa_bridge" / "wa_session"
        if QMessageBox.question(
            self, "Clear Session",
            "This will log you out of WhatsApp. Continue?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        ) == QMessageBox.StandardButton.Yes:
            self.wa.stop_bridge() if hasattr(self.wa, "stop_bridge") else None
            try:
                if sess.exists():
                    shutil.rmtree(sess)
                    sess.mkdir(parents=True, exist_ok=True)
                QMessageBox.information(self, "Done", "Session cleared. Restart bridge to re-login.")
            except Exception as e:
                QMessageBox.warning(self, "Error", str(e))
