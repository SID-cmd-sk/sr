// app/(app)/layout.tsx  — authenticated shell with sidebar
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="app-shell">
      <Sidebar user={profile} />
      <div className="app-main">
        <Header user={profile} />
        <main className="page-content animate-fadein">
          {children}
        </main>
      </div>
    </div>
  )
}
