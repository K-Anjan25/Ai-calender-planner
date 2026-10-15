import Link from 'next/link'
import { CalendraLogo } from '@/components/paper/CalendraMark'
import { DioramaScene } from '@/components/paper/DioramaScene'
import { CutEdge } from '@/components/paper/PaperSheet'

/**
 * The footer, on every product page.
 *
 * The diorama band at the top of it is the same scenery as the hero — the footer is the last sheet in
 * the stack rather than a strip of grey links.
 */

const GROUPS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { href: '/planner', label: 'Planner' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/#features', label: 'Features' },
      { href: '/#how-it-works', label: 'How it works' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/signin', label: 'Sign in' },
      { href: '/signup', label: 'Create an account' },
      { href: '/planner', label: 'Connect Google Calendar' },
    ],
  },
  {
    heading: 'Engineering',
    links: [
      { href: '/docs', label: 'Documentation' },
      { href: '/docs#api', label: 'API' },
      { href: '/docs#env', label: 'Environment variables' },
      { href: '/docs#deploy', label: 'Deploying' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="relative mt-8">
      <CutEdge variant="scallop" className="text-paper-sand" height={16} />
      <div className="paper-fibre relative bg-paper-sand/70">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 opacity-25">
          <DioramaScene variant="dusk" animated={false} />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-4 pt-12 pb-10 sm:px-8">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <CalendraLogo size={26} className="text-teal-deep" />
              <p className="mt-3 max-w-[42ch] text-[13px] leading-relaxed text-ink-soft">
                An AI calendar planner for people whose weeks do not fit. Say what you have to do — it builds a realistic
                week, and tells you the truth when the work cannot fit.
              </p>
            </div>

            {GROUPS.map((group) => (
              <div key={group.heading}>
                <h3 className="text-[11px] font-bold tracking-[0.08em] text-ink-faint uppercase">{group.heading}</h3>
                <ul className="mt-3 space-y-2">
                  {group.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] text-ink-soft transition-colors hover:text-ink hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[color:rgba(120,98,70,0.25)] pt-6 text-[11.5px] text-ink-faint">
            <p>© {new Date().getFullYear()} Calendra · MIT licensed</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Next.js</span>
              <span aria-hidden="true">·</span>
              <span>LangChain</span>
              <span aria-hidden="true">·</span>
              <span>Google Calendar API</span>
              <span aria-hidden="true">·</span>
              <Link href="/docs#env" className="underline hover:text-ink">
                self-hostable
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
