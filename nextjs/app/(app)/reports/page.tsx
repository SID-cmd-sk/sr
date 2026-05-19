'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ReportData {
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  byOwner: { name: string; open: number; closed: number; total: number }[]
  byIssueType: { type: string; count: number }[]
  recentClosed: any[]
  avgResolutionHours: number | null
  totalThisMonth: number
  closedThisMonth: number
}

export default function ReportsPage() {
  const supabase = createClient()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  useEffect(() => { load() }, [range])

  async function load() {
    setLoading(true)

    const now = new Date()
    let fromDate: string | null = null
    if (range === '7d')  fromDate = new Date(now.getTime() - 7  * 86400000).toISOString()
    if (range === '30d') fromDate = new Date(now.getTime() - 30 * 86400000).toISOString()
    if (range === '90d') fromDate = new Date(now.getTime() - 90 * 86400000).toISOString()

    let q = supabase.from('sr').select('id,status,priority,owner_id,issue_type,reported_at,closed_at,resolution')
    if (fromDate) q = q.gte('reported_at', fromDate)
    const { data: srs } = await q

    const { data: users } = await supabase.from('users').select('id,name')
    const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.name]))

    const all = srs ?? []

    // By status
    const byStatus: Record<string, number> = {}
    all.forEach(s => { byStatus[s.status] = (byStatus[s.status] ?? 0) + 1 })

    // By priority
    const byPriority: Record<string, number> = {}
    all.forEach(s => { byPriority[s.priority] = (byPriority[s.priority] ?? 0) + 1 })

    // By owner
    const ownerMap: Record<string, { open: number; closed: number; total: number }> = {}
    all.forEach(s => {
      const n = userMap[s.owner_id] ?? 'Unknown'
      if (!ownerMap[n]) ownerMap[n] = { open: 0, closed: 0, total: 0 }
      ownerMap[n].total++
      if (s.status === 'Closed') ownerMap[n].closed++
      else ownerMap[n].open++
    })
    const byOwner = Object.entries(ownerMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)

    // By issue type
    const typeMap: Record<string, number> = {}
    all.forEach(s => {
      const t = s.issue_type ?? 'Unspecified'
      typeMap[t] = (typeMap[t] ?? 0) + 1
    })
    const byIssueType = Object.entries(typeMap)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    // Recently closed
    const recentClosed = all
      .filter(s => s.status === 'Closed' && s.closed_at)
      .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime())
      .slice(0, 10)
      .map(s => ({ ...s, owner_name: userMap[s.owner_id] ?? '—' }))

    // Avg resolution hours
    const resolved = all.filter(s => s.status === 'Closed' && s.closed_at && s.reported_at)
    const avgResolutionHours = resolved.length > 0
      ? Math.round(resolved.reduce((acc, s) => {
          return acc + (new Date(s.closed_at!).getTime() - new Date(s.reported_at).getTime()) / 3600000
        }, 0) / resolved.length)
      : null

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { count: totalThisMonth } = await supabase
      .from('sr').select('*', { count: 'exact', head: true }).gte('reported_at', monthStart)
    const { count: closedThisMonth } = await supabase
      .from('sr').select('*', { count: 'exact', head: true })
      .eq('status', 'Closed').gte('reported_at', monthStart)

    setData({ byStatus, byPriority, byOwner, byIssueType, recentClosed, avgResolutionHours, totalThisMonth: totalThisMonth ?? 0, closedThisMonth: closedThisMonth ?? 0 })
    setLoading(false)
  }

  async function exportCSV() {
    const { data: srs } = await supabase.from('sr_list').select('*').order('created_at', { ascending: false })
    if (!srs) return
    const headers = ['SR Number','Title','Account','Customer','Issue Type','Priority','Status','Owner','Reported','Closed']
    const rows = srs.map(s => [
      s.sr_number, s.title, s.account ?? '', s.customer_name ?? '',
      s.issue_type ?? '', s.priority, s.status, s.owner_name ?? '',
      fmt(s.reported_at), s.closed_at ? fmt(s.closed_at) : '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `SR-Export-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  if (loading || !data) return <div style={{ color:'var(--text-muted)', padding:'40px', textAlign:'center' }}>Loading reports…</div>

  const total = Object.values(data.byStatus).reduce((a,b) => a+b, 0)
  const STATUS_COLORS: Record<string,string> = {
    'Open':'var(--blue)','In Progress':'var(--accent)','Pending':'var(--yellow)','Closed':'var(--text-muted)','Archived':'#374151'
  }
  const PRI_COLORS: Record<string,string> = {
    Critical:'var(--red-crit)', High:'var(--red)', Medium:'var(--yellow)', Low:'var(--text-muted)'
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Analytics and operational insights</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {(['7d','30d','90d','all'] as const).map(r => (
            <button key={r} className={`btn ${range===r ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setRange(r)}>
              {r==='all' ? 'All time' : r}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>↓ Export CSV</button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid-4 mb-5" style={{ gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))' }}>
        <StatCard label="Total SRs" value={total} color="var(--blue)" />
        <StatCard label="This Month" value={data.totalThisMonth} color="var(--purple)" />
        <StatCard label="Closed This Month" value={data.closedThisMonth} color="var(--accent)" />
        <StatCard label="Avg Resolution" value={data.avgResolutionHours != null ? `${data.avgResolutionHours}h` : '—'} color="var(--yellow)" />
      </div>

      <div className="grid-2 mb-5">
        {/* Status breakdown */}
        <div className="card">
          <h3 style={{ marginBottom:'14px' }}>By Status</h3>
          {Object.entries(data.byStatus).map(([status, count]) => (
            <BarRow key={status} label={status} count={count} total={total} color={STATUS_COLORS[status] ?? 'var(--text-muted)'} />
          ))}
        </div>

        {/* Priority breakdown */}
        <div className="card">
          <h3 style={{ marginBottom:'14px' }}>By Priority</h3>
          {(['Critical','High','Medium','Low'] as const).map(p => (
            data.byPriority[p] ? (
              <BarRow key={p} label={p} count={data.byPriority[p]} total={total} color={PRI_COLORS[p]} />
            ) : null
          ))}
        </div>
      </div>

      <div className="grid-2 mb-5">
        {/* Owner performance */}
        <div className="card">
          <h3 style={{ marginBottom:'14px' }}>Owner Workload</h3>
          {data.byOwner.length === 0 ? (
            <div style={{ color:'var(--text-muted)', fontSize:'0.875rem' }}>No data</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th style={{ textAlign:'right' }}>Open</th>
                  <th style={{ textAlign:'right' }}>Closed</th>
                  <th style={{ textAlign:'right' }}>Total</th>
                  <th style={{ textAlign:'right' }}>Close%</th>
                </tr>
              </thead>
              <tbody>
                {data.byOwner.map(o => (
                  <tr key={o.name}>
                    <td style={{ fontWeight:500 }}>{o.name}</td>
                    <td style={{ textAlign:'right', color:'var(--blue)' }}>{o.open}</td>
                    <td style={{ textAlign:'right', color:'var(--accent)' }}>{o.closed}</td>
                    <td style={{ textAlign:'right' }}>{o.total}</td>
                    <td style={{ textAlign:'right', color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'0.75rem' }}>
                      {o.total > 0 ? Math.round(o.closed/o.total*100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Issue type distribution */}
        <div className="card">
          <h3 style={{ marginBottom:'14px' }}>Top Issue Types</h3>
          {data.byIssueType.length === 0 ? (
            <div style={{ color:'var(--text-muted)', fontSize:'0.875rem' }}>No data</div>
          ) : (
            data.byIssueType.map(({ type, count }) => (
              <BarRow key={type} label={type} count={count} total={total} color="var(--purple)" />
            ))
          )}
        </div>
      </div>

      {/* Recently closed */}
      {data.recentClosed.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom:'14px' }}>Recently Closed</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>SR #</th>
                <th>Issue Type</th>
                <th>Owner</th>
                <th>Priority</th>
                <th>Reported</th>
                <th>Closed</th>
                <th>Resolution Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentClosed.map(s => {
                const resHours = s.closed_at && s.reported_at
                  ? Math.round((new Date(s.closed_at).getTime() - new Date(s.reported_at).getTime()) / 3600000)
                  : null
                return (
                  <tr key={s.id}>
                    <td><a href={`/sr/${s.id}`} style={{ color:'var(--accent)', textDecoration:'none', fontFamily:'var(--font-mono)', fontSize:'0.75rem' }}>{s.sr_number ?? '—'}</a></td>
                    <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{s.issue_type ?? '—'}</td>
                    <td style={{ fontSize:'0.8rem' }}>{s.owner_name}</td>
                    <td><PriBadge p={s.priority} /></td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-muted)' }}>{fmt(s.reported_at)}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-muted)' }}>{fmt(s.closed_at)}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color: resHours && resHours > 48 ? 'var(--red)' : 'var(--accent)' }}>
                      {resHours != null ? `${resHours}h` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="stat-card" style={{ '--accent-color': color } as React.CSSProperties}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round(count / total * 100) : 0
  return (
    <div style={{ marginBottom:'10px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:'4px' }}>
        <span style={{ color:'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>{count} ({pct}%)</span>
      </div>
      <div style={{ height:'5px', background:'var(--bg-elevated)', borderRadius:'3px', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:'3px', transition:'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function PriBadge({ p }: { p: string }) {
  const m: Record<string,string> = { Low:'badge-low', Medium:'badge-medium', High:'badge-high', Critical:'badge-critical' }
  return <span className={`badge ${m[p]??'badge-low'}`}><span className="badge-dot"/>{p}</span>
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })
}
