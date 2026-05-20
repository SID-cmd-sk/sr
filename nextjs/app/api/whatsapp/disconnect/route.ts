// app/api/whatsapp/disconnect/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WA_BRIDGE = process.env.WA_BRIDGE_URL ?? 'http://localhost:3001'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const r = await fetch(`${WA_BRIDGE}/disconnect`, { method: 'POST', signal: AbortSignal.timeout(5000) })
    return NextResponse.json(await r.json())
  } catch { return NextResponse.json({ ok: false, error: 'Bridge offline' }) }
}
