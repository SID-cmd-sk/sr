export const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'
export const fmtDateS = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—'
export const fmtDT = iso => iso ? new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'
export const greeting = () => { const h = new Date().getHours(); return h<12?'morning':h<17?'afternoon':'evening' }
export const escHtml = str => String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
export const withTimeout = (p, ms, msg) => {
  let t
  const to = new Promise((_, r) => { t = setTimeout(() => r(new Error(msg)), ms) })
  return Promise.race([p, to]).finally(() => clearTimeout(t))
}
