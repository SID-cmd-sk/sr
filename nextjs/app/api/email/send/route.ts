// app/api/email/send/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import nodemailer from 'nodemailer'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { sr_id, type, to, subject, message, template_id } = body

    // Load email settings
    const { data: settings } = await supabase.from('settings').select('value').eq('key','email').single()
    const cfg = settings?.value as any
    if (!cfg?.smtp_host) return NextResponse.json({ ok: false, error: 'Email not configured. Set SMTP in Admin → Settings.' })

    let recipient = to
    let emailSubject = subject
    let emailBody = message

    // SR-based email
    if (sr_id) {
      const { data: sr } = await supabase.from('sr_list').select('*').eq('id', sr_id).single()
      if (!sr) return NextResponse.json({ ok: false, error: 'SR not found' })
      recipient = recipient || sr.customer_email

      // Load template if provided
      if (template_id) {
        const { data: tpl } = await supabase.from('templates').select('*').eq('id', template_id).single()
        if (tpl) {
          emailSubject = tpl.subject ? replacePlaceholders(tpl.subject, sr, cfg) : emailSubject
          emailBody = replacePlaceholders(tpl.body, sr, cfg)
        }
      } else {
        // Default subject
        emailSubject = emailSubject || `Update on Service Request ${sr.sr_number}`
        emailBody = emailBody || `Your SR ${sr.sr_number} status is now: ${sr.status}`
      }
    }

    if (!recipient) return NextResponse.json({ ok: false, error: 'No recipient specified' })
    if (!emailBody) return NextResponse.json({ ok: false, error: 'No message body. Provide message or template_id.' })
    if (!emailSubject) emailSubject = 'Message from SR Platform'

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port ?? 587,
      secure: cfg.smtp_port === 465,
      auth: { user: cfg.smtp_user, pass: process.env.SMTP_PASSWORD },
    })

    await transporter.sendMail({
      from: `${cfg.smtp_from_name ?? 'SR Platform'} <${cfg.smtp_from}>`,
      to: recipient,
      subject: emailSubject,
      text: emailBody,
      html: wrapHtml(emailBody, cfg),
    })

    // Log it
    await supabase.from('notification_logs').insert({
      channel: 'email',
      sr_id: sr_id || null,
      recipient,
      subject: emailSubject,
      body: emailBody,
      template_id: template_id || null,
      status: 'sent',
      sent_by: user.id,
    })

    await supabase.from('audit_log').insert({
      action: 'EMAIL_SENT', user_id: user.id,
      target_id: sr_id, target_type: 'sr',
      description: `Email sent to ${recipient}`,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Email send error:', err)
    return NextResponse.json({ ok: false, error: err.message ?? 'Failed to send email' })
  }
}

function replacePlaceholders(template: string, sr: any, cfg: any): string {
  return template
    .replace(/\{\{sr_number\}\}/g, sr.sr_number ?? '')
    .replace(/\{\{customer_name\}\}/g, sr.customer_name ?? '')
    .replace(/\{\{owner_name\}\}/g, sr.owner_name ?? '')
    .replace(/\{\{issue_type\}\}/g, sr.issue_type ?? '')
    .replace(/\{\{issue_description\}\}/g, sr.issue_description ?? '')
    .replace(/\{\{status\}\}/g, sr.status ?? '')
    .replace(/\{\{priority\}\}/g, sr.priority ?? '')
    .replace(/\{\{resolution\}\}/g, sr.resolution ?? '')
    .replace(/\{\{resolved_date\}\}/g, sr.closed_at ? new Date(sr.closed_at).toLocaleDateString('en-IN') : '')
    .replace(/\{\{company_name\}\}/g, cfg.smtp_from_name ?? 'SR Platform')
    .replace(/\{\{sr_url\}\}/g, `${process.env.NEXT_PUBLIC_APP_URL}/sr/${sr.id}`)
    .replace(/\{\{account\}\}/g, sr.account ?? '')
    .replace(/\{\{reported_date\}\}/g, sr.reported_at ? new Date(sr.reported_at).toLocaleDateString('en-IN') : '')
}

function wrapHtml(text: string, cfg: any): string {
  const escaped = text.replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6; margin: 0; padding: 0; background: #f5f5f5; }
  .wrap { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .header { background: #0A0C12; padding: 20px 32px; }
  .header h1 { color: #00D4AA; font-size: 18px; margin: 0; }
  .body { padding: 32px; }
  .footer { padding: 16px 32px; background: #f9f9f9; font-size: 12px; color: #999; border-top: 1px solid #eee; }
</style></head>
<body>
  <div class="wrap">
    <div class="header"><h1>${cfg.smtp_from_name ?? 'SR Platform'}</h1></div>
    <div class="body">${escaped}</div>
    <div class="footer">This is an automated message from SR Platform · Internal use only</div>
  </div>
</body></html>`
}
