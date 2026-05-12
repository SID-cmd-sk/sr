"""
SR Manager - Global Stylesheet
Compact, dense, power-user dark UI theme
"""

STYLESHEET = """
/* ===== GLOBAL ===== */
* {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
    color: #D4D4D4;
}

QMainWindow, QDialog {
    background-color: #1A1A1F;
}

QWidget {
    background-color: #1A1A1F;
    color: #D4D4D4;
}

/* ===== SIDEBAR ===== */
#Sidebar {
    background-color: #111116;
    border-right: 1px solid #2A2A35;
    min-width: 180px;
    max-width: 180px;
}

#SidebarTitle {
    background-color: #0D0D12;
    color: #00D4AA;
    font-size: 11px;
    font-weight: bold;
    padding: 10px 12px;
    border-bottom: 1px solid #2A2A35;
    letter-spacing: 2px;
}

#SidebarUser {
    background-color: #111116;
    color: #888;
    font-size: 10px;
    padding: 6px 12px;
    border-bottom: 1px solid #1E1E28;
}

#NavBtn {
    background-color: transparent;
    color: #888;
    border: none;
    padding: 7px 12px;
    text-align: left;
    font-size: 11px;
    border-left: 2px solid transparent;
}

#NavBtn:hover {
    background-color: #1E1E28;
    color: #CCC;
    border-left: 2px solid #333;
}

#NavBtn[active="true"] {
    background-color: #1A2030;
    color: #00D4AA;
    border-left: 2px solid #00D4AA;
}

#NavSectionLabel {
    background-color: transparent;
    color: #444;
    font-size: 9px;
    padding: 8px 12px 3px 12px;
    letter-spacing: 1px;
}

/* ===== CONTENT AREA ===== */
#ContentArea {
    background-color: #1A1A1F;
}

#PageTitle {
    color: #E8E8E8;
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 1px;
}

#PageSubtitle {
    color: #555;
    font-size: 10px;
}

/* ===== STAT CARDS ===== */
#StatCard {
    background-color: #111116;
    border: 1px solid #252530;
    border-radius: 3px;
    padding: 10px;
}

#StatValue {
    color: #00D4AA;
    font-size: 22px;
    font-weight: bold;
}

#StatLabel {
    color: #555;
    font-size: 9px;
    letter-spacing: 1px;
}

#StatCardRed #StatValue { color: #E05555; }
#StatCardYellow #StatValue { color: #D4A800; }
#StatCardBlue #StatValue { color: #5599FF; }
#StatCardGreen #StatValue { color: #00D4AA; }

/* ===== TABLES ===== */
QTableWidget {
    background-color: #111116;
    border: 1px solid #252530;
    border-radius: 2px;
    gridline-color: #1E1E28;
    selection-background-color: #1A2030;
    selection-color: #00D4AA;
    outline: none;
}

QTableWidget::item {
    padding: 4px 8px;
    border-bottom: 1px solid #1A1A22;
    color: #C0C0C0;
}

QTableWidget::item:selected {
    background-color: #1A2030;
    color: #00D4AA;
}

QHeaderView::section {
    background-color: #0D0D12;
    color: #666;
    padding: 4px 8px;
    border: none;
    border-right: 1px solid #252530;
    border-bottom: 1px solid #252530;
    font-size: 10px;
    letter-spacing: 1px;
}

/* ===== BUTTONS ===== */
QPushButton {
    background-color: #252530;
    color: #C0C0C0;
    border: 1px solid #333340;
    padding: 5px 12px;
    border-radius: 2px;
    font-size: 11px;
}

QPushButton:hover {
    background-color: #2E2E3A;
    color: #E0E0E0;
    border-color: #444455;
}

QPushButton:pressed {
    background-color: #1A1A22;
}

#PrimaryBtn {
    background-color: #003D30;
    color: #00D4AA;
    border: 1px solid #00D4AA;
    font-weight: bold;
}

#PrimaryBtn:hover {
    background-color: #00D4AA;
    color: #001A14;
}

#DangerBtn {
    background-color: #3D0000;
    color: #E05555;
    border: 1px solid #E05555;
}

#DangerBtn:hover {
    background-color: #E05555;
    color: #1A0000;
}

#WarningBtn {
    background-color: #3D3000;
    color: #D4A800;
    border: 1px solid #D4A800;
}

#WarningBtn:hover {
    background-color: #D4A800;
    color: #1A1400;
}

/* ===== INPUTS ===== */
QLineEdit, QTextEdit, QPlainTextEdit {
    background-color: #111116;
    border: 1px solid #2A2A35;
    border-radius: 2px;
    padding: 4px 8px;
    color: #D4D4D4;
    selection-background-color: #1A2030;
}

QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus {
    border-color: #00D4AA;
    background-color: #0D0D14;
}

QComboBox {
    background-color: #111116;
    border: 1px solid #2A2A35;
    border-radius: 2px;
    padding: 4px 8px;
    color: #D4D4D4;
    min-height: 22px;
}

QComboBox:focus {
    border-color: #00D4AA;
}

QComboBox::drop-down {
    border: none;
    width: 20px;
}

QComboBox::down-arrow {
    width: 8px;
    height: 8px;
}

QComboBox QAbstractItemView {
    background-color: #111116;
    border: 1px solid #2A2A35;
    selection-background-color: #1A2030;
    selection-color: #00D4AA;
}

QSpinBox {
    background-color: #111116;
    border: 1px solid #2A2A35;
    border-radius: 2px;
    padding: 4px 8px;
    color: #D4D4D4;
}

/* ===== LABELS ===== */
QLabel {
    background-color: transparent;
    color: #D4D4D4;
}

#FormLabel {
    color: #666;
    font-size: 10px;
    letter-spacing: 1px;
}

/* ===== TABS ===== */
QTabWidget::pane {
    border: 1px solid #252530;
    background-color: #111116;
}

QTabBar::tab {
    background-color: #0D0D12;
    color: #555;
    padding: 5px 14px;
    border: 1px solid #252530;
    border-bottom: none;
    font-size: 10px;
    letter-spacing: 1px;
}

QTabBar::tab:selected {
    background-color: #111116;
    color: #00D4AA;
    border-top: 1px solid #00D4AA;
}

QTabBar::tab:hover {
    background-color: #161620;
    color: #AAA;
}

/* ===== SCROLLBARS ===== */
QScrollBar:vertical {
    background-color: #111116;
    width: 8px;
    border: none;
}

QScrollBar::handle:vertical {
    background-color: #2A2A35;
    border-radius: 4px;
    min-height: 20px;
}

QScrollBar::handle:vertical:hover {
    background-color: #3A3A48;
}

QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical { background: none; }

QScrollBar:horizontal {
    background-color: #111116;
    height: 8px;
    border: none;
}

QScrollBar::handle:horizontal {
    background-color: #2A2A35;
    border-radius: 4px;
}

/* ===== DIALOG ===== */
#DialogBox {
    background-color: #141418;
    border: 1px solid #2A2A35;
}

#DialogTitle {
    background-color: #0D0D12;
    color: #00D4AA;
    padding: 8px 14px;
    font-size: 11px;
    letter-spacing: 2px;
    font-weight: bold;
    border-bottom: 1px solid #2A2A35;
}

/* ===== STATUS BADGES ===== */
#BadgeOpen { color: #5599FF; }
#BadgeClosed { color: #555; }
#BadgeInProgress { color: #00D4AA; }
#BadgePending { color: #D4A800; }
#PriorityHigh { color: #E05555; font-weight: bold; }
#PriorityMedium { color: #D4A800; }
#PriorityLow { color: #5599FF; }

/* ===== TOOLBAR ===== */
#Toolbar {
    background-color: #111116;
    border-bottom: 1px solid #252530;
    padding: 4px 8px;
}

/* ===== STATUS BAR ===== */
QStatusBar {
    background-color: #0D0D12;
    color: #00D4AA;
    font-size: 10px;
    border-top: 1px solid #252530;
}

/* ===== SPLITTER ===== */
QSplitter::handle {
    background-color: #252530;
    width: 1px;
    height: 1px;
}

/* ===== GROUPBOX ===== */
QGroupBox {
    border: 1px solid #252530;
    border-radius: 2px;
    margin-top: 8px;
    padding-top: 6px;
    font-size: 10px;
    color: #555;
    letter-spacing: 1px;
}

QGroupBox::title {
    subcontrol-origin: margin;
    subcontrol-position: top left;
    padding: 0 6px;
    color: #555;
    left: 8px;
}

/* ===== CHECKBOXES ===== */
QCheckBox {
    color: #888;
    spacing: 6px;
    font-size: 11px;
}

QCheckBox::indicator {
    width: 12px;
    height: 12px;
    border: 1px solid #333340;
    border-radius: 1px;
    background-color: #111116;
}

QCheckBox::indicator:checked {
    background-color: #00D4AA;
    border-color: #00D4AA;
}

/* ===== LOGIN SCREEN ===== */
#LoginBox {
    background-color: #111116;
    border: 1px solid #2A2A35;
    border-radius: 4px;
}

#LoginTitle {
    color: #00D4AA;
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 4px;
}

#LoginSub {
    color: #444;
    font-size: 9px;
    letter-spacing: 2px;
}

/* ===== ACTIVITY LOG ===== */
#LogEntry {
    color: #555;
    font-size: 10px;
    padding: 2px 0;
    border-bottom: 1px solid #1A1A22;
}

/* ===== SEARCH ===== */
#SearchBar {
    background-color: #0D0D12;
    border: 1px solid #252530;
    border-radius: 2px;
    padding: 4px 8px;
    color: #888;
    font-size: 11px;
    max-width: 220px;
}

#SearchBar:focus {
    border-color: #00D4AA;
    color: #D4D4D4;
}
"""
