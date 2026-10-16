import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { PaperChip } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'
import { authConfig } from '@/lib/auth/session'
import { billingConfig } from '@/lib/billing'
import { calendarConfig } from '@/lib/google/scopes'
import { providerSummary } from '@/lib/agent/providers'

/**
 * Documentation (PRD §14).
 *
 * The long-form documents live in the repository as markdown — that is where they belong, next to the
 * code they describe, reviewed in the same pull request. This page is the *index*: what each document
 * holds, how to read the deployment's own capability state, and the environment matrix, rendered from
 * the same helpers the runtime uses so the docs cannot drift from the app.
 */

export const metadata: Metadata = {
  title: 'Documentation · Calendra',
  description: 'Architecture, environment variables, API reference and the deployment guide for Calendra.',
}

const REPO = 'https://github.com/K-Anjan25/Ai-calender-planner/blob/arena/d6e1cd24-ai-calender-planner'

const DOCS = [
  { file: 'PRD.md', title: 'Product requirements', blurb: 'Goals, functional requirements, the eight scheduler invariants, success criteria, release scope.' },
  { file: 'ARCHITECTURE.md', title: 'Architecture', blurb: 'The five-stage pipeline, scoring weights, the agent tool contract, OAuth flow, sessions, file map.' },
  { file: 'RULES.md', title: 'Engineering rules', blurb: 'Laws L1–L8 — the constraints this codebase is not allowed to break.' },
  { file: 'DESIGN.md', title: 'Design system', blurb: 'Palette, shadow and radius tokens, the diorama scenes, motion, type scale.' },
  { file: 'TASK.md', title: 'Build ledger', blurb: 'What shipped, in order, with the reason each piece exists and the bugs execution found.' },
  { file: 'MEMORY.md', title: 'Decisions & gotchas', blurb: 'ADRs D-001…, invariants, and the traps that cost real debugging time. Read before touching the engine.' },
]

const API = [
  { method: 'POST', path: '/api/plan', note: 'Build a week from tasks, preferences, busy events and pins. The only source of timestamps.' },
  { method: 'POST', path: '/api/chat', note: 'Conversational refinement, block explanation, and a diff of what actually moved.' },
  { method: 'GET', path: '/api/health', note: 'Capability probe: agent mode, provider, calendar state, feature flags.' },
  { method: 'GET', path: '/api/auth/session', note: 'Current session and which auth capabilities this deployment has.' },
  { method: 'GET', path: '/api/auth/google', note: 'Start Sign in with Google (identity scopes only).' },
  { method: 'POST', path: '/api/auth/demo', note: 'A real, signed session with a clearly-labelled demo identity.' },
  { method: 'GET', path: '/api/auth/callback', note: 'Google redirect target: verifies state, then the ID token, before signing anything.' },
  { method: 'POST', path: '/api/auth/signout', note: 'Clear the session cookie.' },
  { method: 'POST', path: '/api/export/ics', note: 'The plan as an .ics file. No account and no configuration required.' },
  { method: 'GET', path: '/api/calendar/auth', note: 'Start the separate Google Calendar grant (events + free/busy).' },
  { method: 'POST', path: '/api/calendar/sync', note: 'Dry-run or write approved blocks, idempotently; 409 on drift.' },
]

export default function DocsPage() {
  const auth = authConfig()
  const calendar = calendarConfig()
  const billing = billingConfig()
  const agent = providerSummary()

  const env: { name: string; required: string; effect: string; state: string }[] = [
    {
      name: 'AUTH_SECRET',
      required: 'Production',
      effect: 'Signs the session cookie (HMAC-SHA256). Without it sessions are signed with a development key and reported as unconfigured.',
      state: auth.configured ? 'set' : 'missing',
    },
    {
      name: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
      required: 'For Google sign-in and Calendar',
      effect: 'Enables Sign in with Google and the separate Calendar grant. Absent: demo sessions, planning unaffected.',
      state: calendar.configured ? 'set' : 'missing',
    },
    {
      name: 'AUTH_REDIRECT_URI',
      required: 'No',
      effect: 'Overrides the OAuth callback. Defaults to <origin>/api/auth/callback.',
      state: 'optional',
    },
    {
      name: 'REQUIRE_AUTH',
      required: 'No',
      effect: 'When "true", /planner redirects to /signin instead of running in open demo mode.',
      state: auth.required ? 'true' : 'false',
    },
    {
      name: 'LLM_PROVIDER + its API key',
      required: 'No',
      effect: 'openai | anthropic | google | local. Absent: the deterministic local reasoner, identical scheduling.',
      state: agent.mode === 'agent' ? agent.provider : 'local (deterministic)',
    },
    {
      name: 'LLM_MODEL',
      required: 'No',
      effect: 'Any model id the provider accepts. Absent: a per-provider default.',
      state: 'default',
    },
    {
      name: 'Razorpay / UPI (planned)',
      required: 'No',
      effect: 'Not integrated. API keys alone do not enable checkout or paid entitlements.',
      state: billing.configured ? 'available' : 'not implemented',
    },
    {
      name: 'DEMO_MODE',
      required: 'No',
      effect: 'Hides demo data and the demo banner when explicitly "false".',
      state: 'auto',
    },
  ]

  return (
    <main className="relative overflow-x-clip">
      <SiteHeader />

      <section className="mx-auto max-w-[1240px] px-4 pt-10 pb-6 sm:px-8">
        <PaperChip tone="teal" className="mb-4">
          Documentation
        </PaperChip>
        <h1 className="max-w-[30ch] text-balance text-[34px] leading-[1.08] sm:text-[44px]">
          Everything needed to run, read and extend it.
        </h1>
        <p className="mt-4 max-w-[68ch] text-[15.5px] leading-relaxed text-ink-soft">
          The engine is deterministic and the data model is one zod file. If you are changing either, read{' '}
          <Link href={`${REPO}/docs/MEMORY.md`} className="underline hover:text-ink">
            MEMORY.md
          </Link>{' '}
          first — it records the decisions and the traps.
        </p>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-8">
        <h2 className="text-[24px] leading-tight">The six documents</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOCS.map((doc) => (
            <a
              key={doc.file}
              href={`${REPO}/docs/${doc.file}`}
              className="paper-sheet group min-w-0 p-5 transition-transform hover:-translate-y-px"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 font-mono text-[11.5px] font-semibold text-teal-deep">{doc.file}</span>
                <ExternalLink size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
              </span>
              <span className="mt-2 block text-[15.5px] leading-tight font-semibold break-words">{doc.title}</span>
              <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-soft">{doc.blurb}</span>
            </a>
          ))}
        </div>
      </section>

      <section id="env" className="paper-fibre scroll-mt-20 bg-paper-sand/60 py-14">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <h2 className="text-[24px] leading-tight">Environment variables</h2>
          <p className="mt-3 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-soft">
            Every variable is optional; each one degrades to something honest rather than to a crash. The{' '}
            <strong className="font-semibold text-ink">state</strong> column is this deployment&rsquo;s live answer, read from the
            same code the runtime uses.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[color:rgba(120,98,70,0.25)]">
                  <th scope="col" className="py-2.5 pr-3 text-[11px] font-bold tracking-[0.08em] text-ink-faint uppercase">Variable</th>
                  <th scope="col" className="py-2.5 pr-3 text-[11px] font-bold tracking-[0.08em] text-ink-faint uppercase">Required</th>
                  <th scope="col" className="py-2.5 pr-3 text-[11px] font-bold tracking-[0.08em] text-ink-faint uppercase">Effect</th>
                  <th scope="col" className="py-2.5 text-[11px] font-bold tracking-[0.08em] text-ink-faint uppercase">Here</th>
                </tr>
              </thead>
              <tbody>
                {env.map((row) => (
                  <tr key={row.name} className="border-b border-dashed border-[color:rgba(120,98,70,0.18)] align-top">
                    <td className="py-3 pr-3 font-mono text-[11.5px] font-semibold break-all text-ink">{row.name}</td>
                    <td className="py-3 pr-3 text-[12px] text-ink-soft">{row.required}</td>
                    <td className="py-3 pr-3 text-[12.5px] leading-relaxed text-ink-soft">{row.effect}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-[var(--radius-cut-xs)] px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap ${
                          row.state === 'set'
                            ? 'bg-teal-light text-teal-deep'
                            : row.state === 'missing'
                              ? 'bg-paper-kraft text-ink-soft'
                              : 'bg-paper-sand text-ink-faint'
                        }`}
                      >
                        {row.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[12px] text-ink-faint">
            The canonical list, with copy-paste values, is the repository&rsquo;s{' '}
            <Link href={`${REPO}/.env.example`} className="underline hover:text-ink">
              .env.example
            </Link>
            .
          </p>
        </div>
      </section>

      <section id="api" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 py-14 sm:px-8">
        <h2 className="text-[24px] leading-tight">API reference</h2>
        <p className="mt-3 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-soft">
          Every route answers with the same envelope — <code className="font-mono text-[12.5px]">{'{ ok: true, data }'}</code>{' '}
          or <code className="font-mono text-[12.5px]">{'{ ok: false, error: { code, message } }'}</code> — so clients switch
          on stable codes rather than on message text.
        </p>

        <ul className="mt-6 space-y-2.5">
          {API.map((route) => (
            <li key={route.path + route.method} className="paper-sheet flex min-w-0 flex-wrap items-start gap-3 p-4">
              <span
                className={`shrink-0 rounded-[var(--radius-cut-xs)] px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${
                  route.method === 'GET' ? 'bg-paper-kraft text-ink-soft' : 'bg-teal-light text-teal-deep'
                }`}
              >
                {route.method}
              </span>
              <span className="min-w-0 font-mono text-[12.5px] font-semibold break-all text-ink">{route.path}</span>
              <span className="w-full min-w-0 text-[12.5px] leading-relaxed text-ink-soft sm:w-auto sm:flex-1">{route.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="deploy" className="paper-fibre scroll-mt-20 bg-paper-sand/60 py-14">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <h2 className="text-[24px] leading-tight">Deploying</h2>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <PaperSheet className="min-w-0 p-5">
              <h3 className="text-[16px] leading-tight">1 · Zero configuration</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                Deploy the repository with no environment variables at all. The app serves the marketing pages, the planner,
                the demo week and the deterministic reasoner. Useful for a review or a smoke test.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[var(--radius-cut-sm)] bg-paper-sand/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
{`npm install
npm run dev     # http://localhost:3000`}
              </pre>
            </PaperSheet>

            <PaperSheet className="min-w-0 p-5">
              <h3 className="text-[16px] leading-tight">2 · Production checklist</h3>
              <ol className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-ink-soft">
                <li>1 · Set <code className="font-mono">AUTH_SECRET</code> to the output of <code className="font-mono">openssl rand -base64 32</code>.</li>
                <li>2 · Create an OAuth client (Web application) in Google Cloud Console and enable the Calendar API.</li>
                <li>3 · Add both redirect URIs: <code className="font-mono break-all">/api/auth/callback</code> and <code className="font-mono break-all">/api/calendar/callback</code>.</li>
                <li>4 · Set the Google pair, plus <code className="font-mono">AUTH_REDIRECT_URI</code> if the domain differs.</li>
                <li>5 · Set <code className="font-mono">REQUIRE_AUTH=true</code> if the planner should be private.</li>
                <li>6 · Publish the OAuth consent screen (or add test users) or only listed accounts can sign in.</li>
              </ol>
            </PaperSheet>

            <PaperSheet className="min-w-0 p-5">
              <h3 className="text-[16px] leading-tight">3 · Model provider</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                Optional and independent of auth. Without a key the local reasoner runs, and the agent falls back to it and
                says so if a live call fails.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[var(--radius-cut-sm)] bg-paper-sand/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
{`LLM_PROVIDER=openai      # openai | anthropic | google | local
OPENAI_API_KEY=sk-…
LLM_MODEL=gpt-4o-mini`}
              </pre>
            </PaperSheet>

            <PaperSheet className="min-w-0 p-5">
              <h3 className="text-[16px] leading-tight">4 · Verify</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                <code className="font-mono">GET /api/health</code> reports what is actually configured — never what you
                intended to configure:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[var(--radius-cut-sm)] bg-paper-sand/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
{`curl -s <origin>/api/health
{ "agent": { "mode": "local" },
  "calendar": { "configured": false },
  "demoMode": true }`}
              </pre>
            </PaperSheet>
          </div>
        </div>
      </section>

      {/* ── terms & privacy ──────────────────────────────────────────── */}
      <section id="terms" className="paper-fibre scroll-mt-20 border-t border-dashed border-[color:rgba(120,98,70,0.22)] bg-paper-sand/50 py-14">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <h2 className="text-[26px] leading-tight sm:text-[30px]">Terms, in plain words</h2>
          <p className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed text-ink-soft">
            Calendra is a self-hosted scheduling tool. It is provided as-is, with no warranty, and it is not a
            substitute for checking your own calendar: the week it produces is a plan, not a commitment. Do not rely on
            it for anything where a missed appointment has real consequences without reading the Plan Report first —
            that report is the product&rsquo;s actual output, and every number in it comes from the engine, not a model.
          </p>
          <p className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed text-ink-soft">
            Nothing is written to a real calendar without your explicit approval of specific blocks, and every write
            path is dry-runnable first. The free tier is the whole planner; paid tiers, when billing is connected, add
            horizon, history and collaboration — never the truth about capacity.
          </p>

          <h3 id="privacy" className="mt-8 scroll-mt-20 text-[19px] leading-tight">Privacy notice</h3>
          <ul className="mt-3 grid max-w-[90ch] gap-2 text-[14.5px] leading-relaxed text-ink-soft">
            <li>
              <strong className="font-semibold text-ink">There is no database.</strong> Your tasks, preferences and
              plans live in your browser&rsquo;s local storage, and this server holds no account record about you.
            </li>
            <li>
              <strong className="font-semibold text-ink">Your task text goes to a model provider only if this
              deployment has a key configured.</strong> With no provider key, the deterministic local reasoner runs on
              this server and nothing leaves it. <code className="font-mono break-all">GET /api/health</code> tells you
              which mode you are in.
            </li>
            <li>
              <strong className="font-semibold text-ink">Sign-in asks for your name and email only</strong> (the
              <code className="font-mono"> openid email profile</code> scopes). Google Calendar access — read free/busy,
              write approved events — is a separate grant you trigger yourself, and you can withdraw it by disconnecting
              Google in your account settings or signing out here.
            </li>
            <li>
              <strong className="font-semibold text-ink">Sessions are signed cookies, and signing out clears yours.</strong>{' '}
              There is no server-side session store to revoke, so a copy of the cookie stays valid until it expires —
              see <em>D-024</em> in <code className="font-mono">MEMORY.md</code>.
            </li>
            <li>
              <strong className="font-semibold text-ink">No analytics, no third-party scripts, no tracking pixels.</strong>{' '}
              The only outbound requests are the model provider, Google, and the fonts declared in the layout.
            </li>
          </ul>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
