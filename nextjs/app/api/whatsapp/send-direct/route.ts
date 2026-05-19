// app/api/whatsapp/send-direct/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WA_BRIDGE = process.env.WA_BRIDGE_URL ?? 'http://localhost:3001'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { phone, message } = await req.json()
  if (!phone || !message) return NextResponse.json({ ok: false, error: 'phone and message required' })

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
        channel: 'whatsapp', recipient: phone, body: message,
        status: 'sent', sent_by: user.id,
      })
    }
    return NextResponse.json(d)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? 'Send failed' })
  }
}
