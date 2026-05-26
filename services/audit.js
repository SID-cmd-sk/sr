import { getSupabase } from './supabase.js'
import { appState } from './app-state.js'

export async function auditLog(action, targetId, targetType, description, meta = {}) {
  try {
    const me = appState.get('user')
    if (!me) return
    await getSupabase().from('audit_log').insert([{ action, target_id:targetId, target_type:targetType, description, meta, user_id:me.id }])
  } catch(e) { /* silent */ }
}

export function logAppError(msg, source = 'app') {
  const entry = { time: new Date().toISOString(), msg, source }
  const log = appState.get('errorLog') || []
  log.push(entry)
  if (log.length > 100) log.shift()
  appState.set('errorLog', log)
  return entry
}
