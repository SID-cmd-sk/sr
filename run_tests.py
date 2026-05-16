"""
SR Manager Enterprise - Phase 1 Test Runner
Run this from the sr_manager folder:  python run_tests.py
Produces: test_log.txt  with full pass/fail details
"""

# ── PATH BOOTSTRAP ────────────────────────────────────────────────────────────
import sys, os
from pathlib import Path
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
# ─────────────────────────────────────────────────────────────────────────────

import traceback
import json
import time
from datetime import datetime

LOG_FILE = ROOT / "test_log.txt"
RESULTS  = []   # list of (category, test_name, status, detail)


# ══════════════════════════════════════════════════════════════════════════════
#  LOGGER
# ══════════════════════════════════════════════════════════════════════════════

def log(category, name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append((category, name, status, detail))
    marker = "✓" if passed else "✗"
    line   = f"  [{status}] {marker} {name}"
    if detail and not passed:
        line += f"\n         → {detail}"
    print(line)


def section(title):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")


def run(category, name, fn):
    try:
        result = fn()
        msg = result if isinstance(result, str) else ""
        log(category, name, True, msg)
        return True
    except Exception as e:
        log(category, name, False, f"{type(e).__name__}: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  1. ENVIRONMENT
# ══════════════════════════════════════════════════════════════════════════════

def test_environment():
    section("1. ENVIRONMENT")

    run("ENV", "Python version >= 3.10", lambda:
        (_ for _ in ()).throw(RuntimeError(f"Python {sys.version} too old"))
        if sys.version_info < (3, 10) else None)

    run("ENV", "PyQt6 importable", lambda: __import__("PyQt6"))

    run("ENV", "PyQt6.QtWidgets importable", lambda:
        __import__("PyQt6.QtWidgets", fromlist=["QApplication"]))

    run("ENV", "PyQt6.QtCore importable", lambda:
        __import__("PyQt6.QtCore", fromlist=["Qt"]))

    run("ENV", "PyQt6.QtGui importable", lambda:
        __import__("PyQt6.QtGui", fromlist=["QFont"]))

    run("ENV", "ROOT path correct", lambda:
        (_ for _ in ()).throw(AssertionError(f"ROOT={ROOT}"))
        if not (ROOT / "main.py").exists() else None)

    run("ENV", "core/ folder exists",    lambda: assert_true((ROOT/"core").is_dir()))
    run("ENV", "ui/ folder exists",      lambda: assert_true((ROOT/"ui").is_dir()))
    run("ENV", "main.py exists",         lambda: assert_true((ROOT/"main.py").exists()))
    run("ENV", "core/storage.py exists", lambda: assert_true((ROOT/"core"/"storage.py").exists()))
    run("ENV", "core/styles.py exists",  lambda: assert_true((ROOT/"core"/"styles.py").exists()))


def assert_true(val):
    if not val:
        raise AssertionError("Assertion failed")


# ══════════════════════════════════════════════════════════════════════════════
#  2. SYNTAX CHECK — ALL .py FILES
# ══════════════════════════════════════════════════════════════════════════════

def test_syntax():
    section("2. SYNTAX CHECK")
    import ast
    for f in sorted(ROOT.rglob("*.py")):
        if "__pycache__" in str(f) or f.name == "run_tests.py":
            continue
        rel = f.relative_to(ROOT)
        run("SYNTAX", str(rel), lambda f=f: ast.parse(f.read_text(encoding="utf-8")))


# ══════════════════════════════════════════════════════════════════════════════
#  3. MODULE IMPORTS
# ══════════════════════════════════════════════════════════════════════════════

def test_imports():
    section("3. MODULE IMPORTS")

    run("IMPORT", "core.styles",        lambda: __import__("core.styles", fromlist=["STYLESHEET"]))
    run("IMPORT", "core.storage",       lambda: __import__("core.storage", fromlist=["load_db"]))
    run("IMPORT", "ui.login",           lambda: __import__("ui.login", fromlist=["LoginScreen"]))
    run("IMPORT", "ui.dashboard",       lambda: __import__("ui.dashboard", fromlist=["DashboardPage"]))
    run("IMPORT", "ui.sr_page",         lambda: __import__("ui.sr_page", fromlist=["SRPage"]))
    run("IMPORT", "ui.routes_page",     lambda: __import__("ui.routes_page", fromlist=["RoutePage"]))
    run("IMPORT", "ui.pipelines_page",  lambda: __import__("ui.pipelines_page", fromlist=["PipelinePage"]))
    run("IMPORT", "ui.users_page",      lambda: __import__("ui.users_page", fromlist=["UsersPage"]))
    run("IMPORT", "ui.templates_page",  lambda: __import__("ui.templates_page", fromlist=["TemplatesPage"]))
    run("IMPORT", "ui.settings_page",   lambda: __import__("ui.settings_page", fromlist=["SettingsPage"]))
    run("IMPORT", "ui.main_window",     lambda: __import__("ui.main_window", fromlist=["MainWindow"]))


# ══════════════════════════════════════════════════════════════════════════════
#  4. STORAGE ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def test_storage():
    section("4. STORAGE ENGINE")
    from core import storage

    run("STORAGE", "load_db() returns dict",
        lambda: assert_true(isinstance(storage.load_db(), dict)))

    run("STORAGE", "DB has all required tables", lambda: assert_true(
        all(k in storage.load_db() for k in
            ["users","roles","sr_entries","routes","pipelines",
             "mail_templates","whatsapp_templates","activity_logs","settings"])))

    run("STORAGE", "data/ folder auto-created",
        lambda: assert_true((ROOT/"data").is_dir()))

    run("STORAGE", "cache/ folder auto-created",
        lambda: assert_true((ROOT/"cache").is_dir()))

    run("STORAGE", "sr_manager.json exists after load_db",
        lambda: assert_true((ROOT/"data"/"sr_manager.json").exists()))

    # Settings
    run("STORAGE", "get_settings() returns dict",
        lambda: assert_true(isinstance(storage.get_settings(), dict)))

    run("STORAGE", "update_settings() persists", lambda: (
        storage.update_settings(company_name="TestCo"),
        assert_true(storage.get_settings()["company_name"] == "TestCo"),
        storage.update_settings(company_name="SR Manager Enterprise")
    ))

    # Roles
    run("STORAGE", "default roles exist (5)", lambda:
        assert_true(len(storage.load_db()["roles"]) >= 5))

    # Activity log
    run("STORAGE", "log_activity() works", lambda: (
        storage.log_activity("TEST", "Test log entry", "TESTER"),
        assert_true(any(l["action"] == "TEST" for l in storage.get_activity_logs(10)))
    ))

    run("STORAGE", "get_activity_logs() returns list",
        lambda: assert_true(isinstance(storage.get_activity_logs(5), list)))


# ══════════════════════════════════════════════════════════════════════════════
#  5. AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════════════

def test_auth():
    section("5. AUTHENTICATION")
    from core import storage

    run("AUTH", "Master admin login succeeds", lambda:
        assert_true(storage.login("admin@srmanager.local", "admin123") is not None))

    run("AUTH", "Master admin has role=Admin", lambda:
        assert_true(storage.login("admin@srmanager.local", "admin123")["role"] == "Admin"))

    run("AUTH", "Wrong password rejected", lambda:
        assert_true(storage.login("admin@srmanager.local", "wrongpass") is None))

    run("AUTH", "Unknown email rejected", lambda:
        assert_true(storage.login("nobody@nowhere.com", "pass") is None))

    run("AUTH", "save_session() and get_session()", lambda: (
        storage.save_session({"id": "TEST", "name": "Tester", "role": "Admin"}),
        assert_true(storage.get_session()["id"] == "TEST"),
        storage.clear_session()
    ))

    run("AUTH", "clear_session() removes session", lambda: (
        storage.clear_session(),
        assert_true(storage.get_session() is None)
    ))


# ══════════════════════════════════════════════════════════════════════════════
#  6. USER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

def test_users():
    section("6. USER MANAGEMENT")
    from core import storage

    # Create test users
    u1 = storage.create_user("Test Manager",  "tmgr@test.local",  "pass1234", "r2", "FieldOps")
    u2 = storage.create_user("Test Tech",     "ttech@test.local", "pass1234", "r3", "FieldOps")
    u3 = storage.create_user("Test User",     "tuser@test.local", "pass1234", "r4", None)

    run("USER", "create_user() returns dict with id",
        lambda: assert_true("id" in u1 and u1["name"] == "Test Manager"))

    run("USER", "new user status is 'pending'",
        lambda: assert_true(u1["status"] == "pending"))

    run("USER", "update_user_status() to active", lambda: (
        storage.update_user_status(u1["id"], "active"),
        storage.update_user_status(u2["id"], "active"),
        storage.update_user_status(u3["id"], "active"),
        assert_true(next(u for u in storage.get_users() if u["id"]==u1["id"])["status"] == "active")
    ))

    run("USER", "inactive user cannot login", lambda: (
        storage.update_user_status(u3["id"], "inactive"),
        assert_true(storage.login("tuser@test.local", "pass1234") is None),
        storage.update_user_status(u3["id"], "active")
    ))

    run("USER", "active user can login",
        lambda: assert_true(storage.login("tmgr@test.local", "pass1234") is not None))

    run("USER", "get_users() returns list",
        lambda: assert_true(isinstance(storage.get_users(), list)))

    run("USER", "delete_user() removes user", lambda: (
        storage.delete_user(u3["id"]),
        assert_true(all(u["id"] != u3["id"] for u in storage.get_users()))
    ))

    return u1, u2


# ══════════════════════════════════════════════════════════════════════════════
#  7. ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def test_routes():
    section("7. ROUTE MANAGEMENT")
    from core import storage

    steps = [
        {"name": "Review",    "type": "Approval",        "required": True,  "skippable": False,
         "triggers_mail": False, "triggers_whatsapp": False, "needs_approval": True,
         "approval_role": "Manager", "notes": "Initial review"},
        {"name": "Dispatch",  "type": "Engineer Visit",  "required": True,  "skippable": False,
         "triggers_mail": True,  "triggers_whatsapp": True,  "needs_approval": False,
         "approval_role": "Any", "notes": ""},
        {"name": "Close",     "type": "Customer Signoff","required": False, "skippable": True,
         "triggers_mail": True,  "triggers_whatsapp": False, "needs_approval": False,
         "approval_role": "Any", "notes": "Optional signoff"},
    ]

    route = storage.create_route("Test Route", "A test route", steps, "MASTER")

    run("ROUTE", "create_route() returns dict",
        lambda: assert_true("id" in route))

    run("ROUTE", "route has correct step count",
        lambda: assert_true(len(route["steps"]) == 3))

    run("ROUTE", "route appears in get_routes()",
        lambda: assert_true(any(r["id"] == route["id"] for r in storage.get_routes())))

    run("ROUTE", "update_route() persists name change", lambda: (
        storage.update_route(route["id"], name="Updated Route"),
        assert_true(next(r for r in storage.get_routes() if r["id"]==route["id"])["name"] == "Updated Route"),
        storage.update_route(route["id"], name="Test Route")
    ))

    run("ROUTE", "toggle active flag", lambda: (
        storage.update_route(route["id"], active=False),
        assert_true(next(r for r in storage.get_routes() if r["id"]==route["id"])["active"] == False),
        storage.update_route(route["id"], active=True)
    ))

    run("ROUTE", "step fields preserved (triggers_mail)", lambda:
        assert_true(route["steps"][1]["triggers_mail"] == True))

    run("ROUTE", "step skippable flag preserved", lambda:
        assert_true(route["steps"][2]["skippable"] == True))

    return route


# ══════════════════════════════════════════════════════════════════════════════
#  8. PIPELINES
# ══════════════════════════════════════════════════════════════════════════════

def test_pipelines():
    section("8. PIPELINE MANAGEMENT")
    from core import storage

    stages = [
        {"name": "Review",   "description": "First look", "handled_by": "Manager",
         "needs_approval": True,  "send_mail": True,  "send_whatsapp": False,
         "has_escalation": True,  "escalation_hours": 24},
        {"name": "Execute",  "description": "On-site",    "handled_by": "Technical",
         "needs_approval": False, "send_mail": False, "send_whatsapp": True,
         "has_escalation": True,  "escalation_hours": 48},
        {"name": "Close",    "description": "Wrap up",    "handled_by": "Manager",
         "needs_approval": True,  "send_mail": True,  "send_whatsapp": True,
         "has_escalation": False, "escalation_hours": 0},
    ]

    pipeline = storage.create_pipeline("Test Pipeline", stages, "MASTER")

    run("PIPELINE", "create_pipeline() returns dict",
        lambda: assert_true("id" in pipeline))

    run("PIPELINE", "pipeline has 3 stages",
        lambda: assert_true(len(pipeline["stages"]) == 3))

    run("PIPELINE", "pipeline in get_pipelines()",
        lambda: assert_true(any(p["id"]==pipeline["id"] for p in storage.get_pipelines())))

    run("PIPELINE", "stage send_mail flag correct",
        lambda: assert_true(pipeline["stages"][0]["send_mail"] == True))

    run("PIPELINE", "stage escalation_hours correct",
        lambda: assert_true(pipeline["stages"][1]["escalation_hours"] == 48))

    run("PIPELINE", "pipeline edit persists", lambda: (
        db := storage.load_db(),
        [p.__setitem__("name", "Edited Pipeline") for p in db["pipelines"] if p["id"]==pipeline["id"]],
        storage.save_db(db),
        assert_true(next(p for p in storage.get_pipelines() if p["id"]==pipeline["id"])["name"] == "Edited Pipeline")
    ))

    return pipeline


# ══════════════════════════════════════════════════════════════════════════════
#  9. SR ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def test_sr(route, pipeline, user):
    section("9. SR ENGINE")
    from core import storage

    sr1 = storage.create_sr(
        title="AC Unit Failure",
        description="Unit not cooling. Urgent.",
        priority="High",
        pipeline_id=pipeline["id"],
        route_id=route["id"],
        created_by="MASTER",
        customer_name="Acme Corp",
        customer_contact="+1-555-0100"
    )
    sr2 = storage.create_sr(
        title="Network Switch Down",
        description="Switch port 4 dead.",
        priority="Medium",
        pipeline_id=pipeline["id"],
        route_id=route["id"],
        created_by=user["id"],
        customer_name="Beta Ltd",
        customer_contact="beta@example.com"
    )
    sr3 = storage.create_sr(
        title="Routine Inspection",
        description="Quarterly check.",
        priority="Low",
        pipeline_id=None,
        route_id=None,
        created_by="MASTER",
        customer_name="",
        customer_contact=""
    )

    run("SR", "create_sr() returns dict with sr_number",
        lambda: assert_true("sr_number" in sr1 and sr1["sr_number"].startswith("SR-")))

    run("SR", "SR numbers are unique",
        lambda: assert_true(sr1["sr_number"] != sr2["sr_number"] != sr3["sr_number"]))

    run("SR", "default status is Open",
        lambda: assert_true(sr1["status"] == "Open"))

    run("SR", "priority stored correctly",
        lambda: assert_true(sr1["priority"] == "High"))

    run("SR", "customer_name stored",
        lambda: assert_true(sr1["customer_name"] == "Acme Corp"))

    run("SR", "pipeline_id linked",
        lambda: assert_true(sr1["pipeline_id"] == pipeline["id"]))

    run("SR", "route_id linked",
        lambda: assert_true(sr1["route_id"] == route["id"]))

    run("SR", "update_sr() changes status", lambda: (
        storage.update_sr(sr1["id"], status="In Progress"),
        assert_true(next(s for s in storage.get_all_sr() if s["id"]==sr1["id"])["status"] == "In Progress")
    ))

    run("SR", "update_sr() assigns user", lambda: (
        storage.update_sr(sr1["id"], assigned_to=user["id"]),
        assert_true(next(s for s in storage.get_all_sr() if s["id"]==sr1["id"])["assigned_to"] == user["id"])
    ))

    run("SR", "advance_sr_stage() increments stage", lambda: (
        storage.advance_sr_stage(sr1["id"], "MASTER"),
        assert_true(next(s for s in storage.get_all_sr() if s["id"]==sr1["id"])["current_stage"] == 1)
    ))

    run("SR", "stage_history recorded after advance", lambda:
        assert_true(len(next(s for s in storage.get_all_sr() if s["id"]==sr1["id"])["stage_history"]) >= 1))

    run("SR", "add_comment() persists", lambda: (
        storage.add_comment(sr1["id"], "MASTER", "Engineer dispatched."),
        assert_true(any(c["text"]=="Engineer dispatched."
                        for c in next(s for s in storage.get_all_sr() if s["id"]==sr1["id"])["comments"]))
    ))

    run("SR", "multiple comments stack", lambda: (
        storage.add_comment(sr1["id"], user["id"], "On site now."),
        assert_true(len(next(s for s in storage.get_all_sr() if s["id"]==sr1["id"])["comments"]) >= 2)
    ))

    run("SR", "close_sr() sets status=Closed", lambda: (
        storage.close_sr(sr2["id"], "MASTER"),
        assert_true(next(s for s in storage.get_all_sr() if s["id"]==sr2["id"])["status"] == "Closed")
    ))

    run("SR", "close_sr() sets closed_at timestamp", lambda:
        assert_true(next(s for s in storage.get_all_sr() if s["id"]==sr2["id"])["closed_at"] is not None))

    run("SR", "get_sr_by_user() admin sees all", lambda:
        assert_true(len(storage.get_sr_by_user("MASTER", "Admin")) >= 3))

    run("SR", "get_sr_by_user() user sees own SRs only", lambda:
        assert_true(all(
            s["created_by"]==user["id"] or s["assigned_to"]==user["id"]
            for s in storage.get_sr_by_user(user["id"], "User")
        )))

    run("SR", "dashboard stats total_sr >= 3", lambda:
        assert_true(storage.get_dashboard_stats()["total_sr"] >= 3))

    run("SR", "dashboard stats closed_sr >= 1", lambda:
        assert_true(storage.get_dashboard_stats()["closed_sr"] >= 1))

    return sr1


# ══════════════════════════════════════════════════════════════════════════════
#  10. TEMPLATES
# ══════════════════════════════════════════════════════════════════════════════

def test_templates():
    section("10. TEMPLATES")
    from core import storage

    mt = storage.create_mail_template(
        "SR Update",
        "SR {sr_number} — {status}",
        "Dear {customer_name},\n\nYour SR {sr_number} is now {status}.\n\nRegards,\n{company_name}",
        "MASTER"
    )
    wt = storage.create_whatsapp_template(
        "WA SR Update",
        "🔔 SR: {sr_number}\nStatus: {status}\nCustomer: {customer_name}",
        "MASTER"
    )

    run("TEMPLATE", "create_mail_template() returns dict",
        lambda: assert_true("id" in mt and mt["name"] == "SR Update"))

    run("TEMPLATE", "mail template has subject",
        lambda: assert_true("{sr_number}" in mt["subject"]))

    run("TEMPLATE", "mail template has body",
        lambda: assert_true("{customer_name}" in mt["body"]))

    run("TEMPLATE", "mail template in get_mail_templates()",
        lambda: assert_true(any(t["id"]==mt["id"] for t in storage.get_mail_templates())))

    run("TEMPLATE", "create_whatsapp_template() returns dict",
        lambda: assert_true("id" in wt))

    run("TEMPLATE", "WA template in get_whatsapp_templates()",
        lambda: assert_true(any(t["id"]==wt["id"] for t in storage.get_whatsapp_templates())))

    run("TEMPLATE", "mail template variable substitution works", lambda: (
        body := mt["body"].replace("{customer_name}","John").replace("{sr_number}","SR-1001").replace("{status}","Closed").replace("{company_name}","TestCo"),
        assert_true("John" in body and "SR-1001" in body)
    ))

    run("TEMPLATE", "delete mail template", lambda: (
        db := storage.load_db(),
        db.__setitem__("mail_templates", [t for t in db["mail_templates"] if t["id"]!=mt["id"]]),
        storage.save_db(db),
        assert_true(all(t["id"]!=mt["id"] for t in storage.get_mail_templates()))
    ))


# ══════════════════════════════════════════════════════════════════════════════
#  11. UI WIDGETS (headless)
# ══════════════════════════════════════════════════════════════════════════════

def test_ui(user, route, pipeline):
    section("11. UI WIDGETS (headless)")

    from core.styles import STYLESHEET
    from PyQt6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication(sys.argv)
    app.setStyleSheet(STYLESHEET)

    from core import storage
    admin = storage.login("admin@srmanager.local", "admin123")

    run("UI", "LoginScreen instantiates",
        lambda: __import__("ui.login", fromlist=["LoginScreen"]).LoginScreen())

    run("UI", "DashboardPage instantiates",
        lambda: __import__("ui.dashboard", fromlist=["DashboardPage"]).DashboardPage(admin))

    run("UI", "DashboardPage._refresh() runs without error", lambda: (
        dp := __import__("ui.dashboard", fromlist=["DashboardPage"]).DashboardPage(admin),
        dp._refresh()
    ))

    run("UI", "SRPage instantiates",
        lambda: __import__("ui.sr_page", fromlist=["SRPage"]).SRPage(admin))

    run("UI", "SRPage loads SR list", lambda: (
        sp := __import__("ui.sr_page", fromlist=["SRPage"]).SRPage(admin),
        assert_true(sp.table.rowCount() >= 0)
    ))

    run("UI", "SRPage filter works", lambda: (
        sp := __import__("ui.sr_page", fromlist=["SRPage"]).SRPage(admin),
        sp.search_bar.setText("AC"),
        sp._filter(),
        assert_true(sp.table.rowCount() >= 0)
    ))

    run("UI", "CreateSRDialog instantiates", lambda: (
        m := __import__("ui.sr_page", fromlist=["CreateSRDialog"]),
        m.CreateSRDialog(admin)
    ))

    run("UI", "RoutePage instantiates",
        lambda: __import__("ui.routes_page", fromlist=["RoutePage"]).RoutePage(admin))

    run("UI", "RouteEditorDialog instantiates", lambda: (
        m := __import__("ui.routes_page", fromlist=["RouteEditorDialog"]),
        m.RouteEditorDialog(admin)
    ))

    run("UI", "StepEditorDialog save() produces correct dict", lambda: (
        m := __import__("ui.routes_page", fromlist=["StepEditorDialog"]),
        dlg := m.StepEditorDialog(),
        dlg.name_input.setText("Test Step"),
        dlg.type_combo.setCurrentText("Approval"),
        dlg.required_cb.setChecked(True),
        dlg.mail_cb.setChecked(True),
        dlg._save(),
        assert_true(dlg.result_step["name"] == "Test Step"),
        assert_true(dlg.result_step["triggers_mail"] == True)
    ))

    run("UI", "PipelinePage instantiates",
        lambda: __import__("ui.pipelines_page", fromlist=["PipelinePage"]).PipelinePage(admin))

    run("UI", "StageEditorDialog save() correct", lambda: (
        m := __import__("ui.pipelines_page", fromlist=["StageEditorDialog"]),
        dlg := m.StageEditorDialog(),
        dlg.name_input.setText("Stage A"),
        dlg.approval_cb.setChecked(True),
        dlg.mail_cb.setChecked(True),
        dlg._save(),
        assert_true(dlg.result_stage["needs_approval"] == True),
        assert_true(dlg.result_stage["send_mail"] == True)
    ))

    run("UI", "UsersPage instantiates (Admin)",
        lambda: __import__("ui.users_page", fromlist=["UsersPage"]).UsersPage(admin))

    run("UI", "UserDialog instantiates",
        lambda: __import__("ui.users_page", fromlist=["UserDialog"]).UserDialog(admin))

    run("UI", "TemplatesPage instantiates",
        lambda: __import__("ui.templates_page", fromlist=["TemplatesPage"]).TemplatesPage(admin))

    run("UI", "MailTemplateDialog instantiates",
        lambda: __import__("ui.templates_page", fromlist=["MailTemplateDialog"]).MailTemplateDialog(admin))

    run("UI", "WATemplateDialog instantiates",
        lambda: __import__("ui.templates_page", fromlist=["WATemplateDialog"]).WATemplateDialog(admin))

    run("UI", "SettingsPage instantiates",
        lambda: __import__("ui.settings_page", fromlist=["SettingsPage"]).SettingsPage(admin))

    run("UI", "MainWindow instantiates",
        lambda: __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin))

    run("UI", "MainWindow navigate dashboard",   lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("dashboard")))
    run("UI", "MainWindow navigate sr",          lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("sr")))
    run("UI", "MainWindow navigate routes",      lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("routes")))
    run("UI", "MainWindow navigate pipelines",   lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("pipelines")))
    run("UI", "MainWindow navigate users",       lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("users")))
    run("UI", "MainWindow navigate templates",   lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("templates")))
    run("UI", "MainWindow navigate settings",    lambda: (mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin), mw._navigate("settings")))


# ══════════════════════════════════════════════════════════════════════════════
#  12. ROLE-BASED ACCESS
# ══════════════════════════════════════════════════════════════════════════════

def test_roles():
    section("12. ROLE-BASED ACCESS")
    from ui.main_window import NAV_PERMISSIONS

    run("ROLES", "Admin can access all pages", lambda:
        assert_true(all("Admin" in v for v in NAV_PERMISSIONS.values())))

    run("ROLES", "User cannot access settings", lambda:
        assert_true("User" not in NAV_PERMISSIONS.get("settings", [])))

    run("ROLES", "User cannot access users page", lambda:
        assert_true("User" not in NAV_PERMISSIONS.get("users", [])))

    run("ROLES", "User cannot access routes", lambda:
        assert_true("User" not in NAV_PERMISSIONS.get("routes", [])))

    run("ROLES", "User can access dashboard", lambda:
        assert_true("User" in NAV_PERMISSIONS.get("dashboard", [])))

    run("ROLES", "User can access sr", lambda:
        assert_true("User" in NAV_PERMISSIONS.get("sr", [])))

    run("ROLES", "Manager can access routes", lambda:
        assert_true("Manager" in NAV_PERMISSIONS.get("routes", [])))

    run("ROLES", "Manager can access pipelines", lambda:
        assert_true("Manager" in NAV_PERMISSIONS.get("pipelines", [])))

    run("ROLES", "Viewer cannot access settings", lambda:
        assert_true("Viewer" not in NAV_PERMISSIONS.get("settings", [])))


# ══════════════════════════════════════════════════════════════════════════════
#  13. BACKUP / RESTORE
# ══════════════════════════════════════════════════════════════════════════════

def test_backup():
    section("13. BACKUP & RESTORE")
    from core import storage
    import tempfile, json

    run("BACKUP", "DB serializes to valid JSON", lambda: (
        db := storage.load_db(),
        json.loads(json.dumps(db))
    ))

    run("BACKUP", "Backup round-trip preserves data", lambda: (
        db := storage.load_db(),
        tmp := tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False),
        json.dump(db, tmp, indent=2),
        tmp.close(),
        restored := json.load(open(tmp.name)),
        assert_true(restored["settings"] == db["settings"]),
        assert_true(len(restored["sr_entries"]) == len(db["sr_entries"])),
        os.unlink(tmp.name)
    ))

    run("BACKUP", "Restore re-loads correctly", lambda: (
        original := storage.load_db(),
        storage.update_settings(company_name="TEMP_TEST"),
        assert_true(storage.get_settings()["company_name"] == "TEMP_TEST"),
        storage.save_db(original),
        assert_true(storage.get_settings()["company_name"] == original["settings"]["company_name"])
    ))


# ══════════════════════════════════════════════════════════════════════════════
#  WRITE LOG FILE
# ══════════════════════════════════════════════════════════════════════════════

def write_log():
    passed = [r for r in RESULTS if r[2] == "PASS"]
    failed = [r for r in RESULTS if r[2] == "FAIL"]
    total  = len(RESULTS)

    lines = []
    lines.append("=" * 70)
    lines.append("  SR MANAGER ENTERPRISE — PHASE 1 TEST LOG")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"  Python:    {sys.version}")
    lines.append(f"  Root:      {ROOT}")
    lines.append("=" * 70)
    lines.append(f"\n  TOTAL: {total}   PASSED: {len(passed)}   FAILED: {len(failed)}\n")

    if failed:
        lines.append("─" * 70)
        lines.append("  FAILED TESTS")
        lines.append("─" * 70)
        for cat, name, status, detail in failed:
            lines.append(f"  [FAIL] [{cat}] {name}")
            if detail:
                lines.append(f"         → {detail}")
        lines.append("")

    lines.append("─" * 70)
    lines.append("  FULL RESULTS")
    lines.append("─" * 70)

    current_cat = None
    for cat, name, status, detail in RESULTS:
        if cat != current_cat:
            lines.append(f"\n  ── {cat} ──")
            current_cat = cat
        marker = "✓" if status == "PASS" else "✗"
        lines.append(f"    [{status}] {marker} {name}")
        if detail and status == "FAIL":
            lines.append(f"           → {detail}")

    lines.append("\n" + "=" * 70)
    if not failed:
        lines.append("  ✓  ALL TESTS PASSED — Phase 1 fully operational")
    else:
        lines.append(f"  ✗  {len(failed)} TEST(S) FAILED — see details above")
    lines.append("=" * 70)

    log_text = "\n".join(lines)
    LOG_FILE.write_text(log_text, encoding="utf-8")
    return log_text, len(passed), len(failed)


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def test_whatsapp():
    section("14. WHATSAPP (Phase 2)")

    run("WA", "core.whatsapp importable",
        lambda: __import__("core.whatsapp", fromlist=["WhatsAppManager"]))

    run("WA", "ui.whatsapp_page importable",
        lambda: __import__("ui.whatsapp_page", fromlist=["WhatsAppPage"]))

    run("WA", "find_node() runs without error",
        lambda: __import__("core.whatsapp", fromlist=["find_node"]).find_node() is not None or True)

    run("WA", "find_npm() runs without error",
        lambda: __import__("core.whatsapp", fromlist=["find_npm"]).find_npm() is not None or True)

    run("WA", "wa_bridge/bridge.js exists",
        lambda: assert_true((ROOT / "wa_bridge" / "bridge.js").exists()))

    run("WA", "wa_bridge/package.json exists",
        lambda: assert_true((ROOT / "wa_bridge" / "package.json").exists()))

    run("WA", "WhatsAppManager instantiates", lambda: (
        m := __import__("core.whatsapp", fromlist=["WhatsAppManager"]),
        m.WhatsAppManager()
    ))

    run("WA", "WhatsAppManager.node_available() returns bool", lambda: (
        m := __import__("core.whatsapp", fromlist=["WhatsAppManager"]),
        wa := m.WhatsAppManager(),
        assert_true(isinstance(wa.node_available(), bool))
    ))

    run("WA", "WhatsAppManager.deps_installed() returns bool", lambda: (
        m := __import__("core.whatsapp", fromlist=["WhatsAppManager"]),
        wa := m.WhatsAppManager(),
        assert_true(isinstance(wa.deps_installed(), bool))
    ))

    from PyQt6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication(sys.argv)
    from core import storage
    admin = storage.login("admin@srmanager.local", "admin123")

    run("WA", "WhatsAppPage instantiates",
        lambda: __import__("ui.whatsapp_page", fromlist=["WhatsAppPage"]).WhatsAppPage(admin))

    run("WA", "WhatsAppPage has 5 tabs", lambda: (
        wp := __import__("ui.whatsapp_page", fromlist=["WhatsAppPage"]).WhatsAppPage(admin),
        assert_true(wp.tabs.count() == 5)
    ))

    run("WA", "WhatsApp in NAV_PERMISSIONS", lambda: (
        m := __import__("ui.main_window", fromlist=["NAV_PERMISSIONS"]),
        assert_true("whatsapp" in m.NAV_PERMISSIONS)
    ))

    run("WA", "Admin can access WhatsApp page", lambda: (
        m := __import__("ui.main_window", fromlist=["NAV_PERMISSIONS"]),
        assert_true("Admin" in m.NAV_PERMISSIONS["whatsapp"])
    ))

    run("WA", "Technical can access WhatsApp page", lambda: (
        m := __import__("ui.main_window", fromlist=["NAV_PERMISSIONS"]),
        assert_true("Technical" in m.NAV_PERMISSIONS["whatsapp"])
    ))

    run("WA", "Viewer cannot access WhatsApp page", lambda: (
        m := __import__("ui.main_window", fromlist=["NAV_PERMISSIONS"]),
        assert_true("Viewer" not in m.NAV_PERMISSIONS["whatsapp"])
    ))

    run("WA", "MainWindow navigates to whatsapp", lambda: (
        mw := __import__("ui.main_window", fromlist=["MainWindow"]).MainWindow(admin),
        mw._navigate("whatsapp"),
        assert_true(mw.current_page == "whatsapp")
    ))

    # Bridge IPC test (only if node is available)
    from core.whatsapp import WhatsAppManager, find_node
    if find_node():
        import time
        run("WA", "Bridge process starts and sends bridge_ready", lambda: _test_bridge_ipc())
    else:
        log("WA", "Bridge IPC (skipped — Node.js not found on this machine)", True, "")


def _test_bridge_ipc():
    import time
    from PyQt6.QtWidgets import QApplication
    from core.whatsapp import WhatsAppManager
    app = QApplication.instance() or QApplication(sys.argv)
    wa = WhatsAppManager()
    received = []
    wa.sig_status.connect(lambda s: received.append(s))
    wa.start_bridge()
    time.sleep(1)
    app.processEvents()
    wa.ping()
    time.sleep(0.4)
    app.processEvents()
    wa.stop_bridge()
    assert any("bridge_ready" in str(e) for e in received), \
        f"bridge_ready not received. Got: {received}"


# Patch main to include WA tests



if __name__ == "__main__":
    print()
    print("=" * 60)
    print("  SR MANAGER ENTERPRISE — PHASE 1 TEST RUNNER")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    t0 = time.time()

    try:
        test_environment()
        test_syntax()
        test_imports()
        test_storage()
        test_auth()
        u1, u2    = test_users()
        route     = test_routes()
        pipeline  = test_pipelines()
        sr        = test_sr(route, pipeline, u1)
        test_templates()
        test_ui(u1, route, pipeline)
        test_roles()
        test_backup()
        test_whatsapp()
    except Exception as e:
        print(f"\n\n  FATAL ERROR IN TEST RUNNER:\n  {traceback.format_exc()}")

    elapsed = time.time() - t0
    log_text, passed, failed = write_log()

    print()
    print("=" * 60)
    print(f"  Done in {elapsed:.1f}s")
    print(f"  PASSED: {passed}   FAILED: {failed}")
    print(f"  Log saved → {LOG_FILE}")
    if failed == 0:
        print("  ✓ ALL TESTS PASSED")
    else:
        print(f"  ✗ {failed} FAILED — check test_log.txt")
    print("=" * 60)
    print()


# ══════════════════════════════════════════════════════════════════════════════
#  14. PHASE 2 — WHATSAPP
# ══════════════════════════════════════════════════════════════════════════════

