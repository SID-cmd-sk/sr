"""
SR Manager - WhatsApp Manager (Phase 2)
Manages the Node.js Baileys bridge process.
Provides: connect, disconnect, send_message, send_group, get_groups
Emits Qt signals for QR, ready, disconnected, groups, error events.
"""

import sys, os, json, subprocess, threading
from pathlib import Path
from PyQt6.QtCore import QObject, pyqtSignal, QThread, QTimer

ROOT      = Path(__file__).resolve().parent.parent
BRIDGE_JS = ROOT / "wa_bridge" / "bridge.js"
NODE_MOD  = ROOT / "wa_bridge" / "node_modules"


def find_node() -> str:
    """Find node.exe on Windows or node on Unix."""
    import shutil
    node = shutil.which("node") or shutil.which("node.exe")
    if node:
        return node
    # Common Windows paths
    for p in [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
        Path.home() / "AppData" / "Roaming" / "nvm" / "current" / "node.exe",
    ]:
        if Path(p).exists():
            return str(p)
    return None


def find_npm() -> str:
    import shutil
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm:
        return npm
    for p in [
        r"C:\Program Files\nodejs\npm.cmd",
        r"C:\Program Files (x86)\nodejs\npm.cmd",
    ]:
        if Path(p).exists():
            return str(p)
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  BRIDGE READER THREAD
# ══════════════════════════════════════════════════════════════════════════════

class BridgeReader(QThread):
    """Reads JSON lines from the Node bridge stdout and emits them."""
    line_received = pyqtSignal(dict)
    bridge_died   = pyqtSignal()

    def __init__(self, proc):
        super().__init__()
        self.proc = proc

    def run(self):
        try:
            for raw in self.proc.stdout:
                line = raw.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    self.line_received.emit(data)
                except json.JSONDecodeError:
                    pass  # ignore non-JSON (e.g. debug output)
        except Exception:
            pass
        self.bridge_died.emit()


# ══════════════════════════════════════════════════════════════════════════════
#  WHATSAPP MANAGER
# ══════════════════════════════════════════════════════════════════════════════

class WhatsAppManager(QObject):
    # ── signals ──────────────────────────────────────────────────────────────
    sig_qr          = pyqtSignal(str)          # QR string → render
    sig_ready       = pyqtSignal(str, str)     # phone, name
    sig_disconnected= pyqtSignal(str)          # reason
    sig_logged_out  = pyqtSignal()
    sig_groups      = pyqtSignal(list)         # list of {jid, name, participants}
    sig_sent        = pyqtSignal(str, str)     # jid, preview
    sig_error       = pyqtSignal(str, str)     # message, detail
    sig_status      = pyqtSignal(str)          # status string
    sig_message_in  = pyqtSignal(dict)         # incoming message
    sig_node_missing= pyqtSignal()             # node.js not found
    sig_deps_needed = pyqtSignal()             # node_modules not installed
    sig_log         = pyqtSignal(str)          # general log line

    def __init__(self, parent=None):
        super().__init__(parent)
        self.proc     = None
        self.reader   = None
        self.connected= False
        self.phone    = ""
        self.name     = ""
        self.groups   = []

    # ── dependency check ─────────────────────────────────────────────────────
    def node_available(self) -> bool:
        return find_node() is not None

    def deps_installed(self) -> bool:
        return (NODE_MOD / "@whiskeysockets" / "baileys").exists()

    def install_deps(self) -> bool:
        """Blocking install — call from a thread or setup wizard."""
        npm = find_npm()
        if not npm:
            return False
        try:
            r = subprocess.run(
                [npm, "install"],
                cwd=ROOT / "wa_bridge",
                capture_output=True, text=True, timeout=120
            )
            return r.returncode == 0
        except Exception:
            return False

    # ── process lifecycle ─────────────────────────────────────────────────────
    def start_bridge(self):
        if self.proc and self.proc.poll() is None:
            return   # already running

        node = find_node()
        if not node:
            self.sig_node_missing.emit()
            return

        if not self.deps_installed():
            self.sig_deps_needed.emit()
            return

        try:
            self.proc = subprocess.Popen(
                [node, str(BRIDGE_JS)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1,
                cwd=ROOT / "wa_bridge",
            )
            self.reader = BridgeReader(self.proc)
            self.reader.line_received.connect(self._on_event)
            self.reader.bridge_died.connect(self._on_bridge_died)
            self.reader.start()
            self.sig_log.emit("Bridge process started")
        except Exception as e:
            self.sig_error.emit("Failed to start bridge", str(e))

    def stop_bridge(self):
        self._send_cmd({"cmd": "disconnect"})
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=3)
            except Exception:
                self.proc.kill()
            self.proc = None
        if self.reader:
            self.reader.quit()
            self.reader.wait(2000)
            self.reader = None
        self.connected = False

    def _on_bridge_died(self):
        self.connected = False
        self.sig_disconnected.emit("bridge_died")
        self.sig_log.emit("Bridge process died")

    # ── send commands ─────────────────────────────────────────────────────────
    def _send_cmd(self, cmd: dict):
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.stdin.write(json.dumps(cmd) + "\n")
                self.proc.stdin.flush()
            except Exception as e:
                self.sig_error.emit("Bridge write error", str(e))

    def connect_wa(self):
        self._send_cmd({"cmd": "connect"})

    def disconnect_wa(self):
        self._send_cmd({"cmd": "disconnect"})

    def logout_wa(self):
        self._send_cmd({"cmd": "logout"})

    def get_groups(self):
        self._send_cmd({"cmd": "get_groups"})

    def send_to_jid(self, jid: str, text: str):
        self._send_cmd({"cmd": "send_message", "jid": jid, "text": text})

    def send_to_group(self, jid: str, text: str):
        self._send_cmd({"cmd": "send_group", "jid": jid, "text": text})

    def ping(self):
        self._send_cmd({"cmd": "ping"})

    # ── event handler ─────────────────────────────────────────────────────────
    def _on_event(self, data: dict):
        event = data.get("event", "")
        self.sig_log.emit(f"[WA] {event}: {str(data)[:80]}")

        if event == "qr":
            self.sig_qr.emit(data.get("qr", ""))

        elif event == "ready":
            self.connected = True
            self.phone     = data.get("phone", "")
            self.name      = data.get("name", "")
            self.sig_ready.emit(self.phone, self.name)

        elif event == "disconnected":
            self.connected = False
            self.sig_disconnected.emit(data.get("reason", "unknown"))

        elif event == "logged_out":
            self.connected = False
            self.sig_logged_out.emit()

        elif event == "groups":
            self.groups = data.get("groups", [])
            self.sig_groups.emit(self.groups)

        elif event == "sent":
            self.sig_sent.emit(data.get("jid", ""), data.get("preview", ""))

        elif event == "error":
            self.sig_error.emit(data.get("message", ""), data.get("detail", ""))

        elif event == "status":
            self.sig_status.emit(data.get("status", ""))

        elif event == "message":
            self.sig_message_in.emit(data)

        elif event == "pong":
            self.sig_log.emit(f"[WA] pong latency ok")
