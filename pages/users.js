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

function edgeUrl(name) {
  return `${CFG.supabaseUrl}/functions/v1/${name}`
}

function fetchWithTimeout(url, opts, ms = 20000) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t))
}

async function authHeaders() {
  const sb = getSupabase()
  const { data } = await sb?.auth?.getSession() || { data: null }
  const token = data?.session?.access_token || ''
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
}

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
                    ${me?.role === 'Admin' ? `<button class="btn btn-ghost btn-sm" onclick="openChangePassword('${u.id}')">Password</button>` : ''}
                    ${me?.role === 'Admin' && u.role !== 'Admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}','${escHtml(u.email)}',this)">Delete</button>` : ''}
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

window.deleteUser = async (uid, email, btn) => {
  if (!window.confirm(`Delete ${email}? This removes their login access permanently.`)) return
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>' }
  try {
    const r = await fetchWithTimeout(edgeUrl('delete-user'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ user_id: uid }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Delete failed')
    window.toast('✓ User deleted permanently')
    navigate('users')
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete' }
    window.toast('✗ ' + e.message, 'error')
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
  if (!me) throw new Error('Not logged in')
  const { data: profile } = await sb.from('users').select('smtp_email,smtp_password,name').eq('id', me.id).single()
  if (!profile?.smtp_email || !profile?.smtp_password) throw new Error('Your SMTP email is not configured. Go to Settings → My Email first.')
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
}

window.submitInvite = async () => {
  const email = document.getElementById('inv-email')?.value?.trim()
  const name = document.getElementById('inv-name')?.value?.trim()
  const pw = document.getElementById('inv-pw')?.value
  const role = document.getElementById('inv-role')?.value
  if (!email || !name) { window.toast('Email and name are required', 'error'); return }
  if (!pw || pw.length < 6) { window.toast('Password must be at least 6 characters', 'error'); return }

  const btn = document.getElementById('inv-submit')
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Creating…'

  try {
    const r = await fetchWithTimeout(edgeUrl('create-user'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ email, password: pw, name, role }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'User creation failed')

    try {
      await sendWelcomeEmail(email, name, pw)
      window.closeModalForce()
      window.toast('✓ User created — credentials sent via email', 'success')
    } catch (emailErr) {
      window.closeModalForce()
      window.toast('✓ User created — but email failed: ' + emailErr.message, 'warning')
    }
    navigate('users')
  } catch(e) {
    btn.disabled = false
    btn.innerHTML = 'Create User'
    window.toast('✗ ' + e.message, 'error')
  }
}

window.openChangePassword = (uid) => {
  window.modal(`
    <div class="modal-header">
      <div class="modal-title">Change Password</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label req">New Password</label>
        <input class="form-input" id="cp-pw" type="password" placeholder="Min 6 characters"/>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" id="cp-submit" onclick="changePassword('${uid}')">Change Password</button>
    </div>
  `, 'modal-sm')
}

window.changePassword = async (uid) => {
  const pw = document.getElementById('cp-pw')?.value
  if (!pw || pw.length < 6) { window.toast('Password must be at least 6 characters', 'error'); return }

  const btn = document.getElementById('cp-submit')
  btn.disabled = true
  btn.innerHTML = '<span class="btn-spinner"></span> Updating…'

  try {
    const r = await fetchWithTimeout(edgeUrl('change-password'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ user_id: uid, new_password: pw }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Password change failed')

    window.closeModalForce()
    window.toast('✓ Password changed successfully')
  } catch(e) {
    btn.disabled = false
    btn.innerHTML = 'Change Password'
    window.toast('✗ ' + e.message, 'error')
  }
}
