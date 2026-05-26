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
                  <p style="font-size:.72rem;color:var(--text-3);margin-top:3px">One item per line. Changes apply after save.</p>
                </div>`
            }).join('')}
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="card-header">
            <div class="card-title">EOD Report Template</div>
          </div>
          <div class="card-body">
            <p style="font-size:.8rem;color:var(--text-2);margin-bottom:8px">
              Placeholders:
              <code>{header}</code> <code>{items}</code> <code>{items_activities}</code> <code>{items_srs}</code>
              <code>{summary}</code> <code>{date}</code> <code>{time}</code> <code>{weekday}</code>
              <code>{total}</code> <code>{done}</code> <code>{pending}</code>
              <code>{activity_count}</code> <code>{sr_count}</code>
              <code>{activities_done}</code> <code>{activities_pending}</code>
              <code>{srs_done}</code> <code>{srs_pending}</code>
              <code>{separator}</code>
            </p>
            <textarea class="form-textarea config-field" data-key="eod_template" rows="6" style="font-family:var(--mono);font-size:.82rem">${escHtml(cfg.eod_template || EOD_DEFAULT_TEMPLATE)}</textarea>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="card-header">
            <div class="card-title">EOD Item Formats</div>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
            <p style="font-size:.8rem;color:var(--text-2);margin-bottom:4px">
              Per-item placeholders:
              <code>{i}</code> <code>{title}</code> <code>{status}</code> <code>{customer}</code>
              <code>{type}</code> (activity) <code>{sr_num}</code> <code>{issue_type}</code> <code>{description}</code> (SR)
            </p>
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
