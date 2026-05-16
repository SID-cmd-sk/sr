"""
whatsapp_sender.py  v4  - UI to pick, Terminal to message
==========================================================
1. Browser UI opens → shows all contacts & groups
2. Click a contact/group → terminal shows who is selected
3. Type message in terminal → press Enter → sent
4. Type 'exit' → quit

USAGE:  python whatsapp_sender.py
"""

import subprocess, sys, os, json, shutil, threading, time, webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
NODE_DIR    = os.path.join(SCRIPT_DIR, "_wa_node")
NODE_SCRIPT = os.path.join(NODE_DIR, "wa_bridge.js")
PKG_JSON    = os.path.join(NODE_DIR, "package.json")
DATA_FILE   = os.path.join(SCRIPT_DIR, "wa_data.json")
SEL_FILE    = os.path.join(SCRIPT_DIR, "wa_sel.json")    # UI writes selection here
CMD_FILE    = os.path.join(SCRIPT_DIR, "wa_cmd.json")    # Python writes send cmd here
PORT        = 7788

# ── Node.js bridge ─────────────────────────────────────────────────────────────
NODE_JS_CODE = r"""
'use strict';
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs     = require('fs');
const path   = require('path');

const DATA_FILE = path.join(__dirname, '..', 'wa_data.json');
const CMD_FILE  = path.join(__dirname, '..', 'wa_cmd.json');

if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
if (fs.existsSync(CMD_FILE))  fs.unlinkSync(CMD_FILE);

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '..', '.wwebjs_auth') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
    console.log('\n========================================');
    console.log('  Scan QR with WhatsApp                 ');
    console.log('  WhatsApp > Linked Devices > Link Device');
    console.log('========================================\n');
    qrcode.generate(qr, { small: true });
    console.log('\nWaiting for scan...\n');
});

client.on('authenticated', () => console.log('[OK] Authenticated'));
client.on('auth_failure',  m  => { console.error('[FAIL]', m); process.exit(1); });

client.on('ready', async () => {
    console.log('[OK] WhatsApp ready - fetching chats...');
    const chats = await client.getChats();
    const contacts = [], groups = [];
    for (const c of chats) {
        if (c.isGroup) {
            groups.push({ id: c.id._serialized, name: c.name || '(unnamed)', type: 'group' });
        } else {
            const name = c.name || c.id.user || '';
            if (name) contacts.push({ id: c.id._serialized, name, type: 'contact' });
        }
    }
    contacts.sort((a,b) => a.name.localeCompare(b.name));
    groups.sort((a,b)   => a.name.localeCompare(b.name));
    fs.writeFileSync(DATA_FILE, JSON.stringify({ status: 'ready', contacts, groups }));
    console.log(`[OK] ${contacts.length} contacts, ${groups.length} groups loaded`);
    console.log('[OK] Browser UI ready!\n');

    // Poll for send commands
    setInterval(async () => {
        if (!fs.existsSync(CMD_FILE)) return;
        let cmd;
        try { cmd = JSON.parse(fs.readFileSync(CMD_FILE, 'utf8')); } catch { return; }
        if (cmd.done) return;
        fs.writeFileSync(CMD_FILE, JSON.stringify({ ...cmd, done: true }));
        try {
            const chat = await client.getChatById(cmd.id);
            await chat.sendMessage(cmd.message);
            console.log(`\n  [SENT] "${cmd.message}" -> ${cmd.name}`);
        } catch(e) {
            console.error(`\n  [FAIL] ${e.message}`);
        }
        // signal Python terminal loop
        const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        d.lastResult = { ok: true, ts: Date.now() };
        fs.writeFileSync(DATA_FILE, JSON.stringify(d));
    }, 600);
});

client.initialize();
"""

# ── HTML UI (picker only) ───────────────────────────────────────────────────────
HTML_UI = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp — Pick Contact</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#1c2330;
  --border:#30363d;--green:#25D366;--green-dim:#1a9648;
  --green-glow:rgba(37,211,102,.15);--text:#e6edf3;
  --muted:#7d8590;--accent:#58a6ff;--purple:#c084fc;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif}

body{display:flex;flex-direction:column;height:100vh}

/* header */
.header{
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:16px 24px;display:flex;align-items:center;gap:14px;flex-shrink:0;
}
.logo-icon{width:38px;height:38px;border-radius:50%;background:var(--green);
  display:flex;align-items:center;justify-content:center;font-size:20px;
  box-shadow:0 0 16px var(--green-glow);flex-shrink:0}
.logo-text{font-family:'Syne',sans-serif;font-weight:800;font-size:18px}
.logo-text span{color:var(--green)}
.dot{width:9px;height:9px;border-radius:50%;background:#f85149;margin-left:auto;flex-shrink:0;animation:pulse 1.4s infinite}
.dot.on{background:var(--green);animation:none}
.status{font-size:12px;color:var(--muted);margin-left:6px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}

/* selected banner */
.banner{
  background:var(--green-glow);border-bottom:1px solid var(--green-dim);
  padding:10px 24px;font-size:13px;color:var(--green);
  display:flex;align-items:center;gap:8px;flex-shrink:0;
  transition:all .3s;
}
.banner.hidden{display:none}
.banner strong{font-weight:600}
.banner .check{font-size:16px}

/* toolbar */
.toolbar{
  padding:12px 20px 8px;display:flex;align-items:center;gap:10px;flex-shrink:0;
  background:var(--bg);
}
.searchbox{
  flex:1;display:flex;align-items:center;
  background:var(--surface);border:1px solid var(--border);
  border-radius:9px;padding:8px 13px;gap:8px;
}
.searchbox input{
  flex:1;background:none;border:none;outline:none;
  color:var(--text);font-size:14px;font-family:'DM Sans',sans-serif;
}
.searchbox input::placeholder{color:var(--muted)}

.tabs{display:flex;gap:5px;flex-shrink:0}
.tab{
  padding:7px 14px;border-radius:8px;font-size:12px;font-weight:500;
  cursor:pointer;border:1px solid var(--border);color:var(--muted);
  transition:all .18s;background:var(--surface);white-space:nowrap;
}
.tab.active{background:var(--green-glow);border-color:var(--green-dim);color:var(--green)}
.tab:hover:not(.active){color:var(--text);background:var(--surface2)}
.tcnt{
  background:var(--border);border-radius:9px;
  padding:1px 7px;font-size:10px;margin-left:5px;
}

/* list */
.list{flex:1;overflow-y:auto;padding:4px 0 20px}
.list::-webkit-scrollbar{width:5px}
.list::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.sec{padding:10px 22px 4px;font-size:10px;font-weight:700;color:var(--muted);
  text-transform:uppercase;letter-spacing:1.2px}

.ci{
  display:flex;align-items:center;gap:13px;
  padding:10px 22px;cursor:pointer;
  border-left:3px solid transparent;
  transition:all .14s;
}
.ci:hover{background:var(--surface);border-left-color:var(--green-dim)}
.ci.sel{background:var(--green-glow);border-left-color:var(--green)}

.av{
  width:42px;height:42px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-family:'Syne',sans-serif;font-weight:700;font-size:16px;
}
.av.contact{background:#1d2f3f;color:var(--accent)}
.av.group  {background:#2d1f3f;color:var(--purple)}
.cn{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct{font-size:11px;color:var(--muted);margin-top:2px}

/* loading */
.overlay{position:fixed;inset:0;background:rgba(13,17,23,.93);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:99}
.spinner{width:46px;height:46px;border:3px solid var(--border);
  border-top-color:var(--green);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.overlay p{color:var(--muted);font-size:13px}
.hidden{display:none!important}
</style>
</head>
<body>

<div class="overlay" id="ov">
  <div class="spinner"></div>
  <p id="lmsg">Connecting to WhatsApp...</p>
</div>

<div class="header hidden" id="hdr">
  <div class="logo-icon">💬</div>
  <div class="logo-text">Whats<span>App</span> Sender</div>
  <span class="dot" id="dot"></span>
  <span class="status" id="slbl">Connecting...</span>
</div>

<div class="banner hidden" id="banner">
  <span class="check">✅</span>
  <span>Selected: <strong id="selName">—</strong> — now go to the terminal and type your message</span>
</div>

<div class="toolbar hidden" id="tb">
  <div class="searchbox">
    <span style="color:var(--muted)">🔍</span>
    <input id="srch" placeholder="Search contacts & groups…" oninput="render()">
  </div>
  <div class="tabs">
    <div class="tab active" id="tAll"      onclick="setTab('all')">All <span class="tcnt" id="cAll">0</span></div>
    <div class="tab"        id="tContacts" onclick="setTab('contacts')">Contacts <span class="tcnt" id="cC">0</span></div>
    <div class="tab"        id="tGroups"   onclick="setTab('groups')">Groups <span class="tcnt" id="cG">0</span></div>
  </div>
</div>

<div class="list hidden" id="list"></div>

<script>
let chats=[], sel=null, tab='all';

async function poll(){
  try{
    const d=await fetch('/data').then(r=>r.json());
    if(d.status==='ready'){
      document.getElementById('ov').classList.add('hidden');
      ['hdr','tb','list'].forEach(id=>document.getElementById(id).classList.remove('hidden'));
      document.getElementById('dot').classList.add('on');
      document.getElementById('slbl').textContent='Connected – '+
        (d.contacts.length+d.groups.length)+' chats loaded';
      if(!chats.length){
        chats=[...d.contacts,...d.groups];
        document.getElementById('cAll').textContent=chats.length;
        document.getElementById('cC').textContent=d.contacts.length;
        document.getElementById('cG').textContent=d.groups.length;
        render();
      }
    } else {
      document.getElementById('lmsg').textContent='Waiting for WhatsApp scan… (check terminal)';
    }
  }catch(e){}
  setTimeout(poll,1400);
}

function render(){
  const q=document.getElementById('srch').value.toLowerCase();
  const el=document.getElementById('list');el.innerHTML='';
  const all=chats.filter(c=>{
    if(tab==='contacts'&&c.type!=='contact')return false;
    if(tab==='groups'  &&c.type!=='group')  return false;
    return !q||c.name.toLowerCase().includes(q);
  });
  const contacts=all.filter(c=>c.type==='contact');
  const groups  =all.filter(c=>c.type==='group');
  function sec(label,arr){
    if(!arr.length)return;
    const s=document.createElement('div');s.className='sec';s.textContent=label;el.appendChild(s);
    arr.forEach(c=>{
      const d=document.createElement('div');
      d.className='ci'+(sel&&sel.id===c.id?' sel':'');
      d.innerHTML=`<div class="av ${c.type}">${c.name[0].toUpperCase()}</div>
        <div style="min-width:0"><div class="cn">${c.name}</div>
        <div class="ct">${c.type==='group'?'👥 Group':'👤 Contact'}</div></div>`;
      d.onclick=()=>pick(c);
      el.appendChild(d);
    });
  }
  if(tab==='all'){sec('CONTACTS',contacts);sec('GROUPS',groups);}
  else if(tab==='contacts')sec('CONTACTS',contacts);
  else sec('GROUPS',groups);
}

function setTab(t){
  tab=t;
  ['all','contacts','groups'].forEach(x=>{
    const id='t'+x.charAt(0).toUpperCase()+x.slice(1);
    document.getElementById(id).classList.toggle('active',x===t);
  });
  render();
}

async function pick(c){
  sel=c; render();
  document.getElementById('selName').textContent=c.name;
  document.getElementById('banner').classList.remove('hidden');
  // tell Python which contact was selected
  await fetch('/select',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(c)});
}

document.getElementById('srch').addEventListener('input',render);
poll();
</script>
</body>
</html>"""

# ── HTTP handler ────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send_json(self, code, body_bytes):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body_bytes)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body_bytes)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p in ('/', '/index.html'):
            body = HTML_UI.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif p == '/data':
            if os.path.exists(DATA_FILE):
                body = open(DATA_FILE, 'rb').read()
            else:
                body = b'{"status":"waiting"}'
            self.send_json(200, body)
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(n)
        if self.path == '/select':
            data = json.loads(raw)
            with open(SEL_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f)
            self.send_json(200, b'{"ok":true}')
        else:
            self.send_response(404); self.end_headers()

# ── helpers ─────────────────────────────────────────────────────────────────────
def find_exe(name):
    cands = [name+'.cmd', name+'.ps1', name] if sys.platform=='win32' else [name]
    for c in cands:
        f = shutil.which(c)
        if f: return f
    if sys.platform == 'win32':
        for d in [r'C:\Program Files\nodejs', r'C:\Program Files (x86)\nodejs',
                  os.path.expandvars(r'%APPDATA%\npm')]:
            for c in cands:
                fp = os.path.join(d, c)
                if os.path.isfile(fp): return fp
    return None

def get_node_npm():
    node = find_exe('node'); npm = find_exe('npm')
    if not node: print('[ERROR] Node.js not found. Install from https://nodejs.org'); sys.exit(1)
    if not npm:  print('[ERROR] npm not found. Restart terminal after Node.js install.'); sys.exit(1)
    ver = subprocess.run([node,'--version'], capture_output=True, text=True).stdout.strip()
    print(f'[OK] Node.js {ver}')
    return node, npm

def install_deps(npm):
    os.makedirs(NODE_DIR, exist_ok=True)
    if not os.path.exists(PKG_JSON):
        with open(PKG_JSON,'w') as f:
            json.dump({'name':'wa-bridge','version':'1.0.0','private':True,
                       'dependencies':{'whatsapp-web.js':'^1.23.0','qrcode-terminal':'^0.12.0'}},f,indent=2)
    with open(NODE_SCRIPT,'w',encoding='utf-8') as f:
        f.write(NODE_JS_CODE)
    if not os.path.exists(os.path.join(NODE_DIR,'node_modules')):
        print('[...] Installing packages (one-time ~1-2 min)...')
        subprocess.run([npm,'install'], cwd=NODE_DIR, shell=(sys.platform=='win32'), check=True)
        print('[OK] Packages installed.')

# ── terminal messaging loop ──────────────────────────────────────────────────────
def terminal_loop():
    """Runs in a thread. Waits for UI selection, then loops for messages."""
    print('\n' + '─'*50)
    print('  STEP 1 → Browser UI is open')
    print('  STEP 2 → Click a contact or group in the browser')
    print('  STEP 3 → Come back here and type your message')
    print('  Type  exit  at any time to quit')
    print('─'*50 + '\n')

    current = None

    while True:
        # wait for a selection from the UI
        if os.path.exists(SEL_FILE):
            try:
                sel = json.loads(open(SEL_FILE, 'r', encoding='utf-8').read())
                if current is None or current.get('id') != sel.get('id'):
                    current = sel
                    typ = '👥 Group' if sel['type'] == 'group' else '👤 Contact'
                    print(f'\n  ✅ Selected: {sel["name"]}  ({typ})')
                    print(f'  Type your message and press Enter  (or type exit)\n')
            except Exception:
                pass

        if current is None:
            time.sleep(0.8)
            continue

        # prompt for message
        try:
            msg = input('  Message > ').strip()
        except (EOFError, KeyboardInterrupt):
            print('\n[EXIT] Goodbye!')
            os._exit(0)

        if msg.lower() == 'exit':
            print('\n[EXIT] Goodbye!')
            os._exit(0)

        if not msg:
            continue

        # check if user changed selection while typing (re-read sel file)
        if os.path.exists(SEL_FILE):
            try:
                sel2 = json.loads(open(SEL_FILE, 'r', encoding='utf-8').read())
                if sel2.get('id') != current.get('id'):
                    current = sel2
                    print(f'\n  ✅ Target changed to: {sel2["name"]}')
            except Exception:
                pass

        # write command for Node
        cmd = {'id': current['id'], 'name': current['name'], 'message': msg, 'done': False}
        with open(CMD_FILE, 'w', encoding='utf-8') as f:
            json.dump(cmd, f)

        print(f'  → Sending to {current["name"]}...')

        # wait for Node to confirm (up to 8s)
        sent = False
        for _ in range(16):
            time.sleep(0.5)
            if os.path.exists(CMD_FILE):
                try:
                    c = json.loads(open(CMD_FILE,'r').read())
                    if c.get('done'):
                        sent = True
                        break
                except Exception:
                    pass
        if sent:
            print(f'  ✅ Sent!\n')
        else:
            print(f'  ⚠  No confirmation received (message may or may not have sent)\n')

# ── main ────────────────────────────────────────────────────────────────────────
def main():
    print('\n+------------------------------------------+')
    print('|  WhatsApp Sender  v4  (UI Pick + Terminal)|')
    print('+------------------------------------------+\n')

    for f in [DATA_FILE, CMD_FILE, SEL_FILE]:
        if os.path.exists(f): os.remove(f)

    node, npm = get_node_npm()
    install_deps(npm)

    server = HTTPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f'[OK] UI -> http://127.0.0.1:{PORT}')

    def open_browser():
        time.sleep(3)
        webbrowser.open(f'http://127.0.0.1:{PORT}')
    threading.Thread(target=open_browser, daemon=True).start()

    # start terminal loop in background thread
    threading.Thread(target=terminal_loop, daemon=True).start()

    # Node runs in foreground (blocks until killed)
    subprocess.run([node, NODE_SCRIPT], cwd=NODE_DIR)

if __name__ == '__main__':
    main()
