import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml, fmtDateS } from '../utils/format.js'
import { ACT_TYPES, STS_CLS } from '../utils/constants.js'
import { navigate } from '../services/router.js'
import { skeletonPage } from '../components/skeleton.js'
import { emptyState, pageError } from '../components/stats.js'
import { deleteActivitySheetRow } from '../services/sheets.js'

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    container.innerHTML = skeletonPage()

    try {
      const filter = params.status ?? ''
      const q = params.q ?? ''

      const [{ data: acts, error: actsErr }, { data: users }] = await Promise.all([
        sb.from('activities').select('*,owner:users!activities_owner_id_fkey(name)').order('created_at', { ascending: false }).limit(100),
        sb.from('users').select('*').eq('status', 'active').order('name'),
      ])

      if (actsErr) throw actsErr
      if (!acts) throw new Error('Could not fetch activities - check database permissions')

      const query = q.toLowerCase()
      const filtered = (acts ?? [])
        .filter(a => !filter || a.status === filter)
        .filter(a => !q || (a.title || '').toLowerCase().includes(query) || (a.account || '').toLowerCase().includes(query))

      container.innerHTML = `
        <div class="page-header">
          <div>
            <div class="page-title">Activities</div>
            <div class="page-subtitle">${filtered.length} of ${acts.length} records</div>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary" onclick="openNewActivity(${JSON.stringify(users ?? []).replace(/"/g, '&quot;')})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              New Activity
            </button>
          </div>
        </div>
        <div class="filter-bar">
          <div class="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input class="form-input" id="act-q" value="${escHtml(q)}" placeholder="Search title, account…"/>
          </div>
          <select class="form-select" id="act-f" style="width:auto">
            <option value="">All Status</option>
            ${['Open', 'In Progress', 'Done', 'Cancelled'].map(s => `<option value="${s}" ${s === filter ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" onclick="navigate('activities',{q:document.getElementById('act-q').value,status:document.getElementById('act-f').value})">Filter</button>
          <button class="btn btn-ghost" onclick="navigate('activities')">Clear</button>
        </div>
        <div class="card" style="padding:0">
          ${!filtered.length ? emptyState('No activities found', 'Create your first activity to get started') :
          `<div class="table-wrap" style="border:none;border-radius:0 0 var(--r-lg) var(--r-lg)">
            <table class="data-table"><thead><tr>
              <th>Title</th><th>Type</th><th>Account</th><th>Contact</th><th>Status</th><th>Owner</th><th>Due</th><th>Actions</th>
            </tr></thead><tbody>
            ${filtered.map(a => `<tr>
              <td style="font-weight:500">${escHtml(a.title)}</td>
              <td style="font-size:.78rem;color:var(--text-2)">${escHtml(a.type)}</td>
              <td style="font-size:.78rem;color:var(--text-2)">${escHtml(a.account ?? '—')}</td>
              <td style="font-size:.78rem">${escHtml(a.contact_name ?? '—')}</td>
              <td><span class="badge ${STS_CLS[a.status] || 'badge-closed'}">${escHtml(a.status)}</span></td>
              <td style="font-size:.78rem">${escHtml(a.owner?.name ?? '—')}</td>
              <td class="mono" style="font-size:.7rem;color:var(--text-3)">${a.due_date ? fmtDateS(a.due_date) : '—'}</td>
              <td>
                <div class="flex gap-1">
                  ${a.status !== 'Done' ? `<button class="btn btn-success btn-sm" onclick="updateActStatus('${a.id}','Done')">✓ Done</button>` : ''}
                  ${a.status === 'Open' ? `<button class="btn btn-ghost btn-sm" style="color:var(--text-3)" onclick="updateActStatus('${a.id}','Cancelled')">✕</button>` : ''}
                  ${me?.role === 'Admin' ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteAct('${a.id}','${escHtml(a.activity_no)}')" title="Delete">Del</button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
            </tbody></table>
          </div>`}
        </div>`
    } catch (e) {
      container.innerHTML = pageError('Could not load activities', e.message, true, 'activities')
    }
  }
}

window.updateActStatus = async (id, status) => {
  const sb = getSupabase()
  await sb.from('activities').update({ status, closed_at: status === 'Done' ? new Date().toISOString() : null }).eq('id', id)
  window.toast(`✓ Marked as ${status}`)
  navigate('activities')
}

window.deleteAct = async (id, activityNo) => {
  if (!confirm(`Delete activity ${activityNo}? This will also remove it from the sheet.`)) return
  const sb = getSupabase()
  try {
    await sb.from('activities').delete().eq('id', id)
    if (activityNo) {
      deleteActivitySheetRow(activityNo).catch(() => {})
    }
    window.toast('✓ Activity deleted')
    navigate('activities')
  } catch(e) {
    window.toast('Delete failed: ' + e.message, 'error')
  }
}

window.openNewActivity = (users) => {
  const me = appState.get('user')
  window.modal(`
    <div class="modal-header">
      <div class="modal-title">New Activity</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label req">Title</label>
        <input class="form-input" id="na-title" placeholder="Activity summary…"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="na-type">
            ${ACT_TYPES.map(t => `<option>${escHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Owner</label>
          <select class="form-select" id="na-owner">
            ${users.map(u => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${escHtml(u.name ?? '')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Account</label>
          <input class="form-input" id="na-account" placeholder="Company…"/>
        </div>
        <div class="form-group">
          <label class="form-label">Contact</label>
          <input class="form-input" id="na-contact" placeholder="Name…"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" id="na-phone" type="tel" placeholder="+91…"/>
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input class="form-input" id="na-due" type="date"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="na-notes" rows="3" placeholder="Additional notes…"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" id="na-submit" onclick="submitNewActivity()">Create Activity</button>
    </div>
  `)
}

window.submitNewActivity = async () => {
  const sb = getSupabase()
  const me = appState.get('user')
  const title = document.getElementById('na-title')?.value?.trim()
  if (!title) { window.toast('Title is required', 'error'); return }
  const btn = document.getElementById('na-submit')
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Creating…'
  const { error } = await sb.from('activities').insert({
    title,
    type: document.getElementById('na-type')?.value,
    account: document.getElementById('na-account')?.value || null,
    contact_name: document.getElementById('na-contact')?.value || null,
    contact_phone: document.getElementById('na-phone')?.value || null,
    due_date: document.getElementById('na-due')?.value || null,
    notes: document.getElementById('na-notes')?.value || null,
    owner_id: document.getElementById('na-owner')?.value || me.id,
    creator_id: me.id,
    status: 'Open',
  })
  if (error) {
    btn.disabled = false
    btn.innerHTML = 'Create Activity'
    window.toast('Error: ' + error.message, 'error')
    return
  }
  window.closeModalForce()
  window.toast('✓ Activity created')
  navigate('activities')
}
