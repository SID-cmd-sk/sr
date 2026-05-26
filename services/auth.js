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
  if (user) await loadProfile(user.id)
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

export async function loadProfile(uid) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not initialized')
  const { data, error } = await sb.from('users').select('*').eq('id', uid).single()
  if (error) throw error
  if (!data) throw new Error('User profile not found')
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
