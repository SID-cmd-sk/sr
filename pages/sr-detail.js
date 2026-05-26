import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml, fmtDateS, fmtDate } from '../utils/format.js'
import { skeletonPage } from '../components/skeleton.js'
import { priBadge, stsBadge } from '../components/badge.js'
import { pageError, detailRow } from '../components/stats.js'
import { navigate } from '../services/router.js'
import { toast } from '../components/toast.js'
import { modal, closeModalForce } from '../components/modal.js'
import { CFG } from '../utils/config.js'
import { auditLog } from '../services/audit.js'
import { sendEmailFromBrowser, triggerStepEmail, upsertEmailLog, sendEmailModal, doSendEmail } from '../services/email.js'
import { syncSheetsRow, createDriveFolder, deleteSRDriveFolder, deleteSRSheetRow } from '../services/sheets.js'

async function render(container, params = {}) {
  container.innerHTML = skeletonPage()
  const sb = getSupabase()
  const me = appState.get('user')
  try {
    const id = params.id
    const [{ data:sr }, { data:history }, { data:emailLogs }] = await Promise.all([
      sb.from('sr_list').select('*').eq('id', id).single(),
      sb.from('sr_stage_history').select('*,advanced_by_user:users(name)').eq('sr_id',id).order('advanced_at',{ascending:false}),
      sb.from('step_email_logs').select('*').eq('sr_id', id),
    ])

    if (!sr) { container.innerHTML = '<div class="alert alert-error" style="margin:20px">SR not found.</div>'; return }

    const { data:routeSteps } = sr.route_id
      ? await sb.from('route_steps').select('*').eq('route_id', sr.route_id).order('step_order')
      : { data: [] }

    const automatedSteps = (routeSteps||[]).filter(s => s.email_enabled)
    const isClosed   = ['Closed','Archived'].includes(sr.status)
    const isLastStep = routeSteps?.length > 0 && sr.current_step >= routeSteps.length
    const canAdvance = sr.route_id && !isClosed && ['Admin','Manager','Technical'].includes(me?.role) && !isLastStep
    const canClose   = ['Admin','Manager'].includes(me?.role)
    const canEdit    = ['Admin','Manager'].includes(me?.role) || me?.id === sr.owner_id

    window.retriggerAutomatedEmail = async (srId, stepId) => {
      toast('Retriggering automated email…', 'info')
      const ok = await triggerStepEmail(srId, stepId, true)
      toast(ok ? '✓ Automated email sent' : '✗ Email failed — check Settings', ok ? 'success' : 'error')
      navigate('sr-detail', { id: srId })
    }

    container.innerHTML = `
      <div class="page-header">
        <div style="flex:1;min-width:0">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <button class="btn btn-ghost btn-sm" onclick="navigate('sr')">← Back</button>
            <span class="mono text-accent" style="font-size:.85rem;font-weight:700">${escHtml(sr.sr_number)}</span>
            ${stsBadge(sr.status)}
            ${priBadge(sr.priority)}
          </div>
          <div class="page-title truncate">${escHtml(sr.title)}</div>
        </div>
        <div class="page-header-actions">
          ${canAdvance ? `<button class="btn btn-secondary" onclick="openAdvanceModal('${id}',${sr.current_step},${routeSteps?.length??0})">→ Next Step</button>` : ''}
          ${!isClosed && canClose ? `<button class="btn btn-secondary" onclick="openCloseModal('${id}')">✓ Close</button>` : ''}
          ${isClosed && canClose ? `<button class="btn btn-ghost" onclick="reopenSR('${id}')">↩ Reopen</button>` : ''}
          <button class="btn btn-ghost" onclick="sendEmailModal('${id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Email
          </button>
          <button class="btn btn-ghost" style="color:var(--green)" onclick="sendWABySRId('${id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            WhatsApp
          </button>
          ${canEdit ? `<button class="btn btn-ghost" onclick="navigate('sr-edit',{id:'${id}'})">Edit</button>` : ''}
          ${['Admin'].includes(me?.role) ? `<button class="btn btn-ghost" style="color:var(--red)" onclick="openDeleteSRModal('${id}','${escHtml(sr.sr_number)}')">Delete</button>` : ''}
        </div>
      </div>

      ${routeSteps?.length ? `<div class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="section-title">Route Progress</div>
            <div style="font-size:.73rem;color:var(--text-3);margin-top:2px">${escHtml(sr.route_name??'')}</div>
          </div>
          <span style="font-size:.73rem;color:var(--text-2)">Step ${sr.current_step} of ${routeSteps.length}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0;overflow-x:auto;padding-bottom:8px">
          ${routeSteps.map((step, i) => {
            const done    = i < sr.current_step
            const current = i === sr.current_step - 1
            return `<div style="display:flex;align-items:center;gap:6px;min-width:fit-content">
              <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                <div class="step-dot ${done?'done':current?'current':''}" title="${escHtml(step.name??'')}">${i+1}</div>
                <span style="font-size:.65rem;color:${done?'var(--accent-lg)':current?'var(--text-1)':'var(--text-3)'};max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center" title="${escHtml(step.name??'')}">${escHtml(step.name??'')}</span>
              </div>
              ${i < routeSteps.length-1 ? `<div class="step-connector ${done?'done':''}" style="margin-bottom:16px"></div>` : ''}
            </div>`
          }).join('')}
        </div>
      </div>` : ''}

      <div class="grid-2 mb-4">
        <div class="card">
          <div class="label-xs mb-3">SR Details</div>
          ${detailRow('Issue Type', escHtml(sr.issue_type??'—'))}
          ${detailRow('Priority', priBadge(sr.priority))}
          ${detailRow('Status', stsBadge(sr.status))}
          ${detailRow('Owner', escHtml(sr.owner_name??'—'))}
          ${detailRow('Reporter', escHtml(sr.creator_name??'—'))}
          ${detailRow('Reported', fmtDate(sr.reported_at))}
          ${sr.closed_at ? detailRow('Closed', fmtDate(sr.closed_at)) : ''}
          ${sr.drive_folder_url ? `<div class="detail-row">
            <span class="detail-label">Drive Folder</span>
            <a href="${escHtml(sr.drive_folder_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:.73rem">Open →</a>
          </div>` : ''}
        </div>
        <div class="card">
          <div class="label-xs mb-3">Customer Info</div>
          ${detailRow('Account', escHtml(sr.account??'—'))}
          ${detailRow('Contact', escHtml(sr.customer_name??'—'))}
          ${detailRow('Phone', escHtml(sr.customer_contact??'—'))}
          ${detailRow('Email', escHtml(sr.customer_email??'—'))}
        </div>
      </div>

      <div class="card mb-4">
        <div class="section-title mb-3">Issue Description</div>
        <p style="color:var(--text-2);font-size:.875rem;line-height:1.75;white-space:pre-wrap">${escHtml(sr.issue_description??'')}</p>
        ${sr.resolution ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div style="font-size:.73rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:8px">Resolution</div>
          <p style="color:var(--text-2);font-size:.875rem;line-height:1.75;white-space:pre-wrap">${escHtml(sr.resolution)}</p>
        </div>` : ''}
      </div>

      ${automatedSteps.length ? `
      <div class="card mb-4">
        <div class="flex items-center gap-2 mb-4">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-lg)" stroke-width="1.75"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          <div class="section-title">Automated Step Emails</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${automatedSteps.map(step => {
            const log = emailLogs?.find(l => l.step_id === step.id)
            let statusBadge = '', statusText = '', actionBtn = '', errorHtml = ''
            const isPast = step.step_order <= sr.current_step

            if (log) {
              const atts = log.attempts || 1
              if (log.status === 'sent') {
                statusBadge = '<span class="badge badge-sent">Sent</span>'
                statusText  = `<span style="font-size:.73rem;color:var(--text-2)">Delivered to <strong style="color:var(--text-1)">${escHtml(log.recipient)}</strong> · ${fmtDateS(log.sent_at)}</span>`
                actionBtn   = `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();retriggerAutomatedEmail('${id}','${step.id}')">Resend</button>`
              } else if (log.status === 'failed') {
                statusBadge = '<span class="badge badge-failed">Failed</span>'
                statusText  = `<span style="font-size:.73rem;color:var(--text-2)">Failed · ${atts} attempt${atts>1?'s':''} · ${escHtml(log.recipient)}</span>`
                actionBtn   = `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();retriggerAutomatedEmail('${id}','${step.id}')">Retry</button>`
                if (log.error_msg) errorHtml = `<div style="margin-top:6px;padding:8px 10px;background:rgba(239,68,68,.06);border-left:3px solid var(--red);border-radius:4px;font-size:.72rem;color:var(--text-2);font-family:var(--mono)">Error: ${escHtml(log.error_msg)}</div>`
              } else {
                statusBadge = '<span class="badge badge-pending">Pending</span>'
                statusText  = `<span style="font-size:.73rem;color:var(--text-2)">Pending · ${escHtml(log.recipient)}</span>`
                actionBtn   = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();retriggerAutomatedEmail('${id}','${step.id}')">Send Now</button>`
              }
            } else if (isPast) {
              statusBadge = '<span class="badge badge-not-sent">Not Sent</span>'
              statusText  = `<span style="font-size:.73rem;color:var(--text-2)">Step completed but email was not triggered</span>`
              actionBtn   = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();retriggerAutomatedEmail('${id}','${step.id}')">Send Now</button>`
            } else {
              statusBadge = '<span class="badge badge-scheduled">Scheduled</span>'
              statusText  = `<span style="font-size:.73rem;color:var(--text-2)">Triggers automatically on step ${step.step_order} completion</span>`
              actionBtn   = `<button class="btn btn-ghost btn-sm" style="opacity:.5" onclick="event.stopPropagation();retriggerAutomatedEmail('${id}','${step.id}')">Pre-send</button>`
            }

            const cardStatus = log?.status || (isPast?'not-sent':'scheduled')
            return `<div class="email-log-card status-${cardStatus}">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <div class="step-dot ${isPast?'done':''}" style="width:22px;height:22px;font-size:.65rem">${step.step_order}</div>
                  <div style="min-width:0">
                    <div style="font-weight:600;font-size:.83rem;color:var(--text-1)">${escHtml(step.name)}</div>
                    <div style="margin-top:2px">${statusText}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  ${statusBadge}
                  ${actionBtn}
                </div>
              </div>
              ${errorHtml}
            </div>`
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${history?.length ? `<div class="card">
        <div class="section-title mb-3">Stage History</div>
        <div class="divide-y">
          ${history.map(h=>`<div class="flex justify-between items-center" style="padding:8px 0;font-size:.8rem">
            <span style="color:var(--text-2)">Step ${h.from_step??0} → Step ${h.to_step}</span>
            <span style="color:var(--text-3);font-size:.73rem">${escHtml(h.advanced_by_user?.name??'—')} · ${fmtDateS(h.advanced_at)}</span>
          </div>`).join('')}
        </div>
      </div>` : ''}`

    window.sendEmailModal = sendEmailModal
    window.doSendEmail = doSendEmail
    window.openAdvanceModal = openAdvanceModal
    window.advEmailYes = advEmailYes
    window.advEmailNo = advEmailNo
    window.confirmAdvance = confirmAdvance
    window.openCloseModal = openCloseModal
    window.closeSR = closeSR
    window.reopenSR = reopenSR
    window.sendWA = sendWA
    window.sendWABySRId = sendWABySRId
    window.openDeleteSRModal = openDeleteSRModal
    window.deleteSR = deleteSR
  } catch(e) {
    container.innerHTML = pageError('Could not load service request', e.message, true, 'sr')
  }
}

async function openAdvanceModal(srId, currentStep, totalSteps) {
  const sb = getSupabase()
  const { data:templates } = await sb.from('templates').select('*').eq('type','email').eq('is_active',true).order('name')
  const nextStep = currentStep + 1

  const { data:sr } = await sb.from('sr').select('route_id').eq('id',srId).single()
  let stepAutoEmail = null
  if (sr?.route_id) {
    const { data:step } = await sb.from('route_steps').select('*').eq('route_id',sr.route_id).eq('step_order',nextStep).maybeSingle()
    stepAutoEmail = step?.email_enabled ? step : null
  }

  modal(`
    <div class="modal-header">
      <div class="modal-title">Advance to Step ${nextStep}</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      ${stepAutoEmail ? `<div class="alert alert-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span>Automated email is configured for step <strong>"${escHtml(stepAutoEmail.name)}"</strong> and will send automatically.</span>
      </div>` : ''}
      <div>
        <div class="form-label mb-3">Send additional manual email for this step?</div>
        <div class="flex gap-2">
          <button class="btn btn-ghost flex-1" id="adv-yes" style="justify-content:center" onclick="advEmailYes()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Yes, send email
          </button>
          <button class="btn btn-secondary flex-1" id="adv-no" style="justify-content:center" onclick="advEmailNo()">Skip email</button>
        </div>
      </div>
      <div id="tpl-picker" class="hidden">
        <div class="form-group">
          <label class="form-label">Select Template</label>
          ${!templates?.length
            ? `<div class="alert alert-warning">No active email templates. <button class="btn btn-ghost btn-sm" onclick="navigate('templates')">Create one →</button></div>`
            : `<select class="form-select" id="adv-tpl">
                ${templates.map(t=>`<option value="${t.id}">${escHtml(t.name??'')}</option>`).join('')}
               </select>`}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" id="adv-confirm" disabled onclick="confirmAdvance('${srId}',${currentStep},${totalSteps})">
        Advance Step
      </button>
    </div>
  `, 'modal-sm')
}

function advEmailYes() {
  document.getElementById('adv-yes').className = 'btn btn-primary flex-1'
  document.getElementById('adv-yes').style.justifyContent = 'center'
  document.getElementById('adv-no').className = 'btn btn-ghost flex-1'
  document.getElementById('adv-no').style.justifyContent = 'center'
  document.getElementById('tpl-picker').classList.remove('hidden')
  const btn = document.getElementById('adv-confirm')
  btn.disabled = false
  btn.textContent = 'Send Email & Advance'
  btn._emailChoice = 'yes'
}

function advEmailNo() {
  document.getElementById('adv-no').className = 'btn btn-secondary flex-1'
  document.getElementById('adv-no').style.justifyContent = 'center'
  document.getElementById('adv-yes').className = 'btn btn-ghost flex-1'
  document.getElementById('adv-yes').style.justifyContent = 'center'
  document.getElementById('tpl-picker').classList.add('hidden')
  const btn = document.getElementById('adv-confirm')
  btn.disabled = false
  btn.textContent = 'Advance Step'
  btn._emailChoice = 'no'
}

async function confirmAdvance(srId, currentStep, totalSteps) {
  const sb = getSupabase()
  const me = appState.get('user')
  const btn = document.getElementById('adv-confirm')
  const emailChoice = btn._emailChoice
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Working…'
  const nextStep = currentStep + 1

  try {
    if (emailChoice === 'yes') {
      const tplId = document.getElementById('adv-tpl')?.value
      await sendEmailFromBrowser(srId, tplId||null)
    }

    try {
      const { data:srInfo } = await sb.from('sr').select('route_id').eq('id',srId).single()
      if (srInfo?.route_id) {
        const { data:step } = await sb.from('route_steps').select('*').eq('route_id',srInfo.route_id).eq('step_order',currentStep).maybeSingle()
        if (step?.email_enabled) {
          await triggerStepEmail(srId, step.id, false)
        }
      }
    } catch(e) {}

    await sb.from('sr').update({ current_step:nextStep, status:'In Progress' }).eq('id', srId)
    await sb.from('sr_stage_history').insert({ sr_id:srId, from_step:currentStep, to_step:nextStep, advanced_by:me.id })
    await auditLog('SR_STAGE_ADVANCE', srId, 'sr', `Advanced to step ${nextStep}`)

    closeModalForce()
    toast(`✓ Step ${nextStep} reached${emailChoice==='yes'?' · Email sent':''}`)
    navigate('sr-detail', { id:srId })
  } catch(e) {
    btn.disabled = false
    btn.textContent = emailChoice==='yes'?'Send Email & Advance':'Advance Step'
    btn._emailChoice = emailChoice
    toast('Failed to advance step: '+e.message, 'error')
  }
}

function openCloseModal(srId) {
  modal(`
    <div class="modal-header">
      <div class="modal-title">Close Service Request</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Resolution Summary</label>
        <textarea class="form-textarea" id="close-res" rows="4" placeholder="Describe how the issue was resolved…"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" onclick="closeSR('${srId}')">Confirm Close</button>
    </div>
  `, 'modal-sm')
}

async function closeSR(srId) {
  const sb = getSupabase()
  const me = appState.get('user')
  const res = document.getElementById('close-res')?.value ?? ''
  const now = new Date().toISOString()
  await sb.from('sr').update({ status:'Closed', resolution:res||null, closed_at:now, closed_by:me.id }).eq('id', srId)
  await auditLog('SR_CLOSE', srId, 'sr', 'Closed SR')
  try {
    await syncSheetsRow(srId, 'Closed', now, res)
  } catch(e) {
    toast('Note: Google Sheets sync may have failed', 'warning')
  }
  closeModalForce()
  toast('✓ SR closed successfully')
  navigate('sr-detail', { id:srId })
}

async function reopenSR(srId) {
  const sb = getSupabase()
  const me = appState.get('user')
  await sb.from('sr').update({ status:'Open', closed_at:null, closed_by:null }).eq('id', srId)
  await auditLog('SR_REOPEN', srId, 'sr', 'Reopened SR')
  toast('✓ SR reopened')
  navigate('sr-detail', { id:srId })
}

function openDeleteSRModal(srId, srNumber) {
  modal(`
    <div class="modal-header">
      <div class="modal-title">Delete SR</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="alert alert-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Are you sure you want to delete <strong>${escHtml(srNumber)}</strong>? This will remove the Drive folder and sheet row.</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-danger" onclick="deleteSR('${srId}','${escHtml(srNumber)}')">Delete SR</button>
    </div>
  `, 'modal-sm')
}

async function deleteSR(srId, srNumber) {
  const sb = getSupabase()
  const btn = document.querySelector('.modal-footer .btn-danger')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Deleting…' }
  try {
    await Promise.allSettled([
      deleteSRDriveFolder(srNumber),
      deleteSRSheetRow(srNumber),
    ])
    await sb.from('sr').delete().eq('id', srId)
    await auditLog('SR_DELETE', srId, 'sr', `Deleted SR ${srNumber}`)
    closeModalForce()
    toast('✓ SR deleted')
    navigate('sr')
  } catch(e) {
    toast('Delete failed: ' + e.message, 'error')
    if (btn) { btn.disabled = false; btn.textContent = 'Delete SR' }
  }
}

async function sendWA(srId, phone, srNum, status, custName) {
  if (!phone) { toast('No phone number on this SR', 'error'); return }
  const message = `Hello ${custName||'there'}, your service request *${srNum}* status is now: *${status}*. Thank you.`
  const sb = getSupabase()
  const me = appState.get('user')
  try {
    const r = await fetch(`${CFG.waBridgeUrl}/send`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(15000),
    })
    const d = await r.json()
    if (d.ok) {
      await sb.from('notification_logs').insert({ channel:'whatsapp', sr_id:srId, recipient:phone, body:message, status:'sent', sent_by:me.id })
      toast('✓ WhatsApp sent')
    } else toast(`✗ ${d.error}`, 'error')
  } catch(e) { toast('✗ WhatsApp bridge offline', 'error') }
}

async function sendWABySRId(srId) {
  const sb = getSupabase()
  const { data:sr } = await sb.from('sr_list').select('customer_contact,customer_name,sr_number,status').eq('id',srId).single()
  if (!sr) { toast('Could not load SR', 'error'); return }
  await sendWA(srId, sr.customer_contact??'', sr.sr_number, sr.status, sr.customer_name??'')
}

export default { render }
