// app/api/drive/update-sr-row/route.ts
// Called after SR status changes to sync the Google Sheets row
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { sr_id, status, resolved_at, resolution } = body
    if (!sr_id) return NextResponse.json({ ok: false, error: 'sr_id required' })

    const { data: sr } = await supabase.from('sr_list').select('*').eq('id', sr_id).single()
    if (!sr) return NextResponse.json({ ok: false, error: 'SR not found' })

    const { data: driveSetting } = await supabase.from('settings').select('value').eq('key', 'drive').single()
    const cfg = driveSetting?.value as any
    const scriptUrl = cfg?.apps_script_url || process.env.APPS_SCRIPT_URL
    const token = process.env.APPS_SCRIPT_TOKEN || ''

    if (!scriptUrl) return NextResponse.json({ ok: false, error: 'Apps Script not configured' })

    const r = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'update_sr_row',
        sr_number:   sr.sr_number,
        status:      status ?? sr.status,
        resolved_at: resolved_at ?? null,
        resolution:  resolution ?? sr.resolution,
        owner_name:  sr.owner_name,
      }),
      signal: AbortSignal.timeout(15000),
    })

    const d = await r.json()
    return NextResponse.json(d)
  } catch (err: any) {
    // Non-fatal — Sheets update failure should not block the UI
    console.error('Sheets update error:', err.message)
    return NextResponse.json({ ok: false, error: err.message })
  }
}
