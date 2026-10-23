'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarCheck, ShieldCheck } from 'lucide-react'
import { PaperButton, PaperChip, PaperLink } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'
import { useSession } from '@/lib/use-session'

/**
 * Sign in / sign up (PRD §13).
 *
 * One panel, two modes — the only differences are the heading, the CTA copy and the "already have an
 * account" line. A separate component per mode would duplicate the OAuth wiring, which is the part
 * that must not drift.
 *
 * There is no email-and-password form, on purpose: a password field means storing password hashes and
 * owning breach liability to provide a weaker guarantee than the identity provider already gives. The
 * only credential path is Google; the fallback is an explicitly-labelled demo session.
 */

const ERROR_COPY: Record<string, string> = {
  not_configured:
    'Google sign-in is temporarily unavailable. Try the demo instead.',
  state: 'That sign-in attempt expired or did not match. Please try again.',
  exchange: 'Google accepted the request but the identity could not be verified. Please try again.',
  required: 'The planner on this deployment is private. Sign in to continue.',
  origin:
    'Google cannot use this address as a redirect target, so sign-in cannot start from here. Open the app at http://localhost:3000 on this machine, or use the public URL you deployed to. (To test from a phone, put the app behind a public HTTPS address — a tunnel or your deployment — rather than the local network address.)',
}

export function AuthPanel({
  mode,
  error,
  errorHost,
  next = '/planner',
  plan,
}: {
  mode: 'signin' | 'signup'
  error?: string
  /** The host Google refused, when it refused one — named in the message so the cause is obvious. */
  errorHost?: string
  next?: string
  plan?: string
}) {
  const { status, user, capabilities, startDemo, signOut } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const isSignUp = mode === 'signup'
  const query = `?next=${encodeURIComponent(next)}`
  const errorMessage = error ? (ERROR_COPY[error] ?? 'Something went wrong. Please try again.') : null
  const enterDemo = async () => {
    setBusy(true)
    try {
      await startDemo()
      router.push(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
      <div className="animate-sheet-in">
        <h1 className="text-[32px] leading-[1.1] sm:text-[40px]">
          {isSignUp ? 'Give Calendra your worst week.' : 'Welcome back to a week that fits.'}
        </h1>
        <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-ink-soft">
          {isSignUp
            ? 'Create an account to connect Google Calendar and write approved plans. Tasks and preferences are currently saved in this browser, not synced across devices.'
            : 'Sign in to connect Google Calendar. Your tasks and preferences stay in this browser.'}
        </p>

        <ul className="mt-7 space-y-3">
          <Promise icon={<ShieldCheck size={14} aria-hidden="true" />}>
            We ask Google for your name and email only. Calendar access is a separate, later grant — requested when you
            click <em>Connect Google Calendar</em>, never at sign-up.
          </Promise>
          <Promise icon={<CalendarCheck size={14} aria-hidden="true" />}>
            Nothing is written to your calendar without your explicit approval of specific blocks, dry-run first.
          </Promise>
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
          <span>{isSignUp ? 'Already have an account?' : 'New here?'}</span>
          <Link href={isSignUp ? '/signin' : '/signup'} className="font-semibold text-teal-deep underline">
            {isSignUp ? 'Sign in' : 'Create an account'}
          </Link>
        </div>
      </div>

      <PaperSheet mat className="p-6 sm:p-7">
        {user ? (
          <div>
            <PaperChip tone="olive">Already signed in</PaperChip>
            <h2 className="mt-3 text-[20px] leading-tight">{user.name}</h2>
            <p className="mt-1 text-[13px] break-words text-ink-soft">{user.email}</p>
            {user.provider === 'demo' ? <PaperChip tone="kraft">Demo</PaperChip> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <PaperLink href={next} tone="teal">
                Continue to the planner
                <ArrowRight size={14} aria-hidden="true" />
              </PaperLink>
              <PaperButton variant="flat" onClick={() => void signOut()}>
                Sign out
              </PaperButton>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-[20px] leading-tight">{isSignUp ? 'Create your account' : 'Sign in'}</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
              {plan ? `You picked the ${plan} plan. ` : ''}
              No card required.
            </p>

            {errorMessage ? (
              <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-cut-sm)] border border-[color:rgba(82,82,102,0.35)] bg-rose-light/60 px-3 py-2.5 text-[12px] leading-relaxed text-ink">
                <AlertTriangle size={14} className="mt-px shrink-0 text-rose-deep" aria-hidden="true" />
                <span>
                  {errorMessage}
                  {error === 'origin' && errorHost ? (
                    <>
                      {' '}
                      Google refused <code className="font-mono break-all text-[11.5px]">{errorHost}</code>.
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}

            <div className="mt-5 space-y-2.5">
              <PaperLink
                href={`/api/auth/google${query}`}
                tone="teal"
                className={`w-full ${status === 'ready' && !capabilities.googleSignIn ? 'pointer-events-none opacity-45' : ''}`}
                aria-disabled={status === 'ready' && !capabilities.googleSignIn}
              >
                Continue with Google
              </PaperLink>

              {status === 'error' ? (
                <p role="alert" className="text-[11.5px] leading-relaxed text-ink-soft">
                  Could not check sign-in availability. Reload to retry, or try Continue with Google above.
                </p>
              ) : null}

              {status === 'ready' && !capabilities.googleSignIn ? (
                <p className="text-[11.5px] leading-relaxed text-ink-faint">
                  Google sign-in is temporarily unavailable. Try the demo instead.
                </p>
              ) : null}

              <div className="flex items-center gap-3 py-1" aria-hidden="true">
                <span className="h-px flex-1 bg-[color:rgba(77,92,96,0.2)]" />
                <span className="text-[10.5px] font-bold tracking-[0.08em] text-ink-faint uppercase">or</span>
                <span className="h-px flex-1 bg-[color:rgba(77,92,96,0.2)]" />
              </div>

              <PaperButton variant="flat" className="w-full" disabled={busy} onClick={() => void enterDemo()}>
                {busy ? 'Starting…' : 'Continue with a demo session'}
                {busy ? null : <ArrowRight size={14} aria-hidden="true" />}
              </PaperButton>

            </div>

            <p className="mt-6 border-t border-dashed border-[color:rgba(77,92,96,0.22)] pt-4 text-[11px] leading-relaxed text-ink-faint">
              {isSignUp ? 'By creating an account you agree to ' : 'By signing in you agree to '}
              the <Link href="/legal#terms" className="underline hover:text-ink">terms</Link> and{' '}
              <Link href="/legal#privacy" className="underline hover:text-ink">privacy notice</Link>.
            </p>
          </div>
        )}
      </PaperSheet>
    </div>
  )
}

function Promise({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="paper-tile mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-teal-deep">{icon}</span>
      <span className="min-w-0 text-[13px] leading-relaxed text-ink-soft">{children}</span>
    </li>
  )
}
