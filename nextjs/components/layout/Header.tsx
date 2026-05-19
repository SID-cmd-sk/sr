'use client'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { User } from '@/types'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':      'Dashboard',
  '/sr':             'Service Requests',
  '/activities':     'Activities',
  '/whatsapp':       'WhatsApp',
  '/reports':        'Reports',
  '/routes':         'Routes',
  '/templates':      'Templates',
  '/admin':          'Admin',
  '/admin/users':    'User Management',
  '/admin/settings': 'System Settings',
}

export default function Header({ user }: { user: User }) {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k)) ?? ''] ?? 'SR Platform'

  return (
    <header className="app-header">
      <h1 style={{ fontSize: '1rem', fontWeight: 600, flex: 1 }}>{title}</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Clock */}
        <Clock />

        {/* User chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px', borderRadius: '20px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          fontSize: '0.8rem',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>{user.name}</span>
          <span className={`badge badge-${user.role.toLowerCase()}`} style={{ fontSize: '0.6rem' }}>
            {user.role}
          </span>
        </div>
      </div>
    </header>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{time}</div>
      <div>{date}</div>
    </div>
  )
}
