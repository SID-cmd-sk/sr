'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AppSettings } from '@/types'

const DEFAULT: AppSettings = {
  general:   { company_name:'', sr_prefix:'SR', timezone:'Asia/Kolkata', date_format:'DD-MM-YYYY' },
  email:     { smtp_host:'', smtp_port:587, smtp_user:'', smtp_from:'', smtp_from_name:'' },
  drive:     { root_folder_id:'', sr_folder_id:'', activities_folder_id:'', apps_script_url:'' },
  whatsapp:  { bridge_url:'http://localhost:3001', session_active:false },
}

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string,string>>({})
  const [tab, setTab] = useState<'general'|'email'|'drive'|'whatsapp'>('general')
  const [testLoading, setTestLoading] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const keys = ['general','email','drive','whatsapp']
    const { data } = await supabase.from('settings').select('key,value').in('key', keys)
    if (!data) return
    const merged: AppSettings = { ...DEFAULT }
    data.forEach(row => { (merged as any)[row.key] = { ...(DEFAULT as any)[row.key], ...row.value } })
    setSettings(merged)
  }

  function set<K extends keyof AppSettings>(section: K, key: keyof AppSettings[K], val: any) {
    setSettings(s => ({ ...s, [section]: { ...s[section], [key]: val } }))
  }

  async function save(section: keyof AppSettings) {
    setSaving(section)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('settings').upsert({
      key: section,
      value: settings[section] as any,
      updated_by: user!.id,
      updated_at: new Date().toISOString(),
    })
    setMsg(m => ({ ...m, [section]: '✓ Saved' }))
    setTimeout(() => setMsg(m => ({ ...m, [section]: '' })), 3000)
    setSaving(null)
  }

  async function testEmail() {
    setTestLoading(true); setTestMsg('')
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: settings.email.smtp_from, subject: 'SR Platform — Test Email', message: 'This is a test email from SR Platform. If you received this, your SMTP configuration is working correctly.' }),
    })
    const d = await res.json()
    setTestMsg(d.ok ? '✓ Test email sent successfully!' : `✗ ${d.error}`)
    setTestLoading(false)
  }

  async function testDrive() {
    setTestLoading(true); setTestMsg('')
    try {
      const r = await fetch(settings.drive.apps_script_url, { method: 'GET', signal: AbortSignal.timeout(5000) })
      const d = await r.json()
      setTestMsg(d.ok ? '✓ Apps Script bridge is reachable!' : `✗ Bridge error: ${d.error}`)
    } catch {
      setTestMsg('✗ Could not reach Apps Script URL. Make sure it is deployed and accessible.')
    }
    setTestLoading(false)
  }

  const TABS = [
    { id: 'general',   label: 'General' },
    { id: 'email',     label: 'Email / SMTP' },
    { id: 'drive',     label: 'Google Drive' },
    { id: 'whatsapp',  label: 'WhatsApp' },
  ] as const

  return (
    <>
      <div className="page-header">
        <div className="page-title">System Settings</div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setTestMsg('') }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* GENERAL */}
      {tab === 'general' && (
        <div className="card" style={{ maxWidth:'560px' }}>
          <h3 style={{ marginBottom:'16px' }}>General Settings</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-group">
              <label className="form-label">Company / System Name</label>
              <input className="form-input" value={settings.general.company_name}
                onChange={e => set('general','company_name',e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SR Number Prefix</label>
                <input className="form-input" value={settings.general.sr_prefix}
                  onChange={e => set('general','sr_prefix',e.target.value)} placeholder="SR" />
                <div className="form-hint">e.g. SR → SR-2026-0001</div>
              </div>
              <div className="form-group">
                <label className="form-label">Timezone</label>
                <select className="form-select" value={settings.general.timezone}
                  onChange={e => set('general','timezone',e.target.value)}>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'20px' }}>
            <button className="btn btn-primary" onClick={() => save('general')} disabled={saving==='general'}>
              {saving==='general' ? 'Saving…' : 'Save General Settings'}
            </button>
            {msg.general && <span style={{ color:'var(--green)', fontSize:'0.8rem' }}>{msg.general}</span>}
          </div>
        </div>
      )}

      {/* EMAIL */}
      {tab === 'email' && (
        <div className="card" style={{ maxWidth:'560px' }}>
          <h3 style={{ marginBottom:'4px' }}>SMTP / Email Configuration</h3>
          <p style={{ color:'var(--text-muted)', fontSize:'0.8rem', marginBottom:'16px' }}>
            Used for sending SR notifications and workflow emails. SMTP password is stored in the server .env file for security.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SMTP Host</label>
                <input className="form-input" value={settings.email.smtp_host}
                  onChange={e => set('email','smtp_host',e.target.value)}
                  placeholder="smtp.gmail.com" />
              </div>
              <div className="form-group">
                <label className="form-label">SMTP Port</label>
                <input className="form-input" type="number" value={settings.email.smtp_port}
                  onChange={e => set('email','smtp_port',parseInt(e.target.value))}
                  placeholder="587" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">SMTP Username</label>
              <input className="form-input" type="email" value={settings.email.smtp_user}
                onChange={e => set('email','smtp_user',e.target.value)}
                placeholder="your-email@company.com" />
            </div>
            <div className="alert alert-warning" style={{ fontSize:'0.78rem' }}>
              SMTP password must be set in the server environment as <code style={{ fontFamily:'var(--font-mono)', background:'rgba(0,0,0,.3)', padding:'0 4px', borderRadius:'3px' }}>SMTP_PASSWORD</code> — never stored in database.
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">From Email</label>
                <input className="form-input" type="email" value={settings.email.smtp_from}
                  onChange={e => set('email','smtp_from',e.target.value)}
                  placeholder="noreply@company.com" />
              </div>
              <div className="form-group">
                <label className="form-label">From Name</label>
                <input className="form-input" value={settings.email.smtp_from_name}
                  onChange={e => set('email','smtp_from_name',e.target.value)}
                  placeholder="SR Platform" />
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'20px', flexWrap:'wrap' }}>
            <button className="btn btn-primary" onClick={() => save('email')} disabled={saving==='email'}>
              {saving==='email' ? 'Saving…' : 'Save Email Settings'}
            </button>
            <button className="btn btn-secondary" onClick={testEmail} disabled={testLoading}>
              {testLoading ? 'Sending…' : 'Send Test Email'}
            </button>
            {msg.email && <span style={{ color:'var(--green)', fontSize:'0.8rem' }}>{msg.email}</span>}
          </div>
          {testMsg && (
            <div className={`alert ${testMsg.startsWith('✓') ? 'alert-success' : 'alert-error'} mt-2`} style={{ marginTop:'10px', fontSize:'0.8rem' }}>{testMsg}</div>
          )}
        </div>
      )}

      {/* DRIVE */}
      {tab === 'drive' && (
        <div className="card" style={{ maxWidth:'560px' }}>
          <h3 style={{ marginBottom:'4px' }}>Google Drive & Apps Script</h3>
          <p style={{ color:'var(--text-muted)', fontSize:'0.8rem', marginBottom:'16px' }}>
            Configure folder IDs and the Apps Script bridge URL for Drive integration and Sheets logging.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-group">
              <label className="form-label">SR Root Folder ID</label>
              <input className="form-input" value={settings.drive.sr_folder_id}
                onChange={e => set('drive','sr_folder_id',e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
              <div className="form-hint">Copy from the Google Drive URL of your SR folder</div>
            </div>
            <div className="form-group">
              <label className="form-label">Activities Folder ID</label>
              <input className="form-input" value={settings.drive.activities_folder_id}
                onChange={e => set('drive','activities_folder_id',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Apps Script Web App URL</label>
              <input className="form-input" value={settings.drive.apps_script_url}
                onChange={e => set('drive','apps_script_url',e.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec" />
              <div className="form-hint">Deploy the provided Code.gs as a Web App and paste the URL here</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'20px', flexWrap:'wrap' }}>
            <button className="btn btn-primary" onClick={() => save('drive')} disabled={saving==='drive'}>
              {saving==='drive' ? 'Saving…' : 'Save Drive Settings'}
            </button>
            {settings.drive.apps_script_url && (
              <button className="btn btn-secondary" onClick={testDrive} disabled={testLoading}>
                {testLoading ? 'Testing…' : 'Test Connection'}
              </button>
            )}
            {msg.drive && <span style={{ color:'var(--green)', fontSize:'0.8rem' }}>{msg.drive}</span>}
          </div>
          {testMsg && (
            <div className={`alert ${testMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`} style={{ marginTop:'10px', fontSize:'0.8rem' }}>{testMsg}</div>
          )}
        </div>
      )}

      {/* WHATSAPP */}
      {tab === 'whatsapp' && (
        <div className="card" style={{ maxWidth:'560px' }}>
          <h3 style={{ marginBottom:'4px' }}>WhatsApp Bridge</h3>
          <p style={{ color:'var(--text-muted)', fontSize:'0.8rem', marginBottom:'16px' }}>
            The WhatsApp bridge is a separate Node.js service that runs on your VPS. Configure its URL here.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div className="form-group">
              <label className="form-label">Bridge Service URL</label>
              <input className="form-input" value={settings.whatsapp.bridge_url}
                onChange={e => set('whatsapp','bridge_url',e.target.value)}
                placeholder="http://localhost:3001" />
              <div className="form-hint">URL where the wa-service is running. Set the same in .env as WA_BRIDGE_URL</div>
            </div>
            <div className="alert alert-info" style={{ fontSize:'0.78rem' }}>
              To start the WhatsApp bridge, run: <code style={{ fontFamily:'var(--font-mono)', display:'block', marginTop:'6px', background:'rgba(0,0,0,.3)', padding:'6px 8px', borderRadius:'4px' }}>cd wa-service && node bridge.js</code>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'20px' }}>
            <button className="btn btn-primary" onClick={() => save('whatsapp')} disabled={saving==='whatsapp'}>
              {saving==='whatsapp' ? 'Saving…' : 'Save WhatsApp Settings'}
            </button>
            {msg.whatsapp && <span style={{ color:'var(--green)', fontSize:'0.8rem' }}>{msg.whatsapp}</span>}
          </div>
        </div>
      )}
    </>
  )
}
