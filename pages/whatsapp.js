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
    let waConnecting = false
    let pollInterval = null
    let groupList = []
    let savedGroupId = null
    let savedGroupName = ''

    async function loadSavedGroup() {
      try {
        const { data } = await sb.from('settings').select('value').eq('key', 'whatsapp').single()
        if (data?.value?.eod_group_id) {
          savedGroupId = data.value.eod_group_id
          savedGroupName = data.value.eod_group_name || savedGroupId
        }
      } catch {}
    }

    async function fetchGroups() {
      if (!CFG.waBridgeUrl || isLocalBridge(CFG.waBridgeUrl)) return
      try {
        const r = await fetch(`${CFG.waBridgeUrl}/groups`, { signal: AbortSignal.timeout(8000) })
        const d = await r.json()
        if (d.ok && Array.isArray(d.groups)) groupList = d.groups
      } catch {}
    }

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
      if (waStatus.connected) {
        await loadSavedGroup()
        await fetchGroups()
      }
      renderWA()
    }

    function renderWA() {
      const conn = waStatus.connected
      const connecting = waStatus.connecting
      const waContent = document.getElementById('wa-content')
      if (!waContent) return

      const groupOpts = groupList.map(g =>
        `<option value="${escHtml(g.id)}" ${g.id === savedGroupId ? 'selected' : ''}>${escHtml(g.name)} ${g.members ? '(' + g.members + ')' : ''}</option>`
      ).join('')

      const label = conn ? 'Connected' : connecting ? 'Connecting…' : 'Disconnected'
      const color = conn ? 'var(--green)' : connecting ? 'var(--yellow)' : 'var(--text-3)'
      const shadow = conn ? '0 0 8px var(--green)' : connecting ? '0 0 8px var(--yellow)' : 'none'

      waContent.innerHTML = `
        <div class="flex items-center gap-3 mb-5">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};box-shadow:${shadow};flex-shrink:0"></div>
          <div>
            <div style="font-weight:700;font-size:.95rem">${label}</div>
            ${conn && waStatus.phone ? `<div style="font-size:.73rem;color:var(--text-2)">${escHtml(waStatus.phone)}</div>` : ''}
          </div>
          <button class="btn ${conn ? 'btn-danger' : 'btn-primary'} btn-sm ml-auto" onclick="${conn ? `window.waDisconnect()` : `window.waConnect()`}" ${!conn && (waConnecting || connecting) ? 'disabled' : ''}>
            ${!conn && (waConnecting || connecting) ? '<span class="btn-spinner"></span> Connecting…' : conn ? 'Disconnect' : 'Connect / Get QR'}
          </button>
        </div>
        ${waStatus.qr ? `<div style="text-align:center;padding:24px;background:var(--bg-elevated);border-radius:var(--r-lg);border:1px solid var(--border)">
          <p style="color:var(--text-2);font-size:.83rem;margin-bottom:16px">Scan this QR with WhatsApp on your phone</p>
          <img src="${escHtml(waStatus.qr)}" style="max-width:240px;border-radius:var(--r);border:3px solid white"/>
        </div>` : ''}
        ${conn ? `
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
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
        </div>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
          <div class="section-title mb-4">EOD Report Group</div>
          <p style="font-size:.8rem;color:var(--text-2);margin-bottom:12px">Select a WhatsApp group where daily EOD reports will be sent.</p>
          <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
            <div class="form-group">
              <label class="form-label">Group</label>
              <select class="form-select" id="wa-eod-group" onchange="window.waSaveGroup()">
                <option value="">— Select a group —</option>
                ${groupOpts}
              </select>
              ${groupList.length === 0 ? '<p style="font-size:.75rem;color:var(--text-3);margin-top:4px">No groups found. Make sure the WhatsApp number is added to at least one group.</p>' : ''}
            </div>
            ${savedGroupId ? `<div style="font-size:.78rem;color:var(--green)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>
              EOD will be sent to: <strong>${escHtml(savedGroupName)}</strong>
            </div>` : '<div style="font-size:.78rem;color:var(--text-3)">No group selected — EOD report will not be sent.</div>'}
          </div>
        </div>
        ` : `<div class="card" style="margin-top:14px;padding:24px;text-align:center;border:1px dashed var(--border)">
          <div style="font-size:2rem;margin-bottom:8px;opacity:.3">⚡</div>
          <div style="font-weight:600;font-size:.9rem;margin-bottom:4px">Local Server Not Running</div>
          <div style="font-size:.78rem;color:var(--text-2);margin-bottom:14px;line-height:1.5">
            The SR server handles WhatsApp messaging and email relay.<br/>
            Download and run it once — it will auto-start with Windows.
          </div>
          ${CFG.serverDownloadUrl ? `<a href="${escHtml(CFG.serverDownloadUrl)}" target="_blank" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Server
          </a>` : `<div style="font-size:.75rem;color:var(--text-3)">Download link not configured. Set SERVER_DOWNLOAD_URL in config.js</div>`}
          <div style="font-size:.68rem;color:var(--text-3);margin-top:10px">60 MB · Standalone · No install needed</div>
        </div>`}`
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">WhatsApp</div>
          <div class="page-subtitle">QR session for SR notifications, EOD reports, and direct messaging</div>
        </div>
      </div>
      <div class="card" style="max-width:640px" id="wa-content">
        <div style="color:var(--text-3);font-size:.83rem">Checking connection…</div>
      </div>`

    fetchStatus()
    if (CFG.waBridgeUrl && !isLocalBridge(CFG.waBridgeUrl)) {
      pollInterval = setInterval(fetchStatus, 4000)
      appState.update('routeCleanups', list => [...list, () => clearInterval(pollInterval)])
    }

    window.waConnect = async () => {
      if (!CFG.waBridgeUrl || isLocalBridge(CFG.waBridgeUrl) || waConnecting || waStatus.connected) return
      waConnecting = true; renderWA()
      try {
        const r = await fetch(`${CFG.waBridgeUrl}/connect`, { method: 'POST', signal: AbortSignal.timeout(8000) })
        if (!r.ok) throw new Error('Bridge returned ' + r.status)
      } catch { /* bridge will reconnect on its own */ }
      setTimeout(() => { waConnecting = false; fetchStatus() }, 2000)
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
    window.waSaveGroup = async () => {
      const sel = document.getElementById('wa-eod-group')
      if (!sel) return
      const gid = sel.value
      const gname = gid ? (groupList.find(g => g.id === gid)?.name || gid) : ''
      try {
        const { data: existing } = await sb.from('settings').select('value').eq('key', 'whatsapp').single()
        const value = { ...(existing?.value || {}), bridge_url: CFG.waBridgeUrl, eod_group_id: gid, eod_group_name: gname }
        await sb.from('settings').upsert({ key: 'whatsapp', value }, { onConflict: 'key' })
        savedGroupId = gid
        savedGroupName = gname
        window.toast(gid ? `✓ EOD group set to: ${gname}` : '✓ EOD group cleared')
      } catch (e) {
        window.toast('✗ Failed to save: ' + e.message, 'error')
      }
    }
  }
}
