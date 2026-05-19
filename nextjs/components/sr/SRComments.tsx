'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'

interface Comment { id: string; body: string; created_at: string; user?: { name: string; role: string } | null }

export default function SRComments({ srId, comments, profile }: {
  srId: string; comments: Comment[]; profile: User
}) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    await supabase.from('sr_comments').insert({ sr_id: srId, user_id: profile.id, body: body.trim() })
    setBody('')
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom:'14px' }}>Comments ({comments.length})</h3>

      {/* Comment list */}
      {comments.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'16px' }}>
          {comments.map(c => (
            <div key={c.id} style={{ display:'flex', gap:'10px', fontSize:'0.875rem' }}>
              <div style={{
                width:'28px', height:'28px', borderRadius:'50%', flexShrink:0,
                background:'var(--bg-elevated)', border:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'0.65rem', fontWeight:700, color:'var(--text-secondary)',
              }}>
                {c.user?.name?.[0] ?? '?'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:'8px', alignItems:'baseline', marginBottom:'4px' }}>
                  <span style={{ fontWeight:600, fontSize:'0.8rem' }}>{c.user?.name ?? 'Unknown'}</span>
                  <span className={`badge badge-${(c.user?.role ?? 'user').toLowerCase()}`} style={{ fontSize:'0.6rem' }}>
                    {c.user?.role}
                  </span>
                  <span style={{ color:'var(--text-muted)', fontSize:'0.7rem', fontFamily:'var(--font-mono)', marginLeft:'auto' }}>
                    {new Date(c.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
                <p style={{ color:'var(--text-secondary)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add comment */}
      {profile.role !== 'Viewer' && (
        <form onSubmit={submit} style={{ display:'flex', gap:'8px' }}>
          <textarea
            className="form-textarea"
            placeholder="Add a comment…"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={2}
            style={{ resize:'none', flex:1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !body.trim()}
            style={{ alignSelf:'flex-end' }}>
            {saving ? '…' : 'Post'}
          </button>
        </form>
      )}
    </div>
  )
}
