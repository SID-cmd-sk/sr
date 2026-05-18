SR MANAGER  —  COMPLETE SETUP & FEATURE GUIDE
==============================================
Version: P2 (Updated)
Last updated: May 2026


────────────────────────────────────────────────────────────────
1.  REQUIREMENTS
────────────────────────────────────────────────────────────────

Python  :  3.10 or higher
Node.js :  18 or higher  (for WhatsApp bridge)
OS      :  Windows 10/11, macOS 12+, Ubuntu 20+


────────────────────────────────────────────────────────────────
2.  INSTALL ALL PYTHON DEPENDENCIES  (one command)
────────────────────────────────────────────────────────────────

Open a terminal inside the P2 folder and run:

    pip install PyQt6 qrcode[pil] Pillow supabase httpx python-dotenv

That single command installs everything the app needs today AND
everything required for the upcoming Supabase cloud migration.

Package breakdown:
  PyQt6           - the desktop UI framework
  qrcode[pil]     - renders the WhatsApp QR code inside the app
  Pillow          - image processing (required by qrcode)
  supabase        - Supabase Python client (ready for Phase 3)
  httpx           - async HTTP (used by supabase client)
  python-dotenv   - loads .env config files (for cloud credentials)


────────────────────────────────────────────────────────────────
3.  INSTALL NODE.JS DEPENDENCIES  (WhatsApp bridge)
────────────────────────────────────────────────────────────────

The wa_bridge folder already contains node_modules from your
original zip so you may not need this step.  If it fails to
connect, run once inside the wa_bridge folder:

    cd wa_bridge
    npm install


────────────────────────────────────────────────────────────────
4.  RUN THE APP
────────────────────────────────────────────────────────────────

From the P2 folder:

    python main.py

Default login:
  Email   :  admin@srmanager.local
  Password:  admin123


────────────────────────────────────────────────────────────────
5.  WHAT CHANGED IN THIS UPDATE
────────────────────────────────────────────────────────────────

  ui/routes_page.py    - Full replacement  (see section 6)
  ui/sr_page.py        - Full replacement  (see section 7)
  ui/whatsapp_page.py  - Full replacement  (see section 8)
  core/storage.py      - Two new DB keys added automatically


────────────────────────────────────────────────────────────────
6.  VISUAL ROUTE EDITOR  (ui/routes_page.py)
────────────────────────────────────────────────────────────────

Routes are now a wire diagram - each step is a painted node
connected by arrows, like a flowchart.

HOW TO USE:
  - Click  + NEW ROUTE  to create a route
  - Tick or untick  "Requires an SR to trigger"
      TICKED   = this route only runs on a real SR (SR-1001 etc)
      UNTICKED = this route can run on a plain Activity (no SR number)
  - Select the route in the left list to open the canvas
  - Click  + ADD STEP  to add a node to the wire diagram
  - Double-click any node to edit it

STEP EDITOR  (what you set per step):
  Name          - e.g. "Welcome Letter", "Activation", "Done"
  Step Type     - Mail / WhatsApp / Approval / Upload / Visit /
                  Sign-off / Auto Close / Custom
  Mail Template - pick from Templates page  (auto-fires on advance)
  WA Template   - pick from Templates page  (auto-fires on advance)
  Required      - cannot skip
  Skippable     - manager can skip

EXAMPLE ROUTE ON CANVAS:

  +----------------------------+
  |  1  WELCOME LETTER  [Mail] |  <- Mail template fires automatically
  +----------------------------+
              |
              v
  +----------------------------+
  |  2  ACTIVATION   [Mail][WA]|  <- Both fire automatically
  +----------------------------+
              |
              v
  +----------------------------+
  |  3  DONE         [Custom]  |
  +----------------------------+

  Colours:  Mail=blue  WhatsApp=green  Approval=yellow
            Upload=purple  Visit=orange  Sign-off=red

ARROW CONTROLS:
  UP / DOWN    reorder selected step
  REMOVE       delete selected step
  SAVE ROUTE   saves to local JSON (and later Supabase)

ACCESS:  Admin and Manager only


────────────────────────────────────────────────────────────────
7.  SR PAGE  (ui/sr_page.py)
────────────────────────────────────────────────────────────────

TWO TABS:

  Tab 1 — SERVICE REQUESTS
    Gets a proper SR number: SR-1001, SR-1002 ...
    Who can create: Admin, Manager, Technical, User  (ALL roles)
    Fields: Title, Customer, Contact (email/phone), WA Recipient
            (picked from live WhatsApp contacts if bridge is up),
            Priority, Route, Description
    When created, Step 1 of the assigned Route fires automatically
    (sends mail and/or WA message using the step's templates)

  Tab 2 — ACTIVITIES  (no SR number)
    No SR number generated.  Good for quick tasks, follow-ups,
    internal notes, or anything that doesn't need a ticket.
    Who can create: ALL roles including plain User
    Only shows routes that are marked "does not require SR"

ROUTE PROGRESS PANEL  (right side of SR tab):
    Shows each step as a row: Done / Current / Pending
    ADVANCE TO NEXT STEP button:
      - fires the current step's Mail template (email to customer)
      - fires the current step's WA template (WA to customer)
      - moves the pointer to the next step
      - all sends happen in background threads (UI stays responsive)

PERMISSIONS:
  Create SR          - ALL roles
  Create Activity    - ALL roles
  Close SR           - Admin, Manager, Technical
  Advance Route Step - Admin, Manager, Technical


────────────────────────────────────────────────────────────────
8.  WHATSAPP PAGE  (ui/whatsapp_page.py)
────────────────────────────────────────────────────────────────

CONNECTION:
  Click  CONNECT (QR Scan)
  A QR code appears inside the app
  Open WhatsApp on your phone
  Go to  Linked Devices  ->  Link a Device
  Scan the QR code
  App shows "Connected  X contacts  Y groups"

  The session is saved so you only scan once.
  On restart it reconnects automatically.

COMPOSE TAB:
  - Left panel shows all contacts and groups (search box + tabs)
  - Select a contact or group
  - Optionally pick a WA Template (Admin/Manager set these in
    the Templates page)
  - Type your message and click SEND

SEND LOG TAB:
  Shows every message sent: time, recipient, preview, status

DAILY REPORT  (Admin / Manager only):
  Click  DAILY REPORT CONFIG
  Set:
    Enable toggle
    Send time  (e.g. 09:00)
    Recipients - tick contacts or groups from your WA
    Message template - supports these variables:
        {date}        today's date
        {time}        current time
        {open_sr}     count of Open SRs
        {in_progress} count of In Progress SRs
        {pending_sr}  count of Pending SRs
        {closed_sr}   count of Closed SRs
        {total_sr}    total SR count

  Default template:
    Daily SR Report - {date}
    Open       : {open_sr}
    In Progress: {in_progress}
    Pending    : {pending_sr}
    Closed     : {closed_sr}
    Total      : {total_sr}

  The scheduler checks every 60 seconds.
  Once per day at the set time it sends to all recipients.

  Click  SEND REPORT NOW  to test immediately.


────────────────────────────────────────────────────────────────
9.  MAIL SENDING  (how it works)
────────────────────────────────────────────────────────────────

Uses your existing SMTP config:
  SMTP server : smtpout.secureserver.net
  Port        : 465  (SSL)
  From        : sidharth.kumar@sks3d.com

Mail templates are set in the Templates page (Admin/Manager).
Variables available in templates:
  {sr_number}       {title}           {status}
  {priority}        {customer_name}   {customer_contact}
  {assigned_to}     {created_at}      {updated_at}
  {description}     {company_name}    {current_stage}

To change SMTP credentials, edit EMAIL_CFG at the top of:
  ui/routes_page.py  AND  ui/whatsapp_page.py


────────────────────────────────────────────────────────────────
10.  PERMISSIONS SUMMARY
────────────────────────────────────────────────────────────────

Feature                   Admin  Manager  Technical  User
─────────────────────────────────────────────────────────────
Create SR                   Y       Y        Y         Y
Create Activity (no SR)     Y       Y        Y         Y
View all SRs                Y       Y        Y         own only
Close SR                    Y       Y        Y         N
Advance route step          Y       Y        Y         N
Edit Routes                 Y       Y        N         N
Edit Templates              Y       Y        N         N
Daily Report config         Y       Y        N         N
WA Send                     Y       Y        Y         Y
User management             Y       N        N         N
Settings                    Y       N        N         N


────────────────────────────────────────────────────────────────
11.  DATA STORAGE — CURRENT (LOCAL JSON)
────────────────────────────────────────────────────────────────

All data is stored in:  P2/data/sr_manager.json

Tables (keys) in that file:
  users               - login accounts and roles
  sr_entries          - all Service Requests
  activities          - no-SR activities (new)
  routes              - route definitions with steps
  mail_templates      - reusable email templates
  whatsapp_templates  - reusable WA message templates
  activity_logs       - audit trail of all actions
  wa_daily_report     - daily report config (new)
  settings            - company name, SR prefix, counter etc.

Data is per-machine (local only) in the current version.


────────────────────────────────────────────────────────────────
12.  FUTURE PLAN — SUPABASE CLOUD MIGRATION  (Phase 3)
────────────────────────────────────────────────────────────────

The goal is to move all data to Supabase so that:
  - Every user logs in from their own machine and shares the same data
  - SRs, templates, routes, and logs are synced in real time
  - No more copying JSON files between computers
  - Admin can manage users from the Supabase dashboard

HOW IT WILL WORK:

Step A — Supabase project setup (done once by Admin)
  1. Create a free project at https://supabase.com
  2. Create these tables in the SQL editor:
       users, sr_entries, activities, routes,
       mail_templates, whatsapp_templates, activity_logs, settings
     (schema mirrors DEFAULT_DB in core/storage.py exactly)
  3. Enable Row Level Security (RLS) per table so users only
     see their own data unless they are Admin or Manager
  4. Copy the Project URL and anon key from:
       Project Settings -> API

Step B — App config
  Create a file  P2/.env  with two lines:
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_KEY=your-anon-key

Step C — Storage layer swap (no page changes needed)
  core/storage.py will get a second backend that:
    - reads .env on startup
    - if SUPABASE_URL is set  ->  calls Supabase REST API
    - if not set              ->  falls back to local JSON
  All page files (routes_page, sr_page, etc.) stay exactly the
  same because they only call storage.py functions.

Step D — Users on Supabase Auth
  - Supabase Auth handles login (email + password)
  - The login page calls supabase.auth.sign_in_with_password()
  - Roles are stored in a "profiles" table linked to auth.uid
  - All devices share the same user list automatically

Step E — Real-time sync (optional but easy to add)
  - supabase.table("sr_entries").on("*", callback).subscribe()
  - SR list auto-refreshes when another user updates a ticket

The packages supabase, httpx, and python-dotenv are already
included in the pip install command from section 2, so no
extra install step is needed when this migration happens.

Migration is fully backwards compatible:
  Without .env  ->  works exactly as today (local JSON, offline)
  With .env     ->  uses Supabase cloud (all users share data)


────────────────────────────────────────────────────────────────
13.  TROUBLESHOOTING
────────────────────────────────────────────────────────────────

App won't start
  - Check Python version:    python --version   (need 3.10+)
  - Reinstall deps:          pip install PyQt6 qrcode[pil] Pillow

WA QR code not showing inside the app
  - Install image libs:      pip install qrcode[pil] Pillow
  - Check Node.js:           node --version   (need 18+)

WhatsApp bridge won't connect
  - Rebuild node deps:       cd wa_bridge && npm install
  - Ensure phone and PC are on the same Wi-Fi

Email not sending
  - Check EMAIL_CFG in ui/routes_page.py
  - If port 465 is blocked by your ISP try port 587 with STARTTLS

Route steps not auto-sending
  - Make sure a template is assigned in the Step Editor
  - For WA triggers: SR must have a WA Recipient set at creation
  - Check Python console for [Email Error] or [WA Error] lines

────────────────────────────────────────────────────────────────
END OF README
────────────────────────────────────────────────────────────────
