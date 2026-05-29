import { getSupabase, withTimeout } from '../services/supabase.js'

export const CFG = {
  supabaseUrl: null, supabaseAnon: null,
  appsScriptUrl: null, appsScriptToken: null,
  waBridgeUrl: null,
  smtpHost: 'smtpout.secureserver.net', smtpPort: 465,
  srFolderId: null, activitiesFolderId: null,
  srSpreadsheetId: null, srSheetName: 'SR Register', activitySheetName: 'Activity Log',
}

export async function initializeConfig() {
  try {
    if (!window.APP_CONFIG) throw new Error('Missing config.js')
    const c = window.APP_CONFIG
    CFG.supabaseUrl = c.SUPABASE_URL
    CFG.supabaseAnon = c.SUPABASE_ANON
    CFG.appsScriptUrl = c.APPS_SCRIPT_URL || null
    CFG.appsScriptToken = c.APPS_SCRIPT_TOKEN || null
    CFG.waBridgeUrl = c.WA_BRIDGE_URL || null
    CFG.srFolderId = c.DRIVE_SR_FOLDER_ID || null
    CFG.activitiesFolderId = c.DRIVE_ACTIVITIES_FOLDER_ID || null
    CFG.srSpreadsheetId = c.DRIVE_SPREADSHEET_ID || null
    CFG.srSheetName = c.DRIVE_SR_SHEET_NAME || 'SR Register'
    CFG.activitySheetName = c.DRIVE_ACTIVITY_SHEET_NAME || 'Activity Log'
    if (!CFG.supabaseUrl || !CFG.supabaseAnon) throw new Error('Missing Supabase config')
    return true
  } catch(e) { return false }
}

export async function loadRuntimeConfig() {
  try {
    const sb = getSupabase()
    const [{ data:drv }, { data:wa }] = await Promise.all([
      withTimeout(sb.from('settings').select('value').eq('key','drive').single(), 8000, 'settings.drive timeout'),
      withTimeout(sb.from('settings').select('value').eq('key','whatsapp').single(), 8000, 'settings.whatsapp timeout'),
    ])
    if (drv?.value) {
      if (drv.value.apps_script_url) CFG.appsScriptUrl = drv.value.apps_script_url
      if (drv.value.apps_script_token) CFG.appsScriptToken = drv.value.apps_script_token
      if (drv.value.sr_folder_id) CFG.srFolderId = drv.value.sr_folder_id
      if (drv.value.activities_folder_id) CFG.activitiesFolderId = drv.value.activities_folder_id
      if (drv.value.spreadsheet_id) CFG.srSpreadsheetId = drv.value.spreadsheet_id
      if (drv.value.sr_sheet_name) CFG.srSheetName = drv.value.sr_sheet_name
      if (drv.value.activity_sheet_name) CFG.activitySheetName = drv.value.activity_sheet_name
    }
    if (wa?.value?.bridge_url) CFG.waBridgeUrl = wa.value.bridge_url || 'http://localhost:3001'
    if (!CFG.waBridgeUrl) CFG.waBridgeUrl = 'http://localhost:3001'
  } catch(e) { /* silent */ }
}
