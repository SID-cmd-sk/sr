import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { ROLES } from '../utils/constants.js'
import { navigate } from '../services/router.js'
import { roleBadge } from '../components/badge.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'
import { smtpSend } from '../services/email.js'
import { CFG } from '../utils/config.js'

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')

    if (!['Admin', 'Manager'].includes(me?.role)) {
      container.innerHTML = pageError('Access Denied', 'You need Admin or Manager role to view this page.')
      return
    }

    container.innerHTML = skeletonPage()

    try {
      const { data: users } = await sb.from('users').select('*').order('name')

      container.innerHTML = `
        <div class="page-header">
          <div>
            <div class="page-title">Users</div>
            <div class="page-subtitle">${users?.length ?? 0} team members</div>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary" onclick="openInviteUser()">+ Invite User</button>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div class="table-wrap" style="border:none;border-radius:0 0 var(--r-lg) var(--r-lg)">
            <table class="data-table"><thead><tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Email Config</th><th>Actions</th>
            </tr></thead><tbody>
              ${users?.map(u => `<tr>
                <td style="font-weight:600">${escHtml(u.name ?? '—')}</td>
                <td style="font-size:.78rem;color:var(--text-2)">${escHtml(u.email)}</td>
                <td>${roleBadge(u.role)}</td>
                <td><span class="badge ${u.status === 'active' ? 'badge-in-progress' : 'badge-closed'}">${u.status}</span></td>
                <td>${u.smtp_email ? `<span class="badge badge-sent">✓ ${escHtml(u.smtp_email)}</span>` : '<span class="badge badge-not-sent">Not set</span>'}</td>
                <td>
                  <div class="flex gap-2 items-center">
                    <select class="form-select" style="width:auto;padding:5px 8px;font-size:.75rem" onchange="updateUserRole('${u.id}',this.value)">
                      ${ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                    <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.id}','${u.status}')">${u.status === 'active' ? 'Disable' : 'Enable'}</button>
                  </div>
                </td>
              </tr>`).join('') ?? ''}
            </tbody></table>
          </div>
        </div>`
    } catch (e) {
      container.innerHTML = pageError('Could not load users', e.message, true, 'users')
    }
  }
}

window.updateUserRole = async (uid, role) => {
  const sb = getSupabase()
  await sb.from('users').update({ role }).eq('id', uid)
  window.toast('✓ Role updated')
}

window.toggleUserStatus = async (uid, current) => {
  const sb = getSupabase()
  await sb.from('users').update({ status: current === 'active' ? 'inactive' : 'active' }).eq('id', uid)
  window.toast('✓ Status updated')
  navigate('users')
}

window.openInviteUser = () => {
  window.modal(`
    <div class="modal-header">
      <div class="modal-title">Create User</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label req">Email</label>
          <input class="form-input" id="inv-email" type="email" placeholder="user@sks3d.com"/>
        </div>
        <div class="form-group">
          <label class="form-label req">Full Name</label>
          <input class="form-input" id="inv-name" placeholder="Full Name"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label req">Password</label>
          <input class="form-input" id="inv-pw" type="password" placeholder="Min 6 chars"/>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="inv-role">
            ${ROLES.map(r => `<option>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row" style="border-top:1px solid var(--border-md);padding-top:14px;margin-top:6px">
        <div class="form-group">
          <label class="form-label">SMTP Email</label>
          <input class="form-input" id="inv-smtp-email" type="email" placeholder="smtp user email"/>
        </div>
        <div class="form-group">
          <label class="form-label">SMTP Password</label>
          <input class="form-input" id="inv-smtp-pw" type="password" placeholder="SMTP password"/>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" id="inv-submit" onclick="submitInvite()">Create User</button>
    </div>
  `, 'modal-sm')
}

async function sendWelcomeEmail(newEmail, newName, newPw) {
  const sb = getSupabase()
  const me = appState.get('user')
  if (!me) return false
  const { data: profile } = await sb.from('users').select('smtp_email,smtp_password,name').eq('id', me.id).single()
  if (!profile?.smtp_email || !profile?.smtp_password) return false
  const company = 'SKS 3D'
  const subject = `Welcome to ${company} — Your Account Credentials`
  const body = `Hello ${newName},

Your account has been created on the SR Platform.

Here are your login credentials:
  Email    : ${newEmail}
  Password : ${newPw}

Login at: https://sid-cmd-sk.github.io/sr/app.html

For any questions or to change your password, please contact ${profile.name}.

Best regards,
${company}`
  try {
    await smtpSend({
      host: CFG.smtpHost,
      port: CFG.smtpPort,
      username: profile.smtp_email,
      password: profile.smtp_password,
      to: newEmail,
      from: `${profile.name} <${profile.smtp_email}>`,
      subject,
      body,
    })
    return true
  } catch (e) {
    return false
  }
}

window.submitInvite = async () => {
  const sb = getSupabase()
  const email = document.getElementById('inv-email')?.value?.trim()
  const name = document.getElementById('inv-name')?.value?.trim()
  const pw = document.getElementById('inv-pw')?.value
  const role = document.getElementById('inv-role')?.value
  const smtpEmail = document.getElementById('inv-smtp-email')?.value?.trim() || null
  const smtpPw = document.getElementById('inv-smtp-pw')?.value || null
  if (!email || !name) { window.toast('Email and name are required', 'error'); return }
  if (!pw || pw.length < 6) { window.toast('Password must be at least 6 characters', 'error'); return }

  const btn = document.getElementById('inv-submit')
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Creating…'

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password: pw,
      options: { data: { name, role } },
    })
    if (error) throw error
    if (!data?.user?.id) throw new Error('User creation failed — check if signups are enabled in Supabase Auth settings')

    if (smtpEmail || smtpPw) {
      await sb.from('users').update({
        ...(smtpEmail && { smtp_email: smtpEmail }),
        ...(smtpPw && { smtp_password: smtpPw }),
      }).eq('id', data.user.id)
    }

    const emailed = await sendWelcomeEmail(email, name, pw)
    window.closeModalForce()
    window.toast(emailed ? '✓ User created — credentials sent via email' : '✓ User created — email notification skipped', 'success')
    navigate('users')
  } catch(e) {
    btn.disabled = false
    btn.innerHTML = 'Create User'
    window.toast('✗ ' + e.message, 'error')
  }
}
