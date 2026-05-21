// ============================================================
// SR PLATFORM  —  Google Apps Script Bridge
// Deploy as: Web App → Execute as: Me → Access: Anyone
// Copy the deployment URL → paste into Admin → Settings → Drive
// ============================================================

// ────────────────────────────────────────────────────────────
// CONFIGURATION  — update these folder IDs after setup
// ────────────────────────────────────────────────────────────
const CONFIG = {
	SR_ROOT_FOLDER_ID:          '1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV',
	ACTIVITIES_FOLDER_ID:       '1ZhC-rDMoPRnKkK3OVDT3_eC_A5hBSahV',
	SR_REGISTER_SPREADSHEET_ID: '10k6weyGqYVEsUNf4DUe1fFGrBaB2sfOBIskhn2pFWGQ',
	SR_SHEET_NAME:              'SR Register',
	ACTIVITY_SHEET_NAME:        'Activity Log',
	SECRET_TOKEN:               'SR_PLATFORM_2026_SECRET'
}

// ────────────────────────────────────────────────────────────
// MAIN ROUTER
// ────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents)

    // Auth check
    if (payload.token !== CONFIG.SECRET_TOKEN) {
      return json({ ok: false, error: 'Unauthorized' }, 403)
    }

    switch (payload.action) {
      case 'create_sr_folder':    return json(createSRFolder(payload))
      case 'append_sr_row':       return json(appendSRRow(payload))
      case 'update_sr_row':       return json(updateSRRow(payload))
      case 'append_activity_row': return json(appendActivityRow(payload))
      case 'create_export':       return json(createExport(payload))
      default:
        return json({ ok: false, error: `Unknown action: ${payload.action}` })
    }
  } catch (err) {
    return json({ ok: false, error: err.toString() })
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
