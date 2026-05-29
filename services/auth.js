import { appState } from './app-state.js'
import { getSupabase, withTimeout } from './supabase.js'

export function getStoredSession() {
  try {
    const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('auth-token'))
    return k ? JSON.parse(localStorage.getItem(k)) : null
  } catch { return null }
}

export async function checkSession() {
  const sb = getSupabase()
  if (!sb) return null
  const stored = getStoredSession()
  if (stored?.user) return stored.user
  const r = await withTimeout(sb.auth.getSession(), 6000, 'Session timeout').catch(() => ({ data: { session: null } }))
  return r.data.session?.user || null
}

export async function doLogin(email, pass) {
  const sb = getSupabase()
  if (!sb) throw new Error('Not initialized')
  const { data, error } = await withTimeout(
    sb.auth.signInWithPassword({ email, password: pass }),
    30000, 'Sign in timed out.'
  )
  if (error) throw error
  const user = data?.user || data?.session?.user
  if (user) {
    const jwt = data?.session?.access_token
    await loadProfile(user.id, jwt)
  }
  return user
}

export async function doLogout() {
  const sb = getSupabase()
  const cleanups = appState.get('routeCleanups') || []
  cleanups.forEach(fn => { try { fn() } catch {} })
  appState.set('routeCleanups', [])

  try {
    if (sb) await withTimeout(sb.auth.signOut(), 10000, 'Sign out timeout').catch(() => {})
  } catch {}

  sessionStorage.clear()
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-') && k.includes('auth-token'))
    .forEach(k => localStorage.removeItem(k))

  appState.set('user', null)
}

export async function loadProfile(uid, jwt) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not initialized')
  let data
  if (jwt) {
    const c = window.APP_CONFIG
    const res = await withTimeout(fetch(`${c.SUPABASE_URL}/rest/v1/users?id=eq.${uid}&select=*`, { headers: { apikey: c.SUPABASE_ANON, Authorization: `Bearer ${jwt}` } }), 10000, 'Profile load timed out')
    if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`)
    const rows = await res.json()
    if (!rows?.length) throw new Error('User profile not found')
    data = rows[0]
  } else {
    const r = await withTimeout(sb.from('users').select('*').eq('id', uid).single(), 10000, 'Profile load timed out')
    if (r.error) throw r.error
    if (!r.data) throw new Error('User profile not found')
    data = r.data
  }
  appState.set('user', data)
  return data
}

export function isAdmin() {
  const user = appState.get('user')
  return user?.role === 'Admin'
}

export function canManage() {
  const user = appState.get('user')
  return user && ['Admin', 'Manager'].includes(user.role)
}
