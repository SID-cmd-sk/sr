export function toast(msg, type = 'success') {
  const root = document.getElementById('toast-root')
  if (!root) return
  const t = document.createElement('div')
  t.className = `toast toast-${type}`
  const icons = { success:'\u2713', error:'\u2715', info:'\u2139', warning:'\u26A0' }
  const escHtml = str => String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
  t.innerHTML = `<span class="toast-icon">${icons[type]||'\u2139'}</span><span>${escHtml(msg)}</span>`
  root.appendChild(t)
  setTimeout(() => {
    t.style.opacity = '0'
    t.style.transform = 'translateY(8px)'
    t.style.transition = 'all .25s'
    setTimeout(() => t.remove(), 280)
  }, 3500)
}
