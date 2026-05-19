'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User, Route, UserRole, SRPriority } from '@/types'

const ISSUE_TYPES = [
  'Hardware Failure','Software Issue','Network Problem','Access & Permissions',
  'Email Issue','Printer Problem','Installation','Configuration',
  'Performance Issue','Security Concern','Data Recovery','Training Request','Other',
]

const PRIORITIES: SRPriority[] = ['Low','Medium','High','Critical']

export default function NewSRPage() {
  const router = useRouter()
  const supabase = createClient()

  const [me, setMe] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '', account: '', customer_name: '', customer_contact: '',
    customer_email: '', issue_type: '', issue_description: '',
    priority: 'Medium' as SRPriority, owner_id: '', route_id: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: profile }, { data: allUsers }, { data: allRoutes }] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase.from('users').select('id,name,email,role').eq('status','active').order('name'),
        supabase.from('routes').select('id,name').eq('is_active',true).order('name'),
      ])
      setMe(profile)
      setUsers(allUsers ?? [])
      setRoutes(allRoutes ?? [])
      // Default owner = self
      if (profile) setForm(f => ({ ...f, owner_id: profile.id }))
    }
    load()
  }, [])

  const canChooseOwner = me && ['Admin','Manager'].includes(me.role)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.issue_description) { setError('Title and description are required.'); return }
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: sr, error: err } = await supabase.from('sr').insert({
      title: form.title,
      account: form.account || null,
      customer_name: form.customer_name || null,
      customer_contact: form.customer_contact || null,
      customer_email: form.customer_email || null,
      issue_type: form.issue_type || null,
      issue_description: form.issue_description,
      priority: form.priority,
      owner_id: form.owner_id || user!.id,
      creator_id: user!.id,
      route_id: form.route_id || null,
      status: 'Open',
    }).select().single()

    if (err) { setError(err.message); setLoading(false); return }

    // Log audit
    await supabase.from('audit_log').insert({
      action: 'SR_CREATE', user_id: user!.id,
      target_id: sr.id, target_type: 'sr',
      description: `Created SR ${sr.sr_number}`,
    })

    // Trigger Drive folder creation (non-blocking — navigates immediately)
    fetch('/api/drive/sr-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sr_id: sr.id }),
    }).catch(() => {/* Drive setup runs in background */})

    router.push(`/sr/${sr.id}`)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">New Service Request</div>
          <div className="page-subtitle">Fill in the details below to create a new SR</div>
        </div>
        <button onClick={() => router.back()} className="btn btn-ghost">← Cancel</button>
      </div>

      <form onSubmit={submit} style={{ maxWidth: '760px' }}>
        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Section: SR Info */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: '16px' }}>SR Information</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-group">
              <label className="form-label required">Title / Summary</label>
              <input className="form-input" placeholder="Brief description of the issue…"
                value={form.title} onChange={e => set('title', e.target.value)} required />
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
              <label className="form-label required">Issue Description</label>
              <textarea className="form-textarea" rows={4} placeholder="Detailed description of the problem…"
                value={form.issue_description} onChange={e => set('issue_description', e.target.value)} required />
            </div>
          </div>
        </div>

        {/* Section: Customer */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: '16px' }}>Customer Details</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-group">
              <label className="form-label">Account / Company</label>
              <input className="form-input" placeholder="Company or account name"
                value={form.account} onChange={e => set('account', e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Contact Name</label>
                <input className="form-input" placeholder="Customer full name"
                  value={form.customer_name} onChange={e => set('customer_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Number</label>
                <input className="form-input" type="tel" placeholder="+91 9999999999"
                  value={form.customer_contact} onChange={e => set('customer_contact', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="customer@company.com"
                value={form.customer_email} onChange={e => set('customer_email', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Section: Assignment */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: '16px' }}>Assignment & Route</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-group">
              <label className="form-label required">Owner</label>
              {canChooseOwner ? (
                <select className="form-select" value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                  <option value="">Select owner…</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              ) : (
                <input className="form-input" value={me?.name ?? '—'} disabled
                  style={{ opacity: 0.7 }} />
              )}
              {!canChooseOwner && (
                <div className="form-hint">SR will be assigned to you automatically</div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Route (optional)</label>
              <select className="form-select" value={form.route_id} onChange={e => set('route_id', e.target.value)}>
                <option value="">No route — manual handling</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <div className="form-hint">Routes define the step-by-step workflow for this SR</div>
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:'10px' }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? 'Creating…' : 'Create Service Request'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </>
  )
}
