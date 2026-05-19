'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Activity, User, ActivityType, ActivityStatus } from '@/types'

const TYPES: ActivityType[] = ['Call','Follow-up','Site Visit','Internal Reminder','Coordination','Pre-Sales','Support Note','Other']
const STATUSES: ActivityStatus[] = ['Open','In Progress','Done','Cancelled']

const STATUS_COLOR: Record<string, string> = {
  'Open':'badge-open','In Progress':'badge-in-progress','Done':'badge-in-progress','Cancelled':'badge-closed'
}

export default function ActivitiesPage() {
  const supabase = createClient()
  const [me, setMe] = useState<User | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState<ActivityStatus | ''>('')
  const [q, setQ] = useState('')

  const [form, setForm] = useState({
    title:'', type:'Call' as ActivityType, notes:'', account:'',
    contact_name:'', contact_phone:'', due_date:'', owner_id:'',
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: profile }, { data: acts }, { data: allUsers }] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('activities').select('*,owner:users(name,email)').order('created_at', { ascending: false }).limit(100),
      supabase.from('users').select('id,name,email,role').eq('status','active').order('name'),
    ])
    setMe(profile)
    setActivities(acts ?? [])
    setUsers(allUsers ?? [])
    if (profile) setForm(f => ({ ...f, owner_id: profile.id }))
    setLoading(false)
  }

  async function createActivity(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({
      title: form.title, type: form.type, notes: form.notes || null,
      account: form.account || null, contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      due_date: form.due_date || null,
      owner_id: form.owner_id || user!.id,
      creator_id: user!.id, status: 'Open',
    })
    setShowNew(false)
    setForm(f => ({ ...f, title:'', notes:'', account:'', contact_name:'', contact_phone:'', due_date:'' }))
    load()
  }

  async function updateStatus(id: string, status: ActivityStatus) {
    await supabase.from('activities').update({
      status,
      closed_at: status === 'Done' ? new Date().toISOString() : null
    }).eq('id', id)
    load()
  }

  const filtered = activities
    .filter(a => !filter || a.status === filter)
    .filter(a => !q || a.title.toLowerCase().includes(q.toLowerCase()) ||
      (a.account ?? '').toLowerCase().includes(q.toLowerCase()))

  if (loading) return <div style={{ color:'var(--text-muted)', padding:'40px', textAlign:'center' }}>Loading…</div>

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Activities</div>
          <div className="page-subtitle">Internal tasks and work without SR</div>
        </div>
        {me?.role !== 'Viewer' && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Activity
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-wrap">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input className="form-input" placeholder="Search activities…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="form-select" value={filter} onChange={e => setFilter(e.target.value as any)} style={{ width:'auto' }}>
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Activity cards */}
      {!filtered.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12v4m-2-2h4"/>
            </svg>
          </div>
          <div className="empty-title">No activities found</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {filtered.map(a => (
            <div key={a.id} className="card card-sm" style={{ display:'flex', alignItems:'center', gap:'14px' }}>
              {/* Type dot */}
              <div style={{
                width:'8px', height:'8px', borderRadius:'50%', flexShrink:0,
                background: a.status === 'Done' ? 'var(--accent)' : a.status === 'Cancelled' ? 'var(--text-muted)' : 'var(--blue)',
              }} />

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'2px' }}>
                  <span style={{ fontWeight:600, fontSize:'0.875rem' }}>{a.title}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-muted)' }}>{a.activity_no}</span>
                  <span className={`badge ${STATUS_COLOR[a.status] ?? 'badge-closed'}`} style={{ fontSize:'0.65rem' }}>{a.status}</span>
                  <span className="badge" style={{ background:'var(--bg-elevated)', color:'var(--text-muted)', fontSize:'0.65rem' }}>{a.type}</span>
                </div>
                <div style={{ display:'flex', gap:'12px', fontSize:'0.75rem', color:'var(--text-muted)' }}>
                  {a.account && <span>🏢 {a.account}</span>}
                  {a.contact_name && <span>👤 {a.contact_name}</span>}
                  {a.due_date && <span>📅 {fmt(a.due_date)}</span>}
                  <span>Owner: {(a.owner as any)?.name}</span>
                </div>
              </div>

              {/* Status actions */}
              {me?.role !== 'Viewer' && a.status !== 'Done' && a.status !== 'Cancelled' && (
                <div style={{ display:'flex', gap:'6px' }}>
                  {a.status === 'Open' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(a.id, 'In Progress')}>
                      Start
                    </button>
                  )}
                  {a.status === 'In Progress' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(a.id, 'Done')}>
                      ✓ Done
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ color:'var(--text-muted)' }}
                    onClick={() => updateStatus(a.id, 'Cancelled')}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Activity Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">New Activity</div>
            </div>
            <form onSubmit={createActivity}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Title</label>
                  <input className="form-input" required value={form.title}
                    onChange={e => setForm(f => ({...f, title: e.target.value}))}
                    placeholder="What needs to be done?" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={form.type}
                      onChange={e => setForm(f => ({...f, type: e.target.value as ActivityType}))}>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input className="form-input" type="date" value={form.due_date}
                      onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Account</label>
                    <input className="form-input" value={form.account}
                      onChange={e => setForm(f => ({...f, account: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Name</label>
                    <input className="form-input" value={form.contact_name}
                      onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={3} value={form.notes}
                    onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                    placeholder="Any additional notes…" />
                </div>
                {['Admin','Manager'].includes(me?.role ?? '') && (
                  <div className="form-group">
                    <label className="form-label">Assign To</label>
                    <select className="form-select" value={form.owner_id}
                      onChange={e => setForm(f => ({...f, owner_id: e.target.value}))}>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Activity</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
}
