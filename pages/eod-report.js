import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { CFG } from '../utils/config.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'
import { navigate } from '../services/router.js'

function fmtDate(d) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function todayRange() {
  const s = new Date(); s.setHours(0, 0, 0, 0)
  const e = new Date(); e.setHours(23, 59, 59, 999)
  return { start: s.toISOString(), end: e.toISOString() }
}

function buildReport(items) {
  const lines = [`📋 *EOD Report — ${fmtDate(new Date())}*`, '']
  let idx = 1
  let pending = 0

  items.forEach(item => {
    if (item.type === 'activity') {
      lines.push(`${idx}. ${item.title} — ${item.subtype || ''} ${item.account ? '— ' + item.account : ''}`)
      if (item.status !== 'Done') pending++
    } else {
      lines.push(`${idx}. ${item.sr_num} — ${item.title} — ${item.issue_type || ''} ${item.account ? '— ' + item.account : ''}`)
      if (item.status !== 'Closed') pending++
    }
    idx++
  })

  lines.push('')
  lines.push(`*Total tasks:* ${items.length}`)
  lines.push(`*Pending:* ${pending}`)
  return lines.join('\n')
}

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    if (!me) { container.innerHTML = pageError('Not logged in', 'Please login first.'); return }

    container.innerHTML = skeletonPage()

    try {
      const range = todayRange()

      const [{ data: acts }, { data: srs }] = await Promise.all([
        sb.from('activities').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
        sb.from('sr').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
      ])

      const items = []
      ;(acts || []).forEach(a => {
        items.push({ type: 'activity', title: a.title || '', subtype: a.type || '', account: a.contact_name || a.account || '', status: a.status || 'Open', raw: a })
      })
      ;(srs || []).forEach(s => {
        items.push({ type: 'sr', title: s.title || '', sr_num: s.sr_number || '', issue_type: s.issue_type || '', account: s.customer_name || s.account || '', status: s.status || 'Open', raw: s })
      })
      items.sort((a, b) => new Date(a.raw.created_at) - new Date(b.raw.created_at))

      const report = buildReport(items)
      const totalWA = 0

      container.innerHTML = `
        <div class="page-header">
          <div>
            <div class="page-title">EOD Report</div>
            <div class="page-subtitle">${fmtDate(new Date())} · ${items.length} tasks today</div>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary" id="eod-send-btn" onclick="sendEODReport()" ${items.length === 0 ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Send to All
            </button>
            <button class="btn btn-ghost" onclick="navigate('reports')">Back</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Preview</div>
          </div>
          <div class="card-body">
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:.85rem;line-height:1.7;margin:0;color:var(--text-1)">${escHtml(report)}</pre>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
          <div class="card-header">
            <div class="card-title">Recipients</div>
          </div>
          <div class="card-body" id="eod-recipients">
            <p class="text-2" style="font-size:.85rem">Loading team members with phone numbers...</p>
          </div>
        </div>`

      const { data: users } = await sb.from('users').select('name,email,phone,role').not('phone', 'is', null).neq('phone', '').order('name')
      const rcpt = document.getElementById('eod-recipients')
      if (!users || users.length === 0) {
        rcpt.innerHTML = '<p class="text-2" style="font-size:.85rem">No team members have registered phone numbers.</p>'
      } else {
        rcpt.innerHTML = `<p style="font-size:.85rem;margin-bottom:8px;color:var(--text-2)">${users.length} team member(s) will receive this report</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${users.map(u => `<span style="font-size:.78rem;padding:4px 10px;background:var(--bg-subtle);border-radius:20px;border:1px solid var(--border)">${escHtml(u.name || u.email)} ${u.phone ? '<span style="color:var(--text-3)">· ' + escHtml(u.phone) + '</span>' : ''}</span>`).join('')}
          </div>`
      }
    } catch (e) {
      container.innerHTML = pageError('Could not load EOD data', e.message, true, 'eod-report')
    }
  }
}

window.sendEODReport = async () => {
  const btn = document.getElementById('eod-send-btn')
  if (!btn || btn.disabled) return
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Sending…'

  try {
    const sb = getSupabase()
    const range = todayRange()

    const [{ data: acts }, { data: srs }] = await Promise.all([
      sb.from('activities').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
      sb.from('sr').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
    ])

    const items = []
    ;(acts || []).forEach(a => items.push({ type: 'activity', title: a.title || '', subtype: a.type || '', account: a.contact_name || a.account || '', status: a.status || 'Open', raw: a }))
    ;(srs || []).forEach(s => items.push({ type: 'sr', title: s.title || '', sr_num: s.sr_number || '', issue_type: s.issue_type || '', account: s.customer_name || s.account || '', status: s.status || 'Open', raw: s }))
    items.sort((a, b) => new Date(a.raw.created_at) - new Date(b.raw.created_at))
    const report = buildReport(items)

    if (!CFG.waBridgeUrl) throw new Error('WhatsApp bridge URL not configured')

    const { data: users } = await sb.from('users').select('name,email,phone').not('phone', 'is', null).neq('phone', '').order('name')
    if (!users || users.length === 0) throw new Error('No recipients with phone numbers found')

    let sent = 0, failed = 0
    for (const u of users) {
      try {
        const r = await fetch(`${CFG.waBridgeUrl}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: u.phone, message: report }),
          signal: AbortSignal.timeout(15000),
        })
        const d = await r.json()
        if (d.ok) sent++; else failed++
      } catch { failed++ }
    }

    btn.innerHTML = `Sent to ${sent} · ${failed} failed`
    if (failed === 0) {
      btn.className = 'btn btn-success'
      window.toast(`✓ EOD report sent to ${sent} team member(s)`)
    } else {
      window.toast(`Sent to ${sent}, ${failed} failed`, 'error')
    }
    setTimeout(() => { btn.disabled = false; btn.innerHTML = 'Send to All'; btn.className = 'btn btn-primary' }, 3000)
  } catch (e) {
    btn.disabled = false
    btn.innerHTML = 'Send to All'
    window.toast('✗ ' + e.message, 'error')
  }
}
