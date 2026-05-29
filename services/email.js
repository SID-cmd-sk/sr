import { getSupabase } from './supabase.js'
import { appState } from './app-state.js'
import { auditLog } from './audit.js'
import { CFG } from '../utils/config.js'

function edgeUrl(name) {
  return `${CFG.supabaseUrl}/functions/v1/${name}`
}

async function authHeaders() {
  const sb = getSupabase()
  const { data } = await sb?.auth?.getSession() || { data: null }
  const token = data?.session?.access_token || ''
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
}

export async function smtpSend({ host, port, username, password, to, from: fromAddr, subject, body }) {
  const ac = new AbortController()
  const tid = setTimeout(() => ac.abort(), 15000)
  try {
    const res = await fetch(edgeUrl('send-email'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ host, port, username, password, to, from: fromAddr || username, subject, body }),
      signal: ac.signal,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) throw new Error(json.error || `Email error ${res.status}`)
    return 'OK'
  } finally {
    clearTimeout(tid)
  }
}

export function replacePlaceholders(str, sr, senderName, extra = {}) {
  if (!str) return ''
  const map = {
    sr_number: sr.sr_number ?? '',
    customer_name: sr.customer_name ?? '',
    owner_name: sr.owner_name ?? '',
    issue_type: sr.issue_type ?? '',
    issue_description: sr.issue_description ?? '',
    status: sr.status ?? '',
    priority: sr.priority ?? '',
    resolution: sr.resolution ?? '',
    company_name: senderName,
    account: sr.account ?? '',
    route_name: sr.route_name ?? '',
    name: extra.name || sr.customer_name || '',
    email: extra.email || sr.customer_email || '',
    step_name: extra.step_name || '',
    completion_time: extra.completion_time || new Date().toLocaleString(),
    company: extra.company || sr.account || '',
    assigned_user: extra.assigned_user || sr.owner_name || '',
  }
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '')
}

export async function sendEmailFromBrowser(srId, templateId = null, customSubject = null, customBody = null, forcedRecipient = null, extraPlaceholders = {}) {
  const me = appState.get('user')
  if (!me) return false
  const sb = getSupabase()
  const { data:profile } = await sb.from('users').select('smtp_email,smtp_password,name').eq('id', me.id).single()
  if (!profile?.smtp_email || !profile?.smtp_password) {
    return false
  }

  let recipient = null, subject = customSubject, body = customBody

  if (srId) {
    const { data:sr } = await sb.from('sr_list').select('*').eq('id', srId).single()
    if (sr) {
      recipient = forcedRecipient || sr.customer_email
      if (templateId) {
        const { data:tpl } = await sb.from('templates').select('*').eq('id', templateId).single()
        if (tpl) {
          subject = subject || replacePlaceholders(tpl.subject || '', sr, profile.name || profile.smtp_email, extraPlaceholders)
          body = body || replacePlaceholders(tpl.body || '', sr, profile.name || profile.smtp_email, extraPlaceholders)
        }
      }
      subject = subject || `Update on Service Request ${sr.sr_number}`
      body = body || `Your SR ${sr.sr_number} status is now: ${sr.status}`
    }
  }

  if (!recipient) return false

  try {
    await smtpSend({
      host: CFG.smtpHost,
      port: CFG.smtpPort,
      username: profile.smtp_email,
      password: profile.smtp_password,
      to: recipient,
      from: `${profile.name || profile.smtp_email} <${profile.smtp_email}>`,
      subject,
      body,
    })
    await sb.from('notification_logs').insert({ channel:'email', sr_id:srId, recipient, subject, body, template_id:templateId||null, status:'sent', sent_by:me.id })
    await auditLog('EMAIL_SENT', srId, 'sr', `Email sent to ${recipient}`)
    return true
  } catch(e) {
    return false
  }
}

export async function triggerStepEmail(srId, stepId, forceSend = false) {
  const me = appState.get('user')
  if (!me) return false
  const sb = getSupabase()
  try {
    const [{ data:step, error:stepErr }, { data:sr, error:srErr }] = await Promise.all([
      sb.from('route_steps').select('*').eq('id', stepId).single(),
      sb.from('sr_list').select('*').eq('id', srId).single(),
    ])
    if (stepErr || !step) return false
    if (srErr || !sr) return false

    if (!forceSend) {
      const { data:existingLog } = await sb.from('step_email_logs').select('*').eq('sr_id',srId).eq('step_id',stepId).maybeSingle()
      if (existingLog?.status === 'sent') return true
    }

    const { data:profile } = await sb.from('users').select('smtp_email,smtp_password,name').eq('id', me.id).single()
    if (!profile?.smtp_email || !profile?.smtp_password) {
      await upsertEmailLog(srId, stepId, { status:'failed', error_msg:'SMTP credentials not configured', recipient:'(not configured)', subject:'', body:'' })
      return false
    }

    const recipients = []
    const recTokens = (step.email_recipients || 'customer').split(',').map(s => s.trim().toLowerCase())
    for (const token of recTokens) {
      if (token === 'customer' && sr.customer_email) { recipients.push(sr.customer_email) }
      else if (token === 'owner' && sr.owner_email) { recipients.push(sr.owner_email) }
      else if (token === 'creator') {
        const { data:creator } = await sb.from('users').select('email').eq('id', sr.creator_id).single()
        if (creator?.email) recipients.push(creator.email)
      } else if (token.includes('@')) { recipients.push(token) }
    }
    const recipientStr = [...new Set(recipients)].filter(Boolean).join(', ')

    if (!recipientStr) {
      await upsertEmailLog(srId, stepId, { status:'failed', error_msg:'No valid recipient email resolved', recipient:'(none)', subject:'', body:'' })
      return false
    }

    let rawSubj = step.email_subject, rawBody = step.email_body
    if (step.email_template && (!rawSubj || !rawBody)) {
      const { data:tpl } = await sb.from('templates').select('*').eq('id', step.email_template).single()
      if (tpl) { rawSubj = rawSubj || tpl.subject; rawBody = rawBody || tpl.body }
    }

    const senderName = profile.name || profile.smtp_email
    const finalSubj = rawSubj || `Update on Service Request ${sr.sr_number}`
    const finalBody = rawBody || `Your SR ${sr.sr_number} status is now: ${sr.status}`

    const evalPH = str => {
      if (!str) return ''
      const map = {
        name: sr.customer_name||'', email:sr.customer_email||'',
        step_name: step.name||'', route_name:sr.route_name||'',
        completion_time: new Date().toLocaleString(), company:senderName,
        assigned_user: sr.owner_name||'', sr_number:sr.sr_number||'',
        customer_name: sr.customer_name||'', owner_name:sr.owner_name||'',
        issue_type: sr.issue_type||'', status:sr.status||'',
        priority: sr.priority||'', resolution:sr.resolution||'—',
        company_name: senderName, account:sr.account||'',
      }
      return str.replace(/\{\{(\w+)\}\}/g, (_,k) => map[k]??'')
    }

    const subject = evalPH(finalSubj)
    const body = evalPH(finalBody)

    const { data:currentLog } = await sb.from('step_email_logs').select('*').eq('sr_id',srId).eq('step_id',stepId).maybeSingle()
    const attempts = (currentLog?.attempts||0) + 1

    try {
      await smtpSend({
        host: CFG.smtpHost,
        port: CFG.smtpPort,
        username: profile.smtp_email,
        password: profile.smtp_password,
        to: recipientStr,
        from: `${senderName} <${profile.smtp_email}>`,
        subject,
        body,
      })
      await upsertEmailLog(srId, stepId, { status:'sent', recipient:recipientStr, subject, body, attempts, sent_at:new Date().toISOString(), error_msg:null }, currentLog?.id)
      await sb.from('notification_logs').insert({ channel:'email', sr_id:srId, recipient:recipientStr, subject, body, template_id:step.email_template||null, status:'sent', sent_by:me.id })
      await auditLog('EMAIL_SENT', srId, 'sr', `Auto email sent to ${recipientStr} for step "${step.name}"`)
      return true
    } catch(smtpErr) {
      const errMsg = smtpErr.message || 'SMTP exception'
      await upsertEmailLog(srId, stepId, { status:'failed', recipient:recipientStr||'(error)', subject:subject||'', body:body||'', attempts, error_msg:errMsg }, currentLog?.id).catch(()=>{})
      return false
    }
  } catch(e) {
    return false
  }
}

export async function upsertEmailLog(srId, stepId, logData, existingId = null) {
  const sb = getSupabase()
  const payload = {
    sr_id: srId,
    step_id: stepId,
    status: logData.status,
    recipient: logData.recipient || '(unknown)',
    subject: logData.subject || '',
    body: logData.body || '',
    attempts: logData.attempts || 1,
    error_msg: logData.error_msg || null,
    last_attempt_at: new Date().toISOString(),
    ...(logData.sent_at ? { sent_at: logData.sent_at } : {}),
  }
  if (existingId) {
    await sb.from('step_email_logs').update(payload).eq('id', existingId)
  } else {
    await sb.from('step_email_logs').insert(payload)
  }
}

export async function sendEmailModal(srId) {
  const me = appState.get('user')
  if (!me) return
  const sb = getSupabase()
  const { data:templates } = await sb.from('templates').select('*').eq('type','email').eq('is_active',true).order('name')
  const hasCreds = !!me.smtp_email
  const modalRoot = document.getElementById('modal-root')
  if (!modalRoot) return
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModalForce()">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Send Email</div>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          ${!hasCreds ? `<div class="alert alert-warning">Email credentials not configured. Go to Settings → My Email first.</div>` : ''}
          <div class="form-group">
            <label class="form-label">Template (optional)</label>
            <select class="form-select" id="em-tpl">
              <option value="">No template — custom message</option>
              ${templates?.map(t => `<option value="${t.id}">${t.name ?? ''}</option>`).join('') ?? ''}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-input" id="em-subj" placeholder="(uses template subject if set)"/>
          </div>
          <div class="form-group">
            <label class="form-label">Message</label>
            <textarea class="form-textarea" id="em-body" rows="4" placeholder="(uses template body if template selected)"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
          <button class="btn btn-primary" onclick="doSendEmail('${srId}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send Email
          </button>
        </div>
      </div>
    </div>`
  modalRoot.classList.add('active')
}

export async function doSendEmail(srId) {
  const tplId = document.getElementById('em-tpl')?.value
  const subj = document.getElementById('em-subj')?.value
  const body = document.getElementById('em-body')?.value
  const modalRoot = document.getElementById('modal-root')
  if (modalRoot) {
    modalRoot.classList.remove('active')
    modalRoot.innerHTML = ''
  }
  return sendEmailFromBrowser(srId, tplId||null, subj||null, body||null)
}
