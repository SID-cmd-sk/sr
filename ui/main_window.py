"""
SR Manager - Main Application Window
Sidebar nav, role-based page routing, session management
"""

from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QPushButton, QStackedWidget, QFrame,
    QSizePolicy, QStatusBar, QMessageBox
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont
import sys
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage
from ui.dashboard      import DashboardPage
from ui.sr_page        import SRPage
from ui.routes_page    import RoutePage
from ui.pipelines_page import PipelinePage
from ui.users_page     import UsersPage
from ui.templates_page import TemplatesPage
from ui.settings_page  import SettingsPage
from ui.whatsapp_page  import WhatsAppPage


# Role-based nav visibility
NAV_PERMISSIONS = {
    "dashboard":  ["Admin", "Manager", "Technical", "User", "Viewer"],
    "sr":         ["Admin", "Manager", "Technical", "User"],
    "routes":     ["Admin", "Manager"],
    "pipelines":  ["Admin", "Manager"],
    "templates":  ["Admin", "Manager"],
    "whatsapp":   ["Admin", "Manager", "Technical"],
    "users":      ["Admin", "Manager"],
    "settings":   ["Admin", "Manager"],
}

NAV_ITEMS = [
    ("WORKSPACE",        None),
    ("Dashboard",        "dashboard",  "▪"),
    ("Service Requests", "sr",         "▪"),
    ("CONFIGURATION",    None),
    ("Routes",           "routes",     "▪"),
    ("Pipelines",        "pipelines",  "▪"),
    ("Templates",        "templates",  "▪"),
    ("COMMUNICATIONS",   None),
    ("WhatsApp",         "whatsapp",   "▪"),
    ("ADMIN",            None),
    ("Users",            "users",      "▪"),
    ("Settings",         "settings",   "▪"),
]


class NavButton(QPushButton):
    def __init__(self, label, page_key):
        super().__init__(f"  ▪  {label}")
        self.page_key = page_key
        self.setObjectName("NavBtn")
        self.setCheckable(False)
        self.setFixedHeight(28)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def set_active(self, active):
        self.setProperty("active", "true" if active else "false")
        self.style().unpolish(self)
        self.style().polish(self)


class MainWindow(QMainWindow):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self.nav_buttons = {}
        self.pages = {}
        self.current_page = None

        self.setWindowTitle(f"SR Manager Enterprise — {user['name']} [{user['role']}]")
        self.setMinimumSize(1100, 680)
        self.resize(1280, 760)

        self._build_ui()
        self._navigate("dashboard")

        # Status bar clock
        self.clock_timer = QTimer()
        self.clock_timer.timeout.connect(self._update_clock)
        self.clock_timer.start(1000)
        self._update_clock()

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # ── SIDEBAR ───────────────────────────────────────────────────────────
        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(188)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)

        # App title
        title_bar = QLabel("SR MANAGER")
        title_bar.setObjectName("SidebarTitle")
        title_bar.setFixedHeight(36)
        sidebar_layout.addWidget(title_bar)

        # User info
        role_color = {"Admin":"#E05555","Manager":"#D4A800","Technical":"#5599FF"}.get(self.user["role"],"#888")
        user_info = QLabel(f"  {self.user['name']}\n  [{self.user['role']}]")
        user_info.setObjectName("SidebarUser")
        user_info.setStyleSheet(f"color:{role_color}; font-size:10px; padding:6px 12px; border-bottom:1px solid #1E1E28;")
        sidebar_layout.addWidget(user_info)

        # Nav items
        for item in NAV_ITEMS:
            if item[1] is None:
                # Section header
                sec_lbl = QLabel(item[0])
                sec_lbl.setObjectName("NavSectionLabel")
                sidebar_layout.addWidget(sec_lbl)
            else:
                label, key, icon = item
                page_roles = NAV_PERMISSIONS.get(key, [])
                if self.user["role"] not in page_roles:
                    continue
                btn = NavButton(label, key)
                btn.clicked.connect(lambda _, k=key: self._navigate(k))
                self.nav_buttons[key] = btn
                sidebar_layout.addWidget(btn)

        sidebar_layout.addStretch()

        # Logout
        logout_btn = QPushButton("  ⏻  LOGOUT")
        logout_btn.setObjectName("NavBtn")
        logout_btn.setFixedHeight(32)
        logout_btn.setStyleSheet("color:#E05555; border-top:1px solid #1E1E28;")
        logout_btn.clicked.connect(self._logout)
        sidebar_layout.addWidget(logout_btn)

        main_layout.addWidget(sidebar)

        # ── CONTENT AREA ──────────────────────────────────────────────────────
        self.stack = QStackedWidget()
        self.stack.setObjectName("ContentArea")
        main_layout.addWidget(self.stack)

        # Status bar
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.clock_label = QLabel("")
        self.clock_label.setStyleSheet("color:#00D4AA; font-size:10px;")
        self.status_bar.addPermanentWidget(self.clock_label)
        db_info = storage.get_settings()
        self.status_bar.showMessage(
            f"  SR Manager Enterprise  |  {db_info.get('company_name','')}  |  Phase 2 — WhatsApp Enabled"
        )

    def _get_or_create_page(self, key):
        if key not in self.pages:
            page_map = {
                "dashboard": lambda: DashboardPage(self.user),
                "sr":        lambda: SRPage(self.user),
                "routes":    lambda: RoutePage(self.user),
                "pipelines": lambda: PipelinePage(self.user),
                "users":     lambda: UsersPage(self.user),
                "templates": lambda: TemplatesPage(self.user),
                "settings":  lambda: SettingsPage(self.user),
                "whatsapp":  lambda: WhatsAppPage(self.user),
            }
            if key not in page_map:
                return None
            page = page_map[key]()
            self.stack.addWidget(page)
            self.pages[key] = page
        return self.pages[key]

    def _navigate(self, key):
        if key not in self.nav_buttons and key != "dashboard":
            return
        page = self._get_or_create_page(key)
        if page is None:
            return

        self.stack.setCurrentWidget(page)
        self.current_page = key

        for k, btn in self.nav_buttons.items():
            btn.set_active(k == key)

    def _update_clock(self):
        from datetime import datetime
        self.clock_label.setText(datetime.now().strftime("  %Y-%m-%d  %H:%M:%S  "))

    def _logout(self):
        r = QMessageBox.question(self, "Logout", "Logout and return to login screen?",
                                  QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if r == QMessageBox.StandardButton.Yes:
            storage.logout()
            self.logout_requested = True
            self.close()
