'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Route, RouteStep, UserRole } from '@/types'

const ROLES: UserRole[] = ['Admin','Manager','Technical','User','Viewer']

export default function RoutesPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<Route[]>([])
  const [selected, setSelected] = useState<Route | null>(null)
  const [steps, setSteps] = useState<RouteStep[]>([])
  const [userRole, setUserRole] = useState<UserRole>('User')
  const [showNew, setShowNew] = useState(false)
  const [showStep, setShowStep] = useState(false)
  const [loading, setLoading] = useState(true)

  const [newRoute, setNewRoute] = useState({ name: '', description: '' })
  const [newStep, setNewStep] = useState({
    name: '', description: '', assigned_role: 'Technical' as UserRole,
    is_required: true, sla_hours: '', escalation_hours: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
    setUserRole(profile?.role as UserRole ?? 'User')
    const { data } = await supabase.from('routes').select('*').order('name')
    setRoutes(data ?? [])
    setLoading(false)
  }

  async function selectRoute(r: Route) {
    setSelected(r)
    const { data } = await supabase.from('route_steps').select('*').eq('route_id', r.id).order('step_order')
    setSteps(data ?? [])
  }

  async function createRoute(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('routes').insert({
      name: newRoute.name, description: newRoute.description || null, created_by: user!.id
    }).select().single()
    setShowNew(false)
    setNewRoute({ name: '', description: '' })
    await load()
    if (data) selectRoute(data)
  }

  async function toggleActive(r: Route) {
    await supabase.from('routes').update({ is_active: !r.is_active }).eq('id', r.id)
    load()
    if (selected?.id === r.id) setSelected({ ...r, is_active: !r.is_active })
  }

  async function deleteRoute(id: string) {
    if (!confirm('Delete this route and all its steps?')) return
    await supabase.from('routes').delete().eq('id', id)
    if (selected?.id === id) { setSelected(null); setSteps([]) }
    load()
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) + 1 : 1
    await supabase.from('route_steps').insert({
      route_id: selected.id,
      step_order: nextOrder,
      name: newStep.name,
      description: newStep.description || null,
      assigned_role: newStep.assigned_role,
      is_required: newStep.is_required,
      sla_hours: newStep.sla_hours ? parseInt(newStep.sla_hours) : null,
      escalation_hours: newStep.escalation_hours ? parseInt(newStep.escalation_hours) : null,
    })
    setShowStep(false)
    setNewStep({ name:'', description:'', assigned_role:'Technical', is_required:true, sla_hours:'', escalation_hours:'' })
    selectRoute(selected)
  }

  async function deleteStep(stepId: string) {
    await supabase.from('route_steps').delete().eq('id', stepId)
    if (selected) selectRoute(selected)
  }

  async function moveStep(stepId: string, dir: 'up' | 'down') {
    const idx = steps.findIndex(s => s.id === stepId)
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= steps.length) return
    const a = steps[idx], b = steps[target]
    await Promise.all([
      supabase.from('route_steps').update({ step_order: b.step_order }).eq('id', a.id),
      supabase.from('route_steps').update({ step_order: a.step_order }).eq('id', b.id),
    ])
    if (selected) selectRoute(selected)
  }

  const canEdit = ['Admin','Manager'].includes(userRole)

  if (loading) return <div style={{ color:'var(--text-muted)', padding:'40px', textAlign:'center' }}>Loading…</div>

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Routes</div>
          <div className="page-subtitle">Define workflow sequences for service requests</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New Route
          </button>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'16px', alignItems:'start' }}>

        {/* Route list */}
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {routes.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:'32px', color:'var(--text-muted)', fontSize:'0.875rem' }}>
              No routes yet. Create one to define workflow steps.
            </div>
          )}
          {routes.map(r => (
            <div key={r.id}
              className="card card-sm"
              style={{
                cursor:'pointer', borderColor: selected?.id === r.id ? 'var(--accent)' : 'var(--border)',
                background: selected?.id === r.id ? 'var(--accent-dim)' : 'var(--bg-card)',
              }}
              onClick={() => selectRoute(r)}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:'0.875rem', marginBottom:'2px' }}>{r.name}</div>
                  {r.description && <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.description}</div>}
                </div>
                <span className={`badge ${r.is_active ? 'badge-in-progress' : 'badge-closed'}`} style={{ fontSize:'0.6rem', flexShrink:0 }}>
                  {r.is_active ? 'Active' : 'Off'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Steps panel */}
        <div>
          {!selected ? (
            <div className="card" style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-muted)' }}>
              <div style={{ fontSize:'2rem', marginBottom:'8px' }}>→</div>
              <div>Select a route to view and edit its steps</div>
            </div>
          ) : (
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', gap:'12px' }}>
                <div>
                  <h3>{selected.name}</h3>
                  {selected.description && <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:'2px' }}>{selected.description}</div>}
                </div>
                {canEdit && (
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(selected)}>
                      {selected.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteRoute(selected.id)}>Delete</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowStep(true)}>+ Add Step</button>
                  </div>
                )}
              </div>

              {steps.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)', fontSize:'0.875rem' }}>
                  No steps yet. {canEdit ? 'Click "+ Add Step" to build the workflow.' : ''}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {steps.sort((a,b) => a.step_order - b.step_order).map((step, i) => (
                    <div key={step.id} style={{
                      display:'flex', gap:'12px', alignItems:'flex-start',
                      padding:'12px 14px', background:'var(--bg-elevated)',
                      borderRadius:'var(--radius)', border:'1px solid var(--border)',
                    }}>
                      {/* Order badge */}
                      <div style={{
                        width:'28px', height:'28px', borderRadius:'50%', flexShrink:0,
                        background:'var(--accent)', color:'var(--text-inverse)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontWeight:800, fontSize:'0.75rem',
                      }}>{step.step_order}</div>

                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                          <span style={{ fontWeight:600, fontSize:'0.875rem' }}>{step.name}</span>
                          {!step.is_required && (
                            <span className="badge" style={{ background:'var(--bg-card)', color:'var(--text-muted)', fontSize:'0.6rem' }}>Optional</span>
                          )}
                          {step.assigned_role && (
                            <span className={`badge badge-${step.assigned_role.toLowerCase()}`} style={{ fontSize:'0.6rem' }}>{step.assigned_role}</span>
                          )}
                        </div>
                        {step.description && <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{step.description}</div>}
                        <div style={{ display:'flex', gap:'12px', marginTop:'4px', fontSize:'0.7rem', color:'var(--text-muted)' }}>
                          {step.sla_hours && <span>⏱ SLA: {step.sla_hours}h</span>}
                          {step.escalation_hours && <span>🔔 Escalate after: {step.escalation_hours}h</span>}
                        </div>
                      </div>

                      {canEdit && (
                        <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveStep(step.id,'up')} disabled={i===0} title="Move up">↑</button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveStep(step.id,'down')} disabled={i===steps.length-1} title="Move down">↓</button>
                          <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteStep(step.id)} title="Delete step">✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Route Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Create Route</div></div>
            <form onSubmit={createRoute}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Route Name</label>
                  <input className="form-input" required value={newRoute.name}
                    onChange={e => setNewRoute(r => ({...r, name: e.target.value}))}
                    placeholder="e.g. Standard Support Flow" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows={2} value={newRoute.description}
                    onChange={e => setNewRoute(r => ({...r, description: e.target.value}))}
                    placeholder="What is this route for?" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Route</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Step Modal */}
      {showStep && (
        <div className="modal-overlay" onClick={() => setShowStep(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Add Step to: {selected?.name}</div></div>
            <form onSubmit={addStep}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Step Name</label>
                  <input className="form-input" required value={newStep.name}
                    onChange={e => setNewStep(s => ({...s, name: e.target.value}))}
                    placeholder="e.g. Initial Contact" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows={2} value={newStep.description}
                    onChange={e => setNewStep(s => ({...s, description: e.target.value}))} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Assigned Role</label>
                    <select className="form-select" value={newStep.assigned_role}
                      onChange={e => setNewStep(s => ({...s, assigned_role: e.target.value as UserRole}))}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Required?</label>
                    <select className="form-select" value={newStep.is_required ? 'yes' : 'no'}
                      onChange={e => setNewStep(s => ({...s, is_required: e.target.value === 'yes'}))}>
                      <option value="yes">Required</option>
                      <option value="no">Optional</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">SLA (hours)</label>
                    <input className="form-input" type="number" min="1" value={newStep.sla_hours}
                      onChange={e => setNewStep(s => ({...s, sla_hours: e.target.value}))}
                      placeholder="e.g. 24" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Escalate After (hours)</label>
                    <input className="form-input" type="number" min="1" value={newStep.escalation_hours}
                      onChange={e => setNewStep(s => ({...s, escalation_hours: e.target.value}))}
                      placeholder="e.g. 48" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowStep(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Step</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
