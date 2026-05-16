/**
 * SR Manager Enterprise - WhatsApp Bridge (Phase 2)
 * Uses @whiskeysockets/baileys — no browser, pure WebSocket
 * 
 * Protocol: JSON lines over stdin/stdout
 *   Python → Node: { "cmd": "...", ...args }
 *   Node → Python: { "event": "...", ...data }
 * 
 * Commands:  connect, disconnect, send_message, send_group, get_groups, status
 * Events:    qr, ready, message, disconnected, error, groups, status
 */

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidDecode,
    proto,
    getContentType,
} = require('@whiskeysockets/baileys');

const path  = require('path');
const fs    = require('fs');
const pino  = require('pino');

// ── CONFIG ──────────────────────────────────────────────────────────────────
const AUTH_DIR   = path.join(__dirname, 'wa_session');
const logger     = pino({ level: 'silent' });   // suppress baileys logs to stderr

// ── STATE ────────────────────────────────────────────────────────────────────
let sock         = null;
let isConnected  = false;
let groups       = {};   // jid -> name cache

// ── STDOUT PROTOCOL ──────────────────────────────────────────────────────────
function send(event, data = {}) {
    const line = JSON.stringify({ event, ...data });
    process.stdout.write(line + '\n');
}

function sendError(msg, detail = '') {
    send('error', { message: msg, detail });
}

// ── CONNECT ──────────────────────────────────────────────────────────────────
async function connect() {
    try {
        if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version }          = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger,
            auth: state,
            printQRInTerminal: false,
            browser: ['SR Manager', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
        });

        // ── QR CODE ──────────────────────────────────────────────────────────
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                send('qr', { qr });   // Python will render this as a QR image
            }

            if (connection === 'open') {
                isConnected = true;
                const user  = sock.user;
                send('ready', {
                    phone: user?.id?.split(':')[0] || '',
                    name:  user?.name || '',
                });
                await refreshGroups();
            }

            if (connection === 'close') {
                isConnected = false;
                const code  = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[code] || 'unknown';

                send('disconnected', { reason, code: code || 0 });

                // Reconnect unless logged out
                if (code !== DisconnectReason.loggedOut) {
                    setTimeout(connect, 3000);
                } else {
                    // Wipe session so next connect shows QR
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    send('logged_out', {});
                }
            }
        });

        // ── SAVE CREDS ───────────────────────────────────────────────────────
        sock.ev.on('creds.update', saveCreds);

        // ── INCOMING MESSAGES (forward to Python) ────────────────────────────
        sock.ev.on('messages.upsert', ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                if (!msg.message) continue;
                const contentType = getContentType(msg.message);
                const body =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    '';
                send('message', {
                    from:   msg.key.remoteJid,
                    fromMe: msg.key.fromMe,
                    body,
                    type:   contentType,
                    id:     msg.key.id,
                });
            }
        });

        // ── GROUP UPDATES ────────────────────────────────────────────────────
        sock.ev.on('groups.update', async () => { await refreshGroups(); });
        sock.ev.on('group-participants.update', async () => { await refreshGroups(); });

    } catch (err) {
        sendError('Connection failed', err.message);
    }
}

// ── GET GROUPS ───────────────────────────────────────────────────────────────
async function refreshGroups() {
    try {
        const all = await sock.groupFetchAllParticipating();
        groups    = {};
        const list = [];
        for (const [jid, meta] of Object.entries(all)) {
            groups[jid] = meta.subject;
            list.push({ jid, name: meta.subject, participants: meta.participants?.length || 0 });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        send('groups', { groups: list });
    } catch (err) {
        sendError('Failed to fetch groups', err.message);
    }
}

// ── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function sendMessage(jid, text) {
    if (!isConnected || !sock) {
        sendError('Not connected');
        return;
    }
    try {
        await sock.sendMessage(jid, { text });
        send('sent', { jid, preview: text.slice(0, 60) });
    } catch (err) {
        sendError('Send failed', err.message);
    }
}

// ── DISCONNECT ───────────────────────────────────────────────────────────────
async function disconnect() {
    if (sock) {
        await sock.logout().catch(() => {});
        sock        = null;
        isConnected = false;
    }
    send('disconnected', { reason: 'manual', code: 0 });
}

// ── STDIN COMMAND LOOP ────────────────────────────────────────────────────────
process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();   // keep incomplete line in buffer
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const cmd = JSON.parse(trimmed);
            handleCommand(cmd);
        } catch (e) {
            sendError('Invalid JSON command', trimmed.slice(0, 80));
        }
    }
});

process.stdin.on('end', () => process.exit(0));

async function handleCommand(cmd) {
    switch (cmd.cmd) {
        case 'connect':
            send('status', { status: 'connecting' });
            await connect();
            break;

        case 'disconnect':
            await disconnect();
            break;

        case 'send_message':
            await sendMessage(cmd.jid, cmd.text);
            break;

        case 'send_group':
            // Convenience: send to a group by name or jid
            await sendMessage(cmd.jid, cmd.text);
            break;

        case 'get_groups':
            if (isConnected) await refreshGroups();
            else sendError('Not connected');
            break;

        case 'status':
            send('status', {
                connected: isConnected,
                phone:     sock?.user?.id?.split(':')[0] || '',
                name:      sock?.user?.name || '',
            });
            break;

        case 'logout':
            await disconnect();
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            send('logged_out', {});
            break;

        case 'ping':
            send('pong', { ts: Date.now() });
            break;

        default:
            sendError(`Unknown command: ${cmd.cmd}`);
    }
}

// ── STARTUP ───────────────────────────────────────────────────────────────────
send('status', { status: 'bridge_ready' });

// Auto-connect if session exists
if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
    handleCommand({ cmd: 'connect' });
}
