import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { ISSUE_TYPES, PRIORITIES, STATUSES } from '../utils/constants.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'
import { navigate } from '../services/router.js'
import { toast } from '../components/toast.js'
import { auditLog } from '../services/audit.js'

async function render(container, params) {
  container.innerHTML = skeletonPage()
  const sb = getSupabase()
  const me = appState.get('user')
  try {
    const id = params.id
    const [{ data:sr }, { data:users }, { data:routes }] = await Promise.all([
      sb.from('sr_list').select('*').eq('id', id).single(),
      sb.from('users').select('*').eq('status','active').order('name'),
      sb.from('routes').select('*').eq('is_active',true).order('name'),
    ])
    if (!sr) { container.innerHTML = '<div class="alert alert-error" style="margin:20px">SR not found.</div>'; return }
    const canReassign = ['Admin','Manager'].includes(me?.role)

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Edit SR</div>
          <div class="page-subtitle mono" style="font-size:.8rem">${escHtml(sr.sr_number)}</div>
        </div>
        <button class="btn btn-ghost" onclick="navigate('sr-detail',{id:'${id}'})">← Cancel</button>
      </div>
      <div style="max-width:740px">
        <div id="edit-error" class="hidden"></div>
        <div class="card mb-4">
          <div class="section-title mb-4">SR Information</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-group">
              <label class="form-label req">Title / Summary</label>
              <input class="form-input" id="e-title" value="${escHtml(sr.title??'')}"/>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Issue Type</label>
                <select class="form-select" id="e-itype">
                  <option value="">Select type…</option>
                  ${ISSUE_TYPES.map(t=>`<option ${t===sr.issue_type?'selected':''}>${escHtml(t)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Priority</label>
                <select class="form-select" id="e-priority">
                  ${PRIORITIES.map(p=>`<option ${p===sr.priority?'selected':''}>${p}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="e-status">
                ${STATUSES.map(s=>`<option ${s===sr.status?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label req">Issue Description</label>
              <textarea class="form-textarea" id="e-desc" rows="4">${escHtml(sr.issue_description??'')}</textarea>
            </div>
          </div>
        </div>
        <div class="card mb-4">
          <div class="section-title mb-4">Customer Details</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-group">
              <label class="form-label">Account / Company</label>
              <input class="form-input" id="e-account" value="${escHtml(sr.account??'')}"/>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Contact Name</label>
                <input class="form-input" id="e-cname" value="${escHtml(sr.customer_name??'')}"/>
              </div>
              <div class="form-group">
                <label class="form-label">Contact Number</label>
                <input class="form-input" id="e-cphone" value="${escHtml(sr.customer_contact??'')}"/>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input class="form-input" id="e-cemail" type="email" value="${escHtml(sr.customer_email??'')}"/>
            </div>
          </div>
        </div>
        <div class="card mb-5">
          <div class="section-title mb-4">Assignment & Route</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${canReassign ? `<div class="form-group">
              <label class="form-label">Owner</label>
              <select class="form-select" id="e-owner">
                ${users?.map(u=>`<option value="${u.id}" ${u.id===sr.owner_id?'selected':''}>${escHtml(u.name??'')} (${u.role})</option>`).join('')}
              </select>
            </div>` : ''}
            <div class="form-group">
              <label class="form-label">Route</label>
              <select class="form-select" id="e-route">
                <option value="">No route — manual handling</option>
                ${routes?.map(r=>`<option value="${r.id}" ${r.id===sr.route_id?'selected':''}>${escHtml(r.name??'')}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-primary btn-lg" onclick="submitEditSR('${id}')">Save Changes</button>
          <button class="btn btn-ghost" onclick="navigate('sr-detail',{id:'${id}'})">Cancel</button>
        </div>
      </div>`

    window.submitEditSR = submitEditSR
  } catch(e) {
    container.innerHTML = pageError('Could not load edit form', e.message, true, 'sr')
  }
}

async function submitEditSR(id) {
  const sb = getSupabase()
  const me = appState.get('user')
  const title = document.getElementById('e-title')?.value?.trim()
  const desc  = document.getElementById('e-desc')?.value?.trim()
  const errEl = document.getElementById('edit-error')
  if (!title || !desc) { errEl.className='alert alert-error mb-4'; errEl.textContent='Title and description are required.'; return }
  errEl.className = 'hidden'
  const canReassign = ['Admin','Manager'].includes(me?.role)
  const { error } = await sb.from('sr').update({
    title, issue_description:desc,
    account:          document.getElementById('e-account')?.value||null,
    customer_name:    document.getElementById('e-cname')?.value||null,
    customer_contact: document.getElementById('e-cphone')?.value||null,
    customer_email:   document.getElementById('e-cemail')?.value||null,
    issue_type:       document.getElementById('e-itype')?.value||null,
    priority:         document.getElementById('e-priority')?.value,
    status:           document.getElementById('e-status')?.value,
    owner_id:         canReassign ? (document.getElementById('e-owner')?.value||undefined) : undefined,
    route_id:         document.getElementById('e-route')?.value||null,
  }).eq('id', id)
  if (error) { errEl.className='alert alert-error mb-4'; errEl.textContent=error.message; return }
  await auditLog('SR_EDIT', id, 'sr', 'Edited SR')
  toast('✓ SR updated successfully')
  navigate('sr-detail', { id })
}

export default { render }
