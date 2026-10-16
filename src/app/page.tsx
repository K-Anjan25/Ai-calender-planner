import {
  ArrowRight,
  Brain,
  CalendarCheck,
  CalendarPlus,
  CloudOff,
  Layers,
  Lock,
  Ruler,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { DioramaScene } from '@/components/paper/DioramaScene'
import { PaperChip, PaperLink } from '@/components/paper/PaperControls'
import { PaperSheet, CutEdge } from '@/components/paper/PaperSheet'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

/**
 * Marketing surface (PRD J1).
 *
 * The first screen has to do two things: show the product's material — a layered, cut-paper diorama —
 * and state the actual promise: a realistic week, and the truth when it does not fit. No hype copy.
 *
 * Two rules learned the hard way and encoded here:
 *  - **the copy is about planning, not about paper.** The material is the aesthetic; the words sell the
 *    outcome. Earlier drafts described the medium at the user, which read as a design portfolio.
 *  - **every grid cell is overflow-proof.** Narrow columns, long words and `flex-wrap` rows are where
 *    text escapes its card at 320–400px. Each grid below degrades to one column, and any element that
 *    holds user-length text carries `min-w-0` and breaks rather than pushes.
 */
export default function Home() {
  return (
    <main className="relative overflow-x-clip">
      <SiteHeader />

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1240px] px-4 pt-6 pb-16 sm:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="animate-sheet-in">
            <PaperChip tone="teal" icon={<Sparkles size={11} aria-hidden="true" />} className="mb-4">
              AI calendar planner
            </PaperChip>
            <h1 className="text-balance text-[36px] leading-[1.06] sm:text-[50px]">
              A week you can actually keep.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[16.5px] leading-relaxed text-ink-soft">
              Give Calendra your tasks, deadlines and the rules you actually live by. It builds a realistic week — and when
              the work does not fit, it says so with numbers and offers you something to trade.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PaperLink href="/planner" tone="teal" size="lg">
                Build my week
                <ArrowRight size={15} aria-hidden="true" />
              </PaperLink>
              <PaperLink href="/signup" variant="flat" size="lg">
                Create free account
              </PaperLink>
            </div>

            <dl className="mt-8 grid max-w-[520px] gap-3 sm:grid-cols-3">
              <Promise label="Deterministic" value="Timestamps" detail="The engine owns every minute. The model never guesses one." />
              <Promise label="Honest" value="Capacity" detail="Placed + unplaced always equals what you asked for." />
              <Promise label="Your call" value="Writes" detail="Nothing reaches your calendar until you approve it." />
            </dl>
          </div>

          <div className="relative min-w-0">
            <PaperSheet mat className="overflow-hidden p-2.5">
              <div className="overflow-hidden rounded-[var(--radius-cut-sm)]">
                <DioramaScene variant="dawn" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2.5 pb-1">
                <p className="min-w-0 text-[11.5px] font-semibold text-ink-soft">
                  Energy, deadlines and meetings, layered in one view.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <PaperChip tone="teal">deep work</PaperChip>
                  <PaperChip tone="olive">light</PaperChip>
                  <PaperChip tone="frost">meetings</PaperChip>
                </div>
              </div>
            </PaperSheet>
          </div>
        </div>
      </section>

      <CutEdge variant="scallop" className="text-paper-sand" height={16} />

      {/* ── how it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="paper-fibre scroll-mt-20 bg-paper-sand/60 py-16">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <h2 className="max-w-[26ch] text-[28px] leading-tight sm:text-[34px]">
            Four layers, stacked in this order
          </h2>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
            Most planners fail because they let a language model do arithmetic. Calendra splits the job: the agent reads your
            language and chooses a strategy, a deterministic engine decides every timestamp, and your existing calendar is a
            fixed layer everything else is placed around.
          </p>

          <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Layer
              icon={<ScrollText size={16} aria-hidden="true" />}
              title="Say it however you like"
              body="“Finish the deck by Thursday 5pm, gym three times, PRs daily.” Fragments, shorthand and implied deadlines are read, then shown back to you before anything is committed."
            />
            <Layer
              icon={<Ruler size={16} aria-hidden="true" />}
              title="The engine places every minute"
              body="Working hours, focus peak, buffers, lunch, daily caps and blackout windows become free slots. Chunks are scored on energy match, deadline head-room, contiguity and fragmentation."
            />
            <Layer
              icon={<Target size={16} aria-hidden="true" />}
              title="Tell the truth about capacity"
              body="If the week cannot hold everything, the report says how much is left over, which deadlines are at risk, and ranks what you could split, shorten, defer or drop."
            />
            <Layer
              icon={<CalendarCheck size={16} aria-hidden="true" />}
              title="Write only what you approve"
              body="Dry-run first to see the exact events. Approve, and they are tagged so a re-sync updates instead of duplicating — and “undo this plan” removes exactly what it added."
            />
          </ol>
        </div>
      </section>

      <CutEdge variant="scallop" flip className="text-paper-sand" height={16} />

      {/* ── what makes it different ─────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-[1240px] scroll-mt-20 px-4 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0">
            <h2 className="text-[28px] leading-tight sm:text-[34px]">What you get that a blank grid cannot give you</h2>
            <ul className="mt-6 space-y-3">
              <Point icon={<Brain size={15} aria-hidden="true" />} title="Every block explains itself">
                Each tile carries the reason it landed where it did — your focus peak, a deadline with room to spare, a gap
                too small to be useful. Reasons are generated by the same code that computed the score, so the explanation
                can never drift from the algorithm.
              </Point>
              <Point icon={<ShieldCheck size={15} aria-hidden="true" />} title="Nothing is silently dropped">
                Placed minutes plus unplaced minutes always equals what you asked for. Overflow is reported per task, with
                the reason it did not fit.
              </Point>
              <Point icon={<Layers size={15} aria-hidden="true" />} title="It plans around your real week">
                Import free/busy and existing meetings become an immovable layer. Move something yourself and it is pinned —
                it survives every rebuild.
              </Point>
              <Point icon={<Sparkles size={15} aria-hidden="true" />} title="Works with zero configuration">
                No API key? A deterministic reasoner handles the language step, and scheduling is identical. Add a model
                later and the same plan pipeline gets better at understanding you.
              </Point>
            </ul>
          </div>

          <PaperSheet mat className="min-w-0 self-start p-3">
            <div className="overflow-hidden rounded-[var(--radius-cut-sm)]">
              <DioramaScene variant="focus" />
            </div>
            <div className="px-2 pt-3 pb-1">
              <h3 className="text-[17px]">Trustworthy by construction</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Your tasks and preferences stay in your browser. Plans are computed server-side and stored nowhere. Google
                tokens live in an httpOnly cookie, never in client storage — and calendar access is a separate grant you
                give on purpose, after signing up.
              </p>
              <ul className="mt-4 space-y-2.5">
                <Trust icon={<Lock size={13} aria-hidden="true" />} label="No analytics, no third-party scripts" />
                <Trust icon={<CloudOff size={13} aria-hidden="true" />} label="Works offline of any model provider" />
                <Trust icon={<CalendarPlus size={13} aria-hidden="true" />} label="Export any week as .ics, account-free" />
              </ul>
            </div>
          </PaperSheet>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <PaperSheet mat className="relative overflow-hidden p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-x-0 -top-2 h-40 opacity-30">
            <DioramaScene variant="dusk" animated={false} />
          </div>
          <div className="relative">
            <h2 className="text-balance text-[30px] leading-tight sm:text-[38px]">Open it. Your week is already loaded.</h2>
            <p className="mx-auto mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">
              A realistic week and a deliberately overbooked one are both one click away, so you can see the report tell the
              truth before you trust it with anything real.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <PaperLink href="/planner" tone="teal" size="lg">
                Open the planner
                <ArrowRight size={15} aria-hidden="true" />
              </PaperLink>
              <PaperLink href="/pricing" variant="flat" size="lg">
                See pricing
              </PaperLink>
            </div>
          </div>
        </PaperSheet>
      </section>

      <SiteFooter />
    </main>
  )
}

function Promise({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="paper-well min-w-0 p-2.5">
      <dt className="text-[10px] font-bold tracking-[0.08em] text-ink-faint uppercase">{label}</dt>
      <dd className="mt-0.5 font-[family-name:var(--font-display)] text-[17px] font-semibold break-words text-ink">
        {value}
      </dd>
      <p className="mt-1 text-[11px] leading-snug text-ink-faint">{detail}</p>
    </div>
  )
}

function Layer({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="paper-sheet min-w-0 p-5">
      <span className="paper-tile mb-3 flex h-8 w-8 items-center justify-center text-teal-deep">{icon}</span>
      <h3 className="text-[16.5px] leading-tight break-words">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
    </li>
  )
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="paper-sheet flex min-w-0 gap-3 p-4">
      <span className="paper-tile mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-teal-deep">{icon}</span>
      <div className="min-w-0">
        <h3 className="text-[15.5px] leading-tight break-words">{title}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{children}</p>
      </div>
    </li>
  )
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-cut-xs)] bg-teal-light text-teal-deep">
        {icon}
      </span>
      <span className="min-w-0 text-[12.5px] leading-snug text-ink-soft">{label}</span>
    </li>
  )
}
