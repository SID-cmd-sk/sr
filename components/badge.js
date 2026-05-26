function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

export function priBadge(p) {
  const v = String(p || '').toLowerCase()
  const cls = v === 'low' ? 'badge-low' : v === 'medium' ? 'badge-medium' : v === 'high' ? 'badge-high' : v === 'critical' ? 'badge-critical' : 'badge-low'
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${escHtml(p)}</span>`
}

export function stsBadge(s) {
  const v = String(s || '').toLowerCase().replace(/\s+/g, '-')
  const cls = v === 'open' ? 'badge-open' : v === 'in-progress' ? 'badge-in-progress' : v === 'pending' ? 'badge-pending' : v === 'closed' ? 'badge-closed' : v === 'archived' ? 'badge-archived' : 'badge-open'
  return `<span class="badge ${cls}">${escHtml(s)}</span>`
}

export function roleBadge(r) {
  const v = String(r || '').toLowerCase()
  const cls = v === 'admin' ? 'badge-admin' : v === 'manager' ? 'badge-manager' : v === 'technical' ? 'badge-technical' : v === 'user' ? 'badge-user' : v === 'viewer' ? 'badge-viewer' : 'badge-user'
  return `<span class="badge ${cls}">${escHtml(r)}</span>`
}
