// app/(app)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function StatCard({ label, value, color, sub }: {
  label: string; value: number | string; color: string; sub?: string
}) {
  return (
    <div className="stat-card" style={{ '--accent-color': color } as React.CSSProperties}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('*').eq('id', user!.id).single()

  // Fetch stats
  const { data: stats } = await supabase.from('dashboard_stats').select('*').single()

  // Recent SRs
  const { data: recentSRs } = await supabase
    .from('sr_list')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8)

  // Activity count
  const { count: actCount } = await supabase
    .from('activities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Open')

  // Overdue: open SRs older than 48h with no route
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { count: overdueCount } = await supabase
    .from('sr')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Open')
    .lt('reported_at', fortyEightHoursAgo)

  const s = stats ?? { total_sr: 0, open_sr: 0, in_progress_sr: 0, pending_sr: 0, closed_sr: 0, critical_open: 0, in_route: 0 }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Good {greeting()}, {profile?.name?.split(' ')[0]}</div>
          <div className="page-subtitle">Here's what's happening across the system</div>
        </div>
        <Link href="/sr/new" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New SR
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))' }}>
        <StatCard label="Total SRs"    value={s.total_sr}      color="var(--blue)"   />
        <StatCard label="Open"         value={s.open_sr}       color="var(--blue)"   />
        <StatCard label="In Progress"  value={s.in_progress_sr}color="var(--accent)" />
        <StatCard label="Pending"      value={s.pending_sr}    color="var(--yellow)" />
        <StatCard label="Closed"       value={s.closed_sr}     color="var(--text-muted)" />
        <StatCard label="Critical Open"value={s.critical_open} color="var(--red)"    />
        <StatCard label="Overdue"      value={overdueCount ?? 0} color="var(--orange)" />
        <StatCard label="Activities"   value={actCount ?? 0}   color="var(--purple)" sub="open" />
      </div>

      {/* Recent SRs */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3>Recent Service Requests</h3>
          <Link href="/sr" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        {!recentSRs?.length ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="2"/>
              </svg>
            </div>
            <div className="empty-title">No service requests yet</div>
            <div className="empty-desc">Create your first SR to get started</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>SR #</th>
                <th>Title</th>
                <th>Account</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {recentSRs.map(sr => (
                <tr key={sr.id}>
                  <td>
                    <Link href={`/sr/${sr.id}`}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}>
                      {sr.sr_number}
                    </Link>
                  </td>
                  <td style={{ maxWidth: '220px' }} className="truncate">{sr.title}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{sr.account ?? '—'}</td>
                  <td><PriorityBadge p={sr.priority} /></td>
                  <td><StatusBadge s={sr.status} /></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{sr.owner_name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {fmtDate(sr.reported_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function PriorityBadge({ p }: { p: string }) {
  const cls: Record<string,string> = { Low:'badge-low', Medium:'badge-medium', High:'badge-high', Critical:'badge-critical' }
  return <span className={`badge ${cls[p]??'badge-low'}`}><span className="badge-dot" />{p}</span>
}

function StatusBadge({ s }: { s: string }) {
  const cls: Record<string,string> = {
    'Open':'badge-open','In Progress':'badge-in-progress','Pending':'badge-pending',
    'Closed':'badge-closed','Archived':'badge-archived'
  }
  return <span className={`badge ${cls[s]??'badge-closed'}`}>{s}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
