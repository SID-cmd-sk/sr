// app/api/whatsapp/status/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WA_BRIDGE = process.env.WA_BRIDGE_URL ?? 'http://localhost:3001'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const r = await fetch(`${WA_BRIDGE}/status`, { signal: AbortSignal.timeout(3000) })
    const d = await r.json()
    return NextResponse.json(d)
  } catch {
    return NextResponse.json({ connected: false, error: 'Bridge offline' })
  }
}
