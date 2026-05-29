export function modal(html, cls = '') {
  closeModalForce()
  const root = document.getElementById('modal-root')
  if (!root) return
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.onclick = closeModal
  const box = document.createElement('div')
  box.className = `modal${cls ? ' ' + cls : ''}`
  box.onclick = e => e.stopPropagation()
  box.innerHTML = html
  overlay.appendChild(box)
  root.appendChild(overlay)
  document.addEventListener('keydown', onKey)
  const inp = overlay.querySelector('input,textarea,select,button,[tabindex]')
  if (inp) setTimeout(() => inp.focus(), 100)
}

export function closeModal(e) {
  if (e && e.target !== e.currentTarget) return
  const overlay = document.querySelector('.modal-overlay')
  if (overlay) {
    overlay.style.opacity = '0'
    overlay.querySelector('.modal')?.style.setProperty('transform', 'scale(.92)')
    overlay.style.transition = 'opacity .15s, backdrop-filter .15s'
    setTimeout(() => overlay.remove(), 180)
  }
  document.removeEventListener('keydown', onKey)
}

export function closeModalForce() {
  document.querySelector('.modal-overlay')?.remove()
  document.removeEventListener('keydown', onKey)
}

function onKey(e) {
  if (e.key === 'Escape') closeModal()
}
