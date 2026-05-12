"""
SR Manager - Dashboard Page
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QFrame, QGridLayout, QTableWidget, QTableWidgetItem,
    QPushButton, QSizePolicy, QScrollArea
)
from PyQt6.QtCore import Qt, QTimer
import sys
import sys as _sys, os as _os
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
from core import storage


class StatCard(QFrame):
    def __init__(self, value, label, color="#00D4AA"):
        super().__init__()
        self.setObjectName("StatCard")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(2)

        val = QLabel(str(value))
        val.setObjectName("StatValue")
        val.setStyleSheet(f"color: {color}; font-size: 22px; font-weight: bold;")
        layout.addWidget(val)

        lbl = QLabel(label.upper())
        lbl.setObjectName("StatLabel")
        layout.addWidget(lbl)

        self.val_label = val

    def update_value(self, v):
        self.val_label.setText(str(v))


class DashboardPage(QWidget):
    def __init__(self, user):
        super().__init__()
        self.user = user
        self._build_ui()
        self._refresh()

        # Auto-refresh every 10s
        self.timer = QTimer()
        self.timer.timeout.connect(self._refresh)
        self.timer.start(10000)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("DASHBOARD")
        title.setObjectName("PageTitle")
        hdr.addWidget(title)
        hdr.addStretch()

        refresh_btn = QPushButton("↻ REFRESH")
        refresh_btn.clicked.connect(self._refresh)
        refresh_btn.setFixedWidth(90)
        hdr.addWidget(refresh_btn)
        layout.addLayout(hdr)

        # Stat cards grid
        self.stats_grid = QGridLayout()
        self.stats_grid.setSpacing(6)
        layout.addLayout(self.stats_grid)

        self.cards = {}
        defs = [
            ("total_sr",       "Total SR",       "#D4D4D4", 0, 0),
            ("open_sr",        "Open",           "#5599FF", 0, 1),
            ("in_progress_sr", "In Progress",    "#00D4AA", 0, 2),
            ("closed_sr",      "Closed",         "#555555", 0, 3),
            ("high_priority",  "High Priority",  "#E05555", 1, 0),
            ("total_users",    "Total Users",    "#D4A800", 1, 1),
            ("active_users",   "Active Users",   "#00D4AA", 1, 2),
            ("total_routes",   "Routes",         "#5599FF", 1, 3),
        ]
        for key, label, color, row, col in defs:
            card = StatCard(0, label, color)
            self.cards[key] = card
            self.stats_grid.addWidget(card, row, col)

        # Bottom split: recent SR + activity log
        bottom = QHBoxLayout()
        bottom.setSpacing(8)

        # Recent SR
        sr_frame = QFrame()
        sr_frame.setObjectName("StatCard")
        sr_layout = QVBoxLayout(sr_frame)
        sr_layout.setContentsMargins(0, 0, 0, 0)
        sr_layout.setSpacing(0)

        sr_hdr = QLabel("  RECENT SR")
        sr_hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;")
        sr_layout.addWidget(sr_hdr)

        self.sr_table = QTableWidget()
        self.sr_table.setColumnCount(5)
        self.sr_table.setHorizontalHeaderLabels(["SR#", "TITLE", "PRIORITY", "STATUS", "DATE"])
        self.sr_table.horizontalHeader().setStretchLastSection(True)
        self.sr_table.setColumnWidth(0, 80)
        self.sr_table.setColumnWidth(1, 160)
        self.sr_table.setColumnWidth(2, 70)
        self.sr_table.setColumnWidth(3, 80)
        self.sr_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.sr_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.sr_table.verticalHeader().setVisible(False)
        self.sr_table.setAlternatingRowColors(True)
        self.sr_table.setStyleSheet("alternate-background-color: #13131A;")
        sr_layout.addWidget(self.sr_table)
        bottom.addWidget(sr_frame, 3)

        # Activity log
        log_frame = QFrame()
        log_frame.setObjectName("StatCard")
        log_layout = QVBoxLayout(log_frame)
        log_layout.setContentsMargins(0, 0, 0, 0)
        log_layout.setSpacing(0)

        log_hdr = QLabel("  ACTIVITY LOG")
        log_hdr.setStyleSheet("color:#555; font-size:9px; letter-spacing:2px; padding:6px 0; border-bottom:1px solid #1E1E28;")
        log_layout.addWidget(log_hdr)

        self.log_table = QTableWidget()
        self.log_table.setColumnCount(3)
        self.log_table.setHorizontalHeaderLabels(["ACTION", "DESCRIPTION", "TIME"])
        self.log_table.horizontalHeader().setStretchLastSection(True)
        self.log_table.setColumnWidth(0, 90)
        self.log_table.setColumnWidth(1, 160)
        self.log_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.log_table.verticalHeader().setVisible(False)
        self.log_table.setAlternatingRowColors(True)
        self.log_table.setStyleSheet("alternate-background-color: #13131A;")
        log_layout.addWidget(self.log_table)
        bottom.addWidget(log_frame, 2)

        layout.addLayout(bottom)

    def _refresh(self):
        stats = storage.get_dashboard_stats()
        for key, card in self.cards.items():
            card.update_value(stats.get(key, 0))

        # Recent SR
        srs = storage.get_sr_by_user(self.user["id"], self.user["role"])
        srs = sorted(srs, key=lambda x: x["created_at"], reverse=True)[:20]
        self.sr_table.setRowCount(len(srs))
        priority_colors = {"High": "#E05555", "Medium": "#D4A800", "Low": "#5599FF"}
        status_colors = {"Open": "#5599FF", "Closed": "#555", "In Progress": "#00D4AA", "Pending": "#D4A800"}
        for row, sr in enumerate(srs):
            self.sr_table.setRowHeight(row, 22)
            items = [
                sr["sr_number"],
                sr["title"][:30],
                sr.get("priority", "Medium"),
                sr["status"],
                sr["created_at"][:10],
            ]
            for col, val in enumerate(items):
                item = QTableWidgetItem(val)
                if col == 2:
                    item.setForeground(__import__('PyQt6.QtGui', fromlist=['QColor']).QColor(priority_colors.get(val, "#888")))
                if col == 3:
                    item.setForeground(__import__('PyQt6.QtGui', fromlist=['QColor']).QColor(status_colors.get(val, "#888")))
                self.sr_table.setItem(row, col, item)

        # Activity log
        logs = storage.get_activity_logs(30)
        self.log_table.setRowCount(len(logs))
        for row, log in enumerate(logs):
            self.log_table.setRowHeight(row, 20)
            self.log_table.setItem(row, 0, QTableWidgetItem(log["action"]))
            self.log_table.setItem(row, 1, QTableWidgetItem(log["description"][:40]))
            self.log_table.setItem(row, 2, QTableWidgetItem(log["at"][11:19]))
