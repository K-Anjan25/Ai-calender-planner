'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowRight, LogOut, Menu, X } from 'lucide-react'
import { CalendraLogo } from '@/components/paper/CalendraMark'
import { PaperButton, PaperLink } from '@/components/paper/PaperControls'
import { useSession } from '@/lib/use-session'

/**
 * The product header: navigation, account state, and the two calls to action.
 *
 * It resolves the session on the client so a cached static page can still show *your* name. Until
 * that resolves it renders a neutral placeholder of the same height, so the layout never shifts —
 * a header that pops from "Sign in" to an avatar is the kind of jitter that reads as a bug.
 */

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
]

export function SiteHeader({ tone = 'board' }: { tone?: 'board' | 'sand' }) {
  const { status, user, capabilities, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header
      className={
        tone === 'sand'
          ? 'relative z-20 border-b border-[color:rgba(77,92,96,0.16)] bg-paper-sand/70'
          : 'relative z-20'
      }
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="Calendra home">
          <CalendraLogo size={28} className="text-teal-deep" markClassName="shrink-0" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[var(--radius-cut-xs)] px-3 py-1.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors ${
                pathname === item.href ? 'bg-paper-ivory text-ink' : 'text-ink-soft hover:bg-paper-ivory/70 hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Account block. `min-h` reserves the row so resolving the session never reflows the page. */}
          <div className="hidden min-h-[34px] items-center gap-2 sm:flex">
            {status === 'loading' ? (
              <span className="paper-well h-[30px] w-[104px]" aria-hidden="true" />
            ) : user ? (
              <>
                <span className="flex max-w-[190px] items-center gap-2 rounded-[var(--radius-cut-xs)] bg-paper-ivory/80 px-2 py-1">
                  {user.picture ? (
                    // A remote avatar from Google's CDN — a plain <img>, so no image-domain config is
                    // needed and the app still runs on any host.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.picture} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded-full" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-light text-[10px] font-bold text-teal-deep">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink" title={user.email}>
                    {user.name}
                  </span>
                  {user.provider === 'demo' ? (
                    <span className="shrink-0 rounded-[var(--radius-cut-xs)] bg-paper-kraft px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-ink-soft uppercase">
                      demo
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex items-center gap-1 rounded-[var(--radius-cut-xs)] px-2 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-paper-ivory/70 hover:text-ink"
                >
                  <LogOut size={13} aria-hidden="true" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="rounded-[var(--radius-cut-xs)] px-2.5 py-1.5 text-[13px] font-semibold text-ink-soft whitespace-nowrap transition-colors hover:bg-paper-ivory/70 hover:text-ink"
                >
                  Sign in
                </Link>
                <PaperLink href="/signup" tone="teal" size="sm">
                  Start free
                  <ArrowRight size={13} aria-hidden="true" />
                </PaperLink>
              </>
            )}
          </div>

          <PaperButton
            variant="flat"
            size="sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={15} aria-hidden="true" /> : <Menu size={15} aria-hidden="true" />}
            <span className="sr-only">Menu</span>
          </PaperButton>
        </div>
      </div>

      {open ? (
        <div id="site-menu" className="border-t border-dashed border-[color:rgba(77,92,96,0.22)] bg-paper-ivory/95 lg:hidden">
          <nav className="mx-auto grid max-w-[1240px] gap-1 px-4 py-3 sm:px-8" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-cut-xs)] px-3 py-2 text-[14px] font-semibold text-ink-soft hover:bg-paper-sand/60 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1 grid gap-2 border-t border-dashed border-[color:rgba(77,92,96,0.22)] pt-3">
              {user ? (
                <>
                  <p className="px-3 text-[12.5px] text-ink-soft">
                    Signed in as <span className="font-semibold text-ink">{user.email}</span>
                  </p>
                  <PaperButton variant="flat" onClick={() => { setOpen(false); void signOut() }}>
                    <LogOut size={14} aria-hidden="true" />
                    Sign out
                  </PaperButton>
                </>
              ) : (
                <>
                  <PaperLink href="/signin" variant="flat" onClick={() => setOpen(false)}>
                    Sign in
                  </PaperLink>
                  <PaperLink href="/signup" tone="teal" onClick={() => setOpen(false)}>
                    Start free
                    {capabilities.googleSignIn ? null : <span className="text-[11px] opacity-80">(demo)</span>}
                    <ArrowRight size={14} aria-hidden="true" />
                  </PaperLink>
                </>
              )}
              <PaperLink href="/planner" variant="flat" onClick={() => setOpen(false)}>
                Open the planner
              </PaperLink>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
