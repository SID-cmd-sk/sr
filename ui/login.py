"""
SR Manager - Login Screen
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QFrame, QCheckBox, QMessageBox
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont
import sys
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage


class LoginScreen(QWidget):
    login_success = pyqtSignal(dict)

    def __init__(self):
        super().__init__()
        self.setObjectName("LoginScreen")
        self._build_ui()

    def _build_ui(self):
        outer = QVBoxLayout(self)
        outer.setAlignment(Qt.AlignmentFlag.AlignCenter)
        outer.setContentsMargins(0, 0, 0, 0)

        # Center card
        card = QFrame()
        card.setObjectName("LoginBox")
        card.setFixedWidth(340)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(28, 28, 28, 28)
        card_layout.setSpacing(10)

        # Title
        title = QLabel("SR MANAGER")
        title.setObjectName("LoginTitle")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(title)

        sub = QLabel("ENTERPRISE • PHASE 1 • OFFLINE")
        sub.setObjectName("LoginSub")
        sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(sub)

        card_layout.addSpacing(16)

        # Divider
        div = QFrame()
        div.setFrameShape(QFrame.Shape.HLine)
        div.setStyleSheet("color: #252530;")
        card_layout.addWidget(div)
        card_layout.addSpacing(8)

        # Email
        lbl_email = QLabel("EMAIL")
        lbl_email.setObjectName("FormLabel")
        card_layout.addWidget(lbl_email)
        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText("admin@srmanager.local")
        self.email_input.setText("admin@srmanager.local")
        card_layout.addWidget(self.email_input)

        card_layout.addSpacing(4)

        # Password
        lbl_pass = QLabel("PASSWORD")
        lbl_pass.setObjectName("FormLabel")
        card_layout.addWidget(lbl_pass)
        self.pass_input = QLineEdit()
        self.pass_input.setPlaceholderText("••••••••")
        self.pass_input.setText("admin123")
        self.pass_input.setEchoMode(QLineEdit.EchoMode.Password)
        card_layout.addWidget(self.pass_input)

        # Show password
        show_cb = QCheckBox("Show password")
        show_cb.stateChanged.connect(self._toggle_pass)
        card_layout.addWidget(show_cb)

        card_layout.addSpacing(12)

        # Login button
        self.login_btn = QPushButton("LOGIN")
        self.login_btn.setObjectName("PrimaryBtn")
        self.login_btn.setFixedHeight(32)
        self.login_btn.clicked.connect(self._do_login)
        card_layout.addWidget(self.login_btn)

        card_layout.addSpacing(8)

        # Quick hint
        hint = QLabel("Default: admin@srmanager.local / admin123")
        hint.setStyleSheet("color: #333; font-size: 9px;")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(hint)

        self.error_label = QLabel("")
        self.error_label.setStyleSheet("color: #E05555; font-size: 10px;")
        self.error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self.error_label)

        outer.addWidget(card)

        # Press Enter to login
        self.email_input.returnPressed.connect(self._do_login)
        self.pass_input.returnPressed.connect(self._do_login)

    def _toggle_pass(self, state):
        if state:
            self.pass_input.setEchoMode(QLineEdit.EchoMode.Normal)
        else:
            self.pass_input.setEchoMode(QLineEdit.EchoMode.Password)

    def _do_login(self):
        email = self.email_input.text().strip()
        password = self.pass_input.text().strip()
        if not email or not password:
            self.error_label.setText("Enter email and password.")
            return
        user = storage.login(email, password)
        if user:
            self.error_label.setText("")
            self.login_success.emit(user)
        else:
            self.error_label.setText("Invalid credentials or inactive account.")
