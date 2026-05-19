// app/(app)/sr/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import SRActions from '@/components/sr/SRActions'
import SRComments from '@/components/sr/SRComments'
import SRRouteProgress from '@/components/sr/SRRouteProgress'

export const dynamic = 'force-dynamic'

export default async function SRDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('*').eq('id', user!.id).single()

  const { data: sr } = await supabase.from('sr_list').select('*').eq('id', id).single()
  if (!sr) notFound()
  if (!profile) redirect('/login')

  const [
    { data: comments },
    { data: attachments },
    { data: history },
    { data: routeSteps },
    { data: notifLogs },
  ] = await Promise.all([
    supabase.from('sr_comments').select('*,user:users(name,role)').eq('sr_id', id).order('created_at'),
    supabase.from('sr_attachments').select('*,user:users(name)').eq('sr_id', id).order('uploaded_at'),
    supabase.from('sr_stage_history').select('*,user:users(name)').eq('sr_id', id).order('advanced_at', { ascending: false }),
    sr.route_id
      ? supabase.from('route_steps').select('*').eq('route_id', sr.route_id).order('step_order')
      : Promise.resolve({ data: [] }),
    supabase.from('notification_logs').select('*').eq('sr_id', id).order('sent_at', { ascending: false }).limit(10),
  ])

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
            <Link href="/sr" style={{ color:'var(--text-muted)', textDecoration:'none', fontSize:'0.8rem' }}>
              ← Service Requests
            </Link>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', color:'var(--accent)', fontWeight:700 }}>
              {sr.sr_number}
            </span>
            <h1 style={{ fontSize:'1.2rem' }}>{sr.title}</h1>
          </div>
          <div style={{ display:'flex', gap:'8px', marginTop:'8px', flexWrap:'wrap' }}>
            <PriBadge p={sr.priority} />
            <StsBadge s={sr.status} />
            {sr.route_name && (
              <span className="badge" style={{ background:'var(--bg-elevated)', color:'var(--text-secondary)' }}>
                📍 {sr.route_name}
              </span>
            )}
          </div>
        </div>
        <SRActions sr={sr} profile={profile} totalSteps={routeSteps?.length ?? 0} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'20px', alignItems:'start' }}>
        {/* Left column */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Route progress */}
          {routeSteps && routeSteps.length > 0 && (
            <SRRouteProgress steps={routeSteps} currentStep={sr.current_step} />
          )}

          {/* Issue details */}
          <div className="card">
            <h3 style={{ marginBottom:'14px' }}>Issue Details</h3>
            <dl style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:'10px 0', fontSize:'0.875rem' }}>
              <Dl label="Issue Type" value={sr.issue_type ?? '—'} />
              <Dl label="Description">
                <p style={{ whiteSpace:'pre-wrap', lineHeight:1.6 }}>{sr.issue_description}</p>
              </Dl>
              {sr.resolution && (
                <Dl label="Resolution">
                  <p style={{ whiteSpace:'pre-wrap', lineHeight:1.6, color:'var(--accent)' }}>{sr.resolution}</p>
                </Dl>
              )}
            </dl>
          </div>

          {/* Comments */}
          <SRComments srId={id} comments={comments ?? []} profile={profile} />

          {/* Notification log */}
          {notifLogs && notifLogs.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom:'12px' }}>Communication Log</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {notifLogs.map(n => (
                  <div key={n.id} style={{ display:'flex', gap:'10px', fontSize:'0.8rem', padding:'8px 10px', background:'var(--bg-elevated)', borderRadius:'var(--radius)' }}>
                    <span style={{ color: n.channel==='email' ? 'var(--blue)' : 'var(--green)', fontWeight:600, textTransform:'uppercase', fontSize:'0.65rem', width:'60px', flexShrink:0 }}>
                      {n.channel}
                    </span>
                    <span style={{ flex:1, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      To: {n.recipient} {n.subject ? `· ${n.subject}` : ''}
                    </span>
                    <span style={{ color: n.status==='sent' ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                      {n.status}
                    </span>
                    <span style={{ color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'0.7rem', whiteSpace:'nowrap' }}>
                      {fmt(n.sent_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {/* Meta */}
          <div className="card">
            <h4 style={{ marginBottom:'12px' }}>SR Details</h4>
            <dl style={{ display:'flex', flexDirection:'column', gap:'8px', fontSize:'0.8rem' }}>
              <MetaRow label="Owner" value={sr.owner_name} />
              <MetaRow label="Creator" value={sr.creator_name} />
              <MetaRow label="Account" value={sr.account ?? '—'} />
              <MetaRow label="Reported" value={fmtFull(sr.reported_at)} />
              <MetaRow label="Updated" value={fmtFull(sr.updated_at)} />
              {sr.closed_at && <MetaRow label="Closed" value={fmtFull(sr.closed_at)} />}
              {sr.drive_folder_url && (
                <div style={{ display:'flex', justifyContent:'space-between', paddingTop:'4px', borderTop:'1px solid var(--border)' }}>
                  <span style={{ color:'var(--text-muted)' }}>Drive Folder</span>
                  <a href={sr.drive_folder_url} target="_blank" rel="noreferrer"
                    style={{ color:'var(--accent)', textDecoration:'none', fontSize:'0.75rem' }}>
                    Open ↗
                  </a>
                </div>
              )}
            </dl>
          </div>

          {/* Customer */}
          <div className="card">
            <h4 style={{ marginBottom:'12px' }}>Customer</h4>
            <dl style={{ display:'flex', flexDirection:'column', gap:'8px', fontSize:'0.8rem' }}>
              <MetaRow label="Name" value={sr.customer_name ?? '—'} />
              <MetaRow label="Contact" value={sr.customer_contact ?? '—'} />
              <MetaRow label="Email" value={sr.customer_email ?? '—'} />
            </dl>
          </div>

          {/* Stage history */}
          {history && history.length > 0 && (
            <div className="card">
              <h4 style={{ marginBottom:'12px' }}>Stage History</h4>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {history.map(h => (
                  <div key={h.id} style={{ fontSize:'0.78rem' }}>
                    <div style={{ color:'var(--text-secondary)' }}>
                      Step {h.from_step ?? 0} → {h.to_step} · {(h.user as any)?.name}
                    </div>
                    {h.notes && <div style={{ color:'var(--text-muted)', marginTop:'2px' }}>{h.notes}</div>}
                    <div style={{ color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'0.7rem', marginTop:'2px' }}>
                      {fmtFull(h.advanced_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {attachments && attachments.length > 0 && (
            <div className="card">
              <h4 style={{ marginBottom:'12px' }}>Attachments ({attachments.length})</h4>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {attachments.map(a => (
                  <a key={a.id} href={a.drive_url} target="_blank" rel="noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px',
                      background:'var(--bg-elevated)', borderRadius:'var(--radius)', textDecoration:'none',
                      fontSize:'0.78rem', color:'var(--text-secondary)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {a.file_name}
                    </span>
                    <span style={{ color:'var(--accent)' }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Dl({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <>
      <dt style={{ color:'var(--text-muted)', alignSelf:'start', paddingTop:'1px' }}>{label}</dt>
      <dd style={{ color:'var(--text-primary)' }}>{children ?? value}</dd>
    </>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:'12px' }}>
      <span style={{ color:'var(--text-muted)' }}>{label}</span>
      <span style={{ color:'var(--text-primary)', textAlign:'right' }}>{value}</span>
    </div>
  )
}

function PriBadge({ p }: { p: string }) {
  const m: Record<string,string> = { Low:'badge-low', Medium:'badge-medium', High:'badge-high', Critical:'badge-critical' }
  return <span className={`badge ${m[p]??'badge-low'}`}><span className="badge-dot"/>{p}</span>
}

function StsBadge({ s }: { s: string }) {
  const m: Record<string,string> = { 'Open':'badge-open','In Progress':'badge-in-progress','Pending':'badge-pending','Closed':'badge-closed','Archived':'badge-archived' }
  return <span className={`badge ${m[s]??'badge-closed'}`}>{s}</span>
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}
