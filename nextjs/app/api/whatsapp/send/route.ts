// app/api/whatsapp/send/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WA_BRIDGE = process.env.WA_BRIDGE_URL ?? 'http://localhost:3001'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { sr_id, type, phone: manualPhone, message: manualMsg } = await req.json()

  let phone = manualPhone
  let message = manualMsg

  if (sr_id) {
    const { data: sr } = await supabase.from('sr_list').select('*').eq('id', sr_id).single()
    if (!sr) return NextResponse.json({ ok: false, error: 'SR not found' })
    phone = phone || sr.customer_contact
    if (!message) {
      message = `Hello ${sr.customer_name ?? 'there'}, your service request *${sr.sr_number}* status is now: *${sr.status}*. Thank you.`
    }
  }

  if (!phone) return NextResponse.json({ ok: false, error: 'No phone number available' })

  try {
    const r = await fetch(`${WA_BRIDGE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(15000),
    })
    const d = await r.json()
    if (d.ok) {
      await supabase.from('notification_logs').insert({
        channel: 'whatsapp', sr_id: sr_id || null,
        recipient: phone, body: message, status: 'sent', sent_by: user.id,
      })
      await supabase.from('audit_log').insert({
        action: 'WHATSAPP_SENT', user_id: user.id,
        target_id: sr_id, target_type: 'sr',
        description: `WhatsApp sent to ${phone}`,
      })
    }
    return NextResponse.json(d)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? 'Send failed' })
  }
}
