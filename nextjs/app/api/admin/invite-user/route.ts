// app/api/admin/invite-user/route.ts
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'Admin') return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })

  const { name, email, role } = await req.json()
  if (!name || !email || !role) return NextResponse.json({ ok: false, error: 'name, email and role required' })

  const admin = await createAdminClient()

  // Send invite email via Supabase Auth
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  })
  if (inviteErr) return NextResponse.json({ ok: false, error: inviteErr.message })

  // Create profile row (trigger may handle this, but upsert is safe)
  await admin.from('users').upsert({
    id: inviteData.user.id,
    name, email, role, status: 'pending',
  })

  await supabase.from('audit_log').insert({
    action: 'USER_CREATE', user_id: user.id,
    target_id: inviteData.user.id, target_type: 'user',
    description: `Invited ${email} as ${role}`,
  })

  return NextResponse.json({ ok: true })
}
