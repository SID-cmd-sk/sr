// middleware.ts — auth protection + role-based redirect
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require auth
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/api/wa']

// Role → default landing page
const ROLE_HOME: Record<string, string> = {
  Admin:     '/admin/users',
  Manager:   '/dashboard',
  Technical: '/sr',
  User:      '/sr',
  Viewer:    '/reports',
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response = NextResponse.next({ request })
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Allow public routes without auth
  if (PUBLIC_ROUTES.some(r => path.startsWith(r))) {
    if (user && path === '/login') {
      // Already logged in — redirect to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Not authenticated → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Root → role-based home
  if (path === '/') {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const home = ROLE_HOME[profile?.role ?? 'User'] ?? '/dashboard'
    return NextResponse.redirect(new URL(home, request.url))
  }

  // Guard admin routes
  if (path.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['Admin', 'Manager'].includes(profile?.role ?? '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
