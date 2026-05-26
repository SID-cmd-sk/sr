import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { ISSUE_TYPES, PRIORITIES, ACT_TYPES } from '../utils/constants.js'
import { navigate } from '../services/router.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    container.innerHTML = skeletonPage()

    try {
      const [{ data: users }, { data: routes }] = await Promise.all([
        sb.from('users').select('*').eq('status', 'active').order('name'),
        sb.from('routes').select('*').eq('is_active', true).order('name'),
      ])

      let type = params.type || 'activity'

      render()

      function render() {
        container.innerHTML = `
          <div class="page-header">
            <div>
              <div class="page-title">Create New</div>
              <div class="page-subtitle">Create a new activity or service request</div>
            </div>
            <div class="page-header-actions">
              <select class="form-select" id="create-type" style="width:auto" onchange="switchCreateType(this.value)">
                <option value="activity" ${type === 'activity' ? 'selected' : ''}>Activity</option>
                <option value="sr" ${type === 'sr' ? 'selected' : ''}>Service Request</option>
              </select>
            </div>
          </div>
          ${type === 'activity' ? renderActivityForm() : renderSRForm()}`
      }

      function renderActivityForm() {
        return `
          <div style="max-width:640px">
            <div class="card">
              <div class="section-title mb-4">New Activity</div>
              <div style="display:flex;flex-direction:column;gap:14px">
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
              <div class="flex gap-3 mt-4">
                <button class="btn btn-primary" onclick="submitCreateActivity()">Create Activity</button>
                <button class="btn btn-ghost" onclick="navigate('activities')">Cancel</button>
              </div>
            </div>
          </div>`
      }

      function renderSRForm() {
        const canChooseOwner = ['Admin', 'Manager'].includes(me?.role)
        return `
          <div style="max-width:740px">
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
                      ${ISSUE_TYPES.map(t => `<option>${escHtml(t)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label req">Priority</label>
                    <select class="form-select" id="n-priority">
                      ${PRIORITIES.map(p => `<option ${p === 'Medium' ? 'selected' : ''}>${p}</option>`).join('')}
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
                        ${users?.map(u => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${escHtml(u.name ?? '')} (${u.role})</option>`).join('')}
                      </select>`
                    : `<input class="form-input" value="${escHtml(me?.name ?? '')}" disabled style="opacity:.6"/>
                       <div class="form-hint">SR will be assigned to you</div>`}
                </div>
                <div class="form-group">
                  <label class="form-label">Route (optional)</label>
                  <select class="form-select" id="n-route">
                    <option value="">No route — manual handling</option>
                    ${routes?.map(r => `<option value="${r.id}">${escHtml(r.name ?? '')}</option>`).join('')}
                  </select>
                  <div class="form-hint">Routes define step-by-step workflow with automated notifications</div>
                </div>
              </div>
            </div>
            <div class="flex gap-3">
              <button class="btn btn-primary btn-lg" onclick="submitCreateSR()">Create Service Request</button>
              <button class="btn btn-ghost" onclick="navigate('sr')">Cancel</button>
            </div>
          </div>`
      }

      window.switchCreateType = (t) => {
        type = t
        const urlParams = new URLSearchParams(window.location.search)
        urlParams.set('type', t)
        history.replaceState(null, '', window.location.pathname + '?' + urlParams.toString())
        render()
      }

      window.submitCreateActivity = async () => {
        const title = document.getElementById('na-title')?.value?.trim()
        if (!title) { window.toast('Title is required', 'error'); return }
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
        if (error) { window.toast('Error: ' + error.message, 'error'); return }
        window.toast('✓ Activity created')
        navigate('activities')
      }

      window.submitCreateSR = async () => {
        const title = document.getElementById('n-title')?.value?.trim()
        const desc = document.getElementById('n-desc')?.value?.trim()
        if (!title || !desc) { window.toast('Title and description are required.', 'error'); return }
        const canChooseOwner = ['Admin', 'Manager'].includes(me?.role)
        const { data: sr, error } = await sb.from('sr').insert({
          title, issue_description: desc,
          account: document.getElementById('n-account')?.value || null,
          customer_name: document.getElementById('n-cname')?.value || null,
          customer_contact: document.getElementById('n-cphone')?.value || null,
          customer_email: document.getElementById('n-cemail')?.value || null,
          issue_type: document.getElementById('n-itype')?.value || null,
          priority: document.getElementById('n-priority')?.value || 'Medium',
          owner_id: canChooseOwner ? (document.getElementById('n-owner')?.value || me.id) : me.id,
          creator_id: me.id,
          route_id: document.getElementById('n-route')?.value || null,
          status: 'Open',
        }).select().single()
        if (error) { window.toast(error.message, 'error'); return }
        try { await window.auditLog('SR_CREATE', sr.id, 'sr', `Created SR ${sr.sr_number}`) } catch {}
        try { await window.createDriveFolder(sr.id) } catch {}
        window.toast('✓ Service request created')
        navigate('sr-detail', { id: sr.id })
      }
    } catch (e) {
      container.innerHTML = pageError('Could not load create page', e.message, true, 'create')
    }
  }
}
