'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User, Route, SRPriority, SRStatus } from '@/types'

const ISSUE_TYPES = [
  'Hardware Failure','Software Issue','Network Problem','Access & Permissions',
  'Email Issue','Printer Problem','Installation','Configuration',
  'Performance Issue','Security Concern','Data Recovery','Training Request','Other',
]

const PRIORITIES: SRPriority[] = ['Low','Medium','High','Critical']
const STATUSES: SRStatus[] = ['Open','In Progress','Pending','Closed','Archived']

export default function EditSRPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [me, setMe] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '', account: '', customer_name: '', customer_contact: '',
    customer_email: '', issue_type: '', issue_description: '',
    priority: 'Medium' as SRPriority, status: 'Open' as SRStatus,
    owner_id: '', route_id: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: profile }, { data: sr }, { data: allUsers }, { data: allRoutes }] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase.from('sr_list').select('*').eq('id', id).single(),
        supabase.from('users').select('*').eq('status','active').order('name'),
        supabase.from('routes').select('*').eq('is_active',true).order('name'),
      ])
      setMe(profile)
      setUsers(allUsers ?? [])
      setRoutes(allRoutes ?? [])
      if (sr) {
        setForm({
          title: sr.title ?? '',
          account: sr.account ?? '',
          customer_name: sr.customer_name ?? '',
          customer_contact: sr.customer_contact ?? '',
          customer_email: sr.customer_email ?? '',
          issue_type: sr.issue_type ?? '',
          issue_description: sr.issue_description ?? '',
          priority: sr.priority ?? 'Medium',
          status: sr.status ?? 'Open',
          owner_id: sr.owner_id ?? '',
          route_id: sr.route_id ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [id])

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.issue_description) { setError('Title and description are required.'); return }
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('sr').update({
      title: form.title,
      account: form.account || null,
      customer_name: form.customer_name || null,
      customer_contact: form.customer_contact || null,
      customer_email: form.customer_email || null,
      issue_type: form.issue_type || null,
      issue_description: form.issue_description,
      priority: form.priority,
      status: form.status,
      owner_id: form.owner_id || undefined,
      route_id: form.route_id || null,
    }).eq('id', id)

    if (err) { setError(err.message); setSaving(false); return }

    await supabase.from('audit_log').insert({
      action: 'SR_EDIT', user_id: user!.id,
      target_id: id, target_type: 'sr',
      description: `Edited SR`,
    })

    router.push(`/sr/${id}`)
    router.refresh()
  }

  const canReassign = me && ['Admin','Manager'].includes(me.role)

  if (loading) return (
    <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}>Loading…</div>
  )

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Edit Service Request</div>
          <div className="page-subtitle">Update SR details</div>
        </div>
        <button onClick={() => router.back()} className="btn btn-ghost">← Cancel</button>
      </div>

      <form onSubmit={submit} style={{ maxWidth: '760px' }}>
        {error && <div className="alert alert-error mb-4">{error}</div>}

        <div className="card mb-4">
          <h3 style={{ marginBottom: '16px' }}>SR Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label required">Title / Summary</label>
              <input className="form-input" value={form.title}
                onChange={e => set('title', e.target.value)} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Issue Type</label>
                <select className="form-select" value={form.issue_type} onChange={e => set('issue_type', e.target.value)}>
                  <option value="">Select type…</option>
                  {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required">Priority</label>
                <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value as SRPriority)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => set('status', e.target.value as SRStatus)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Issue Description</label>
              <textarea className="form-textarea" rows={4} value={form.issue_description}
                onChange={e => set('issue_description', e.target.value)} required />
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <h3 style={{ marginBottom: '16px' }}>Customer Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Account / Company</label>
              <input className="form-input" value={form.account} onChange={e => set('account', e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Contact Name</label>
                <input className="form-input" value={form.customer_name} onChange={e => set('customer_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Number</label>
                <input className="form-input" type="tel" value={form.customer_contact} onChange={e => set('customer_contact', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" value={form.customer_email} onChange={e => set('customer_email', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <h3 style={{ marginBottom: '16px' }}>Assignment & Route</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {canReassign && (
              <div className="form-group">
                <label className="form-label">Owner</label>
                <select className="form-select" value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                  <option value="">Select owner…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Route</label>
              <select className="form-select" value={form.route_id} onChange={e => set('route_id', e.target.value)}>
                <option value="">No route — manual handling</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancel</button>
        </div>
      </form>
    </>
  )
}
