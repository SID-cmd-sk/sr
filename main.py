"""
SR Manager Enterprise - Phase 1
Main entry point — works from any CWD, any terminal, double-click, VS Code etc.
"""

# ── PATH BOOTSTRAP — must be the very first thing before any local imports ──
import sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent   # always the folder containing main.py
os.chdir(ROOT)                            # make CWD = project root (critical for Windows)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
# ─────────────────────────────────────────────────────────────────────────────

from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QFont

from core.styles import STYLESHEET
from core import storage
from ui.login import LoginScreen
from ui.main_window import MainWindow


class AppController:
    def __init__(self, app):
        self.app = app
        self.login_win = None
        self.main_win  = None

    def start(self):
        session = storage.get_session()
        if session:
            self._open_main(session)
        else:
            self._show_login()

    def _show_login(self):
        self.login_win = LoginScreen()
        self.login_win.setWindowTitle("SR Manager Enterprise — Login")
        self.login_win.resize(500, 400)
        self.login_win.login_success.connect(self._on_login)
        self.login_win.show()

    def _on_login(self, user):
        if self.login_win:
            self.login_win.close()
            self.login_win = None
        self._open_main(user)

    def _open_main(self, user):
        self.main_win = MainWindow(user)
        self.main_win.logout_requested = False
        self.main_win.closeEvent = self._make_close_handler()
        self.main_win.show()

    def _make_close_handler(self):
        def close_event(event):
            event.accept()
            if getattr(self.main_win, "logout_requested", False):
                self._show_login()
        return close_event


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(STYLESHEET)
    app.setApplicationName("SR Manager Enterprise")
    app.setApplicationVersion("1.0.0-phase1")
    app.setFont(QFont("Consolas", 11))

    controller = AppController(app)
    controller.start()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
