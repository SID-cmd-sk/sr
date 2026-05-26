import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { statCard, pageError } from '../components/stats.js'
import { skeletonPage } from '../components/skeleton.js'

function barChart(data, keys) {
  const vals = keys.map(k => data[k] ?? 0)
  const max = Math.max(...vals, 1)
  return `<div>${keys.filter(k => data[k]).map(k => `<div class="bar-row">
    <div class="bar-label">${escHtml(String(k))}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round((data[k] ?? 0) / max * 100)}%"></div></div>
    <div class="bar-val">${data[k] ?? 0}</div>
  </div>`).join('')}</div>`
}

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    let range = '30d'

    async function loadReport() {
      const body = document.getElementById('report-body')
      if (!body) return
      body.innerHTML = skeletonPage()
      try {
        const now = new Date()
        const fromDate = range === '7d' ? new Date(now - 7 * 86400000).toISOString() : range === '30d' ? new Date(now - 30 * 86400000).toISOString() : range === '90d' ? new Date(now - 90 * 86400000).toISOString() : null
        let q = sb.from('sr').select('id,status,priority,owner_id,issue_type,reported_at,closed_at')
        if (fromDate) q = q.gte('reported_at', fromDate)
        const [{ data: srs }, { data: users }] = await Promise.all([q, sb.from('users').select('id,name')])
        const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.name]))
        const all = srs ?? []
        const byStatus = {}, byPriority = {}, byOwner = {}, byType = {}
        let totalResMs = 0, resolvedCount = 0
        all.forEach(s => {
          byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
          byPriority[s.priority] = (byPriority[s.priority] ?? 0) + 1
          const n = userMap[s.owner_id] ?? 'Unknown'
          if (!byOwner[n]) byOwner[n] = { open: 0, closed: 0, total: 0 }
          byOwner[n].total++
          if (s.status === 'Closed') byOwner[n].closed++; else byOwner[n].open++
          byType[s.issue_type ?? 'Other'] = (byType[s.issue_type ?? 'Other'] ?? 0) + 1
          if (s.closed_at && s.reported_at) { totalResMs += new Date(s.closed_at) - new Date(s.reported_at); resolvedCount++ }
        })
        const avgHours = resolvedCount > 0 ? Math.round(totalResMs / resolvedCount / 3600000) : null

        body.innerHTML = `
          <div class="grid-stats mb-5">
            ${statCard('Total SRs', all.length, 'var(--accent-lg)')}
            ${statCard('Open', byStatus['Open'] ?? 0, '#60A5FA')}
            ${statCard('Closed', byStatus['Closed'] ?? 0, 'var(--text-3)')}
            ${statCard('Avg Resolution', avgHours != null ? avgHours + 'h' : '—', 'var(--teal)')}
          </div>
          <div class="grid-2 mb-4">
            <div class="card">
              <div class="section-title mb-3">By Status</div>
              ${barChart(byStatus, ['Open', 'In Progress', 'Pending', 'Closed', 'Archived'])}
            </div>
            <div class="card">
              <div class="section-title mb-3">By Priority</div>
              ${barChart(byPriority, ['Critical', 'High', 'Medium', 'Low'])}
            </div>
          </div>
          <div class="card mb-4">
            <div class="section-title mb-3">By Owner</div>
            <div class="table-wrap" style="border:none">
              <table class="data-table"><thead><tr>
                <th>Name</th><th>Total</th><th>Open</th><th>Closed</th><th>Close Rate</th>
              </tr></thead><tbody>
                ${Object.entries(byOwner).sort((a, b) => b[1].total - a[1].total).map(([name, v]) => `<tr>
                  <td style="font-weight:500">${escHtml(name)}</td>
                  <td>${v.total}</td>
                  <td>${v.open}</td>
                  <td>${v.closed}</td>
                  <td><span style="font-weight:700;color:var(--teal)">${v.total > 0 ? Math.round(v.closed / v.total * 100) + '%' : '—'}</span></td>
                </tr>`).join('')}
              </tbody></table>
            </div>
          </div>
          <div class="card">
            <div class="section-title mb-3">By Issue Type</div>
            ${barChart(byType, Object.keys(byType).sort((a, b) => (byType[b] || 0) - (byType[a] || 0)))}
          </div>`
      } catch (e) {
        if (body) body.innerHTML = pageError('Could not load report', e.message, true, 'reports')
      }
    }

    container.innerHTML = `
      <div class="page-header">
        <div><div class="page-title">Reports</div></div>
        <div class="page-header-actions">
          ${['7d', '30d', '90d', 'all'].map(r => `<button class="btn ${r === range ? 'btn-primary' : 'btn-ghost'} btn-sm" id="range-btn-${r}" onclick="window.setReportRange('${r}')">${r === 'all' ? 'All Time' : r}</button>`).join('')}
        </div>
      </div>
      <div id="report-body">${skeletonPage()}</div>`

    window.setReportRange = async (r) => {
      range = r
      document.querySelectorAll('[id^="range-btn-"]').forEach(b => {
        b.className = b.id === `range-btn-${r}` ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'
      })
      await loadReport()
    }
    await loadReport()
  }
}
