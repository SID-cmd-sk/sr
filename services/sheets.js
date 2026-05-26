import { getSupabase } from './supabase.js'
import { CFG } from '../utils/config.js'
import { logAppError } from './audit.js'

const _syncQueue = []

export function syncQueueEmpty() {
  return _syncQueue.length === 0
}

export async function retrySync() {
  const item = _syncQueue.shift()
  if (!item) return
  try {
    if (item.action === 'syncSheetsRow') {
      await syncSheetsRow(item.srId, item.status, item.resolvedAt, item.resolution)
    } else if (item.action === 'createDriveFolder') {
      await createDriveFolder(item.srId)
    } else if (item.action === 'syncActivityRow') {
      await syncActivityRow(item.activityId, item.srId)
    }
  } catch(e) {
    logAppError(`Retry failed for ${item.action}: ${e.message}`)
  }
}

function _enqueue(action, payload) {
  _syncQueue.push({ action, ...payload })
  if (_syncQueue.length > 50) _syncQueue.shift()
}

function _validateSrData(sr) {
  if (!sr) return false
  if (!sr.sr_number || typeof sr.sr_number !== 'string') return false
  return true
}

async function _postToAppsScript(body) {
  if (!CFG.appsScriptUrl) throw new Error('Apps Script URL not configured')
  const res = await fetch(CFG.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: CFG.appsScriptToken, timestamp: Date.now().toString(), ...body }),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) throw new Error(json.error || `Apps Script error ${res.status}`)
  return json
}

export async function syncSheetsRow(srId, status, resolvedAt, resolution) {
  if (!CFG.appsScriptUrl) return
  const sb = getSupabase()
  const { data:sr } = await sb.from('sr_list').select('*').eq('id',srId).single()
  if (!sr || !_validateSrData(sr)) {
    _enqueue('syncSheetsRow', { srId, status, resolvedAt, resolution })
    return
  }
  try {
    await _postToAppsScript({ action:'update_sr_row', sr_number:sr.sr_number, status, resolved_at:resolvedAt, resolution, owner_name:sr.owner_name })
  } catch(e) {
    logAppError(`Sheet sync error: ${e.message}`)
    _enqueue('syncSheetsRow', { srId, status, resolvedAt, resolution })
  }
}

export async function createDriveFolder(srId) {
  if (!CFG.appsScriptUrl) return
  const sb = getSupabase()
  const { data:sr } = await sb.from('sr_list').select('*').eq('id',srId).single()
  if (!sr || !_validateSrData(sr)) {
    _enqueue('createDriveFolder', { srId })
    return
  }
  const year = new Date().getFullYear().toString()
  try {
    const d = await _postToAppsScript({ action:'create_sr_folder', sr_number:sr.sr_number, year })
    if (d.folder_url) {
      await sb.from('sr').update({ drive_folder_url:d.folder_url, drive_folder_id:d.folder_id }).eq('id', srId)
      await _postToAppsScript({ action:'append_sr_row', sr_number:sr.sr_number, status:sr.status, reported_at:sr.reported_at, account:sr.account, customer_name:sr.customer_name, customer_contact:sr.customer_contact, customer_email:sr.customer_email, issue_type:sr.issue_type, issue_description:sr.issue_description, owner_name:sr.owner_name, creator_name:sr.creator_name, priority:sr.priority, route_name:sr.route_name, folder_url:d.folder_url })
    }
  } catch(e) {
    logAppError(`Drive folder error: ${e.message}`)
    _enqueue('createDriveFolder', { srId })
  }
}

export async function syncActivityRow(activityId, srId) {
  if (!CFG.appsScriptUrl) return
  const sb = getSupabase()
  const { data:act } = await sb.from('activities_list').select('*').eq('id',activityId).single()
  if (!act) {
    _enqueue('syncActivityRow', { activityId, srId })
    return
  }
  let srNumber = ''
  if (srId) {
    const { data:sr } = await sb.from('sr').select('sr_number').eq('id',srId).single().catch(()=>({}))
    if (sr) srNumber = sr.sr_number
  }
  try {
    await _postToAppsScript({ action:'append_activity_row', title:act.title, type:act.type, status:act.status, owner_name:act.owner_name, account:act.account, contact_name:act.contact_name, linked_sr:srNumber, due_date:act.due_date, created_at:act.created_at })
  } catch(e) {
    logAppError(`Activity sync error: ${e.message}`)
    _enqueue('syncActivityRow', { activityId, srId })
  }
}
