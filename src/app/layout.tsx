import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * Fonts load through a plain `<link>` rather than `next/font/google`: a build environment without
 * access to fonts.googleapis.com must not fail the build (D-005). The fallback stack in
 * `globals.css` is complete, so the design degrades to Arial/system sans rather than to nothing.
 */

export const metadata: Metadata = {
  title: 'Calendra — the AI calendar planner that tells you the truth',
  description:
    'Give Calendra your tasks, deadlines and preferences. It builds a realistic week — or tells you exactly what does not fit, and what to trade.',
  applicationName: 'Calendra',
  icons: {
    icon: [{ url: '/calendra-icon-v10.png', type: 'image/png', sizes: '64x64' }],
    shortcut: '/calendra-icon-v10.png',
    apple: [{ url: '/calendra-apple-v10.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#F5F2E9',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- deliberate: a build-time
            font fetch would fail in networks without access to fonts.googleapis.com (D-005). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-paper-cream antialiased">
        {children}
      </body>
    </html>
  )
}
