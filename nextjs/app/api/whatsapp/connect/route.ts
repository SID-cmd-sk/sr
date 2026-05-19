// app/api/whatsapp/connect/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WA_BRIDGE = process.env.WA_BRIDGE_URL ?? 'http://localhost:3001'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const r = await fetch(`${WA_BRIDGE}/connect`, { method: 'POST', signal: AbortSignal.timeout(5000) })
    const d = await r.json()
    return NextResponse.json(d)
  } catch {
    return NextResponse.json({ ok: false, error: 'WhatsApp bridge is offline. Make sure the wa-service is running.' })
  }
}
