import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * Fonts load through a plain `<link>` rather than `next/font/google`: a build environment without
 * access to fonts.googleapis.com must not fail the build (D-005). The fallback stack in
 * `globals.css` is complete, so the design degrades to Palatino/system sans rather than to nothing.
 */

export const metadata: Metadata = {
  title: 'Calendra — the AI calendar planner that tells you the truth',
  description:
    'Give Calendra your tasks, deadlines and preferences. It builds a realistic week — or tells you exactly what does not fit, and what to trade.',
  applicationName: 'Calendra',
  icons: {
    icon: [{ url: '/calendra-icon-v8.png', type: 'image/png', sizes: '64x64' }],
    shortcut: '/calendra-icon-v8.png',
    apple: [{ url: '/calendra-apple-v8.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#F3E3D2',
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
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap"
        />
      </head>
      <body className="min-h-screen bg-paper-cream antialiased">
        {children}
      </body>
    </html>
  )
}
