'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import { can } from '@/types'

interface SR {
  id: string; sr_number: string; status: string; current_step: number
  route_id: string | null; resolution?: string | null; owner_id: string
  total_steps?: number  // passed from parent so advance can be bounded
}

export default function SRActions({ sr, profile, totalSteps = 0 }: {
  sr: SR; profile: User; totalSteps?: number
}) {
  const router = useRouter()
  const supabase = createClient()
  const role = profile.role

  const [showClose, setShowClose] = useState(false)
  const [resolution, setResolution] = useState(sr.resolution ?? '')
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function advanceStep() {
    const nextStep = sr.current_step + 1
    if (totalSteps > 0 && nextStep > totalSteps) {
      setMsg('✗ Already at the last step')
      return
    }
    setLoading('advance')
    const { error } = await supabase.from('sr').update({
      current_step: nextStep,
      status: 'In Progress',
    }).eq('id', sr.id)
    if (error) { setMsg(`✗ ${error.message}`); setLoading(null); return }
    await supabase.from('sr_stage_history').insert({
      sr_id: sr.id, from_step: sr.current_step, to_step: nextStep,
      advanced_by: profile.id,
    })
    await supabase.from('audit_log').insert({
      action: 'SR_STAGE_ADVANCE', user_id: profile.id, target_id: sr.id, target_type: 'sr',
      description: `Advanced ${sr.sr_number} to step ${nextStep}`,
    })
    setLoading(null); router.refresh()
  }

  async function closeSR() {
    setLoading('close')
    const now = new Date().toISOString()
    const { error } = await supabase.from('sr').update({
      status: 'Closed', resolution, closed_at: now, closed_by: profile.id,
    }).eq('id', sr.id)
    if (error) { setMsg(`✗ ${error.message}`); setLoading(null); return }
    await supabase.from('audit_log').insert({
      action: 'SR_CLOSE', user_id: profile.id, target_id: sr.id, target_type: 'sr',
      description: `Closed ${sr.sr_number}`,
    })
    // Sync to Sheets via Drive API (non-blocking)
    fetch('/api/drive/update-sr-row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sr_id: sr.id, status: 'Closed', resolved_at: now, resolution }),
    }).catch(() => {})
    setShowClose(false); setLoading(null); router.refresh()
  }

  async function reopenSR() {
    setLoading('reopen')
    const { error } = await supabase.from('sr').update({
      status: 'Open', closed_at: null, closed_by: null
    }).eq('id', sr.id)
    if (error) { setMsg(`✗ ${error.message}`); setLoading(null); return }
    await supabase.from('audit_log').insert({
      action: 'SR_REOPEN', user_id: profile.id, target_id: sr.id, target_type: 'sr',
      description: `Reopened ${sr.sr_number}`,
    })
    setLoading(null); router.refresh()
  }

  async function sendEmail() {
    setLoading('email'); setMsg('')
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sr_id: sr.id, type: 'update' }),
    })
    const data = await res.json()
    setMsg(data.ok ? '✓ Email sent' : `✗ ${data.error}`)
    setLoading(null)
  }

  async function sendWA() {
    setLoading('wa'); setMsg('')
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sr_id: sr.id, type: 'update' }),
    })
    const data = await res.json()
    setMsg(data.ok ? '✓ WhatsApp sent' : `✗ ${data.error}`)
    setLoading(null)
  }

  const isClosed = sr.status === 'Closed' || sr.status === 'Archived'
  const isAtLastStep = totalSteps > 0 && sr.current_step >= totalSteps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>

        {sr.route_id && !isClosed && can(role, 'canAdvanceRoute') && !isAtLastStep && (
          <button className="btn btn-secondary" onClick={advanceStep} disabled={loading === 'advance'}>
            {loading === 'advance' ? '…' : '→ Next Step'}
          </button>
        )}

        {!isClosed && can(role, 'canCloseSR') && (
          <button className="btn btn-secondary" onClick={() => setShowClose(true)}>
            ✓ Close SR
          </button>
        )}

        {isClosed && can(role, 'canCloseSR') && (
          <button className="btn btn-ghost" onClick={reopenSR} disabled={loading === 'reopen'}>
            ↩ Reopen
          </button>
        )}

        <button className="btn btn-ghost" onClick={sendEmail} disabled={loading === 'email'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          {loading === 'email' ? '…' : 'Email'}
        </button>

        <button className="btn btn-ghost" onClick={sendWA} disabled={loading === 'wa'}
          style={{ color: 'var(--green)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          {loading === 'wa' ? '…' : 'WhatsApp'}
        </button>

        {(can(role, 'canReassign') || profile.id === sr.owner_id) && (
          <a href={`/sr/${sr.id}/edit`} className="btn btn-ghost">Edit</a>
        )}
      </div>

      {msg && (
        <div style={{ fontSize: '0.75rem', color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </div>
      )}

      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Close Service Request</div>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Resolution Summary</label>
                <textarea className="form-textarea" rows={4}
                  placeholder="Describe how the issue was resolved…"
                  value={resolution} onChange={e => setResolution(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowClose(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={closeSR} disabled={loading === 'close'}>
                {loading === 'close' ? 'Closing…' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
