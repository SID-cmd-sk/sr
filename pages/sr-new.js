import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { ISSUE_TYPES, PRIORITIES } from '../utils/constants.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'
import { navigate } from '../services/router.js'
import { toast } from '../components/toast.js'
import { auditLog } from '../services/audit.js'
import { createDriveFolder } from '../services/sheets.js'

async function render(container) {
  container.innerHTML = skeletonPage()
  const sb = getSupabase()
  const me = appState.get('user')
  try {
    const [{ data:users }, { data:routes }] = await Promise.all([
      sb.from('users').select('*').eq('status','active').order('name'),
      sb.from('routes').select('*').eq('is_active',true).order('name'),
    ])
    const canChooseOwner = ['Admin','Manager'].includes(me?.role)

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">New Service Request</div>
          <div class="page-subtitle">Create a new SR and assign it to your team</div>
        </div>
        <button class="btn btn-ghost" onclick="navigate('sr')">← Cancel</button>
      </div>
      <div style="max-width:740px">
        <div id="sr-new-error" class="hidden"></div>
        <div class="card mb-4">
          <div class="section-title mb-4">SR Information</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-group">
              <label class="form-label req">Title / Summary</label>
              <input class="form-input" id="n-title" placeholder="Brief description of the issue…"/>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Issue Type</label>
                <select class="form-select" id="n-itype">
                  <option value="">Select type…</option>
                  ${ISSUE_TYPES.map(t=>`<option>${escHtml(t)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label req">Priority</label>
                <select class="form-select" id="n-priority">
                  ${PRIORITIES.map(p=>`<option ${p==='Medium'?'selected':''}>${p}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label req">Issue Description</label>
              <textarea class="form-textarea" id="n-desc" rows="4" placeholder="Detailed description of the problem…"></textarea>
            </div>
          </div>
        </div>
        <div class="card mb-4">
          <div class="section-title mb-4">Customer Details</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-group">
              <label class="form-label">Account / Company</label>
              <input class="form-input" id="n-account" placeholder="Company or account name"/>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Contact Name</label>
                <input class="form-input" id="n-cname" placeholder="Customer full name"/>
              </div>
              <div class="form-group">
                <label class="form-label">Contact Number</label>
                <input class="form-input" id="n-cphone" type="tel" placeholder="+91 9999999999"/>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input class="form-input" id="n-cemail" type="email" placeholder="customer@company.com"/>
            </div>
          </div>
        </div>
        <div class="card mb-5">
          <div class="section-title mb-4">Assignment & Route</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-group">
              <label class="form-label req">Owner</label>
              ${canChooseOwner
                ? `<select class="form-select" id="n-owner">
                    <option value="">Select owner…</option>
                    ${users?.map(u=>`<option value="${u.id}" ${u.id===me.id?'selected':''}>${escHtml(u.name??'')} (${u.role})</option>`).join('')}
                   </select>`
                : `<input class="form-input" value="${escHtml(me?.name??'')}" disabled style="opacity:.6"/>
                   <div class="form-hint">SR will be assigned to you</div>`}
            </div>
            <div class="form-group">
              <label class="form-label">Route (optional)</label>
              <select class="form-select" id="n-route">
                <option value="">No route — manual handling</option>
                ${routes?.map(r=>`<option value="${r.id}">${escHtml(r.name??'')}</option>`).join('')}
              </select>
              <div class="form-hint">Routes define step-by-step workflow with automated notifications</div>
            </div>
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-primary btn-lg" id="n-submit" onclick="submitNewSR()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Create Service Request
          </button>
          <button class="btn btn-ghost" onclick="navigate('sr')">Cancel</button>
        </div>
      </div>`

    window.submitNewSR = submitNewSR
  } catch(e) {
    container.innerHTML = pageError('Could not load form', e.message, true, 'sr-new')
  }
}

async function submitNewSR() {
  const sb = getSupabase()
  const me = appState.get('user')
  const title = document.getElementById('n-title')?.value?.trim()
  const desc  = document.getElementById('n-desc')?.value?.trim()
  const errEl = document.getElementById('sr-new-error')
  const btn   = document.getElementById('n-submit')
  if (!title || !desc) {
    errEl.className = 'alert alert-error mb-4'
    errEl.textContent = 'Title and description are required.'
    return
  }
  errEl.className = 'hidden'
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Creating…'
  const canChooseOwner = ['Admin','Manager'].includes(me?.role)
  const { data:sr, error } = await sb.from('sr').insert({
    title, issue_description:desc,
    account:          document.getElementById('n-account')?.value||null,
    customer_name:    document.getElementById('n-cname')?.value||null,
    customer_contact: document.getElementById('n-cphone')?.value||null,
    customer_email:   document.getElementById('n-cemail')?.value||null,
    issue_type:       document.getElementById('n-itype')?.value||null,
    priority:         document.getElementById('n-priority')?.value||'Medium',
    owner_id:         canChooseOwner ? (document.getElementById('n-owner')?.value||me.id) : me.id,
    creator_id:       me.id,
    route_id:         document.getElementById('n-route')?.value||null,
    status:           'Open',
  }).select().single()
  if (error) {
    btn.disabled = false
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>\n            Create Service Request'
    errEl.className='alert alert-error mb-4'
    errEl.textContent=error.message
    return
  }
  await auditLog('SR_CREATE', sr.id, 'sr', `Created SR ${sr.sr_number}`)
  try {
    await createDriveFolder(sr.id)
  } catch(e) {}
  toast('✓ Service request created')
  navigate('sr-detail', { id:sr.id })
}

export default { render }
