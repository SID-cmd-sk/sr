import { getSupabase } from '../services/supabase.js'
import { appState } from '../services/app-state.js'
import { escHtml } from '../utils/format.js'
import { CFG } from '../utils/config.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'

export default {
  async render(container, params) {
    const sb = getSupabase()
    const me = appState.get('user')
    container.innerHTML = skeletonPage()

    try {
      const [{ data: driveSet }, { data: genSet }, { data: waSet }, { data: myProfile }] = await Promise.all([
        sb.from('settings').select('value').eq('key', 'drive').single(),
        sb.from('settings').select('value').eq('key', 'general').single(),
        sb.from('settings').select('value').eq('key', 'whatsapp').single(),
        sb.from('users').select('smtp_email,smtp_password,name').eq('id', me.id).single(),
      ])

      const gen = genSet?.value ?? { company_name: '', sr_prefix: 'SR', timezone: 'Asia/Kolkata' }
      const drv = driveSet?.value ?? { sr_folder_id: '', apps_script_url: '', apps_script_token: '' }
      const wa = waSet?.value ?? { bridge_url: 'http://localhost:3001' }

      container.innerHTML = `
        <div class="page-header">
          <div><div class="page-title">Settings</div></div>
        </div>
        <div class="tabs">
          <button class="tab-btn active" id="tab-btn-email"    onclick="switchSettingsTab('email')">My Email</button>
          <button class="tab-btn"        id="tab-btn-general"  onclick="switchSettingsTab('general')">General</button>
          <button class="tab-btn"        id="tab-btn-drive"    onclick="switchSettingsTab('drive')">Google Drive</button>
          <button class="tab-btn"        id="tab-btn-wa"       onclick="switchSettingsTab('wa')">WhatsApp</button>
          <button class="tab-btn"        id="tab-btn-debug"    onclick="switchSettingsTab('debug')">Debug Log</button>
        </div>
        <div id="settings-panel"></div>`

      const errorLog = appState.get('errorLog') || []

      const panels = {
        email: `<div class="card" style="max-width:560px">
          <div class="section-title mb-2">My Email Credentials</div>
          <p style="color:var(--text-2);font-size:.8rem;margin-bottom:20px;line-height:1.6">Emails are sent from your own mailbox using the company mail server below. Each user manages their own credentials.</p>
          <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:20px">
            <div class="label-xs mb-2">Company Mail Server (fixed)</div>
            <div class="flex gap-4 flex-wrap" style="font-size:.78rem;font-family:var(--mono);color:var(--text-2)">
              <span>Host: <strong style="color:var(--text-1)">smtpout.secureserver.net</strong></span>
              <span>Port: <strong style="color:var(--text-1)">465</strong></span>
              <span>SSL: <strong style="color:var(--green)">On</strong></span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="form-group">
              <label class="form-label req">Your Email Address</label>
              <input class="form-input" id="se-email" type="email" value="${escHtml(myProfile?.smtp_email ?? '')}" placeholder="you@sks3d.com"/>
              <div class="form-hint">Must match your GoDaddy/company mailbox login</div>
            </div>
            <div class="form-group">
              <label class="form-label req">Your Email Password</label>
              <input class="form-input" id="se-pass" type="password" value="${escHtml(myProfile?.smtp_password ?? '')}" placeholder="••••••••"/>
              <div class="form-hint">Your mailbox password — stored in your profile only</div>
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4 flex-wrap">
            <button class="btn btn-primary" onclick="window.saveEmailCreds()">Save My Email</button>
            <button class="btn btn-secondary" onclick="window.testEmail()">Send Test Email</button>
            <div id="email-creds-msg" style="font-size:.8rem"></div>
          </div>
        </div>`,

        general: `<div class="card" style="max-width:560px">
          <div class="section-title mb-4">General Settings</div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="form-group">
              <label class="form-label">Company / System Name</label>
              <input class="form-input" id="sg-company" value="${escHtml(gen.company_name ?? '')}"/>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">SR Number Prefix</label>
                <input class="form-input" id="sg-prefix" value="${escHtml(gen.sr_prefix ?? 'SR')}" placeholder="SR"/>
                <div class="form-hint">e.g. SR → SR-2026-0001</div>
              </div>
              <div class="form-group">
                <label class="form-label">Timezone</label>
                <select class="form-select" id="sg-tz">
                  ${['Asia/Kolkata', 'Asia/Dubai', 'UTC', 'America/New_York', 'Europe/London'].map(tz => `<option ${tz === gen.timezone ? 'selected' : ''}>${tz}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4">
            <button class="btn btn-primary" onclick="window.saveGeneral()">Save General</button>
            <div id="gen-msg" style="font-size:.8rem"></div>
          </div>
        </div>`,

        drive: `<div class="card" style="max-width:560px">
          <div class="section-title mb-2">Google Drive & Apps Script</div>
          <p style="color:var(--text-2);font-size:.8rem;margin-bottom:18px;line-height:1.6">Configure folder IDs and Apps Script bridge for Drive and Sheets integration.</p>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="form-group">
              <label class="form-label">SR Folder ID</label>
              <input class="form-input" id="sd-folder" value="${escHtml(drv.sr_folder_id ?? '')}" placeholder="Google Drive folder ID"/>
              <div class="form-hint">From the Drive URL: drive.google.com/drive/folders/<strong>THIS_PART</strong></div>
            </div>
            <div class="form-group">
              <label class="form-label">Apps Script Web App URL</label>
              <input class="form-input" id="sd-url" value="${escHtml(drv.apps_script_url ?? '')}" placeholder="https://script.google.com/macros/s/…/exec"/>
            </div>
            <div class="form-group">
              <label class="form-label">Apps Script Token</label>
              <input class="form-input" id="sd-token" type="password" value="${escHtml(drv.apps_script_token ?? '')}" placeholder="Secret token matching Code.gs"/>
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4 flex-wrap">
            <button class="btn btn-primary" onclick="window.saveDrive()">Save Drive Settings</button>
            <button class="btn btn-secondary" onclick="window.testDrive()">Test Connection</button>
            <div id="drive-msg" style="font-size:.8rem"></div>
          </div>
        </div>`,

        wa: `<div class="card" style="max-width:560px">
          <div class="section-title mb-2">WhatsApp Bridge</div>
          <p style="color:var(--text-2);font-size:.8rem;margin-bottom:18px;line-height:1.6">The WhatsApp bridge is a separate service (wa-service/bridge.js). Enter its URL here.</p>
          <div class="form-group">
            <label class="form-label">Bridge URL</label>
            <input class="form-input" id="sw-url" value="${escHtml(wa.bridge_url ?? 'http://localhost:3001')}" placeholder="http://localhost:3001"/>
          </div>
          <div class="alert alert-info mt-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01" stroke-linecap="round"/></svg>
            <div>Start: <code style="font-family:var(--mono);background:rgba(0,0,0,.3);padding:1px 6px;border-radius:3px;font-size:.75rem">cd wa-service && node bridge.js</code></div>
          </div>
          <div class="flex items-center gap-3 mt-4">
            <button class="btn btn-primary" onclick="window.saveWA()">Save WhatsApp Settings</button>
            <div id="wa-msg" style="font-size:.8rem"></div>
          </div>
        </div>`,

        debug: `<div class="card" style="max-width:720px">
          <div class="section-title mb-2">Error Log</div>
          <p style="color:var(--text-2);font-size:.8rem;margin-bottom:14px">Recent system errors and debug information</p>
          <div style="border:1px solid var(--border);border-radius:var(--r);background:var(--bg-elevated);max-height:400px;overflow-y:auto;font-family:var(--mono);font-size:.7rem">
            ${errorLog.length === 0 ? `<div style="padding:16px;color:var(--text-3)">No errors logged</div>` : `
              <table style="width:100%;border-collapse:collapse">
                <tbody>
                ${errorLog.map((e, i) => `<tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:8px 12px;color:var(--text-2)">${e.time}</td>
                  <td style="padding:8px 12px;color:var(--text-2);width:80px">[${e.source}]</td>
                  <td style="padding:8px 12px;color:var(--text-1);word-break:break-word">${escHtml(e.msg.substring(0, 200))}</td>
                </tr>`).join('')}
                </tbody>
              </table>
            `}
          </div>
          <div class="flex items-center gap-3 mt-4">
            <button class="btn btn-secondary btn-sm" onclick="appState.set('errorLog',[]);document.location.reload()">Clear Log</button>
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(JSON.stringify(appState.get('errorLog'),null,2)).then(()=>alert('Copied to clipboard'))">Export as JSON</button>
          </div>
        </div>`,
      }

      window.switchSettingsTab = (t) => {
        document.querySelectorAll('[id^="tab-btn-"]').forEach(b => b.classList.toggle('active', b.id === `tab-btn-${t}`))
        document.getElementById('settings-panel').innerHTML = panels[t] || ''
      }

      window.saveEmailCreds = async () => {
        const em = document.getElementById('se-email')?.value?.trim()
        const pw = document.getElementById('se-pass')?.value
        const el = document.getElementById('email-creds-msg')
        const { error } = await sb.from('users').update({ smtp_email: em, smtp_password: pw }).eq('id', me.id)
        if (!error) { const u = appState.get('user'); if (u) u.smtp_email = em }
        if (el) { el.textContent = error ? `✗ ${error.message}` : '✓ Saved'; el.style.color = error ? 'var(--red)' : 'var(--green)' }
      }

      window.testEmail = async () => {
        const em = document.getElementById('se-email')?.value?.trim()
        const pw = document.getElementById('se-pass')?.value
        const el = document.getElementById('email-creds-msg')
        if (el) { el.textContent = 'Sending test…'; el.style.color = 'var(--text-3)' }
        await sb.from('users').update({ smtp_email: em, smtp_password: pw }).eq('id', me.id)
        try {
          await window.smtpSend({ host: CFG.smtpHost, port: CFG.smtpPort, username: em, password: pw, to: em, from: em, saveToSent: true, subject: 'SR Platform — Test Email', body: 'Your email credentials are configured correctly.' })
          if (el) { el.textContent = `✓ Test sent to ${em}`; el.style.color = 'var(--green)' }
        } catch (e) {
          if (el) { el.textContent = '✗ Error: ' + e.message; el.style.color = 'var(--red)' }
        }
      }

      window.saveGeneral = async () => {
        await sb.from('settings').upsert({ key: 'general', value: { company_name: document.getElementById('sg-company')?.value, sr_prefix: document.getElementById('sg-prefix')?.value, timezone: document.getElementById('sg-tz')?.value }, updated_by: me.id })
        const el = document.getElementById('gen-msg'); if (el) { el.textContent = '✓ Saved'; el.style.color = 'var(--green)'; setTimeout(() => el.textContent = '', 3000) }
      }

      window.saveDrive = async () => {
        const url = document.getElementById('sd-url')?.value?.trim()
        const token = document.getElementById('sd-token')?.value
        const existingValue = drv
        const newValue = { sr_folder_id: document.getElementById('sd-folder')?.value, apps_script_url: url, apps_script_token: token, activities_folder_id: existingValue.activities_folder_id || CFG.activitiesFolderId, spreadsheet_id: existingValue.spreadsheet_id || CFG.srSpreadsheetId, sr_sheet_name: existingValue.sr_sheet_name || CFG.srSheetName, activity_sheet_name: existingValue.activity_sheet_name || CFG.activitySheetName }
        await sb.from('settings').upsert({ key: 'drive', value: newValue, updated_by: me.id })
        CFG.appsScriptUrl = url; CFG.appsScriptToken = token; CFG.srFolderId = newValue.sr_folder_id; CFG.activitiesFolderId = newValue.activities_folder_id; CFG.srSpreadsheetId = newValue.spreadsheet_id; CFG.srSheetName = newValue.sr_sheet_name; CFG.activitySheetName = newValue.activity_sheet_name
        const el = document.getElementById('drive-msg'); if (el) { el.textContent = '✓ Saved'; el.style.color = 'var(--green)'; setTimeout(() => el.textContent = '', 3000) }
      }

      window.testDrive = async () => {
        const url = document.getElementById('sd-url')?.value?.trim()
        const el = document.getElementById('drive-msg')
        if (el) { el.textContent = 'Testing…'; el.style.color = 'var(--text-3)' }
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
          const d = await r.json()
          if (el) { el.textContent = d.ok ? '✓ Connected!' : '✗ ' + d.error; el.style.color = d.ok ? 'var(--green)' : 'var(--red)' }
        } catch {
          if (el) { el.textContent = '✗ Could not reach URL'; el.style.color = 'var(--red)' }
        }
      }

      window.saveWA = async () => {
        const url = document.getElementById('sw-url')?.value?.trim()
        await sb.from('settings').upsert({ key: 'whatsapp', value: { bridge_url: url }, updated_by: me.id })
        CFG.waBridgeUrl = url
        const el = document.getElementById('wa-msg'); if (el) { el.textContent = '✓ Saved'; el.style.color = 'var(--green)'; setTimeout(() => el.textContent = '', 3000) }
      }

      window.switchSettingsTab('email')
    } catch (e) {
      container.innerHTML = pageError('Could not load settings', e.message, true, 'settings')
    }
  }
}
