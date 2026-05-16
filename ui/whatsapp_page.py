"""
SR Manager - WhatsApp Page (Phase 2)
QR login, group management, message sending, send log
"""

import sys, os, io
from pathlib import Path
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QFrame,
    QPushButton, QTextEdit, QComboBox, QTableWidget,
    QTableWidgetItem, QSplitter, QTabWidget, QLineEdit,
    QMessageBox, QProgressBar, QScrollArea, QGroupBox,
    QCheckBox
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QThread
from PyQt6.QtGui import QPixmap, QImage, QColor

import sys as _sys
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))

from core import storage
from core.whatsapp import WhatsAppManager, find_node

try:
    import qrcode
    from PIL import Image
    HAS_QR = True
except ImportError:
    HAS_QR = False


# ── QR Renderer ──────────────────────────────────────────────────────────────
def qr_string_to_pixmap(qr_data: str, size: int = 260) -> QPixmap:
    """Convert QR string to QPixmap for display."""
    if not HAS_QR:
        return QPixmap()
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=6,
            border=2,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#00D4AA", back_color="#0D0D12")
        img = img.resize((size, size), Image.NEAREST)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        qimage = QImage()
        qimage.loadFromData(buf.read())
        return QPixmap.fromImage(qimage)
    except Exception:
        return QPixmap()


# ── Dep Installer Thread ──────────────────────────────────────────────────────
class DepInstallerThread(QThread):
    done    = pyqtSignal(bool, str)
    progress= pyqtSignal(str)

    def run(self):
        from core.whatsapp import find_npm
        import subprocess
        npm = find_npm()
        if not npm:
            self.done.emit(False, "npm not found. Install Node.js from https://nodejs.org")
            return
        try:
            self.progress.emit("Installing @whiskeysockets/baileys...")
            r = subprocess.run(
                [npm, "install"],
                cwd=_ROOT / "wa_bridge",
                capture_output=True, text=True, timeout=180
            )
            if r.returncode == 0:
                self.done.emit(True, "Dependencies installed successfully.")
            else:
                self.done.emit(False, r.stderr[-400:] if r.stderr else "npm install failed")
        except subprocess.TimeoutExpired:
            self.done.emit(False, "Install timed out (180s). Check your internet connection.")
        except Exception as e:
            self.done.emit(False, str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  WHATSAPP PAGE
# ══════════════════════════════════════════════════════════════════════════════

class WhatsAppPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user    = user
        self.wa      = WhatsAppManager(self)
        self.groups  = []      # [{jid, name, participants}]
        self.send_log= []      # [{time, target, preview, status}]

        self._connect_signals()
        self._build_ui()
        self._check_setup()

    # ── signals ───────────────────────────────────────────────────────────────
    def _connect_signals(self):
        self.wa.sig_qr.connect(self._on_qr)
        self.wa.sig_ready.connect(self._on_ready)
        self.wa.sig_disconnected.connect(self._on_disconnected)
        self.wa.sig_logged_out.connect(self._on_logged_out)
        self.wa.sig_groups.connect(self._on_groups)
        self.wa.sig_sent.connect(self._on_sent)
        self.wa.sig_error.connect(self._on_wa_error)
        self.wa.sig_status.connect(self._on_status)
        self.wa.sig_node_missing.connect(self._on_node_missing)
        self.wa.sig_deps_needed.connect(self._on_deps_needed)
        self.wa.sig_log.connect(self._append_log)

    # ── UI build ──────────────────────────────────────────────────────────────
    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("WHATSAPP")
        title.setObjectName("PageTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        self.status_badge = QLabel("● OFFLINE")
        self.status_badge.setStyleSheet("color:#555; font-size:11px; font-weight:bold;")
        hdr.addWidget(self.status_badge)

        self.btn_connect = QPushButton("▶ CONNECT")
        self.btn_connect.setObjectName("PrimaryBtn")
        self.btn_connect.clicked.connect(self._do_connect)
        hdr.addWidget(self.btn_connect)

        self.btn_disconnect = QPushButton("■ DISCONNECT")
        self.btn_disconnect.setObjectName("DangerBtn")
        self.btn_disconnect.clicked.connect(self._do_disconnect)
        self.btn_disconnect.setEnabled(False)
        hdr.addWidget(self.btn_disconnect)

        self.btn_logout = QPushButton("⏻ LOGOUT")
        self.btn_logout.setObjectName("WarningBtn")
        self.btn_logout.clicked.connect(self._do_logout)
        self.btn_logout.setEnabled(False)
        hdr.addWidget(self.btn_logout)

        layout.addLayout(hdr)

        # Main tabs
        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        self._build_connect_tab()
        self._build_send_tab()
        self._build_groups_tab()
        self._build_log_tab()
        self._build_sr_dispatch_tab()

    # ── TAB: Connect / QR ────────────────────────────────────────────────────
    def _build_connect_tab(self):
        tab = QWidget()
        tl  = QHBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(20)

        # Left: QR + status
        left = QFrame()
        left.setObjectName("StatCard")
        left.setFixedWidth(320)
        ll = QVBoxLayout(left)
        ll.setContentsMargins(16, 16, 16, 16)
        ll.setSpacing(10)
        ll.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.qr_label = QLabel()
        self.qr_label.setFixedSize(260, 260)
        self.qr_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.qr_label.setStyleSheet(
            "background:#0D0D12; border:1px solid #252530; border-radius:4px;"
        )
        self.qr_label.setText("QR CODE\nWILL APPEAR\nHERE")
        self.qr_label.setStyleSheet(
            "background:#0D0D12; border:1px solid #252530; border-radius:4px;"
            "color:#333; font-size:11px;"
        )
        ll.addWidget(self.qr_label, alignment=Qt.AlignmentFlag.AlignCenter)

        self.qr_hint = QLabel("Click CONNECT to start")
        self.qr_hint.setStyleSheet("color:#555; font-size:10px;")
        self.qr_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ll.addWidget(self.qr_hint)

        self.qr_timer_lbl = QLabel("")
        self.qr_timer_lbl.setStyleSheet("color:#D4A800; font-size:10px;")
        self.qr_timer_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ll.addWidget(self.qr_timer_lbl)

        tl.addWidget(left)

        # Right: instructions + account info
        right = QVBoxLayout()
        right.setSpacing(12)

        # Account info card
        self.account_frame = QFrame()
        self.account_frame.setObjectName("StatCard")
        af = QVBoxLayout(self.account_frame)
        af.setContentsMargins(14, 12, 14, 12)
        af.setSpacing(6)

        acc_hdr = QLabel("CONNECTED ACCOUNT")
        acc_hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px;")
        af.addWidget(acc_hdr)

        self.acc_phone = QLabel("—")
        self.acc_phone.setStyleSheet("color:#00D4AA; font-size:16px; font-weight:bold;")
        af.addWidget(self.acc_phone)

        self.acc_name = QLabel("—")
        self.acc_name.setStyleSheet("color:#888; font-size:11px;")
        af.addWidget(self.acc_name)

        right.addWidget(self.account_frame)

        # Instructions
        instr_frame = QFrame()
        instr_frame.setObjectName("StatCard")
        inf = QVBoxLayout(instr_frame)
        inf.setContentsMargins(14, 12, 14, 12)
        inf.setSpacing(6)

        instr_hdr = QLabel("HOW TO CONNECT")
        instr_hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px;")
        inf.addWidget(instr_hdr)

        steps = [
            "1. Click  ▶ CONNECT  above",
            "2. QR code appears on the left",
            "3. Open WhatsApp on your phone",
            "4. Settings → Linked Devices → Link a Device",
            "5. Scan the QR code",
            "6. Wait for  ● ONLINE  status",
            "",
            "Session is saved — next launch auto-connects.",
            "Click  ⏻ LOGOUT  to clear the session.",
        ]
        for s in steps:
            lbl = QLabel(s)
            lbl.setStyleSheet("color:#666; font-size:10px;" if s else "")
            inf.addWidget(lbl)

        right.addWidget(instr_frame)

        # Setup status
        self.setup_frame = QFrame()
        self.setup_frame.setObjectName("StatCard")
        sf = QVBoxLayout(self.setup_frame)
        sf.setContentsMargins(14, 12, 14, 12)
        sf.setSpacing(6)

        setup_hdr = QLabel("SETUP STATUS")
        setup_hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px;")
        sf.addWidget(setup_hdr)

        self.node_status_lbl  = QLabel("Node.js: checking...")
        self.deps_status_lbl  = QLabel("Dependencies: checking...")
        self.node_status_lbl.setStyleSheet("font-size:10px;")
        self.deps_status_lbl.setStyleSheet("font-size:10px;")
        sf.addWidget(self.node_status_lbl)
        sf.addWidget(self.deps_status_lbl)

        self.install_btn = QPushButton("⬇ INSTALL DEPENDENCIES")
        self.install_btn.setObjectName("WarningBtn")
        self.install_btn.clicked.connect(self._install_deps)
        self.install_btn.setVisible(False)
        sf.addWidget(self.install_btn)

        self.install_progress = QLabel("")
        self.install_progress.setStyleSheet("color:#D4A800; font-size:10px;")
        sf.addWidget(self.install_progress)

        right.addWidget(self.setup_frame)
        right.addStretch()
        tl.addLayout(right)

        self.tabs.addTab(tab, "🔗  CONNECT")

        # QR expiry countdown timer
        self._qr_countdown = 0
        self._qr_timer = QTimer()
        self._qr_timer.timeout.connect(self._tick_qr)

    # ── TAB: Send Message ────────────────────────────────────────────────────
    def _build_send_tab(self):
        tab = QWidget()
        tl  = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(10)

        # Target selector
        target_row = QHBoxLayout()
        target_lbl = QLabel("SEND TO")
        target_lbl.setObjectName("FormLabel")
        target_lbl.setFixedWidth(80)
        target_row.addWidget(target_lbl)

        self.target_combo = QComboBox()
        self.target_combo.setPlaceholderText("Select group or enter JID...")
        self.target_combo.setEditable(True)
        self.target_combo.setMinimumWidth(300)
        target_row.addWidget(self.target_combo)

        btn_refresh = QPushButton("↻ REFRESH GROUPS")
        btn_refresh.clicked.connect(lambda: self.wa.get_groups())
        target_row.addWidget(btn_refresh)
        target_row.addStretch()
        tl.addLayout(target_row)

        # Message body
        msg_lbl = QLabel("MESSAGE")
        msg_lbl.setObjectName("FormLabel")
        tl.addWidget(msg_lbl)

        self.msg_input = QTextEdit()
        self.msg_input.setPlaceholderText(
            "Type your message here...\n\nYou can use variables:\n"
            "{sr_number}  {title}  {status}  {priority}  {customer_name}"
        )
        self.msg_input.setMinimumHeight(120)
        tl.addWidget(self.msg_input)

        # Template quick-fill
        tmpl_row = QHBoxLayout()
        tmpl_lbl = QLabel("TEMPLATE")
        tmpl_lbl.setObjectName("FormLabel")
        tmpl_lbl.setFixedWidth(80)
        tmpl_row.addWidget(tmpl_lbl)

        self.tmpl_combo = QComboBox()
        self.tmpl_combo.addItem("-- Select WA Template --", None)
        self._reload_templates()
        tmpl_row.addWidget(self.tmpl_combo)

        btn_load_tmpl = QPushButton("LOAD")
        btn_load_tmpl.clicked.connect(self._load_template)
        tmpl_row.addWidget(btn_load_tmpl)
        tmpl_row.addStretch()
        tl.addLayout(tmpl_row)

        # Send button row
        send_row = QHBoxLayout()
        self.char_count_lbl = QLabel("0 chars")
        self.char_count_lbl.setStyleSheet("color:#555; font-size:10px;")
        self.msg_input.textChanged.connect(
            lambda: self.char_count_lbl.setText(f"{len(self.msg_input.toPlainText())} chars")
        )
        send_row.addWidget(self.char_count_lbl)
        send_row.addStretch()

        self.btn_send = QPushButton("▶ SEND MESSAGE")
        self.btn_send.setObjectName("PrimaryBtn")
        self.btn_send.setFixedWidth(160)
        self.btn_send.clicked.connect(self._send_message)
        self.btn_send.setEnabled(False)
        send_row.addWidget(self.btn_send)
        tl.addLayout(send_row)

        # Recent send log
        log_lbl = QLabel("SEND LOG")
        log_lbl.setObjectName("FormLabel")
        tl.addWidget(log_lbl)

        self.send_table = QTableWidget()
        self.send_table.setColumnCount(4)
        self.send_table.setHorizontalHeaderLabels(["TIME", "TARGET", "PREVIEW", "STATUS"])
        self.send_table.setColumnWidth(0, 70)
        self.send_table.setColumnWidth(1, 160)
        self.send_table.setColumnWidth(2, 240)
        self.send_table.horizontalHeader().setStretchLastSection(True)
        self.send_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.send_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.send_table.verticalHeader().setVisible(False)
        self.send_table.setAlternatingRowColors(True)
        self.send_table.setStyleSheet("alternate-background-color: #13131A;")
        tl.addWidget(self.send_table)

        self.tabs.addTab(tab, "✉  SEND")

    # ── TAB: Groups ──────────────────────────────────────────────────────────
    def _build_groups_tab(self):
        tab = QWidget()
        tl  = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(8)

        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("YOUR WHATSAPP GROUPS"))
        toolbar.addStretch()
        btn_refresh = QPushButton("↻ REFRESH")
        btn_refresh.clicked.connect(lambda: self.wa.get_groups())
        toolbar.addWidget(btn_refresh)
        tl.addLayout(toolbar)

        self.groups_table = QTableWidget()
        self.groups_table.setColumnCount(3)
        self.groups_table.setHorizontalHeaderLabels(["GROUP NAME", "JID", "MEMBERS"])
        self.groups_table.setColumnWidth(0, 260)
        self.groups_table.setColumnWidth(1, 300)
        self.groups_table.setColumnWidth(2, 70)
        self.groups_table.horizontalHeader().setStretchLastSection(True)
        self.groups_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.groups_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.groups_table.verticalHeader().setVisible(False)
        self.groups_table.setAlternatingRowColors(True)
        self.groups_table.setStyleSheet("alternate-background-color: #13131A;")
        tl.addWidget(self.groups_table)

        # Quick send from groups tab
        qs_row = QHBoxLayout()
        qs_lbl = QLabel("QUICK SEND TO SELECTED GROUP")
        qs_lbl.setObjectName("FormLabel")
        qs_row.addWidget(qs_lbl)
        qs_row.addStretch()
        tl.addLayout(qs_row)

        self.quick_msg = QLineEdit()
        self.quick_msg.setPlaceholderText("Type quick message and press Send...")
        tl.addWidget(self.quick_msg)

        btn_quick_send = QPushButton("▶ QUICK SEND")
        btn_quick_send.setObjectName("PrimaryBtn")
        btn_quick_send.setFixedWidth(140)
        btn_quick_send.clicked.connect(self._quick_send)
        tl.addWidget(btn_quick_send, alignment=Qt.AlignmentFlag.AlignRight)

        self.tabs.addTab(tab, "👥  GROUPS")

    # ── TAB: Log ─────────────────────────────────────────────────────────────
    def _build_log_tab(self):
        tab = QWidget()
        tl  = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(6)

        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("BRIDGE LOG"))
        toolbar.addStretch()
        btn_clear = QPushButton("🗑 CLEAR")
        btn_clear.clicked.connect(lambda: self.log_view.clear())
        toolbar.addWidget(btn_clear)
        tl.addLayout(toolbar)

        self.log_view = QTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setStyleSheet(
            "font-family:Consolas; font-size:10px; color:#666; background:#0D0D12;"
        )
        tl.addWidget(self.log_view)
        self.tabs.addTab(tab, "📋  LOG")

    # ── TAB: SR Dispatch ─────────────────────────────────────────────────────
    def _build_sr_dispatch_tab(self):
        tab = QWidget()
        tl  = QVBoxLayout(tab)
        tl.setContentsMargins(14, 14, 14, 14)
        tl.setSpacing(10)

        hdr = QLabel("DISPATCH SR UPDATE VIA WHATSAPP")
        hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px;")
        tl.addWidget(hdr)

        # SR selector
        sr_row = QHBoxLayout()
        sr_lbl = QLabel("SELECT SR")
        sr_lbl.setObjectName("FormLabel")
        sr_lbl.setFixedWidth(100)
        sr_row.addWidget(sr_lbl)

        self.sr_combo = QComboBox()
        self.sr_combo.setMinimumWidth(300)
        self.sr_combo.currentIndexChanged.connect(self._on_sr_selected)
        sr_row.addWidget(self.sr_combo)

        btn_reload_sr = QPushButton("↻")
        btn_reload_sr.setFixedWidth(30)
        btn_reload_sr.clicked.connect(self._reload_sr_combo)
        sr_row.addWidget(btn_reload_sr)
        sr_row.addStretch()
        tl.addLayout(sr_row)

        # Group selector
        grp_row = QHBoxLayout()
        grp_lbl = QLabel("SEND TO GROUP")
        grp_lbl.setObjectName("FormLabel")
        grp_lbl.setFixedWidth(100)
        grp_row.addWidget(grp_lbl)
        self.dispatch_group_combo = QComboBox()
        self.dispatch_group_combo.setMinimumWidth(300)
        grp_row.addWidget(self.dispatch_group_combo)
        grp_row.addStretch()
        tl.addLayout(grp_row)

        # Template selector
        tmpl_row = QHBoxLayout()
        tmpl_lbl = QLabel("WA TEMPLATE")
        tmpl_lbl.setObjectName("FormLabel")
        tmpl_lbl.setFixedWidth(100)
        tmpl_row.addWidget(tmpl_lbl)
        self.dispatch_tmpl_combo = QComboBox()
        self.dispatch_tmpl_combo.setMinimumWidth(300)
        self._reload_dispatch_templates()
        tmpl_row.addWidget(self.dispatch_tmpl_combo)
        btn_reload_tmpl = QPushButton("↻")
        btn_reload_tmpl.setFixedWidth(30)
        btn_reload_tmpl.clicked.connect(self._reload_dispatch_templates)
        tmpl_row.addWidget(btn_reload_tmpl)
        tmpl_row.addStretch()
        tl.addLayout(tmpl_row)

        # Preview
        prev_lbl = QLabel("MESSAGE PREVIEW")
        prev_lbl.setObjectName("FormLabel")
        tl.addWidget(prev_lbl)

        self.dispatch_preview = QTextEdit()
        self.dispatch_preview.setReadOnly(True)
        self.dispatch_preview.setFixedHeight(120)
        self.dispatch_preview.setStyleSheet(
            "color:#25D366; background:#0a1a0a; font-size:11px;"
        )
        tl.addWidget(self.dispatch_preview)

        btn_row = QHBoxLayout()
        btn_preview = QPushButton("👁 PREVIEW")
        btn_preview.clicked.connect(self._build_dispatch_preview)
        btn_row.addWidget(btn_preview)

        self.btn_dispatch = QPushButton("▶ DISPATCH TO WHATSAPP")
        self.btn_dispatch.setObjectName("PrimaryBtn")
        self.btn_dispatch.clicked.connect(self._dispatch_sr)
        self.btn_dispatch.setEnabled(False)
        btn_row.addWidget(self.btn_dispatch)
        btn_row.addStretch()
        tl.addLayout(btn_row)

        tl.addStretch()

        self.tabs.addTab(tab, "📤  SR DISPATCH")
        self._reload_sr_combo()

    # ── setup check ──────────────────────────────────────────────────────────
    def _check_setup(self):
        has_node = find_node() is not None
        has_deps = self.wa.deps_installed()

        if has_node:
            self.node_status_lbl.setText("Node.js: ✓ Found")
            self.node_status_lbl.setStyleSheet("color:#00D4AA; font-size:10px;")
        else:
            self.node_status_lbl.setText("Node.js: ✗ Not found — install from nodejs.org")
            self.node_status_lbl.setStyleSheet("color:#E05555; font-size:10px;")

        if has_deps:
            self.deps_status_lbl.setText("Dependencies: ✓ Installed")
            self.deps_status_lbl.setStyleSheet("color:#00D4AA; font-size:10px;")
            self.install_btn.setVisible(False)
        else:
            self.deps_status_lbl.setText("Dependencies: ✗ Not installed")
            self.deps_status_lbl.setStyleSheet("color:#E05555; font-size:10px;")
            self.install_btn.setVisible(has_node)

    # ── dep installer ─────────────────────────────────────────────────────────
    def _install_deps(self):
        self.install_btn.setEnabled(False)
        self.install_progress.setText("Installing... (may take 1-2 min)")
        self._installer = DepInstallerThread()
        self._installer.progress.connect(lambda m: self.install_progress.setText(m))
        self._installer.done.connect(self._on_install_done)
        self._installer.start()

    def _on_install_done(self, ok, msg):
        self.install_progress.setText(msg)
        self.install_btn.setEnabled(True)
        if ok:
            self._check_setup()
            QMessageBox.information(self, "Done", "Dependencies installed. You can now connect.")
        else:
            QMessageBox.critical(self, "Install Failed", msg)

    # ── connect / disconnect ──────────────────────────────────────────────────
    def _do_connect(self):
        if not find_node():
            QMessageBox.warning(self, "Node.js Required",
                "Node.js is not installed.\n\nDownload from: https://nodejs.org\n"
                "Install it, then restart SR Manager.")
            return
        if not self.wa.deps_installed():
            r = QMessageBox.question(self, "Install Dependencies",
                "WhatsApp bridge dependencies are not installed.\nInstall now? (~15MB)",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
            if r == QMessageBox.StandardButton.Yes:
                self._install_deps()
            return

        self.btn_connect.setEnabled(False)
        self.qr_hint.setText("Starting bridge...")
        self._set_status_badge("CONNECTING", "#D4A800")
        self.wa.start_bridge()
        self.wa.connect_wa()
        storage.log_activity("WA_CONNECT", "WhatsApp connection initiated", self.user["id"])

    def _do_disconnect(self):
        self.wa.stop_bridge()
        self._set_status_badge("OFFLINE", "#555")
        self.btn_connect.setEnabled(True)
        self.btn_disconnect.setEnabled(False)
        self.btn_logout.setEnabled(False)
        self.btn_send.setEnabled(False)
        self.btn_dispatch.setEnabled(False)
        self.qr_hint.setText("Disconnected")
        storage.log_activity("WA_DISCONNECT", "WhatsApp disconnected", self.user["id"])

    def _do_logout(self):
        r = QMessageBox.question(self, "Logout WhatsApp",
            "This will remove the saved session.\nYou will need to scan the QR code again.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            self.wa.logout_wa()
            storage.log_activity("WA_LOGOUT", "WhatsApp session cleared", self.user["id"])

    # ── WA event handlers ─────────────────────────────────────────────────────
    def _on_qr(self, qr_data: str):
        self.tabs.setCurrentIndex(0)
        self.qr_hint.setText("Scan with WhatsApp on your phone")
        self._qr_countdown = 60
        self._qr_timer.start(1000)

        if HAS_QR:
            px = qr_string_to_pixmap(qr_data, 260)
            if not px.isNull():
                self.qr_label.setPixmap(px)
                self.qr_label.setText("")
                return

        # Fallback text
        self.qr_label.setText(
            f"SCAN QR\n\nIf image not shown,\ninstall:\npip install qrcode pillow"
        )
        storage.log_activity("WA_QR", "QR code generated", self.user["id"])

    def _tick_qr(self):
        self._qr_countdown -= 1
        if self._qr_countdown <= 0:
            self._qr_timer.stop()
            self.qr_timer_lbl.setText("QR expired — reconnect")
        else:
            self.qr_timer_lbl.setText(f"QR expires in {self._qr_countdown}s")

    def _on_ready(self, phone: str, name: str):
        self._qr_timer.stop()
        self.qr_timer_lbl.setText("")
        self._set_status_badge("ONLINE", "#00D4AA")
        self.acc_phone.setText(f"+{phone}" if phone else "Connected")
        self.acc_name.setText(name)
        self.qr_label.setText("✓ CONNECTED")
        self.qr_label.setStyleSheet(
            "background:#001A14; border:1px solid #00D4AA; border-radius:4px;"
            "color:#00D4AA; font-size:18px; font-weight:bold;"
        )
        self.qr_hint.setText("Session active — scan not needed until logout")
        self.btn_connect.setEnabled(False)
        self.btn_disconnect.setEnabled(True)
        self.btn_logout.setEnabled(True)
        self.btn_send.setEnabled(True)
        self.btn_dispatch.setEnabled(True)
        self.wa.get_groups()
        storage.log_activity("WA_READY", f"WhatsApp connected: +{phone}", self.user["id"])

    def _on_disconnected(self, reason: str):
        self._set_status_badge("OFFLINE", "#555")
        self.btn_connect.setEnabled(True)
        self.btn_disconnect.setEnabled(False)
        self.btn_logout.setEnabled(False)
        self.btn_send.setEnabled(False)
        self.btn_dispatch.setEnabled(False)
        self.qr_hint.setText(f"Disconnected: {reason}")
        self.acc_phone.setText("—")
        self.acc_name.setText("—")

    def _on_logged_out(self):
        self._on_disconnected("logged out")
        self.qr_label.setText("QR CODE\nWILL APPEAR\nHERE")
        self.qr_label.setStyleSheet(
            "background:#0D0D12; border:1px solid #252530; border-radius:4px;"
            "color:#333; font-size:11px;"
        )

    def _on_groups(self, groups: list):
        self.groups = groups
        self._refresh_groups_table()
        self._refresh_target_combo()
        self._refresh_dispatch_groups()

    def _on_sent(self, jid: str, preview: str):
        from datetime import datetime
        name = next((g["name"] for g in self.groups if g["jid"] == jid), jid[:20])
        entry = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "target": name,
            "preview": preview,
            "status": "SENT",
        }
        self.send_log.insert(0, entry)
        self._refresh_send_table()
        storage.log_activity("WA_SENT", f"WA message sent to {name}: {preview[:40]}", self.user["id"])

    def _on_wa_error(self, msg: str, detail: str):
        self._append_log(f"ERROR: {msg} — {detail}")
        from datetime import datetime
        entry = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "target": "—",
            "preview": msg,
            "status": "FAIL",
        }
        self.send_log.insert(0, entry)
        self._refresh_send_table()

    def _on_status(self, status: str):
        self._append_log(f"STATUS: {status}")

    def _on_node_missing(self):
        QMessageBox.warning(self, "Node.js Not Found",
            "Node.js is required for WhatsApp.\n\n"
            "Download and install from: https://nodejs.org\n"
            "Then restart SR Manager.")

    def _on_deps_needed(self):
        self._check_setup()
        self.tabs.setCurrentIndex(0)

    def _append_log(self, line: str):
        from datetime import datetime
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_view.append(f"[{ts}] {line}")

    # ── send helpers ──────────────────────────────────────────────────────────
    def _send_message(self):
        idx = self.target_combo.currentIndex()
        jid = self.target_combo.currentData() or self.target_combo.currentText().strip()
        msg = self.msg_input.toPlainText().strip()

        if not jid:
            QMessageBox.warning(self, "No Target", "Select a group or enter a JID.")
            return
        if not msg:
            QMessageBox.warning(self, "No Message", "Type a message first.")
            return
        if not self.wa.connected:
            QMessageBox.warning(self, "Not Connected", "Connect to WhatsApp first.")
            return

        self.wa.send_to_jid(jid, msg)
        self.msg_input.clear()

    def _quick_send(self):
        row = self.groups_table.currentRow()
        if row < 0:
            QMessageBox.information(self, "Select Group", "Select a group first.")
            return
        jid = self.groups_table.item(row, 1).text()
        msg = self.quick_msg.text().strip()
        if not msg:
            QMessageBox.warning(self, "No Message", "Type a message first.")
            return
        if not self.wa.connected:
            QMessageBox.warning(self, "Not Connected", "Connect to WhatsApp first.")
            return
        self.wa.send_to_jid(jid, msg)
        self.quick_msg.clear()

    # ── template helpers ──────────────────────────────────────────────────────
    def _reload_templates(self):
        self.tmpl_combo.clear()
        self.tmpl_combo.addItem("-- Select WA Template --", None)
        for t in storage.get_whatsapp_templates():
            self.tmpl_combo.addItem(t["name"], t["id"])

    def _load_template(self):
        tid = self.tmpl_combo.currentData()
        if not tid:
            return
        templates = storage.get_whatsapp_templates()
        t = next((x for x in templates if x["id"] == tid), None)
        if t:
            self.msg_input.setPlainText(t.get("message", ""))

    def _reload_dispatch_templates(self):
        self.dispatch_tmpl_combo.clear()
        self.dispatch_tmpl_combo.addItem("-- Select Template --", None)
        for t in storage.get_whatsapp_templates():
            self.dispatch_tmpl_combo.addItem(t["name"], t["id"])

    # ── SR dispatch helpers ───────────────────────────────────────────────────
    def _reload_sr_combo(self):
        self.sr_combo.clear()
        srs = sorted(storage.get_all_sr(), key=lambda x: x["created_at"], reverse=True)
        for sr in srs:
            label = f"{sr['sr_number']} — {sr['title'][:35]} [{sr['status']}]"
            self.sr_combo.addItem(label, sr["id"])

    def _on_sr_selected(self):
        self._build_dispatch_preview()

    def _refresh_dispatch_groups(self):
        self.dispatch_group_combo.clear()
        self.dispatch_group_combo.addItem("-- Select Group --", None)
        for g in self.groups:
            self.dispatch_group_combo.addItem(f"{g['name']} ({g['participants']} members)", g["jid"])

    def _build_dispatch_preview(self):
        sr_id  = self.sr_combo.currentData()
        tmpl_id= self.dispatch_tmpl_combo.currentData()
        if not sr_id or not tmpl_id:
            self.dispatch_preview.setPlainText("Select an SR and a template to preview.")
            return

        sr = next((s for s in storage.get_all_sr() if s["id"] == sr_id), None)
        templates = storage.get_whatsapp_templates()
        tmpl = next((t for t in templates if t["id"] == tmpl_id), None)
        if not sr or not tmpl:
            return

        settings = storage.get_settings()
        msg = tmpl["message"]
        replacements = {
            "{sr_number}":      sr.get("sr_number", ""),
            "{title}":          sr.get("title", ""),
            "{status}":         sr.get("status", ""),
            "{priority}":       sr.get("priority", ""),
            "{customer_name}":  sr.get("customer_name", ""),
            "{customer_contact}":sr.get("customer_contact",""),
            "{assigned_to}":    sr.get("assigned_to", "") or "Unassigned",
            "{created_at}":     sr.get("created_at", "")[:16],
            "{updated_at}":     sr.get("updated_at", "")[:16],
            "{description}":    sr.get("description", ""),
            "{company_name}":   settings.get("company_name", ""),
            "{current_stage}":  str(sr.get("current_stage", 0)),
        }
        for k, v in replacements.items():
            msg = msg.replace(k, v)
        self.dispatch_preview.setPlainText(msg)

    def _dispatch_sr(self):
        jid   = self.dispatch_group_combo.currentData()
        sr_id = self.sr_combo.currentData()
        msg   = self.dispatch_preview.toPlainText().strip()

        if not jid:
            QMessageBox.warning(self, "No Group", "Select a WhatsApp group.")
            return
        if not msg:
            QMessageBox.warning(self, "No Message", "Build a preview first.")
            return
        if not self.wa.connected:
            QMessageBox.warning(self, "Not Connected", "Connect to WhatsApp first.")
            return

        self.wa.send_to_group(jid, msg)

        if sr_id:
            storage.add_comment(sr_id, self.user["id"], f"[WA DISPATCH] {msg[:80]}")

        self.tabs.setCurrentIndex(1)

    # ── table refresh helpers ─────────────────────────────────────────────────
    def _refresh_groups_table(self):
        self.groups_table.setRowCount(len(self.groups))
        for row, g in enumerate(self.groups):
            self.groups_table.setRowHeight(row, 22)
            name_item = QTableWidgetItem(g["name"])
            name_item.setForeground(QColor("#C0C0C0"))
            self.groups_table.setItem(row, 0, name_item)
            jid_item = QTableWidgetItem(g["jid"])
            jid_item.setForeground(QColor("#555"))
            self.groups_table.setItem(row, 1, jid_item)
            self.groups_table.setItem(row, 2, QTableWidgetItem(str(g.get("participants", 0))))

    def _refresh_target_combo(self):
        self.target_combo.clear()
        for g in self.groups:
            self.target_combo.addItem(f"{g['name']} ({g['participants']})", g["jid"])

    def _refresh_send_table(self):
        self.send_table.setRowCount(len(self.send_log))
        for row, entry in enumerate(self.send_log[:50]):
            self.send_table.setRowHeight(row, 22)
            self.send_table.setItem(row, 0, QTableWidgetItem(entry["time"]))
            self.send_table.setItem(row, 1, QTableWidgetItem(entry["target"]))
            self.send_table.setItem(row, 2, QTableWidgetItem(entry["preview"][:60]))
            status_item = QTableWidgetItem(entry["status"])
            color = "#00D4AA" if entry["status"] == "SENT" else "#E05555"
            status_item.setForeground(QColor(color))
            self.send_table.setItem(row, 3, status_item)

    def _set_status_badge(self, text: str, color: str):
        self.status_badge.setText(f"● {text}")
        self.status_badge.setStyleSheet(f"color:{color}; font-size:11px; font-weight:bold;")

    def closeEvent(self, event):
        self.wa.stop_bridge()
        event.accept()
