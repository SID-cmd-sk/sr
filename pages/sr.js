import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml, fmtDateS } from '../utils/format.js'
import { STATUSES, PRIORITIES } from '../utils/constants.js'
import { skeletonPage } from '../components/skeleton.js'
import { priBadge, stsBadge } from '../components/badge.js'
import { emptyState, pageError } from '../components/stats.js'
import { navigate } from '../services/router.js'

async function render(container, params = {}) {
  container.innerHTML = skeletonPage()
  const sb = getSupabase()
  const me = appState.get('user')
  try {
    const q = params.q ?? ''
    const sts = params.status ?? ''
    const pri = params.priority ?? ''
    const page = parseInt(params.page ?? '1')
    const ps = 25

    let query = sb.from('sr_list').select('*', {count:'exact'})
    if (sts) query = query.eq('status', sts)
    if (pri) query = query.eq('priority', pri)
    if (q) query = query.or(`sr_number.ilike.%${q}%,title.ilike.%${q}%,account.ilike.%${q}%,customer_name.ilike.%${q}%`)
    if (!['Admin','Manager'].includes(me?.role)) query = query.eq('owner_id', me?.id)

    const { data:srs, count } = await query.order('created_at',{ascending:false}).range((page-1)*ps, page*ps-1)
    const totalPages = Math.ceil((count??0)/ps)

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Service Requests</div>
          <div class="page-subtitle">${count??0} total records</div>
        </div>
        ${me?.role !== 'Viewer' ? `<div class="page-header-actions">
          <button class="btn btn-primary" onclick="navigate('sr-new')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New SR
          </button>
        </div>` : ''}
      </div>
      <div class="filter-bar">
        <div class="search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="form-input" id="sr-q" value="${escHtml(q)}" placeholder="Search SR#, title, account…"/>
        </div>
        <select class="form-select" id="sr-sts" style="width:auto">
          <option value="">All Status</option>
          ${STATUSES.map(s=>`<option value="${s}" ${s===sts?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="form-select" id="sr-pri" style="width:auto">
          <option value="">All Priority</option>
          ${PRIORITIES.map(p=>`<option value="${p}" ${p===pri?'selected':''}>${p}</option>`).join('')}
        </select>
        <button class="btn btn-secondary" onclick="srFilter()">Filter</button>
        <button class="btn btn-ghost" onclick="navigate('sr')">Clear</button>
      </div>
      <div class="card" style="padding:0">
        ${!srs?.length ? emptyState('No service requests found','Try adjusting your filters or create a new SR') :
        `<div class="table-wrap" style="border:none;border-radius:0 0 var(--r-lg) var(--r-lg)">
          <table class="data-table"><thead><tr>
            <th>SR #</th><th>Title</th><th>Account</th><th>Issue Type</th><th>Priority</th><th>Status</th><th>Owner</th><th>Reported</th><th>Updated</th>
          </tr></thead><tbody>
          ${srs.map(sr=>`<tr onclick="navigate('sr-detail',{id:'${sr.id}'})">
            <td><span class="mono text-accent" style="font-size:.73rem;font-weight:700">${escHtml(sr.sr_number)}</span></td>
            <td class="truncate" style="max-width:200px;font-weight:500">${escHtml(sr.title)}</td>
            <td style="color:var(--text-2);font-size:.78rem">${escHtml(sr.account??'—')}</td>
            <td style="color:var(--text-2);font-size:.78rem">${escHtml(sr.issue_type??'—')}</td>
            <td>${priBadge(sr.priority)}</td>
            <td>${stsBadge(sr.status)}</td>
            <td style="font-size:.78rem;font-weight:500">${escHtml(sr.owner_name??'—')}</td>
            <td class="mono" style="font-size:.7rem;color:var(--text-3)">${fmtDateS(sr.reported_at)}</td>
            <td class="mono" style="font-size:.7rem;color:var(--text-3)">${fmtDateS(sr.updated_at)}</td>
          </tr>`).join('')}
          </tbody></table>
        </div>`}
      </div>
      ${totalPages>1 ? `<div class="flex items-center gap-2" style="justify-content:center;margin-top:16px">
        ${page>1 ? `<button class="btn btn-secondary btn-sm" onclick="navigate('sr',{q:'${q}',status:'${sts}',priority:'${pri}',page:${page-1}})">← Prev</button>` : ''}
        <span style="font-size:.78rem;color:var(--text-2)">Page ${page} of ${totalPages}</span>
        ${page<totalPages ? `<button class="btn btn-secondary btn-sm" onclick="navigate('sr',{q:'${q}',status:'${sts}',priority:'${pri}',page:${page+1}})">Next →</button>` : ''}
      </div>` : ''}`

    window.srFilter = function() {
      const q = document.getElementById('sr-q')?.value ?? ''
      const sts = document.getElementById('sr-sts')?.value ?? ''
      const pri = document.getElementById('sr-pri')?.value ?? ''
      navigate('sr', { q, status:sts, priority:pri, page:1 })
    }
  } catch(e) {
    container.innerHTML = pageError('Could not load service requests', e.message, true, 'sr')
  }
}

export default { render }
