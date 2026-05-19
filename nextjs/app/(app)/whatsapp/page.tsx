'use client'
import { useState, useEffect, useRef } from 'react'

interface WAStatus { connected: boolean; phone?: string; qr?: string }

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WAStatus>({ connected: false })
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sendStatus, setSendStatus] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchStatus()
    // Poll every 3s while not connected
    pollRef.current = setInterval(fetchStatus, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function fetchStatus() {
    try {
      const r = await fetch('/api/whatsapp/status')
      const d = await r.json()
      setStatus(d)
      if (d.connected && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch { /* bridge may be offline */ }
  }

  async function connect() {
    setLoading(true)
    await fetch('/api/whatsapp/connect', { method: 'POST' })
    setTimeout(fetchStatus, 1500)
    setLoading(false)
  }

  async function disconnect() {
    setLoading(true)
    await fetch('/api/whatsapp/disconnect', { method: 'POST' })
    setStatus({ connected: false })
    setLoading(false)
    // Restart polling so QR updates if reconnect is triggered
    if (!pollRef.current) {
      pollRef.current = setInterval(fetchStatus, 3000)
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!phone || !message) return
    setSendStatus('Sending…')
    const r = await fetch('/api/whatsapp/send-direct', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone, message }),
    })
    const d = await r.json()
    setSendStatus(d.ok ? '✓ Message sent!' : `✗ ${d.error}`)
    if (d.ok) { setPhone(''); setMessage('') }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">WhatsApp</div>
          <div className="page-subtitle">QR-based session for team messaging and SR notifications</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{
            width:'8px', height:'8px', borderRadius:'50%',
            background: status.connected ? 'var(--accent)' : 'var(--text-muted)',
            boxShadow: status.connected ? '0 0 8px var(--accent)' : 'none',
          }} />
          <span style={{ fontSize:'0.8rem', color: status.connected ? 'var(--accent)' : 'var(--text-muted)' }}>
            {status.connected ? `Connected ${status.phone ? `· ${status.phone}` : ''}` : 'Disconnected'}
          </span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', alignItems:'start' }}>
        {/* QR / Connect panel */}
        <div className="card" style={{ textAlign:'center' }}>
          <h3 style={{ marginBottom:'16px' }}>Session Control</h3>

          {!status.connected ? (
            <>
              {status.qr ? (
                <div style={{ marginBottom:'20px' }}>
                  <p style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:'16px' }}>
                    Scan this QR code with WhatsApp on your phone
                  </p>
                  {/* QR is a data URL or base64 from the bridge */}
                  <div style={{
                    display:'inline-block', padding:'16px', background:'white',
                    borderRadius:'var(--radius-lg)', margin:'0 auto',
                  }}>
                    <img src={status.qr} alt="WhatsApp QR" style={{ width:'200px', height:'200px', display:'block' }} />
                  </div>
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'12px' }}>
                    Open WhatsApp → Settings → Linked Devices → Link a Device
                  </p>
                  <div style={{ marginTop:'16px' }}>
                    <div className="animate-pulse" style={{ fontSize:'0.75rem', color:'var(--accent)' }}>
                      Waiting for scan…
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding:'40px 20px' }}>
                  <div style={{
                    width:'80px', height:'80px', borderRadius:'50%',
                    background:'var(--bg-elevated)', border:'2px dashed var(--border-light)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    margin:'0 auto 20px',
                  }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <p style={{ color:'var(--text-secondary)', fontSize:'0.875rem', marginBottom:'20px' }}>
                    Click Connect to generate a QR code and link your WhatsApp account
                  </p>
                  <button className="btn btn-primary btn-lg" onClick={connect} disabled={loading}>
                    {loading ? 'Starting…' : '🔗 Connect WhatsApp'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding:'32px 20px' }}>
              <div style={{
                width:'80px', height:'80px', borderRadius:'50%',
                background:'var(--accent-dim)', border:'2px solid var(--accent)',
                display:'flex', alignItems:'center', justifyContent:'center',
                margin:'0 auto 20px',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p style={{ color:'var(--accent)', fontWeight:600, marginBottom:'6px' }}>WhatsApp Connected</p>
              {status.phone && (
                <p style={{ color:'var(--text-secondary)', fontSize:'0.8rem', marginBottom:'20px' }}>{status.phone}</p>
              )}
              <p style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginBottom:'20px' }}>
                Session is active. The team shares this connection for sending messages.
              </p>
              <button className="btn btn-danger" onClick={disconnect} disabled={loading}>
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Send message panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          <div className="card">
            <h3 style={{ marginBottom:'16px' }}>Send Message</h3>
            {!status.connected ? (
              <div style={{ color:'var(--text-muted)', fontSize:'0.875rem', textAlign:'center', padding:'20px' }}>
                Connect WhatsApp first to send messages
              </div>
            ) : (
              <form onSubmit={sendMessage} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div className="form-group">
                  <label className="form-label required">Phone Number</label>
                  <input className="form-input" type="tel" placeholder="+91 9999999999"
                    value={phone} onChange={e => setPhone(e.target.value)} required />
                  <div className="form-hint">Include country code, e.g. +91 for India</div>
                </div>
                <div className="form-group">
                  <label className="form-label required">Message</label>
                  <textarea className="form-textarea" rows={4} placeholder="Type your message…"
                    value={message} onChange={e => setMessage(e.target.value)} required />
                </div>
                {sendStatus && (
                  <div style={{ fontSize:'0.8rem', color: sendStatus.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
                    {sendStatus}
                  </div>
                )}
                <button type="submit" className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
                  Send Message
                </button>
              </form>
            )}
          </div>

          {/* Info */}
          <div className="card" style={{ background:'var(--accent-dim)', borderColor:'rgba(0,212,170,.2)' }}>
            <h4 style={{ marginBottom:'8px', color:'var(--accent)' }}>How WhatsApp works here</h4>
            <ul style={{ fontSize:'0.8rem', color:'var(--text-secondary)', lineHeight:1.7, paddingLeft:'14px' }}>
              <li>One shared business session for the entire team</li>
              <li>Admin connects once by scanning QR</li>
              <li>All users can trigger messages from SR workflow</li>
              <li>Session persists on the server (VPS)</li>
              <li>Auto-reconnects if session drops</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
