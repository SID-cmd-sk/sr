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

function buildItemLines(items) {
  let pending = 0
  const lines = items.map((item, i) => {
    if (item.type === 'activity') {
      if (item.status !== 'Done') pending++
      return `${i + 1}. ${item.title} (${item.subtype || 'Activity'})`
    }
    if (item.status !== 'Closed') pending++
    return `${i + 1}. ${item.title} — ${item.sr_num} (${item.issue_type || 'SR'})`
  })
  return { lines, pending, total: items.length, done: items.length - pending }
}

function buildReport(items, template) {
  const { lines, pending, total, done } = buildItemLines(items)
  const date = fmtDate(new Date())
  const vars = {
    header: `📋 *${date}*`,
    items:  lines.join('\n'),
    summary: `*${total} tasks* — ${done} done, ${pending} pending`,
    date,
    total: String(total),
    done: String(done),
    pending: String(pending),
  }
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    if (!me) { container.innerHTML = pageError('Not logged in', 'Please login first.'); return }

    container.innerHTML = skeletonPage()

    try {
      const range = todayRange()

      const [{ data: acts }, { data: srs }, { data: waSettings }, { data: appConfig }] = await Promise.all([
        sb.from('activities').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
        sb.from('sr').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
        sb.from('settings').select('value').eq('key', 'whatsapp').single(),
        sb.from('settings').select('value').eq('key', 'app_config').single(),
      ])

      const items = []
      ;(acts || []).forEach(a => {
        items.push({ type: 'activity', title: a.title || '', subtype: a.type || '', account: a.contact_name || a.account || '', status: a.status || 'Open', raw: a })
      })
      ;(srs || []).forEach(s => {
        items.push({ type: 'sr', title: s.title || '', sr_num: s.sr_number || '', issue_type: s.issue_type || '', account: s.customer_name || s.account || '', status: s.status || 'Open', raw: s })
      })
      items.sort((a, b) => new Date(a.raw.created_at) - new Date(b.raw.created_at))

      const defaultTemplate = `{header}\n\n{items}\n\n{summary}`
      const template = appConfig?.value?.eod_template || defaultTemplate
      const report = buildReport(items, template)
      const groupId = waSettings?.value?.eod_group_id || ''
      const groupName = waSettings?.value?.eod_group_name || ''

      container.innerHTML = `
        <div class="page-header">
          <div>
            <div class="page-title">EOD Report</div>
            <div class="page-subtitle">${fmtDate(new Date())} · ${items.length} tasks today</div>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary" id="eod-send-btn" onclick="sendEODReport()" ${items.length === 0 || !groupId ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Send to Group
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
            <div class="card-title">Delivery</div>
          </div>
          <div class="card-body" id="eod-recipients">
            ${groupId ? `<p style="font-size:.85rem;color:var(--text-2)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Sent to WhatsApp group: <strong>${escHtml(groupName)}</strong>
            </p>
            <p style="font-size:.75rem;color:var(--text-3);margin-top:4px">Change group in <a href="#" onclick="navigate('whatsapp');return false" style="color:var(--accent-lg)">WhatsApp settings</a></p>` :
            `<p style="font-size:.85rem;color:var(--orange)">⚠ No EOD group selected.</p>
            <p style="font-size:.75rem;color:var(--text-3);margin-top:4px">Go to <a href="#" onclick="navigate('whatsapp');return false" style="color:var(--accent-lg)">WhatsApp settings</a> and select a group for EOD reports.</p>`}
          </div>
        </div>`
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

    const [{ data: acts }, { data: srs }, { data: waSettings }, { data: appConfig }] = await Promise.all([
      sb.from('activities').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
      sb.from('sr').select('*').gte('created_at', range.start).lte('created_at', range.end).order('created_at'),
      sb.from('settings').select('value').eq('key', 'whatsapp').single(),
      sb.from('settings').select('value').eq('key', 'app_config').single(),
    ])

    const groupId = waSettings?.value?.eod_group_id
    if (!groupId) throw new Error('No EOD group configured. Select one in WhatsApp settings.')

    const items = []
    ;(acts || []).forEach(a => items.push({ type: 'activity', title: a.title || '', subtype: a.type || '', account: a.contact_name || a.account || '', status: a.status || 'Open', raw: a }))
    ;(srs || []).forEach(s => items.push({ type: 'sr', title: s.title || '', sr_num: s.sr_number || '', issue_type: s.issue_type || '', account: s.customer_name || s.account || '', status: s.status || 'Open', raw: s }))
    items.sort((a, b) => new Date(a.raw.created_at) - new Date(b.raw.created_at))
    const defaultTemplate = `{header}\n\n{items}\n\n{summary}`
    const template = appConfig?.value?.eod_template || defaultTemplate
    const report = buildReport(items, template)

    if (!CFG.waBridgeUrl) throw new Error('WhatsApp bridge URL not configured')

    const r = await fetch(`${CFG.waBridgeUrl}/send-group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, message: report }),
      signal: AbortSignal.timeout(20000),
    })
    const d = await r.json()

    if (d.ok) {
      btn.innerHTML = '✓ Sent'
      btn.className = 'btn btn-success'
      window.toast('✓ EOD report sent to WhatsApp group')
    } else {
      throw new Error(d.error || 'Send failed')
    }
    setTimeout(() => { btn.disabled = false; btn.innerHTML = 'Send to Group'; btn.className = 'btn btn-primary' }, 3000)
  } catch (e) {
    btn.disabled = false
    btn.innerHTML = 'Send to Group'
    window.toast('✗ ' + e.message, 'error')
  }
}
