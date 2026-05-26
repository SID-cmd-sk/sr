function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

export function renderTable(headers, rows) {
  const th = headers.map(h => `<th>${escHtml(h)}</th>`).join('')
  const tr = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`
}
