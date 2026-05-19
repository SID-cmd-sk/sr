// app/layout.tsx
import type { Metadata } from 'next'
import { Syne } from 'next/font/google'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
})

const mono = GeistMono

export const metadata: Metadata = {
  title: 'SR Platform',
  description: 'Internal Service Request & Workflow Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
