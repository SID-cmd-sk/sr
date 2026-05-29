import { getSupabase } from '../services/supabase.js'
import { fmtDate, fmtDateS, fmtDT, greeting, escHtml } from '../utils/format.js'
import { STATUSES, PRIORITIES, ROLES, STS_CLS, PRI_CLS } from '../utils/constants.js'
import { CFG } from '../utils/config.js'
import { appState } from '../services/app-state.js'
import { auditLog } from '../services/audit.js'
import { statCard, emptyState, pageError } from '../components/stats.js'
import { skeletonPage } from '../components/skeleton.js'
import { navigate } from '../services/router.js'
import { priBadge, stsBadge } from '../components/badge.js'

window.navigate = navigate

export async function render(container, params) {
  container.innerHTML = skeletonPage()
  try {
    const sb = getSupabase()
    const user = appState.get('user')

    const [{ data:stats }, { data:recentSRs }, { count:actCount }, { count:overdueCount }] = await Promise.all([
      sb.from('dashboard_stats').select('*').single(),
      sb.from('sr_list').select('*').order('created_at',{ascending:false}).limit(8),
      sb.from('activities').select('*',{count:'exact',head:true}).eq('status','Open'),
      sb.from('sr').select('*',{count:'exact',head:true}).eq('status','Open').lt('reported_at', new Date(Date.now()-48*3600000).toISOString()),
    ])
    const s = stats ?? { total_sr:0,open_sr:0,in_progress_sr:0,pending_sr:0,closed_sr:0,critical_open:0 }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Good ${greeting()}, ${user?.name?.split(' ')[0]??''}</div>
          <div class="page-subtitle">Your workflows at a glance</div>
        </div>
        ${user?.role !== 'Viewer' ? `<div class="page-header-actions">
          <button class="btn btn-primary" onclick="navigate('sr-new')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New SR
          </button>
        </div>` : ''}
      </div>

      <div class="grid-stats mb-5">
        ${statCard('Total SRs', s.total_sr, 'var(--accent-lg)')}
        ${statCard('Open', s.open_sr, '#60A5FA')}
        ${statCard('In Progress', s.in_progress_sr, 'var(--teal)')}
        ${statCard('Pending', s.pending_sr, 'var(--yellow)')}
        ${statCard('Closed', s.closed_sr, 'var(--text-3)')}
        ${statCard('Critical Open', s.critical_open, 'var(--red)')}
        ${statCard('Overdue 48h', overdueCount??0, 'var(--orange)')}
        ${statCard('Open Activities', actCount??0, 'var(--purple)')}
      </div>

      <div class="card" style="padding:0" id="recent-sr-card">
        <div class="flex items-center justify-between" style="padding:16px 18px;border-bottom:1px solid var(--border)">
          <div>
            <div class="section-title">Recent Service Requests</div>
            <div style="font-size:.73rem;color:var(--text-3);margin-top:2px">Latest 8 records</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('sr')">View all →</button>
        </div>
        ${!recentSRs?.length ? emptyState('No service requests yet','Create your first SR to get started',`<button class="btn btn-primary btn-sm" onclick="navigate('sr-new')">Create SR</button>`) :
        `<div class="table-wrap" style="border:none;border-radius:0">
          <table class="data-table"><thead><tr>
            <th>SR #</th><th>Title</th><th>Account</th><th>Priority</th><th>Status</th><th>Owner</th><th>Reported</th>
          </tr></thead><tbody>
          ${recentSRs.map(sr=>`<tr onclick="navigate('sr-detail',{id:'${sr.id}'})">
            <td><span class="mono text-accent" style="font-size:.73rem;font-weight:700">${escHtml(sr.sr_number)}</span></td>
            <td class="truncate" style="max-width:220px;font-weight:500">${escHtml(sr.title)}</td>
            <td style="color:var(--text-2);font-size:.78rem">${escHtml(sr.account??'—')}</td>
            <td>${priBadge(sr.priority)}</td>
            <td>${stsBadge(sr.status)}</td>
            <td style="font-size:.78rem">${escHtml(sr.owner_name??'—')}</td>
            <td class="mono" style="font-size:.7rem;color:var(--text-3)">${fmtDateS(sr.reported_at)}</td>
          </tr>`).join('')}
          </tbody></table>
        </div>`}
      </div>`
  } catch(e) {
    container.innerHTML = pageError('Could not load dashboard', 'Make sure SQL setup files are run in Supabase. Error: '+e.message, true, 'dashboard')
  }
}

export default { render }
