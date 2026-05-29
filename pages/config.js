import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { CFG } from '../utils/config.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'
import { navigate } from '../services/router.js'
import { ROLES, ISSUE_TYPES, PRIORITIES, STATUSES, ACT_TYPES, ACT_STATUSES } from '../utils/constants.js'

const EOD_DEFAULT_TEMPLATE = `{header}\n\n{items}\n\n*Total tasks:* {total}\n*Pending:* {pending}`

const FIELDS = [
  { key: 'issue_types', label: 'Issue Types', default: ISSUE_TYPES.join('\n'), placeholder: 'One per line' },
  { key: 'activity_types', label: 'Activity Types', default: ACT_TYPES.join('\n'), placeholder: 'One per line' },
  { key: 'priorities', label: 'Priorities', default: PRIORITIES.join('\n'), placeholder: 'One per line' },
  { key: 'sr_statuses', label: 'SR Statuses', default: STATUSES.join('\n'), placeholder: 'One per line' },
  { key: 'activity_statuses', label: 'Activity Statuses', default: ACT_STATUSES.join('\n'), placeholder: 'One per line' },
  { key: 'roles', label: 'Roles', default: ROLES.join('\n'), placeholder: 'One per line' },
]

let dirtyFields = new Set()

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    if (me?.role !== 'Admin') {
      container.innerHTML = pageError('Access Denied', 'Admin access required.')
      return
    }

    container.innerHTML = skeletonPage()

    try {
      const { data: saved } = await sb.from('settings').select('value').eq('key', 'app_config').single()
      const cfg = saved?.value || {}

      container.innerHTML = `
        <div class="page-header">
          <div>
            <div class="page-title">Configuration</div>
            <div class="page-subtitle">Customize dropdown lists used across the platform</div>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary" onclick="saveConfig()" id="cfg-save-btn">Save Changes</button>
            <button class="btn btn-ghost" onclick="navigate('settings')">Back</button>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="display:flex;flex-direction:column;gap:18px">
            ${FIELDS.map(f => {
              const val = cfg[f.key] ? (Array.isArray(cfg[f.key]) ? cfg[f.key].join('\n') : cfg[f.key]) : f.default
              return `
                <div class="form-group">
                  <label class="form-label">${escHtml(f.label)}</label>
                  <textarea class="form-textarea config-field" data-key="${f.key}" rows="${Math.max(val.split('\n').length + 1, 4)}" style="font-family:var(--mono);font-size:.82rem" placeholder="${escHtml(f.placeholder)}">${escHtml(val)}</textarea>
                  <div class="form-hint">One item per line. Changes apply after save.</div>
                </div>`
            }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <div class="section-title">EOD Report Template</div>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="toggleEodInfo()" title="Placeholder reference">?</button>
          </div>
            <div id="eod-info-table" style="display:none;margin-bottom:14px;font-size:.78rem;background:var(--bg-elevated);border-radius:var(--r);padding:12px;overflow-x:auto">
              <table style="width:100%;border-collapse:collapse">
                <tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px 8px;color:var(--text-2)">Placeholder</th><th style="text-align:left;padding:4px 8px;color:var(--text-2)">Description</th><th style="text-align:left;padding:4px 8px;color:var(--text-2)">Example</th></tr>
                <tr><td style="padding:4px 8px"><code>{header}</code></td><td style="padding:4px 8px">Bold title line</td><td style="padding:4px 8px">📋 *EOD Report — 26 May 2026*</td></tr>
                <tr><td style="padding:4px 8px"><code>{items}</code></td><td style="padding:4px 8px">All items numbered (uses item formats)</td><td style="padding:4px 8px">1. SR-1013 — Title — Bug</td></tr>
                <tr><td style="padding:4px 8px"><code>{items_activities}</code></td><td style="padding:4px 8px">Only activity lines</td><td style="padding:4px 8px">1. Meeting (Call)</td></tr>
                <tr><td style="padding:4px 8px"><code>{items_srs}</code></td><td style="padding:4px 8px">Only SR lines</td><td style="padding:4px 8px">1. SR-1013 — Title — Bug</td></tr>
                <tr><td style="padding:4px 8px"><code>{summary}</code></td><td style="padding:4px 8px">Combined done/pending summary</td><td style="padding:4px 8px">*3 tasks* — 2 done, 1 pending</td></tr>
                <tr><td style="padding:4px 8px"><code>{date}</code></td><td style="padding:4px 8px">Current date</td><td style="padding:4px 8px">26 May 2026</td></tr>
                <tr><td style="padding:4px 8px"><code>{time}</code></td><td style="padding:4px 8px">Current time</td><td style="padding:4px 8px">05:30 PM</td></tr>
                <tr><td style="padding:4px 8px"><code>{weekday}</code></td><td style="padding:4px 8px">Day of week</td><td style="padding:4px 8px">Tuesday</td></tr>
                <tr><td style="padding:4px 8px"><code>{total}</code></td><td style="padding:4px 8px">Total task count</td><td style="padding:4px 8px">3</td></tr>
                <tr><td style="padding:4px 8px"><code>{done}</code></td><td style="padding:4px 8px">Completed task count</td><td style="padding:4px 8px">2</td></tr>
                <tr><td style="padding:4px 8px"><code>{pending}</code></td><td style="padding:4px 8px">Pending task count</td><td style="padding:4px 8px">1</td></tr>
                <tr><td style="padding:4px 8px"><code>{activity_count}</code></td><td style="padding:4px 8px">Number of activities</td><td style="padding:4px 8px">2</td></tr>
                <tr><td style="padding:4px 8px"><code>{sr_count}</code></td><td style="padding:4px 8px">Number of SRs</td><td style="padding:4px 8px">1</td></tr>
                <tr><td style="padding:4px 8px"><code>{activities_done}</code></td><td style="padding:4px 8px">Completed activities</td><td style="padding:4px 8px">1</td></tr>
                <tr><td style="padding:4px 8px"><code>{activities_pending}</code></td><td style="padding:4px 8px">Pending activities</td><td style="padding:4px 8px">1</td></tr>
                <tr><td style="padding:4px 8px"><code>{srs_done}</code></td><td style="padding:4px 8px">Closed SRs</td><td style="padding:4px 8px">0</td></tr>
                <tr><td style="padding:4px 8px"><code>{srs_pending}</code></td><td style="padding:4px 8px">Open SRs</td><td style="padding:4px 8px">1</td></tr>
                <tr><td style="padding:4px 8px"><code>{separator}</code></td><td style="padding:4px 8px">Horizontal divider line</td><td style="padding:4px 8px">──────────</td></tr>
                <tr style="border-top:1px solid var(--border)"><td colspan="3" style="padding:6px 8px;color:var(--accent-lg);font-weight:600">Per-item placeholders (for item format textareas)</td></tr>
                <tr><td style="padding:4px 8px"><code>{i}</code></td><td style="padding:4px 8px">Item number (1-based)</td><td style="padding:4px 8px">1</td></tr>
                <tr><td style="padding:4px 8px"><code>{title}</code></td><td style="padding:4px 8px">Item title</td><td style="padding:4px 8px">123test</td></tr>
                <tr><td style="padding:4px 8px"><code>{status}</code></td><td style="padding:4px 8px">Current status</td><td style="padding:4px 8px">Open / Done</td></tr>
                <tr><td style="padding:4px 8px"><code>{customer}</code></td><td style="padding:4px 8px">Account/customer name</td><td style="padding:4px 8px">Acme Corp</td></tr>
                <tr><td style="padding:4px 8px"><code>{type}</code></td><td style="padding:4px 8px">Activity subtype</td><td style="padding:4px 8px">Call / Meeting</td></tr>
                <tr><td style="padding:4px 8px"><code>{sr_num}</code></td><td style="padding:4px 8px">SR number</td><td style="padding:4px 8px">SR-2026-1013</td></tr>
                <tr><td style="padding:4px 8px"><code>{issue_type}</code></td><td style="padding:4px 8px">SR issue type</td><td style="padding:4px 8px">Bug / Feature</td></tr>
                <tr><td style="padding:4px 8px"><code>{description}</code></td><td style="padding:4px 8px">SR issue description</td><td style="padding:4px 8px">Customer reported…</td></tr>
                <tr><td style="padding:4px 8px"><code>{created_at}</code></td><td style="padding:4px 8px">Creation timestamp</td><td style="padding:4px 8px">2026-05-26T…</td></tr>
              </table>
            </div>
            <textarea class="form-textarea config-field" data-key="eod_template" rows="6" style="font-family:var(--mono);font-size:.82rem">${escHtml(cfg.eod_template || EOD_DEFAULT_TEMPLATE)}</textarea>
          </div>
        </div>
        <div class="card">
          <div class="section-title mb-4">EOD Item Formats</div>
          <div class="flex-col gap-4">
            <div class="form-group">
              <label class="form-label">Activity line format</label>
              <textarea class="form-textarea config-field" data-key="eod_item_fmt_activity" rows="2" style="font-family:var(--mono);font-size:.82rem">${escHtml(cfg.eod_item_fmt_activity || '{i}. {title} ({type})')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">SR line format</label>
              <textarea class="form-textarea config-field" data-key="eod_item_fmt_sr" rows="2" style="font-family:var(--mono);font-size:.82rem">${escHtml(cfg.eod_item_fmt_sr || '{i}. {sr_num} — {title} — {issue_type}')}</textarea>
            </div>
          </div>
        </div>`

      document.querySelectorAll('.config-field').forEach(el => {
        el.addEventListener('input', () => { dirtyFields.add(el.dataset.key) })
      })
    } catch (e) {
      container.innerHTML = pageError('Could not load config', e.message, true, 'config')
    }
  }
}

window.toggleEodInfo = () => {
  const el = document.getElementById('eod-info-table')
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'
}

window.saveConfig = async () => {
  const btn = document.getElementById('cfg-save-btn')
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Saving…'

  try {
    const sb = getSupabase()
    const value = {}
    FIELDS.forEach(f => {
      const el = document.querySelector(`.config-field[data-key="${f.key}"]`)
      if (el) {
        const lines = el.value.split('\n').map(s => s.trim()).filter(Boolean)
        value[f.key] = lines
      }
    })
    const tmpl = document.querySelector(`.config-field[data-key="eod_template"]`)
    if (tmpl) value.eod_template = tmpl.value
    ;['eod_item_fmt_activity', 'eod_item_fmt_sr'].forEach(k => {
      const el = document.querySelector(`.config-field[data-key="${k}"]`)
      if (el) value[k] = el.value
    })
    await sb.from('settings').upsert({ key: 'app_config', value }, { onConflict: 'key' })
    dirtyFields.clear()
    btn.innerHTML = '✓ Saved'
    btn.className = 'btn btn-success'
    window.toast('✓ Configuration saved')
    setTimeout(() => { btn.disabled = false; btn.innerHTML = 'Save Changes'; btn.className = 'btn btn-primary' }, 2000)
  } catch (e) {
    btn.disabled = false
    btn.innerHTML = 'Save Changes'
    window.toast('✗ ' + e.message, 'error')
  }
}
