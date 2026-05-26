import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { ROLES } from '../utils/constants.js'
import { navigate } from '../services/router.js'
import { roleBadge } from '../components/badge.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'

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
      <div class="modal-title">Invite User</div>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="closeModalForce()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="alert alert-info">User will receive a confirmation email from Supabase to activate their account.</div>
      <div class="form-group">
        <label class="form-label req">Email Address</label>
        <input class="form-input" id="inv-email" type="email" placeholder="colleague@sks3d.com"/>
      </div>
      <div class="form-group">
        <label class="form-label req">Full Name</label>
        <input class="form-input" id="inv-name" placeholder="Full Name"/>
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-select" id="inv-role">
          ${ROLES.map(r => `<option>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" onclick="submitInvite()">Create Profile</button>
    </div>
  `, 'modal-sm')
}

window.submitInvite = async () => {
  const sb = getSupabase()
  const email = document.getElementById('inv-email')?.value?.trim()
  const name = document.getElementById('inv-name')?.value?.trim()
  const role = document.getElementById('inv-role')?.value
  if (!email || !name) { window.toast('Email and name are required', 'error'); return }

  const btn = document.querySelector('.modal-footer .btn-primary')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Creating…' }

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password: 'Temp@' + Date.now().toString(36).slice(-6),
      options: { data: { name, role } },
    })
    if (error) throw error
    if (!data?.user?.id) throw new Error('User creation failed — check if signups are enabled in Supabase Auth settings')

    window.closeModalForce()
    window.toast(data.user?.email_confirmed_at ? '✓ User created' : '✓ Invitation sent — user will receive a confirmation email', 'success')
    navigate('users')
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Profile' }
    window.toast('✗ ' + e.message, 'error')
  }
}
