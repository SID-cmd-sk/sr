import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { navigate } from '../services/router.js'
import { skeletonPage } from '../components/skeleton.js'
import { emptyState, pageError } from '../components/stats.js'

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    container.innerHTML = skeletonPage()

    try {
      const { data: templates } = await sb.from('templates').select('*').order('name')

      container.innerHTML = `
        <div class="page-header">
          <div>
            <div class="page-title">Templates</div>
            <div class="page-subtitle">Email and WhatsApp message templates with placeholder support</div>
          </div>
          ${['Admin', 'Manager'].includes(me?.role) ? `<div class="page-header-actions">
            <button class="btn btn-primary" onclick="openNewTemplate()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              New Template
            </button>
          </div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${!templates?.length ? emptyState('No templates yet', 'Create email or WhatsApp templates for SR actions and automated steps') :
          templates.map(t => `<div class="card" style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
            <div style="flex:1;min-width:0">
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <span style="font-weight:700;font-size:.9rem">${escHtml(t.name)}</span>
                <span class="badge ${t.type === 'email' ? 'badge-open' : 'badge-in-progress'}">${t.type}</span>
                <span class="badge ${t.is_active ? 'badge-in-progress' : 'badge-closed'}">${t.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              ${t.subject ? `<div style="font-size:.78rem;color:var(--text-2);margin-bottom:4px">Subject: ${escHtml(t.subject)}</div>` : ''}
              <div style="font-size:.78rem;color:var(--text-3);white-space:pre-wrap;max-height:72px;overflow:hidden;line-height:1.5">${escHtml((t.body ?? '').slice(0, 200))}${(t.body?.length ?? 0) > 200 ? '…' : ''}</div>
            </div>
            ${['Admin', 'Manager'].includes(me?.role) ? `<div class="flex gap-2 flex-shrink-0">
              <button class="btn btn-secondary btn-sm" onclick="openEditTemplate(${JSON.stringify(t).replace(/"/g, '&quot;')})">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="toggleTemplate('${t.id}',${t.is_active})">${t.is_active ? 'Disable' : 'Enable'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${t.id}')">Delete</button>
            </div>` : ''}
          </div>`).join('')}
        </div>
        <div class="card" style="margin-top:16px">
          <div class="label-xs mb-2">Available Placeholders</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${['sr_number', 'customer_name', 'owner_name', 'issue_type', 'status', 'priority', 'account', 'resolution', 'company_name', 'route_name'].map(p => `<span class="placeholder-tag" style="cursor:default">{{${p}}}</span>`).join('')}
          </div>
        </div>`
    } catch (e) {
      container.innerHTML = pageError('Could not load templates', e.message, true, 'templates')
    }
  }
}

window.openNewTemplate = (tpl) => {
  window.modal(`
    <div class="modal-header">
      <div class="modal-title">${tpl ? 'Edit Template' : 'New Template'}</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label req">Name</label>
          <input class="form-input" id="nt-name" value="${tpl ? escHtml(tpl.name) : ''}" placeholder="Template name…"/>
        </div>
        <div class="form-group">
          <label class="form-label req">Type</label>
          <select class="form-select" id="nt-type">
            <option value="email" ${tpl?.type === 'email' ? 'selected' : ''}>Email</option>
            <option value="whatsapp" ${tpl?.type === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Subject (email only)</label>
        <input class="form-input" id="nt-subj" value="${tpl ? escHtml(tpl.subject ?? '') : ''}" placeholder="e.g. Update on SR {{sr_number}}"/>
      </div>
      <div class="form-group">
        <label class="form-label req">Body / Message</label>
        <textarea class="form-textarea" id="nt-body" rows="7" placeholder="Use {{sr_number}}, {{customer_name}}, {{status}}, etc.">${tpl ? escHtml(tpl.body ?? '') : ''}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" onclick="submitTemplate('${tpl?.id ?? ''}')">Save Template</button>
    </div>
  `)
}

window.openEditTemplate = (tpl) => window.openNewTemplate(tpl)

window.submitTemplate = async (existingId) => {
  const sb = getSupabase()
  const me = appState.get('user')
  const name = document.getElementById('nt-name')?.value?.trim()
  const body = document.getElementById('nt-body')?.value?.trim()
  if (!name || !body) { window.toast('Name and body are required', 'error'); return }
  const data = { name, body, type: document.getElementById('nt-type')?.value, subject: document.getElementById('nt-subj')?.value || null, is_active: true }
  if (existingId) {
    await sb.from('templates').update(data).eq('id', existingId)
  } else {
    await sb.from('templates').insert({ ...data, created_by: me.id })
  }
  window.closeModalForce()
  window.toast('✓ Template saved')
  navigate('templates')
}

window.toggleTemplate = async (id, current) => {
  const sb = getSupabase()
  await sb.from('templates').update({ is_active: !current }).eq('id', id)
  window.toast(`Template ${current ? 'disabled' : 'enabled'}`)
  navigate('templates')
}

window.deleteTemplate = async (id) => {
  if (!confirm('Delete this template?')) return
  const sb = getSupabase()
  await sb.from('templates').delete().eq('id', id)
  window.toast('Template deleted')
  navigate('templates')
}
