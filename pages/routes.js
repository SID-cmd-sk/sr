import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { ROLES } from '../utils/constants.js'
import { navigate } from '../services/router.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    container.innerHTML = skeletonPage()

    try {
      const { data: routes } = await sb.from('routes').select('*').order('name')
      let selectedRoute = null, selectedSteps = []

      render()

      function render() {
        container.innerHTML = `
          <div class="page-header">
            <div>
              <div class="page-title">Routes</div>
              <div class="page-subtitle">Manage workflow routes and automation steps</div>
            </div>
            ${['Admin', 'Manager'].includes(me?.role) ? `<div class="page-header-actions">
              <button class="btn btn-primary" onclick="openNewRoute()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                New Route
              </button>
            </div>` : ''}
          </div>
          <div class="grid-2">
            <div class="card">
              <div class="section-title mb-3">All Routes</div>
              ${!routes?.length ? `<div style="color:var(--text-3);font-size:.83rem;text-align:center;padding:24px 0">No routes yet. Create one to get started.</div>` :
              routes.map(r => `<div onclick="window.selectRoute('${r.id}')"
                style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:var(--r);cursor:pointer;background:${selectedRoute?.id === r.id ? 'var(--accent-dim)' : 'transparent'};margin-bottom:4px;border:1px solid ${selectedRoute?.id === r.id ? 'rgba(59,130,246,.25)' : 'transparent'};transition:all var(--t)">
                <div style="min-width:0">
                  <div style="font-weight:600;font-size:.85rem">${escHtml(r.name ?? '')}</div>
                  ${r.description ? `<div style="font-size:.73rem;color:var(--text-3);margin-top:1px">${escHtml(r.description)}</div>` : ''}
                </div>
                <div class="flex items-center gap-2" style="flex-shrink:0;margin-left:10px">
                  <span class="badge ${r.is_active ? 'badge-in-progress' : 'badge-closed'}">${r.is_active ? 'Active' : 'Off'}</span>
                  ${['Admin', 'Manager'].includes(me?.role) ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.toggleRoute('${r.id}',${r.is_active})">${r.is_active ? 'Disable' : 'Enable'}</button>
                  <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();window.deleteRoute('${r.id}')">Delete</button>` : ''}
                </div>
              </div>`).join('')}
            </div>
            <div class="card" id="steps-panel">
              ${selectedRoute
                ? `<div class="flex items-center justify-between mb-3">
                    <div>
                      <div class="section-title">${escHtml(selectedRoute.name)}</div>
                      <div style="font-size:.73rem;color:var(--text-3);margin-top:2px">${selectedSteps.length} step${selectedSteps.length !== 1 ? 's' : ''}</div>
                    </div>
                    ${['Admin', 'Manager'].includes(me?.role) ? `<button class="btn btn-secondary btn-sm" onclick="openAddStep('${selectedRoute.id}')">+ Add Step</button>` : ''}
                  </div>
                  ${!selectedSteps.length ? `<div style="color:var(--text-3);font-size:.83rem;text-align:center;padding:24px 0">No steps yet. Add a step to this route.</div>` :
                  selectedSteps.map((s, i) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-elevated);border-radius:var(--r);margin-bottom:6px;border:1px solid var(--border)">
                    <div class="step-dot" style="width:22px;height:22px;font-size:.65rem;flex-shrink:0">${s.step_order}</div>
                    <div style="flex:1;min-width:0">
                      <div class="flex items-center gap-2">
                        <div style="font-weight:600;font-size:.83rem">${escHtml(s.name ?? '')}</div>
                        ${s.email_enabled ? `<span class="badge badge-open" style="font-size:.6rem;padding:1px 6px">Email</span>` : ''}
                      </div>
                      <div style="font-size:.72rem;color:var(--text-3);margin-top:2px">${escHtml(s.assigned_role ?? '')} ${s.sla_hours ? `· ${s.sla_hours}h SLA` : ''}</div>
                    </div>
                    ${['Admin', 'Manager'].includes(me?.role) ? `<div class="flex gap-1 flex-shrink-0">
                      <button class="btn btn-ghost btn-sm" onclick="openEditStep('${s.id}','${selectedRoute.id}')">Edit</button>
                      <button class="btn btn-ghost btn-sm" onclick="window.moveStep('${s.id}','up','${selectedRoute.id}')" ${i === 0 ? 'disabled' : ''}>↑</button>
                      <button class="btn btn-ghost btn-sm" onclick="window.moveStep('${s.id}','down','${selectedRoute.id}')" ${i === selectedSteps.length - 1 ? 'disabled' : ''}>↓</button>
                      <button class="btn btn-danger btn-sm" onclick="window.deleteStep('${s.id}','${selectedRoute.id}')">✕</button>
                    </div>` : ''}
                  </div>`).join('')}`
                : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:var(--text-3);font-size:.83rem;gap:8px">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".4"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3"/></svg>
                    <span>Select a route to see its steps</span>
                  </div>`}
            </div>
          </div>`
      }

      window.selectRoute = async (id) => {
        selectedRoute = routes.find(r => r.id === id)
        const { data } = await sb.from('route_steps').select('*').eq('route_id', id).order('step_order')
        selectedSteps = data ?? []
        render()
      }

      window.toggleRoute = async (id, current) => {
        await sb.from('routes').update({ is_active: !current }).eq('id', id)
        const r = routes.find(r => r.id === id); if (r) r.is_active = !current
        render()
      }

      window.deleteRoute = async (id) => {
        if (!confirm('Delete this route and all its steps?')) return
        await sb.from('routes').delete().eq('id', id)
        const idx = routes.findIndex(r => r.id === id); if (idx > -1) routes.splice(idx, 1)
        if (selectedRoute?.id === id) { selectedRoute = null; selectedSteps = [] }
        render()
      }

      window.deleteStep = async (stepId, routeId) => {
        if (!confirm('Delete this step?')) return
        await sb.from('route_steps').delete().eq('id', stepId)
        window.selectRoute(routeId)
      }

      window.moveStep = async (stepId, dir, routeId) => {
        const idx = selectedSteps.findIndex(s => s.id === stepId)
        const target = dir === 'up' ? idx - 1 : idx + 1
        if (target < 0 || target >= selectedSteps.length) return
        const a = selectedSteps[idx], b = selectedSteps[target]
        await Promise.all([
          sb.from('route_steps').update({ step_order: b.step_order }).eq('id', a.id),
          sb.from('route_steps').update({ step_order: a.step_order }).eq('id', b.id),
        ])
        window.selectRoute(routeId)
      }

      window.openAddStep = (routeId) => openStepModal(null, routeId, null)
      window.openEditStep = async (stepId, routeId) => {
        const { data: step } = await sb.from('route_steps').select('*').eq('id', stepId).single()
        if (!step) { window.toast('Could not load step', 'error'); return }
        openStepModal(stepId, routeId, step)
      }

      window.openNewRoute = () => {
        window.modal(`
          <div class="modal-header">
            <div class="modal-title">New Route</div>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label req">Route Name</label>
              <input class="form-input" id="nr-name" placeholder="e.g. Standard IT Support"/>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" id="nr-desc" rows="2" placeholder="Brief description of this workflow…"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
            <button class="btn btn-primary" onclick="submitNewRoute()">Create Route</button>
          </div>
        `, 'modal-sm')
      }

      window.submitNewRoute = async () => {
        const name = document.getElementById('nr-name')?.value?.trim()
        if (!name) { window.toast('Route name is required', 'error'); return }
        await sb.from('routes').insert({ name, description: document.getElementById('nr-desc')?.value || null, created_by: me.id })
        window.closeModalForce(); window.toast('✓ Route created'); navigate('routes')
      }

      async function openStepModal(stepId, routeId, existingStep) {
        const { data: templates } = await sb.from('templates').select('*').eq('type', 'email').eq('is_active', true).order('name')
        const isEdit = !!stepId
        const step = existingStep || {}

        const name = step.name || ''
        const desc = step.description || ''
        const role = step.assigned_role || 'Technical'
        const sla = step.sla_hours || ''
        const emailEnabled = step.email_enabled || false
        const emailTemplate = step.email_template || ''
        const emailRecipients = step.email_recipients || 'customer'
        const emailSubject = step.email_subject || ''
        const emailBody = step.email_body || ''

        const recipientTokens = emailRecipients.split(',').map(s => s.trim().toLowerCase())
        const customRecipients = recipientTokens.filter(x => !['customer', 'owner', 'creator'].includes(x)).join(', ')

        const PLACEHOLDERS = ['name', 'email', 'step_name', 'route_name', 'completion_time', 'company', 'assigned_user', 'sr_number', 'status', 'priority']

        let activeTab = 'general'

        function renderModal() {
          const m = document.querySelector('.modal')
          if (!m) return
          m.innerHTML = `
            <div class="modal-header">
              <div class="modal-title">${isEdit ? 'Edit Step' : 'Add Step'}</div>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="modal-tabs">
              ${['general', 'email', 'preview'].map(t => `<button class="tab-btn ${activeTab === t ? 'active' : ''}" onclick="window._stepTab('${t}')">${t === 'general' ? 'General' : t === 'email' ? 'Email Automation' : 'Live Preview'}</button>`).join('')}
            </div>
            <div class="modal-body">

              <div id="step-tab-general" ${activeTab !== 'general' ? 'class="hidden"' : ''} style="display:${activeTab === 'general' ? 'flex' : 'none'};flex-direction:column;gap:14px">
                <div class="form-group">
                  <label class="form-label req">Step Name</label>
                  <input class="form-input" id="s-name" value="${escHtml(name)}" placeholder="e.g. Initial Assessment"/>
                </div>
                <div class="form-group">
                  <label class="form-label">Description</label>
                  <textarea class="form-textarea" id="s-desc" rows="2">${escHtml(desc)}</textarea>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Assigned Role</label>
                    <select class="form-select" id="s-role">
                      ${ROLES.map(r => `<option ${r === role ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">SLA Hours</label>
                    <input class="form-input" id="s-sla" type="number" value="${escHtml(String(sla))}" placeholder="e.g. 24"/>
                  </div>
                </div>
              </div>

              <div id="step-tab-email" style="display:${activeTab === 'email' ? 'flex' : 'none'};flex-direction:column;gap:14px">
                <div class="toggle-wrap" onclick="window._toggleEmail()">
                  <div class="toggle-info">
                    <div class="toggle-title">Enable Automated Email Trigger</div>
                    <div class="toggle-desc">Automatically send email when a user completes this step</div>
                  </div>
                  <div class="toggle-switch ${emailEnabled ? 'on' : ''}" id="email-toggle"></div>
                </div>
                <div id="email-config-area" style="display:${emailEnabled ? 'flex' : 'none'};flex-direction:column;gap:14px">
                  <div class="form-group">
                    <label class="form-label">Base Template (optional)</label>
                    <select class="form-select" id="s-email-tpl" onchange="window._onTplChange(this.value)">
                      <option value="">— Custom (no template inheritance) —</option>
                      ${templates?.map(t => `<option value="${t.id}" ${t.id === emailTemplate ? 'selected' : ''}>${escHtml(t.name)}</option>`).join('')}
                    </select>
                    <div class="form-hint">Select a template to inherit subject/body defaults</div>
                  </div>
                  <div class="form-group">
                    <label class="form-label req">Recipients</label>
                    <div style="display:flex;gap:16px;margin:6px 0;flex-wrap:wrap">
                      <label style="display:flex;align-items:center;gap:6px;font-size:.83rem;cursor:pointer">
                        <input type="checkbox" class="s-rec-chk" value="customer" ${recipientTokens.includes('customer') ? 'checked' : ''}/> Customer Email
                      </label>
                      <label style="display:flex;align-items:center;gap:6px;font-size:.83rem;cursor:pointer">
                        <input type="checkbox" class="s-rec-chk" value="owner" ${recipientTokens.includes('owner') ? 'checked' : ''}/> SR Owner
                      </label>
                      <label style="display:flex;align-items:center;gap:6px;font-size:.83rem;cursor:pointer">
                        <input type="checkbox" class="s-rec-chk" value="creator" ${recipientTokens.includes('creator') ? 'checked' : ''}/> SR Creator
                      </label>
                    </div>
                    <input class="form-input" id="s-custom-rec" value="${escHtml(customRecipients)}" placeholder="Additional comma-separated emails…"/>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Subject Override</label>
                    <input class="form-input" id="s-email-subj" value="${escHtml(emailSubject)}" placeholder="e.g. Update on SR {{sr_number}}"/>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Body / Message Override</label>
                    <textarea class="form-textarea" id="s-email-body" rows="6" placeholder="Email body with {{placeholders}}…">${escHtml(emailBody)}</textarea>
                    <div style="margin-top:8px">
                      <div style="font-size:.7rem;color:var(--text-3);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Click to insert placeholder:</div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap">
                        ${PLACEHOLDERS.map(p => `<span class="placeholder-tag" onclick="window._insertPH('${p}')">{{${p}}}</span>`).join('')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div id="step-tab-preview" style="display:${activeTab === 'preview' ? 'flex' : 'none'};flex-direction:column;gap:14px">
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden">
                  <div style="background:var(--bg-elevated);padding:10px 14px;border-bottom:1px solid var(--border)">
                    <div style="font-size:.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:4px">Email Preview</div>
                    <div class="flex gap-2 items-center flex-wrap">
                      <span style="font-size:.73rem;color:var(--text-3)">To:</span>
                      <span id="esp-to" style="font-size:.78rem;font-weight:600;color:var(--accent-lg)">—</span>
                    </div>
                    <div class="flex gap-2 items-center" style="margin-top:4px">
                      <span style="font-size:.73rem;color:var(--text-3)">Subject:</span>
                      <span id="esp-subject" style="font-size:.83rem;font-weight:700">—</span>
                    </div>
                  </div>
                  <div style="padding:14px;min-height:120px;white-space:pre-wrap;font-size:.83rem;color:var(--text-2);line-height:1.7" id="esp-body">—</div>
                </div>
                <div style="font-size:.73rem;color:var(--text-3)">* Preview uses mock data to simulate a real service request.</div>
                <button class="btn btn-secondary btn-sm" onclick="window._refreshPreview()" style="align-self:flex-start">↺ Refresh Preview</button>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
              <button class="btn btn-primary" onclick="window._saveStep('${stepId || ''}','${routeId}')">
                ${isEdit ? 'Save Changes' : 'Add Step'}
              </button>
            </div>`

          if (activeTab === 'preview') setTimeout(window._refreshPreview, 50)
        }

        window._stepTab = (tab) => {
          activeTab = tab
          const tabs = document.querySelectorAll('.modal-tabs .tab-btn')
          tabs.forEach(t => t.classList.toggle('active', t.textContent.toLowerCase().includes(tab === 'general' ? 'general' : tab === 'email' ? 'email' : 'preview')))
          const panels = ['general', 'email', 'preview']
          panels.forEach(p => {
            const el = document.getElementById(`step-tab-${p}`)
            if (el) el.style.display = p === tab ? 'flex' : 'none'
          })
          if (tab === 'preview') setTimeout(window._refreshPreview, 50)
        }

        window._toggleEmail = () => {
          const toggle = document.getElementById('email-toggle')
          const config = document.getElementById('email-config-area')
          if (!toggle || !config) return
          const newState = !toggle.classList.contains('on')
          toggle.classList.toggle('on', newState)
          config.style.display = newState ? 'flex' : 'none'
        }

        window._onTplChange = async (tplId) => {
          if (!tplId) return
          const { data: tpl } = await sb.from('templates').select('*').eq('id', tplId).single()
          if (tpl) {
            const subj = document.getElementById('s-email-subj')
            const body = document.getElementById('s-email-body')
            if (subj && !subj.value) subj.value = tpl.subject || ''
            if (body && !body.value) body.value = tpl.body || ''
          }
        }

        window._insertPH = (ph) => {
          const el = document.getElementById('s-email-body')
          if (!el) return
          const s = el.selectionStart, e = el.selectionEnd
          el.value = el.value.slice(0, s) + `{{${ph}}}` + el.value.slice(e)
          el.focus()
          el.selectionStart = el.selectionEnd = s + ph.length + 4
        }

        window._refreshPreview = async () => {
          const mockSR = {
            sr_number: 'SR-2026-1001', customer_name: 'John Doe', customer_email: 'john.doe@example.com',
            owner_name: 'Sidharth Kumar', account: 'Acme Corp', route_name: 'IT Support Route',
            issue_type: 'Technical Support', status: 'In Progress', priority: 'High',
            resolution: 'Rebooted server.', company_name: 'SKS 3D',
          }
          const tplId = document.getElementById('s-email-tpl')?.value
          let subj = document.getElementById('s-email-subj')?.value || ''
          let body = document.getElementById('s-email-body')?.value || ''
          const nameVal = document.getElementById('s-name')?.value || 'Step'

          if (tplId && (!subj || !body)) {
            const { data: tpl } = await sb.from('templates').select('*').eq('id', tplId).single()
            if (tpl) { subj = subj || tpl.subject || ''; body = body || tpl.body || '' }
          }
          subj = subj || `Update on Service Request ${mockSR.sr_number}`
          body = body || `Your SR ${mockSR.sr_number} status is: ${mockSR.status}`

          const recs = []
          document.querySelectorAll('.s-rec-chk').forEach(c => {
            if (c.checked) {
              if (c.value === 'customer') recs.push(mockSR.customer_email)
              else if (c.value === 'owner') recs.push('owner@sks3d.com')
              else recs.push('creator@sks3d.com')
            }
          })
          const custRec = document.getElementById('s-custom-rec')?.value?.trim()
          if (custRec) recs.push(custRec)

          const evalPH = s => s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
            const map = { ...mockSR, name: mockSR.customer_name, email: mockSR.customer_email, step_name: nameVal, company: mockSR.company_name, assigned_user: mockSR.owner_name, completion_time: new Date().toLocaleString() }
            return map[k] ?? ''
          })

          const toEl = document.getElementById('esp-to')
          const subjEl = document.getElementById('esp-subject')
          const bodyEl = document.getElementById('esp-body')
          if (toEl) toEl.textContent = recs.length ? recs.join(', ') : '(No recipients selected)'
          if (subjEl) subjEl.textContent = evalPH(subj)
          if (bodyEl) bodyEl.textContent = evalPH(body)
        }

        window._saveStep = async (sId, rId) => {
          const nameVal = document.getElementById('s-name')?.value?.trim()
          if (!nameVal) { window.toast('Step name is required', 'error'); return }

          const emailEnabledVal = document.getElementById('email-toggle')?.classList.contains('on') || false
          const tplVal = document.getElementById('s-email-tpl')?.value || null

          const recs = []
          document.querySelectorAll('.s-rec-chk').forEach(c => { if (c.checked) recs.push(c.value) })
          const custRec = document.getElementById('s-custom-rec')?.value?.trim()
          if (custRec) recs.push(custRec)

          const updateData = {
            name: nameVal,
            description: document.getElementById('s-desc')?.value || null,
            assigned_role: document.getElementById('s-role')?.value || 'Technical',
            sla_hours: document.getElementById('s-sla')?.value ? parseInt(document.getElementById('s-sla').value) : null,
            email_enabled: emailEnabledVal,
            email_template: tplVal,
            email_recipients: recs.join(',') || 'customer',
            email_subject: document.getElementById('s-email-subj')?.value || null,
            email_body: document.getElementById('s-email-body')?.value || null,
            email_trigger_enabled: emailEnabledVal,
            email_subject_override: document.getElementById('s-email-subj')?.value || null,
            email_body_override: document.getElementById('s-email-body')?.value || null,
          }

          let error
          if (sId) {
            const res = await sb.from('route_steps').update(updateData).eq('id', sId)
            error = res.error
          } else {
            const { data: existing } = await sb.from('route_steps').select('step_order').eq('route_id', rId).order('step_order', { ascending: false }).limit(1)
            const nextOrder = (existing?.[0]?.step_order ?? 0) + 1
            const res = await sb.from('route_steps').insert({ ...updateData, route_id: rId, step_order: nextOrder, is_required: true })
            error = res.error
          }

          if (error) { window.toast('Error: ' + error.message, 'error'); return }
          window.closeModalForce()
          window.toast(`✓ Step ${sId ? 'updated' : 'added'} successfully`)
          const { data } = await sb.from('route_steps').select('*').eq('route_id', rId).order('step_order')
          if (window.selectRoute) window.selectRoute(rId)
        }

        window.modal('<div class="modal-body" style="padding:20px;color:var(--text-3)">Loading…</div>', 'modal-lg')
        renderModal()
      }
    } catch (e) {
      container.innerHTML = pageError('Could not load routes', e.message, true, 'routes')
    }
  }
}
