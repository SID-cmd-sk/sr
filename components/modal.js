export function modal(html, cls = '') {
  closeModalForce()
  const root = document.getElementById('modal-root')
  if (!root) return
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.onclick = closeModal
  const box = document.createElement('div')
  box.className = `modal${cls ? ' ' + cls : ''}`
  box.onclick = e => e.stopPropagation()
  box.innerHTML = html
  overlay.appendChild(box)
  root.appendChild(overlay)
  document.addEventListener('keydown', onKey)
}

export function closeModal(e) {
  if (e && e.target !== e.currentTarget) return
  closeModalForce()
}

export function closeModalForce() {
  const root = document.getElementById('modal-root')
  if (!root) return
  const el = root.querySelector('.modal-overlay')
  if (el) el.remove()
  document.removeEventListener('keydown', onKey)
}

function onKey(e) {
  if (e.key === 'Escape') closeModalForce()
}
