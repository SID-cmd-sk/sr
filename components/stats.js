function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function colToVar(color) {
  if (!color) return ''
  const map = { blue:'var(--accent)', green:'var(--green)', red:'var(--red)', yellow:'var(--yellow)', teal:'var(--teal)', purple:'var(--purple)', orange:'var(--orange)' }
  return map[color] || color
}

export function statCard(label, value, color) {
  const c = colToVar(color)
  return `<div class="stat-card"${c ? ' style="--_ac:' + c + '"' : ''}><div class="stat-value">${escHtml(value)}</div><div class="stat-label">${escHtml(label)}</div></div>`
}

export function pageError(title, msg, canRetry, page) {
  const retryBtn = canRetry ? `<button class="btn btn-secondary btn-sm" onclick="retryPage('${escHtml(page)}')">Retry</button>` : ''
  return `<div class="page-error"><div style="width:48px;height:48px;border-radius:12px;background:var(--red-dim);display:flex;align-items:center;justify-content:center;color:var(--red);font-size:1.3rem;font-weight:700">!</div><div style="font-weight:700;color:var(--text-2);font-size:0.95rem">${escHtml(title)}</div><div style="font-size:0.8rem;color:var(--text-3);max-width:320px;line-height:1.6">${escHtml(msg)}</div>${retryBtn}</div>`
}

export function emptyState(title, desc, action) {
  return `<div class="empty-state"><div class="empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg></div><div class="empty-title">${escHtml(title)}</div>${desc ? '<div class="empty-desc">' + escHtml(desc) + '</div>' : ''}${action || ''}</div>`
}

export function detailRow(label, value) {
  return `<div class="detail-row"><span class="detail-label">${escHtml(label)}</span><span class="detail-value">${value}</span></div>`
}

export function barChart(data, keys) {
  const max = Math.max(...data.map(d => d[keys.value] || 0), 1)
  return data.map(d => {
    const pct = (d[keys.value] / max * 100).toFixed(1)
    return `<div class="bar-row"><div class="bar-label">${escHtml(d[keys.label])}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-val">${d[keys.value]}</div></div>`
  }).join('')
}
