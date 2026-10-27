'use client'
import Link from 'next/link'
import { CalendraLogo } from '@/components/paper/CalendraMark'
import { PaperButton } from '@/components/paper/PaperControls'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset(): void
}) {
  return (
    <main className="bauhaus-recovery">
      <Link href="/" aria-label="Calendra home">
        <CalendraLogo size={32} />
      </Link>
      <p className="bauhaus-eyebrow mt-12">
        <span />
        LET’S TRY THAT AGAIN.
      </p>
      <h1>
        A brief
        <br />
        interruption.
      </h1>
      <p>
        We couldn’t load this page. Try again, or return home. No calendar
        changes are made by retrying this page.
      </p>
      <div className="bauhaus-recovery-actions">
        <PaperButton tone="teal" onClick={reset}>
          Try again
        </PaperButton>
        <Link
          className="inline-flex min-h-11 items-center px-4 underline"
          href="/"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}
