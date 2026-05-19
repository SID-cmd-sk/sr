'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, UserRole } from '@/types'

const ROLES: UserRole[] = ['Admin','Manager','Technical','User','Viewer']

export default function UsersClient({ initialUsers, currentUserId }: { initialUsers: User[]; currentUserId: string }) {
  const supabase = createClient()
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [showInvite, setShowInvite] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [invite, setInvite] = useState({ name:'', email:'', role:'User' as UserRole })
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function refresh() {
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data ?? [])
  }

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault()
    setLoading('invite')
    const r = await fetch('/api/admin/invite-user', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(invite),
    })
    const d = await r.json()
    setMsg(d.ok ? `✓ Invitation sent to ${invite.email}` : `✗ ${d.error}`)
    if (d.ok) { setShowInvite(false); setInvite({ name:'', email:'', role:'User' }); refresh() }
    setLoading(null)
  }

  async function updateUser(id: string, updates: Partial<User>) {
    setLoading(id)
    await supabase.from('users').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    setEditUser(null)
    refresh()
    setLoading(null)
  }

  async function toggleStatus(u: User) {
    const newStatus = u.status === 'active' ? 'inactive' : 'active'
    await updateUser(u.id, { status: newStatus })
  }

  const roleClass = (r: string) => `badge badge-${r.toLowerCase()}`

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-subtitle">{users.length} users in system</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Invite User
        </button>
      </div>

      {msg && (
        <div className={`alert ${msg.startsWith('✓') ? 'alert-success' : 'alert-error'} mb-4`}>
          {msg}
          <button onClick={() => setMsg('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'inherit' }}>✕</button>
        </div>
      )}

      <div className="card" style={{ padding:0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Team</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ opacity: u.status === 'inactive' ? 0.55 : 1 }}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{
                      width:'28px', height:'28px', borderRadius:'50%', flexShrink:0,
                      background:'var(--bg-elevated)', border:'1px solid var(--border)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:'0.7rem', fontWeight:700, color:'var(--text-secondary)',
                    }}>
                      {u.name[0]}
                    </div>
                    <span style={{ fontWeight:500 }}>{u.name}</span>
                    {u.id === currentUserId && (
                      <span style={{ fontSize:'0.65rem', color:'var(--accent)', background:'var(--accent-dim)', padding:'1px 5px', borderRadius:'4px' }}>you</span>
                    )}
                  </div>
                </td>
                <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{u.email}</td>
                <td><span className={roleClass(u.role)}>{u.role}</span></td>
                <td style={{ color:'var(--text-muted)', fontSize:'0.8rem' }}>{u.team ?? '—'}</td>
                <td>
                  <span className={`badge ${u.status === 'active' ? 'badge-in-progress' : 'badge-closed'}`}>
                    {u.status}
                  </span>
                </td>
                <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-muted)' }}>
                  {new Date(u.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                </td>
                <td>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditUser(u)}>Edit</button>
                    {u.id !== currentUserId && (
                      <button className="btn btn-ghost btn-sm"
                        style={{ color: u.status === 'active' ? 'var(--yellow)' : 'var(--green)' }}
                        onClick={() => toggleStatus(u)}
                        disabled={loading === u.id}>
                        {u.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Invite New User</div>
            </div>
            <form onSubmit={inviteUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Full Name</label>
                  <input className="form-input" required value={invite.name}
                    onChange={e => setInvite(i => ({...i, name: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Email Address</label>
                  <input className="form-input" type="email" required value={invite.email}
                    onChange={e => setInvite(i => ({...i, email: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={invite.role}
                    onChange={e => setInvite(i => ({...i, role: e.target.value as UserRole}))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="alert alert-info" style={{ fontSize:'0.8rem' }}>
                  An email with login instructions will be sent to the user.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowInvite(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading === 'invite'}>
                  {loading === 'invite' ? 'Sending…' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Edit User: {editUser.name}</div>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={editUser.role}
                  onChange={e => setEditUser(u => u ? {...u, role: e.target.value as UserRole} : null)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Team</label>
                <input className="form-input" value={editUser.team ?? ''}
                  onChange={e => setEditUser(u => u ? {...u, team: e.target.value} : null)} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" type="tel" value={editUser.phone ?? ''}
                  onChange={e => setEditUser(u => u ? {...u, phone: e.target.value} : null)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => updateUser(editUser.id, editUser)}
                disabled={loading === editUser.id}>
                {loading === editUser.id ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
