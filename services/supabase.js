let sb = null

export function getSupabase() { return sb }

export async function initSupabase() {
  if (sb) return sb
  const c = window.APP_CONFIG
  if (!c?.SUPABASE_URL || !c?.SUPABASE_ANON) throw new Error('Missing Supabase config')
  const { createClient } = window.supabase
  sb = createClient(c.SUPABASE_URL, c.SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  })
  return sb
}

export function withTimeout(p, ms, msg) {
  let t
  const to = new Promise((_, r) => { t = setTimeout(() => r(new Error(msg)), ms) })
  return Promise.race([p, to]).finally(() => clearTimeout(t))
}
