// app/api/drive/sr-folder/route.ts
// Called after SR creation to create Drive folder and log to Sheets
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const { sr_id } = await req.json()
    if (!sr_id) return NextResponse.json({ ok: false, error: 'sr_id required' })

    // Fetch SR details
    const { data: sr } = await supabase.from('sr_list').select('*').eq('id', sr_id).single()
    if (!sr) return NextResponse.json({ ok: false, error: 'SR not found' })

    // Fetch Apps Script URL and token from settings
    const { data: driveSetting } = await supabase.from('settings').select('value').eq('key', 'drive').single()
    const cfg = driveSetting?.value as any
    const scriptUrl = cfg?.apps_script_url || process.env.APPS_SCRIPT_URL
    const token     = process.env.APPS_SCRIPT_TOKEN || ''

    if (!scriptUrl) {
      return NextResponse.json({ ok: false, error: 'Apps Script URL not configured' })
    }

    const year = new Date().getFullYear().toString()

    // Create Drive folder
    const folderRes = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'create_sr_folder',
        sr_number: sr.sr_number,
        year,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const folderData = await folderRes.json()

    if (folderData.ok) {
      // Update SR with folder URL
      await supabase.from('sr').update({
        drive_folder_url: folderData.folder_url,
        drive_folder_id:  folderData.folder_id,
      }).eq('id', sr_id)

      // Log to Sheets
      await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'append_sr_row',
          sr_number:       sr.sr_number,
          status:          sr.status,
          reported_at:     sr.reported_at,
          account:         sr.account,
          customer_name:   sr.customer_name,
          customer_contact:sr.customer_contact,
          customer_email:  sr.customer_email,
          issue_type:      sr.issue_type,
          issue_description: sr.issue_description,
          owner_name:      sr.owner_name,
          creator_name:    sr.creator_name,
          priority:        sr.priority,
          route_name:      sr.route_name,
          folder_url:      folderData.folder_url,
        }),
        signal: AbortSignal.timeout(15000),
      })

      await supabase.from('audit_log').insert({
        action: 'DRIVE_FOLDER_CREATE',
        user_id: user.id,
        target_id: sr_id,
        target_type: 'sr',
        description: `Drive folder created for ${sr.sr_number}`,
        meta: { folder_url: folderData.folder_url },
      })
    }

    return NextResponse.json({
      ok: folderData.ok,
      folder_url: folderData.folder_url,
      error: folderData.error,
    })
  } catch (err: any) {
    console.error('Drive folder creation error:', err.message)
    return NextResponse.json({ ok: false, error: err.message })
  }
}
