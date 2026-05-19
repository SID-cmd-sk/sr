// app/(app)/sr/page.tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { SRStatus, SRPriority, UserRole } from '@/types'

export const dynamic = 'force-dynamic'

interface SearchParams { status?: string; priority?: string; q?: string; page?: string }

export default async function SRListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  const role = (profile?.role ?? 'User') as UserRole

  const page = parseInt(params.page ?? '1')
  const pageSize = 25
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('sr_list').select('*', { count: 'exact' })

  if (params.status) query = query.eq('status', params.status)
  if (params.priority) query = query.eq('priority', params.priority)
  if (params.q) query = query.or(`sr_number.ilike.%${params.q}%,title.ilike.%${params.q}%,account.ilike.%${params.q}%,customer_name.ilike.%${params.q}%`)

  // Non-admin sees own SRs only
  if (!['Admin','Manager'].includes(role)) {
    query = query.eq('owner_id', user!.id)
  }

  const { data: srs, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  const STATUS_OPTIONS: SRStatus[] = ['Open','In Progress','Pending','Closed','Archived']
  const PRIORITY_OPTIONS: SRPriority[] = ['Critical','High','Medium','Low']

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Service Requests</div>
          <div className="page-subtitle">{count ?? 0} total records</div>
        </div>
        {role !== 'Viewer' && (
          <Link href="/sr/new" className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New SR
          </Link>
        )}
      </div>

      {/* Filters */}
      <form className="filter-bar" method="GET">
        <div className="search-input-wrap">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input className="form-input" name="q" defaultValue={params.q} placeholder="Search SR#, title, account…" />
        </div>
        <select className="form-select" name="status" defaultValue={params.status ?? ''} style={{ width: 'auto' }}>
          <option value="">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" name="priority" defaultValue={params.priority ?? ''} style={{ width: 'auto' }}>
          <option value="">All Priority</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button type="submit" className="btn btn-secondary">Filter</button>
        <Link href="/sr" className="btn btn-ghost">Clear</Link>
      </form>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {!srs?.length ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="2"/>
              </svg>
            </div>
            <div className="empty-title">No service requests found</div>
            <div className="empty-desc">Try adjusting your filters or create a new SR</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>SR Number</th>
                <th>Title</th>
                <th>Account</th>
                <th>Issue Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Reported</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {srs.map(sr => (
                <tr key={sr.id}>
                  <td>
                    <Link href={`/sr/${sr.id}`} style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>
                      {sr.sr_number}
                    </Link>
                  </td>
                  <td style={{ maxWidth: '200px' }}>
                    <Link href={`/sr/${sr.id}`} style={{ color:'var(--text-primary)', textDecoration:'none' }} className="truncate" title={sr.title}>
                      {sr.title}
                    </Link>
                  </td>
                  <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{sr.account ?? '—'}</td>
                  <td style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{sr.issue_type ?? '—'}</td>
                  <td><PriBadge p={sr.priority} /></td>
                  <td><StsBadge s={sr.status} /></td>
                  <td style={{ fontSize:'0.8rem' }}>
                    <div style={{ fontWeight:500 }}>{sr.owner_name}</div>
                    <div style={{ color:'var(--text-muted)', fontSize:'0.7rem' }}>{sr.owner_email}</div>
                  </td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                    {fmt(sr.reported_at)}
                  </td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                    {fmt(sr.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginTop:'16px' }}>
          {page > 1 && (
            <Link href={buildUrl(params, page - 1)} className="btn btn-secondary btn-sm">← Prev</Link>
          )}
          <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildUrl(params, page + 1)} className="btn btn-secondary btn-sm">Next →</Link>
          )}
        </div>
      )}
    </>
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

function buildUrl(params: SearchParams, page: number) {
  const p = new URLSearchParams()
  if (params.q) p.set('q', params.q)
  if (params.status) p.set('status', params.status)
  if (params.priority) p.set('priority', params.priority)
  p.set('page', String(page))
  return `/sr?${p.toString()}`
}
