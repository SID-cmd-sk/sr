/**
 * SR PLATFORM — WhatsApp Bridge Service (ESM-compatible)
 * Run: node bridge.js
 * Listens on port 3001 by default
 */

import express   from 'express'
import QRCode    from 'qrcode'
import pino      from 'pino'
import fs        from 'fs'
import path      from 'path'
import http      from 'http'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Baileys loaded dynamically (ESM)
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = await import('@whiskeysockets/baileys')

// ─── Config ──────────────────────────────────────────────────
const PORT           = parseInt(process.env.WA_PORT    ?? '3001')
const AUTH_DIR       = process.env.WA_AUTH_DIR         ?? path.join(__dirname, 'wa_auth')
const ALLOWED_ORIGIN = process.env.WA_ALLOWED_ORIGIN   ?? '*'   // allow all for GitHub Pages

// ─── State ───────────────────────────────────────────────────
let sock           = null
let qrDataUrl      = null
let isConnected    = false
let phoneNumber    = null
let reconnectTimer = null

// ─── Express ─────────────────────────────────────────────────
const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ─── Routes ──────────────────────────────────────────────────

app.get('/status', (req, res) => {
  res.json({ ok: true, connected: isConnected, phone: phoneNumber, qr: qrDataUrl })
})

app.post('/connect', async (req, res) => {
  if (isConnected) return res.json({ ok: true, connected: true, phone: phoneNumber })
  try {
    await startConnection()
    let waited = 0
    while (!qrDataUrl && !isConnected && waited < 10000) {
      await sleep(500); waited += 500
    }
    res.json({ ok: true, connected: isConnected, qr: qrDataUrl })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

app.get('/qr', (req, res) => {
  if (isConnected)  return res.json({ ok: true, connected: true, qr: null })
  if (!qrDataUrl)   return res.json({ ok: false, error: 'No QR. POST /connect first.' })
  res.json({ ok: true, qr: qrDataUrl })
})

app.post('/disconnect', async (req, res) => {
  try {
    if (sock) { await sock.logout(); sock = null }
    isConnected = false; phoneNumber = null; qrDataUrl = null
    clearSessionFiles()
    res.json({ ok: true })
  } catch (err) {
    isConnected = false; sock = null
    res.json({ ok: true, warning: err.message })
  }
})

app.post('/send', async (req, res) => {
  if (!isConnected || !sock)
    return res.json({ ok: false, error: 'WhatsApp not connected. Scan QR first.' })
  const { phone, message } = req.body
  if (!phone || !message)
    return res.json({ ok: false, error: 'phone and message are required' })
  try {
    const jid = formatJid(phone)
    await sock.sendMessage(jid, { text: message })
    console.log(`[WA] Sent to ${phone}`)
    res.json({ ok: true, jid })
  } catch (err) {
    console.error('[WA] Send error:', err.message)
    res.json({ ok: false, error: err.message })
  }
})

app.post('/send-template', async (req, res) => {
  if (!isConnected || !sock)
    return res.json({ ok: false, error: 'WhatsApp not connected' })
  const { phone, template, vars = {} } = req.body
  if (!phone || !template)
    return res.json({ ok: false, error: 'phone and template required' })
  let message = template
  Object.entries(vars).forEach(([k, v]) => {
    message = message.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
  })
  try {
    await sock.sendMessage(formatJid(phone), { text: message })
    res.json({ ok: true })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// ─── Baileys ─────────────────────────────────────────────────

async function startConnection() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version }          = await fetchLatestBaileysVersion()

  console.log(`[WA] Baileys v${version.join('.')}`)

  sock = makeWASocket({
    version,
    auth:  state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal:            true,
    browser:                      ['SR Platform', 'Chrome', '120.0.0'],
    connectTimeoutMs:             60000,
    defaultQueryTimeoutMs:        30000,
    keepAliveIntervalMs:          10000,
    generateHighQualityLinkPreview: false,
    syncFullHistory:              false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('[WA] QR received — scan with WhatsApp on your phone')
      try { qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 }) }
      catch { qrDataUrl = null }
    }

    if (connection === 'open') {
      console.log('[WA] ✓ Connected!')
      isConnected = true; qrDataUrl = null
      if (sock.user?.id) {
        phoneNumber = sock.user.id.split(':')[0].replace('@s.whatsapp.net', '')
        if (!phoneNumber.startsWith('+')) phoneNumber = '+' + phoneNumber
      }
    }

    if (connection === 'close') {
      isConnected = false; qrDataUrl = null; phoneNumber = null
      const reason = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = reason !== DisconnectReason.loggedOut
      console.log(`[WA] Closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`)
      if (shouldReconnect) {
        clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => startConnection(), 5000)
      } else {
        clearSessionFiles(); sock = null
      }
    }
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    messages.forEach(m => {
      if (!m.key.fromMe) {
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
        if (text) console.log(`[WA] Incoming from ${m.key.remoteJid}: ${text.slice(0, 80)}`)
      }
    })
  })
}

function formatJid(phone) {
  return `${phone.replace(/[^\d]/g, '')}@s.whatsapp.net`
}

function clearSessionFiles() {
  try {
    if (fs.existsSync(AUTH_DIR))
      fs.readdirSync(AUTH_DIR).forEach(f => fs.unlinkSync(path.join(AUTH_DIR, f)))
  } catch (e) {
    console.warn('[WA] Could not clear session:', e.message)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Start ───────────────────────────────────────────────────

const server = http.createServer(app)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[WA Bridge] Running on port ${PORT}`)
  console.log(`[WA Bridge] Auth dir: ${AUTH_DIR}\n`)

  if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
    console.log('[WA Bridge] Found saved session — reconnecting…')
    startConnection().catch(e => console.error('[WA] Auto-connect failed:', e.message))
  }
})

server.on('error', err => { console.error('[WA Bridge] Error:', err.message); process.exit(1) })
process.on('SIGTERM', () => { server.close(() => process.exit(0)) })
process.on('SIGINT',  () => { server.close(() => process.exit(0)) })
