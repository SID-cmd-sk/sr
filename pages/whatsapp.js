import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { CFG } from '../utils/config.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'

function isLocalBridge(url) {
  return false
}

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')

    let waStatus = { connected: false }
    let pollInterval = null

    async function fetchStatus() {
      if (!CFG.waBridgeUrl || isLocalBridge(CFG.waBridgeUrl)) {
        waStatus = { connected: false, error: 'Bridge unavailable from this host' }
        renderWA(); return
      }
      try {
        const r = await fetch(`${CFG.waBridgeUrl}/status`, { signal: AbortSignal.timeout(4000) })
        waStatus = await r.json()
      } catch {
        waStatus = { connected: false, error: 'Bridge offline' }
      }
      renderWA()
    }

    function renderWA() {
      const conn = waStatus.connected
      const waContent = document.getElementById('wa-content')
      if (!waContent) return
      waContent.innerHTML = `
        <div class="flex items-center gap-3 mb-5">
          <div style="width:10px;height:10px;border-radius:50%;background:${conn ? 'var(--green)' : 'var(--text-3)'};box-shadow:${conn ? '0 0 8px var(--green)' : 'none'};flex-shrink:0"></div>
          <div>
            <div style="font-weight:700;font-size:.95rem">${conn ? 'Connected' : 'Disconnected'}</div>
            ${conn && waStatus.phone ? `<div style="font-size:.73rem;color:var(--text-2)">${escHtml(waStatus.phone)}</div>` : ''}
          </div>
          <button class="btn ${conn ? 'btn-danger' : 'btn-primary'} btn-sm ml-auto" onclick="${conn ? `window.waDisconnect()` : `window.waConnect()`}">
            ${conn ? 'Disconnect' : 'Connect / Get QR'}
          </button>
        </div>
        ${waStatus.qr ? `<div style="text-align:center;padding:24px;background:var(--bg-elevated);border-radius:var(--r-lg);border:1px solid var(--border)">
          <p style="color:var(--text-2);font-size:.83rem;margin-bottom:16px">Scan this QR with WhatsApp on your phone</p>
          <img src="${escHtml(waStatus.qr)}" style="max-width:240px;border-radius:var(--r);border:3px solid white"/>
        </div>` : ''}
        ${conn ? `<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
          <div class="section-title mb-4">Send Test Message</div>
          <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
            <div class="form-group">
              <label class="form-label req">Phone (with country code)</label>
              <input class="form-input" id="wa-phone" placeholder="+91 9999999999"/>
            </div>
            <div class="form-group">
              <label class="form-label req">Message</label>
              <textarea class="form-textarea" id="wa-msg" rows="3" placeholder="Type your message…"></textarea>
            </div>
            <button class="btn btn-primary" onclick="window.waSendDirect()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send
            </button>
            <div id="wa-send-status" style="font-size:.8rem"></div>
          </div>
        </div>` : `<div class="alert alert-info" style="margin-top:14px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" stroke-linecap="round"/></svg>
          <div>Start the WhatsApp bridge service first: <code style="font-family:var(--mono);background:rgba(0,0,0,.3);padding:2px 6px;border-radius:3px">cd wa-service && node bridge.js</code></div>
        </div>`}`
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">WhatsApp</div>
          <div class="page-subtitle">QR session for SR notifications and direct messaging</div>
        </div>
      </div>
      <div class="card" style="max-width:600px" id="wa-content">
        <div style="color:var(--text-3);font-size:.83rem">Checking connection…</div>
      </div>`

    fetchStatus()
    if (CFG.waBridgeUrl && !isLocalBridge(CFG.waBridgeUrl)) {
      pollInterval = setInterval(fetchStatus, 4000)
      appState.update('routeCleanups', list => [...list, () => clearInterval(pollInterval)])
    }

    window.waConnect = async () => {
      if (!CFG.waBridgeUrl || isLocalBridge(CFG.waBridgeUrl)) return
      try { await fetch(`${CFG.waBridgeUrl}/connect`, { method: 'POST', signal: AbortSignal.timeout(5000) }) } catch {}
      setTimeout(fetchStatus, 1500)
    }
    window.waDisconnect = async () => {
      if (!CFG.waBridgeUrl || isLocalBridge(CFG.waBridgeUrl)) return
      try { await fetch(`${CFG.waBridgeUrl}/disconnect`, { method: 'POST', signal: AbortSignal.timeout(5000) }) } catch {}
      waStatus = { connected: false }; renderWA()
    }
    window.waSendDirect = async () => {
      const phone = document.getElementById('wa-phone')?.value
      const message = document.getElementById('wa-msg')?.value
      if (!phone || !message) { window.toast('Phone and message are required', 'error'); return }
      const el = document.getElementById('wa-send-status')
      if (el) { el.textContent = 'Sending…'; el.style.color = 'var(--text-3)' }
      if (!CFG.waBridgeUrl || isLocalBridge(CFG.waBridgeUrl)) {
        if (el) { el.textContent = 'Bridge unavailable'; el.style.color = 'var(--red)' }; return
      }
      try {
        const r = await fetch(`${CFG.waBridgeUrl}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message }), signal: AbortSignal.timeout(15000) })
        const d = await r.json()
        if (el) { el.textContent = d.ok ? '✓ Sent!' : '✗ ' + d.error; el.style.color = d.ok ? 'var(--green)' : 'var(--red)' }
      } catch {
        if (el) { el.textContent = '✗ Bridge offline'; el.style.color = 'var(--red)' }
      }
    }
  }
}
