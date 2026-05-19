// app/(app)/admin/users/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsersClient from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'Admin') redirect('/dashboard')
  const { data: users } = await supabase.from('users').select('*').order('name')
  return <UsersClient initialUsers={users ?? []} currentUserId={user!.id} />
}
