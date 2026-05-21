/**
 * SR PLATFORM — WhatsApp Bridge Service
 * Standalone Node.js server using Baileys
 * Run: node bridge.js
 * Listens on port 3001 by default
 */

'use strict'

const express   = require('express')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const QRCode    = require('qrcode')
const pino      = require('pino')
const fs        = require('fs')
const path      = require('path')
const http      = require('http')

// ─── Config ──────────────────────────────────────────────────
const PORT         = parseInt(process.env.WA_PORT    ?? '3001')
const AUTH_DIR     = process.env.WA_AUTH_DIR         ?? path.join(__dirname, 'wa_auth')
const ALLOWED_ORIGIN = process.env.WA_ALLOWED_ORIGIN ?? 'http://localhost:3000'

// ─── State ───────────────────────────────────────────────────
let sock          = null
let qrDataUrl     = null
let isConnected   = false
let phoneNumber   = null
let reconnectTimer = null

// ─── Express app ─────────────────────────────────────────────
const app = express()
app.use(express.json())

// CORS — only allow the Next.js app
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ─── Routes ──────────────────────────────────────────────────

/** GET /status — current session state */
app.get('/status', (req, res) => {
  res.json({ ok: true, connected: isConnected, phone: phoneNumber, qr: qrDataUrl })
})

/** POST /connect — start WhatsApp connection and generate QR */
app.post('/connect', async (req, res) => {
  if (isConnected) return res.json({ ok: true, connected: true, phone: phoneNumber })
  try {
    await startConnection()
    // Wait up to 10s for QR or connection
    let waited = 0
    while (!qrDataUrl && !isConnected && waited < 10000) {
      await sleep(500)
      waited += 500
    }
    res.json({ ok: true, connected: isConnected, qr: qrDataUrl })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

/** GET /qr — latest QR data URL */
app.get('/qr', (req, res) => {
  if (isConnected) return res.json({ ok: true, connected: true, qr: null })
  if (!qrDataUrl)  return res.json({ ok: false, error: 'No QR available. POST /connect first.' })
  res.json({ ok: true, qr: qrDataUrl })
})

/** POST /disconnect — log out and clear session */
app.post('/disconnect', async (req, res) => {
  try {
    if (sock) {
      await sock.logout()
      sock = null
    }
    isConnected  = false
    phoneNumber  = null
    qrDataUrl    = null
    clearSessionFiles()
    res.json({ ok: true })
  } catch (err) {
    isConnected = false
    sock = null
    res.json({ ok: true, warning: err.message })
  }
})

/** POST /send — send a WhatsApp message
 *  Body: { phone: "+919999999999", message: "Hello" }
 */
app.post('/send', async (req, res) => {
  if (!isConnected || !sock) {
    return res.json({ ok: false, error: 'WhatsApp is not connected. Scan QR first.' })
  }
  const { phone, message } = req.body
  if (!phone || !message) {
    return res.json({ ok: false, error: 'phone and message are required' })
  }
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

/** POST /send-template — send with placeholder replacement
 *  Body: { phone, template: "Hello {{name}}", vars: { name: "John" } }
 */
app.post('/send-template', async (req, res) => {
  if (!isConnected || !sock) {
    return res.json({ ok: false, error: 'WhatsApp not connected' })
  }
  const { phone, template, vars = {} } = req.body
  if (!phone || !template) return res.json({ ok: false, error: 'phone and template required' })

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

// ─── Baileys connection logic ─────────────────────────────────

async function startConnection() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  console.log(`[WA] Using Baileys v${version.join('.')}`)

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    browser: ['SR Platform', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 30000,
    keepAliveIntervalMs: 10000,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    // New QR generated
    if (qr) {
      console.log('[WA] QR received — waiting for scan…')
      try {
        qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
      } catch (e) {
        qrDataUrl = null
      }
    }

    if (connection === 'open') {
      console.log('[WA] ✓ Connected!')
      isConnected = true
      qrDataUrl   = null
      // Extract phone number from JID
      if (sock.user?.id) {
        phoneNumber = sock.user.id.split(':')[0].replace('@s.whatsapp.net','')
        if (!phoneNumber.startsWith('+')) phoneNumber = '+' + phoneNumber
      }
    }

    if (connection === 'close') {
      isConnected = false
      qrDataUrl   = null
      phoneNumber = null

      const reason = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = reason !== DisconnectReason.loggedOut
      console.log(`[WA] Connection closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`)

      if (shouldReconnect) {
        // Reconnect after 5s
        clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => startConnection(), 5000)
      } else {
        // Logged out — clear session
        clearSessionFiles()
        sock = null
      }
    }
  })

  // Message received handler (for logging / future use)
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    messages.forEach(m => {
      if (!m.key.fromMe) {
        const from = m.key.remoteJid
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
        if (text) console.log(`[WA] Incoming from ${from}: ${text.slice(0,80)}`)
      }
    })
  })
}

function formatJid(phone) {
  // Normalize: remove spaces/dashes, ensure no leading +
  const digits = phone.replace(/[^\d]/g, '')
  return `${digits}@s.whatsapp.net`
}

function clearSessionFiles() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.readdirSync(AUTH_DIR).forEach(f => {
        fs.unlinkSync(path.join(AUTH_DIR, f))
      })
    }
  } catch (e) {
    console.warn('[WA] Could not clear session files:', e.message)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Start server ─────────────────────────────────────────────

const server = http.createServer(app)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[WA Bridge] Server running on port ${PORT}`)
  console.log(`[WA Bridge] Allowed origin: ${ALLOWED_ORIGIN}`)
  console.log(`[WA Bridge] Auth dir: ${AUTH_DIR}\n`)

  // Auto-connect if credentials already exist
  if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
    console.log('[WA Bridge] Found saved session — reconnecting…')
    startConnection().catch(e => console.error('[WA] Auto-connect failed:', e.message))
  }
})

server.on('error', (err) => {
  console.error('[WA Bridge] Server error:', err.message)
  process.exit(1)
})

process.on('SIGTERM', () => { console.log('[WA Bridge] Shutting down…'); server.close(() => process.exit(0)) })
process.on('SIGINT',  () => { console.log('[WA Bridge] Shutting down…'); server.close(() => process.exit(0)) })
