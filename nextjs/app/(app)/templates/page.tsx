'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Template, TemplateType } from '@/types'

const TYPES: TemplateType[] = ['email','whatsapp','closure','escalation','reminder']
const PLACEHOLDERS = [
  '{{sr_number}}','{{customer_name}}','{{owner_name}}','{{issue_type}}',
  '{{issue_description}}','{{status}}','{{priority}}','{{resolution}}',
  '{{resolved_date}}','{{reported_date}}','{{company_name}}','{{sr_url}}',
  '{{account}}','{{sla_breach_time}}',
]

const TYPE_COLOR: Record<string,string> = {
  email:'badge-open', whatsapp:'badge-in-progress', closure:'badge-closed',
  escalation:'badge-high', reminder:'badge-pending',
}

export default function TemplatesPage() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected, setSelected] = useState<Template | null>(null)
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [filterType, setFilterType] = useState<TemplateType | ''>('')
  const [msg, setMsg] = useState('')

  const [form, setForm] = useState({ name:'', type:'email' as TemplateType, subject:'', body:'' })
  const [editForm, setEditForm] = useState<Template | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
    setUserRole(profile?.role ?? '')
    const { data } = await supabase.from('templates').select('*').order('type').order('name')
    setTemplates(data ?? [])
    setLoading(false)
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const placeholders = PLACEHOLDERS.filter(p => form.body.includes(p) || form.subject.includes(p))
    await supabase.from('templates').insert({
      name: form.name, type: form.type,
      subject: form.subject || null, body: form.body,
      placeholders, created_by: user!.id,
    })
    setShowNew(false)
    setForm({ name:'', type:'email', subject:'', body:'' })
    setSaving(false)
    load()
  }

  async function saveEdit() {
    if (!editForm) return
    setSaving(true)
    const placeholders = PLACEHOLDERS.filter(p => editForm.body.includes(p) || (editForm.subject ?? '').includes(p))
    await supabase.from('templates').update({
      name: editForm.name, subject: editForm.subject || null,
      body: editForm.body, placeholders,
    }).eq('id', editForm.id)
    setMsg('✓ Saved')
    setTimeout(() => setMsg(''), 3000)
    setSaving(false)
    setSelected(editForm)
    load()
  }

  async function toggleActive(t: Template) {
    await supabase.from('templates').update({ is_active: !t.is_active }).eq('id', t.id)
    load()
    if (selected?.id === t.id) setSelected({ ...t, is_active: !t.is_active })
    if (editForm?.id === t.id) setEditForm({ ...editForm, is_active: !t.is_active })
  }

  function insertPlaceholder(ph: string) {
    if (!editForm) return
    setEditForm(f => f ? { ...f, body: f.body + ph } : f)
  }

  function selectTemplate(t: Template) {
    setSelected(t)
    setEditForm({ ...t })
    setMsg('')
  }

  const canEdit = ['Admin','Manager'].includes(userRole)
  const filtered = templates.filter(t => !filterType || t.type === filterType)

  if (loading) return <div style={{ color:'var(--text-muted)', padding:'40px', textAlign:'center' }}>Loading…</div>

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Templates</div>
          <div className="page-subtitle">Email and WhatsApp message templates with placeholders</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New Template
          </button>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:'16px', alignItems:'start' }}>

        {/* Template list */}
        <div>
          <div style={{ marginBottom:'8px' }}>
            <select className="form-select" value={filterType}
              onChange={e => setFilterType(e.target.value as any)} style={{ width:'100%' }}>
              <option value="">All Types</option>
              {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {filtered.map(t => (
              <div key={t.id}
                className="card card-sm"
                style={{
                  cursor:'pointer', opacity: t.is_active ? 1 : 0.5,
                  borderColor: selected?.id === t.id ? 'var(--accent)' : 'var(--border)',
                  background: selected?.id === t.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                }}
                onClick={() => selectTemplate(t)}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' }}>
                  <span className={`badge ${TYPE_COLOR[t.type] ?? 'badge-closed'}`} style={{ fontSize:'0.6rem' }}>{t.type}</span>
                  {!t.is_active && <span className="badge badge-closed" style={{ fontSize:'0.6rem' }}>inactive</span>}
                </div>
                <div style={{ fontWeight:600, fontSize:'0.8rem' }}>{t.name}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ color:'var(--text-muted)', fontSize:'0.8rem', padding:'20px', textAlign:'center' }}>
                No templates found
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div>
          {!editForm ? (
            <div className="card" style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-muted)' }}>
              <div style={{ fontSize:'2rem', marginBottom:'8px' }}>📄</div>
              <div>Select a template to view and edit it</div>
            </div>
          ) : (
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
                <h3>{editForm.name}</h3>
                <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                  {msg && <span style={{ fontSize:'0.78rem', color:'var(--green)' }}>{msg}</span>}
                  {canEdit && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(editForm)}>
                        {editForm.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Template Name</label>
                    <input className="form-input" value={editForm.name}
                      onChange={e => setEditForm(f => f ? {...f, name:e.target.value} : f)}
                      disabled={!canEdit} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <input className="form-input" value={editForm.type} disabled
                      style={{ opacity:0.6 }} />
                  </div>
                </div>

                {editForm.type === 'email' && (
                  <div className="form-group">
                    <label className="form-label">Email Subject</label>
                    <input className="form-input" value={editForm.subject ?? ''}
                      onChange={e => setEditForm(f => f ? {...f, subject:e.target.value} : f)}
                      disabled={!canEdit} placeholder="Email subject line…" />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Message Body</label>
                  <textarea className="form-textarea" rows={12}
                    style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}
                    value={editForm.body}
                    onChange={e => setEditForm(f => f ? {...f, body:e.target.value} : f)}
                    disabled={!canEdit} />
                </div>

                {canEdit && (
                  <div>
                    <div className="form-label" style={{ marginBottom:'6px' }}>Insert Placeholder</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                      {PLACEHOLDERS.map(ph => (
                        <button key={ph} type="button" className="btn btn-ghost btn-sm"
                          style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', padding:'2px 6px' }}
                          onClick={() => insertPlaceholder(ph)}>
                          {ph}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview of active placeholders */}
                {editForm.placeholders?.length > 0 && (
                  <div>
                    <div className="form-label" style={{ marginBottom:'6px' }}>Active Placeholders</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                      {editForm.placeholders.map(ph => (
                        <span key={ph} className="badge" style={{ background:'var(--accent-dim)', color:'var(--accent)', fontFamily:'var(--font-mono)', fontSize:'0.65rem' }}>
                          {ph}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Template Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">New Template</div></div>
            <form onSubmit={createTemplate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required">Template Name</label>
                    <input className="form-input" required value={form.name}
                      onChange={e => setForm(f => ({...f, name:e.target.value}))}
                      placeholder="e.g. SR Created — Customer ACK" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={form.type}
                      onChange={e => setForm(f => ({...f, type:e.target.value as TemplateType}))}>
                      {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                {form.type === 'email' && (
                  <div className="form-group">
                    <label className="form-label">Email Subject</label>
                    <input className="form-input" value={form.subject}
                      onChange={e => setForm(f => ({...f, subject:e.target.value}))} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label required">Body</label>
                  <textarea className="form-textarea" rows={8} required value={form.body}
                    style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}
                    onChange={e => setForm(f => ({...f, body:e.target.value}))}
                    placeholder="Write your template here. Use {{sr_number}}, {{customer_name}}, etc." />
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom:'6px' }}>Click to insert placeholder</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                    {PLACEHOLDERS.map(ph => (
                      <button key={ph} type="button" className="btn btn-ghost btn-sm"
                        style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', padding:'2px 6px' }}
                        onClick={() => setForm(f => ({...f, body: f.body+ph}))}>
                        {ph}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>Create Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
