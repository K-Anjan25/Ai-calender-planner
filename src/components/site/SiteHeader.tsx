'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, LogOut, Menu, X } from 'lucide-react'
import { CalendraLogo } from '@/components/paper/CalendraMark'
import { useSession } from '@/lib/use-session'

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#product', label: 'The product' },
  { href: '/pricing', label: 'Plans' },
]

/** Native modal navigation provides focus containment, Escape and focus restoration on mobile. */
export function SiteHeader({ tone = 'board' }: { tone?: 'board' | 'sand' }) {
  const { status, user, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
    const previous = document.body.style.overflow
    if (open) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])
  function close() {
    setOpen(false)
    toggle.current?.focus()
  }
  async function leave() {
    try {
      await signOut()
      setError('')
      close()
    } catch {
      setError('Could not sign out. Check your connection and retry.')
    }
  }
  return (
    <header className="bauhaus-site-header" data-tone={tone}>
      <a className="bauhaus-skip" href="#page-content">
        Skip to content
      </a>
      <div className="bauhaus-header-inner">
        <Link href="/" className="bauhaus-brand" aria-label="Calendra home">
          <CalendraLogo size={32} />
        </Link>
        <nav className="bauhaus-desktop-nav" aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="bauhaus-header-actions">
          {status === 'loading' ? (
            <span className="bauhaus-account-placeholder" aria-hidden="true" />
          ) : user ? (
            <div className="bauhaus-account">
              <span title={user.email}>
                {user.name}
                {user.provider === 'demo' ? ' · Demo' : ''}
              </span>
              <button onClick={() => void leave()}>
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          ) : (
            <Link className="bauhaus-sign-in" href="/signin">
              Sign in
              <ArrowUpRight size={15} />
            </Link>
          )}
          <Link className="bauhaus-header-cta" href="/planner">
            Start planning
            <ArrowUpRight size={17} />
          </Link>
          <button
            ref={toggle}
            className="bauhaus-menu-button"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={22} />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="bauhaus-nav-error">
          {error}
        </p>
      )}
      <dialog
        id="site-menu"
        ref={dialog}
        className="bauhaus-menu"
        aria-label="Site navigation"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close()
        }}
      >
        <div className="bauhaus-menu-top">
          <CalendraLogo size={28} />
          <button autoFocus onClick={close} aria-label="Close navigation">
            <X />
          </button>
        </div>
        <nav aria-label="Mobile">
          {NAV.map((item) => (
            <Link href={item.href} key={item.href} onClick={close}>
              {item.label}
              <ArrowUpRight size={20} />
            </Link>
          ))}
          <Link href="/planner" onClick={close}>
            Open the planner
            <ArrowUpRight size={20} />
          </Link>
          {user ? (
            <>
              <p className="bauhaus-mobile-account">
                Signed in as {user.email}
              </p>
              <button onClick={() => void leave()}>
                Sign out
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link href="/signin" onClick={close}>
                Sign in
                <ArrowUpRight size={20} />
              </Link>
              <Link href="/signup" onClick={close}>
                Create an account
                <ArrowUpRight size={20} />
              </Link>
            </>
          )}
        </nav>
      </dialog>
    </header>
  )
}
