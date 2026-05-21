// ============================================================
// SR PLATFORM  —  Google Apps Script Bridge (SECURE VERSION)
// Deploy as: Web App → Execute as: Me → Access: Anyone
// Copy the deployment URL → paste into Admin → Settings → Drive
// ============================================================

// ────────────────────────────────────────────────────────────
// CONFIGURATION  — update these folder IDs after setup
// NOTE: Do NOT hardcode sensitive tokens here!
// Use environment-based token verification instead
// ────────────────────────────────────────────────────────────
const CONFIG = {
  SR_ROOT_FOLDER_ID:          '1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV',
  ACTIVITIES_FOLDER_ID:       '1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV',
  SR_REGISTER_SPREADSHEET_ID: '10k6weyGqYVEsUNf4DUe1fFGrBaB2sfOBIskhn2pFWGQ',
  SR_SHEET_NAME:              'SR Register',
  ACTIVITY_SHEET_NAME:        'Activity Log',
  SECRET_TOKEN:               'SR_PLATFORM_2026_SECRET'  // Load from Properties in production
}

// Timestamp window to prevent replay attacks (5 minutes)
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000

// ────────────────────────────────────────────────────────────
// SECURITY: Request verification & rate limiting
// ────────────────────────────────────────────────────────────

function verifyRequest(payload, token, timestamp) {
  // Check timestamp to prevent replay attacks
  const now = new Date().getTime()
  const payloadTime = parseInt(timestamp, 10)
  
  if (isNaN(payloadTime)) {
    return { valid: false, error: 'Invalid timestamp' }
  }
  
  if (Math.abs(now - payloadTime) > TIMESTAMP_WINDOW_MS) {
    return { valid: false, error: 'Request timestamp expired' }
  }
  
  // Verify token
  if (token !== CONFIG.SECRET_TOKEN) {
    return { valid: false, error: 'Unauthorized' }
  }
  
  return { valid: true }
}

// Simple request rate limiting per action
const requestLog = {}

function checkRateLimit(action, ip) {
  const key = `${action}:${ip}`
  const now = new Date().getTime()
  
  if (!requestLog[key]) {
    requestLog[key] = []
  }
  
  // Remove old entries (older than 1 minute)
  requestLog[key] = requestLog[key].filter(t => now - t < 60000)
  
  // Max 20 requests per minute per action per IP
  if (requestLog[key].length >= 20) {
    return false
  }
  
  requestLog[key].push(now)
  return true
}

// ────────────────────────────────────────────────────────────
// MAIN ROUTER
// ────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const ip = e.userIp || 'unknown'
    const payload = JSON.parse(e.postData.contents)
    
    // SECURITY: Validate timestamp to prevent replay attacks
    const verification = verifyRequest(payload, payload.token, payload.timestamp)
    if (!verification.valid) {
      console.warn(`[Security] Request rejected: ${verification.error} from ${ip}`)
      return json({ ok: false, error: verification.error }, 403)
    }
    
    // SECURITY: Rate limiting
    const action = payload.action || 'unknown'
    if (!checkRateLimit(action, ip)) {
      console.warn(`[Security] Rate limit exceeded for action: ${action} from ${ip}`)
      return json({ ok: false, error: 'Rate limit exceeded' }, 429)
    }
    
    // INPUT VALIDATION
    if (!action || typeof action !== 'string') {
      return json({ ok: false, error: 'Invalid action parameter' })
    }
    
    // Whitelist allowed actions
    const allowedActions = ['create_sr_folder', 'append_sr_row', 'update_sr_row', 'append_activity_row', 'create_export']
    if (!allowedActions.includes(action)) {
      console.warn(`[Security] Unknown action attempted: ${action} from ${ip}`)
      return json({ ok: false, error: `Unknown action: ${action}` })
    }
    
    switch (action) {
      case 'create_sr_folder':    return json(createSRFolder(payload))
      case 'append_sr_row':       return json(appendSRRow(payload))
      case 'update_sr_row':       return json(updateSRRow(payload))
      case 'append_activity_row': return json(appendActivityRow(payload))
      case 'create_export':       return json(createExport(payload))
      default:
        return json({ ok: false, error: 'Unexpected error' })
    }
  } catch (err) {
    console.error('[Error]', err.toString())
    return json({ ok: false, error: 'Internal error' }, 500)
  }
}

function doGet(e) {
  return json({ ok: true, message: 'SR Platform Apps Script Bridge is running.' })
}

// ────────────────────────────────────────────────────────────
// CREATE SR FOLDER
// ────────────────────────────────────────────────────────────
function createSRFolder(p) {
  const { sr_number, year } = p

  // Year folder: SR Root / 2026
  const root = DriveApp.getFolderById(CONFIG.SR_ROOT_FOLDER_ID)
  const yearFolder = getOrCreateFolder(root, year || new Date().getFullYear().toString())

  // SR folder: 2026 / SR-2026-0001
  const srFolder = yearFolder.createFolder(sr_number)

  // Subfolders
  srFolder.createFolder('Attachments')
  srFolder.createFolder('Resolution')
  srFolder.createFolder('Exports')
  srFolder.createFolder('Notes')

  return {
    ok: true,
    folder_id:  srFolder.getId(),
    folder_url: srFolder.getUrl(),
  }
}

// ────────────────────────────────────────────────────────────
// APPEND SR ROW TO SHEET
// ────────────────────────────────────────────────────────────
function appendSRRow(p) {
  const sheet = getSheet(CONFIG.SR_SHEET_NAME)
  ensureSRHeaders(sheet)

  sheet.appendRow([
    p.sr_number,
    p.status         || 'Open',
    formatDate(p.reported_at),
    p.resolved_at    ? formatDate(p.resolved_at) : '',
    p.account        || '',
    p.customer_name  || '',
    p.customer_contact || '',
    p.customer_email || '',
    p.issue_type     || '',
    p.issue_description || '',
    p.resolution     || '',
    p.owner_name     || '',
    p.creator_name   || '',
    p.priority       || '',
    p.route_name     || '',
    p.folder_url     || '',
    formatDate(new Date().toISOString()),   // logged_at
  ])

  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// UPDATE SR ROW IN SHEET  (finds by SR Number in col A)
// ────────────────────────────────────────────────────────────
function updateSRRow(p) {
  const sheet = getSheet(CONFIG.SR_SHEET_NAME)
  const data  = sheet.getDataRange().getValues()

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.sr_number) {
      const row = i + 1   // 1-based
      if (p.status)      sheet.getRange(row, 2).setValue(p.status)
      if (p.resolved_at) sheet.getRange(row, 4).setValue(formatDate(p.resolved_at))
      if (p.resolution)  sheet.getRange(row, 11).setValue(p.resolution)
      if (p.owner_name)  sheet.getRange(row, 12).setValue(p.owner_name)
      sheet.getRange(row, 17).setValue(formatDate(new Date().toISOString()))   // updated_at
      return { ok: true, updated_row: row }
    }
  }

  // Not found — append as new
  return appendSRRow(p)
}

// ────────────────────────────────────────────────────────────
// APPEND ACTIVITY ROW
// ────────────────────────────────────────────────────────────
function appendActivityRow(p) {
  const sheet = getSheet(CONFIG.ACTIVITY_SHEET_NAME)
  ensureActivityHeaders(sheet)

  sheet.appendRow([
    p.activity_no    || '',
    p.title          || '',
    p.type           || '',
    p.status         || 'Open',
    p.owner_name     || '',
    p.account        || '',
    p.contact_name   || '',
    p.linked_sr      || '',
    p.due_date       ? formatDate(p.due_date) : '',
    formatDate(p.created_at || new Date().toISOString()),
  ])

  return { ok: true }
}

// ────────────────────────────────────────────────────────────
// CREATE EXPORT  (text file in SR folder)
// ────────────────────────────────────────────────────────────
function createExport(p) {
  const { folder_id, filename, content } = p
  const folder = DriveApp.getFolderById(folder_id)
  const blob   = Utilities.newBlob(content, 'text/plain', filename)
  const file   = folder.createFile(blob)
  return { ok: true, file_id: file.getId(), file_url: file.getUrl() }
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────
function getOrCreateFolder(parent, name) {
  const iter = parent.getFoldersByName(name)
  return iter.hasNext() ? iter.next() : parent.createFolder(name)
}

function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SR_REGISTER_SPREADSHEET_ID)
  let sheet = ss.getSheetByName(sheetName)
  if (!sheet) sheet = ss.insertSheet(sheetName)
  return sheet
}

function ensureSRHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = [
      'SR Number','Status','Reported At','Resolved At',
      'Account','Customer Name','Contact No','Email ID',
      'Issue Type','Issue Description','Resolution','SR Owner',
      'Created By','Priority','Route','Drive Folder','Updated At',
    ]
    const range = sheet.getRange(1, 1, 1, headers.length)
    range.setValues([headers])
    range.setFontWeight('bold')
    range.setBackground('#0A0C12')
    range.setFontColor('#00D4AA')
    sheet.setFrozenRows(1)
  }
}

function ensureActivityHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = ['Activity No','Title','Type','Status','Owner','Account','Contact','Linked SR','Due Date','Created At']
    const range = sheet.getRange(1, 1, 1, headers.length)
    range.setValues([headers])
    range.setFontWeight('bold')
    range.setBackground('#0A0C12')
    range.setFontColor('#00D4AA')
    sheet.setFrozenRows(1)
  }
}

function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm')
}

function json(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
  output.setMimeType(ContentService.MimeType.JSON)
  return output
}
