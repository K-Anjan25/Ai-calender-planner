import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { PaperLink } from '@/components/paper/PaperControls'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="page-content" tabIndex={-1} className="bauhaus-recovery">
        <p className="bauhaus-eyebrow">
          <span />
          PAGE NOT FOUND
        </p>
        <h1>
          Not on
          <br />
          the plan.
        </h1>
        <p>
          This page may have moved, or the address may be incorrect. Let’s get
          you back to a clearer path.
        </p>
        <div className="bauhaus-recovery-actions">
          <PaperLink href="/" tone="teal">
            Back to home
            <ArrowUpRight size={18} />
          </PaperLink>
          <Link
            className="inline-flex min-h-11 items-center px-4 underline"
            href="/planner"
          >
            Open the planner
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
