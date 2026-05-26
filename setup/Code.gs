/**
 * SR Platform — Google Apps Script Bridge
 * ===========================================
 * Deploy as: Web App → Execute as: Me → Access: Anyone
 * Paste deployment URL in Admin → Settings → Drive
 *
 * Architecture (proven pattern):
 *   doPost  → parse JSON payload → route by action → return JSON
 *   doGet   → health-check JSON
 *   doOptions → empty 200 for CORS preflight
 *
 * Action reference:
 *   create_sr_folder    — create Drive folder tree for an SR
 *   append_sr_row       — append a row to the SR Register sheet
 *   update_sr_row       — update a row in the SR Register sheet
 *   append_activity_row — append a row to the Activity Log sheet
 *   create_export       — write a text file into an SR folder
 *   delete_sr_folder    — trash the Drive folder for an SR
 *   delete_sr_row       — remove a row from the SR Register sheet
 *   delete_activity_row — move an activity row to Removed Activities
 */

// ── CONFIG ————————————————————————————————————————————————
var CONFIG = {
  SR_ROOT_FOLDER_ID:          '1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV',
  SR_REGISTER_SPREADSHEET_ID: '10k6weyGqYVEsUNf4DUe1fFGrBaB2sfOBIskhn2pFWGQ',
  SR_SHEET_NAME:              'SR Register',
  ACTIVITY_SHEET_NAME:        'Activity Log',
  SECRET_TOKEN:               'SR_PLATFORM_2026_SECRET',
}

// ── TIMESTAMP WINDOW —————————————————————————————————————

// Prevent replay attacks: reject requests older than 10 min
var TIMESTAMP_WINDOW_MS = 10 * 60 * 1000


// ══════════════════════════════════════════════════════════
// ROUTER
// ══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents)

    // Timestamp verification (defense in depth)
    var check = verifyTimestamp(payload)
    if (!check.valid) return jsonResponse({ ok: false, error: check.error })

    // Route by action
    switch (payload.action) {
      case 'create_sr_folder':    return jsonResponse(createSRFolder(payload))
      case 'append_sr_row':       return jsonResponse(appendSRRow(payload))
      case 'update_sr_row':       return jsonResponse(updateSRRow(payload))
      case 'append_activity_row': return jsonResponse(appendActivityRow(payload))
      case 'create_export':       return jsonResponse(createExport(payload))
      case 'delete_sr_folder':    return jsonResponse(deleteSRFolder(payload))
      case 'delete_sr_row':       return jsonResponse(deleteSRRow(payload))
      case 'delete_activity_row': return jsonResponse(deleteActivityRow(payload))
      default:                    return jsonResponse({ ok: false, error: 'Unknown action: ' + payload.action })
    }
  } catch (err) {
    console.error('doPost error: ' + err.message)
    return jsonResponse({ ok: false, error: err.message })
  }
}

function doGet(e) {
  // Support GET ?action=...&sr_number=...&token=... for testing / curl
  if (e && e.parameter && e.parameter.action) {
    e.postData = { contents: JSON.stringify(e.parameter) }
    return doPost(e)
  }
  return jsonResponse({ ok: true, message: 'SR Platform bridge running.' })
}

/** CORS preflight — required if Content-Type is ever application/json */
function doOptions() {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT)
}


// ══════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════

// ── CREATE SR DRIVE FOLDER ───────────────────────────────

function createSRFolder(p) {
  var root   = DriveApp.getFolderById(CONFIG.SR_ROOT_FOLDER_ID)
  var year   = p.year || new Date().getFullYear().toString()
  var yf     = getOrCreateSubFolder(root, year)
  var folder = yf.createFolder(p.sr_number)

  folder.createFolder('Attachments')
  folder.createFolder('Resolution')
  folder.createFolder('Exports')
  folder.createFolder('Notes')

  return {
    ok: true,
    folder_id:  folder.getId(),
    folder_url: folder.getUrl(),
  }
}

// ── APPEND SR ROW ────────────────────────────────────────

function appendSRRow(p) {
  var sheet = getSheet(CONFIG.SR_SHEET_NAME)
  ensureHeaders(sheet, SR_HEADERS)

  sheet.appendRow([
    p.sr_number,
    p.status              || 'Open',
    fmtDate(p.reported_at),
    p.resolved_at         ? fmtDate(p.resolved_at) : '',
    p.account             || '',
    p.customer_name       || '',
    p.customer_contact    || '',
    p.customer_email      || '',
    p.issue_type          || '',
    p.issue_description   || '',
    p.resolution          || '',
    p.owner_name          || '',
    p.creator_name        || '',
    p.priority            || '',
    p.route_name          || '',
    p.folder_url          || '',
    fmtDate(new Date().toISOString()),
  ])

  return { ok: true }
}

// ── UPDATE SR ROW ────────────────────────────────────────

function updateSRRow(p) {
  var sheet = getSheet(CONFIG.SR_SHEET_NAME)
  var data  = sheet.getDataRange().getValues()

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === p.sr_number) {
      var row = i + 1
      if (p.status)      sheet.getRange(row, 2).setValue(p.status)
      if (p.resolved_at) sheet.getRange(row, 4).setValue(fmtDate(p.resolved_at))
      if (p.resolution)  sheet.getRange(row, 11).setValue(p.resolution)
      if (p.owner_name)  sheet.getRange(row, 12).setValue(p.owner_name)
      sheet.getRange(row, 17).setValue(fmtDate(new Date().toISOString()))
      return { ok: true }
    }
  }

  // Not found → append as new
  return appendSRRow(p)
}

// ── APPEND ACTIVITY ROW ──────────────────────────────────

function appendActivityRow(p) {
  var sheet = getSheet(CONFIG.ACTIVITY_SHEET_NAME)
  ensureHeaders(sheet, ACTIVITY_HEADERS)

  sheet.appendRow([
    p.activity_no  || '',
    p.title        || '',
    p.type         || '',
    p.status       || 'Open',
    p.owner_name   || '',
    p.account      || '',
    p.contact_name || '',
    p.linked_sr    || '',
    p.due_date     ? fmtDate(p.due_date) : '',
    fmtDate(p.created_at || new Date().toISOString()),
  ])

  return { ok: true }
}

// ── CREATE EXPORT (text file in SR folder) ───────────────

function createExport(p) {
  var folder = DriveApp.getFolderById(p.folder_id)
  var blob   = Utilities.newBlob(p.content, 'text/plain', p.filename)
  var file   = folder.createFile(blob)
  return { ok: true, file_id: file.getId(), file_url: file.getUrl() }
}

// ── DELETE SR FOLDER (trash) ─────────────────────────────

function deleteSRFolder(p) {
  if (!p.sr_number) return { ok: false, error: 'sr_number required' }

  var root = DriveApp.getFolderById(CONFIG.SR_ROOT_FOLDER_ID)
  var year = (p.sr_number.match(/-(\d{4})-/) || [])[1] || new Date().getFullYear().toString()
  var yf   = root.getFoldersByName(year)
  if (!yf.hasNext()) return { ok: false, error: 'Year folder not found' }

  var sf = yf.next().getFoldersByName(p.sr_number)
  if (!sf.hasNext()) return { ok: false, error: 'SR folder not found' }

  sf.next().setTrashed(true)
  return { ok: true }
}

// ── DELETE SR ROW (remove from sheet) ────────────────────

function deleteSRRow(p) {
  if (!p.sr_number) return { ok: false, error: 'sr_number required' }

  var sheet = getSheet(CONFIG.SR_SHEET_NAME)
  var data  = sheet.getDataRange().getValues()
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === p.sr_number) {
      sheet.deleteRow(i + 1)
      return { ok: true }
    }
  }
  return { ok: false, error: 'SR row not found' }
}

// ── DELETE ACTIVITY ROW (move to Removed Activities) ─────

function deleteActivityRow(p) {
  if (!p.activity_no) return { ok: false, error: 'activity_no required' }

  var sheet = getSheet(CONFIG.ACTIVITY_SHEET_NAME)
  var data  = sheet.getDataRange().getValues()

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === p.activity_no) {
      sheet.deleteRow(i + 1)

      // Move to Removed Activities
      var removed = getSheet('Removed Activities')
      if (removed.getLastRow() === 0) {
        var hdr = ['Activity No','Title','Type','Status','Owner','Account','Contact','Linked SR','Due Date','Created At','Removed At']
        var r   = removed.getRange(1, 1, 1, hdr.length)
        r.setValues([hdr])
        r.setFontWeight('bold')
      }
      var moved = data[i].slice()
      moved.push(new Date().toISOString())
      removed.appendRow(moved)

      return { ok: true }
    }
  }
  return { ok: false, error: 'Activity row not found' }
}


// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

var SR_HEADERS = [
  'SR Number','Status','Reported At','Resolved At',
  'Account','Customer Name','Contact No','Email ID',
  'Issue Type','Issue Description','Resolution','SR Owner',
  'Created By','Priority','Route','Drive Folder','Updated At',
]

var ACTIVITY_HEADERS = [
  'Activity No','Title','Type','Status','Owner','Account','Contact','Linked SR','Due Date','Created At',
]

function getOrCreateSubFolder(parent, name) {
  var iter = parent.getFoldersByName(name)
  return iter.hasNext() ? iter.next() : parent.createFolder(name)
}

function getSheet(name) {
  var ss    = SpreadsheetApp.openById(CONFIG.SR_REGISTER_SPREADSHEET_ID)
  var sheet = ss.getSheetByName(name)
  if (!sheet) sheet = ss.insertSheet(name)
  return sheet
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() > 0) return
  var r = sheet.getRange(1, 1, 1, headers.length)
  r.setValues([headers])
  r.setFontWeight('bold')
  r.setBackground('#0A0C12')
  r.setFontColor('#00D4AA')
  sheet.setFrozenRows(1)
}

function fmtDate(iso) {
  if (!iso) return ''
  var d = new Date(iso)
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm')
}

function verifyTimestamp(p) {
  if (p.token !== CONFIG.SECRET_TOKEN) return { valid: false, error: 'Unauthorized' }
  var t = parseInt(p.timestamp, 10)
  if (isNaN(t)) return { valid: false, error: 'Invalid timestamp' }
  if (Math.abs(new Date().getTime() - t) > TIMESTAMP_WINDOW_MS) return { valid: false, error: 'Timestamp expired' }
  return { valid: true }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
