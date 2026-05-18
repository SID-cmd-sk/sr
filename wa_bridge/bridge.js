/**
 * SR Manager — WhatsApp Bridge
 * IPC protocol: newline-delimited JSON on stdin/stdout
 *
 * Events emitted (stdout):
 *   {"event":"status","status":"bridge_ready"}
 *   {"event":"qr","qr":"<qr_string>"}
 *   {"event":"ready","phone":"...","name":"..."}
 *   {"event":"disconnected","reason":"..."}
 *   {"event":"logged_out"}
 *   {"event":"groups","groups":[...]}
 *   {"event":"sent","jid":"...","preview":"..."}
 *   {"event":"error","message":"...","detail":"..."}
 *   {"event":"pong"}
 *
 * Commands accepted (stdin):
 *   {"cmd":"connect"}
 *   {"cmd":"disconnect"}
 *   {"cmd":"send_message","jid":"...","text":"..."}
 *   {"cmd":"send_group","jid":"...","text":"..."}
 *   {"cmd":"get_groups"}
 *   {"cmd":"ping"}
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── pino silent logger (suppress Baileys noise) ─────────────────────────────
let pino;
try {
  pino = require('pino');
} catch (_) {
  pino = () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, child: () => pino()() });
}
const logger = pino({ level: 'silent' });

// ── IPC helpers ──────────────────────────────────────────────────────────────
function emit(obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + '\n');
  } catch (_) {}
}

function emitError(message, detail = '') {
  emit({ event: 'error', message, detail: String(detail) });
}

// ── startup: emit bridge_ready immediately ───────────────────────────────────
emit({ event: 'status', status: 'bridge_ready' });

// ── session dir ──────────────────────────────────────────────────────────────
const SESSION_DIR = path.join(__dirname, 'wa_session');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// ── Baileys state ────────────────────────────────────────────────────────────
let sock         = null;
let connecting   = false;

async function getAuthState() {
  try {
    const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
    return await useMultiFileAuthState(SESSION_DIR);
  } catch (e) {
    emitError('auth_state_failed', e.message);
    return null;
  }
}

async function connect() {
  if (connecting || (sock && sock.user)) return;
  connecting = true;

  try {
    const Baileys = require('@whiskeysockets/baileys');
    const {
      default: makeWASocket,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = Baileys;

    const authResult = await getAuthState();
    if (!authResult) { connecting = false; return; }
    const { state, saveCreds } = authResult;

    let versionInfo;
    try {
      versionInfo = await fetchLatestBaileysVersion();
    } catch (_) {
      versionInfo = { version: [2, 3000, 1015901307] };
    }

    sock = makeWASocket({
      version:        versionInfo.version,
      auth:           state,
      logger:         logger.child({}),
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        emit({ event: 'qr', qr });
      }
      if (connection === 'open') {
        connecting = false;
        const phone = sock.user?.id?.split(':')[0] || '';
        const name  = sock.user?.name  || sock.user?.verifiedName || '';
        emit({ event: 'ready', phone, name });
      }
      if (connection === 'close') {
        connecting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        if (loggedOut) {
          emit({ event: 'logged_out' });
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
        } else {
          emit({ event: 'disconnected', reason: String(lastDisconnect?.error?.message || 'unknown') });
        }
        sock = null;
      }
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
      // incoming messages — not forwarded in this version
    });

  } catch (e) {
    connecting = false;
    emitError('connect_failed', e.message);
  }
}

function disconnect() {
  if (sock) {
    try { sock.logout(); } catch (_) {}
    sock = null;
  }
  emit({ event: 'disconnected', reason: 'user_request' });
}

async function sendMessage(jid, text) {
  if (!sock || !sock.user) { emitError('not_connected', 'Cannot send — not connected'); return; }
  try {
    await sock.sendMessage(jid, { text });
    emit({ event: 'sent', jid, preview: text.slice(0, 60) });
  } catch (e) {
    emitError('send_failed', e.message);
  }
}

async function getGroups() {
  if (!sock || !sock.user) { emitError('not_connected', 'Cannot fetch groups — not connected'); return; }
  try {
    const raw = await sock.groupFetchAllParticipating();
    const groups = Object.entries(raw).map(([jid, g]) => ({
      jid,
      name: g.subject || jid,
      participants: (g.participants || []).length,
    }));
    emit({ event: 'groups', groups });
  } catch (e) {
    emitError('groups_failed', e.message);
  }
}

// ── stdin command reader ─────────────────────────────────────────────────────
let _buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  _buf += chunk;
  let nl;
  while ((nl = _buf.indexOf('\n')) !== -1) {
    const line = _buf.slice(0, nl).trim();
    _buf = _buf.slice(nl + 1);
    if (!line) continue;
    let cmd;
    try { cmd = JSON.parse(line); } catch (_) { continue; }
    handleCommand(cmd);
  }
});

process.stdin.on('end', () => process.exit(0));

function handleCommand(cmd) {
  switch (cmd.cmd) {
    case 'connect':      connect();                           break;
    case 'disconnect':   disconnect();                        break;
    case 'send_message': sendMessage(cmd.jid, cmd.text);     break;
    case 'send_group':   sendMessage(cmd.jid, cmd.text);     break;
    case 'get_groups':   getGroups();                         break;
    case 'ping':         emit({ event: 'pong' });             break;
    default:             emitError('unknown_cmd', cmd.cmd);   break;
  }
}

// ── keep-alive ───────────────────────────────────────────────────────────────
process.on('SIGTERM', () => { disconnect(); process.exit(0); });
process.on('SIGINT',  () => { disconnect(); process.exit(0); });
