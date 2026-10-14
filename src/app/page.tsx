import {
  ArrowRight,
  Brain,
  CalendarCheck,
  Layers,
  Ruler,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { DioramaScene } from '@/components/paper/DioramaScene'
import { PaperChip, PaperLink } from '@/components/paper/PaperControls'
import { PaperSheet, CutEdge } from '@/components/paper/PaperSheet'

/**
 * Marketing surface (PRD J1).
 *
 * The first screen has to do two things: show the paper-diorama material clearly, and state the
 * product's actual promise — a realistic week, and the truth when it does not fit. No hype copy.
 */

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-4 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <span className="paper-tile flex h-9 w-9 items-center justify-center">
            <Layers size={17} className="text-teal-deep" aria-hidden="true" />
          </span>
          <span className="font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-tight">Paperweek</span>
        </span>
        <nav className="flex items-center gap-2">
          <PaperLink href="/planner" tone="teal">
            Open the planner
            <ArrowRight size={14} aria-hidden="true" />
          </PaperLink>
        </nav>
      </header>

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1240px] px-4 pt-2 pb-16 sm:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="animate-sheet-in">
            <PaperChip tone="teal" icon={<Sparkles size={11} aria-hidden="true" />} className="mb-4">
              Tasks in · a real week out
            </PaperChip>
            <h1 className="text-balance text-[38px] leading-[1.05] sm:text-[52px]">
              A week you can actually keep.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[16.5px] leading-relaxed text-ink-soft">
              Give Paperweek your tasks, deadlines and the rules you actually live by. It builds the week sheet by sheet — and
              when the work does not fit, it says so with numbers and offers you something to trade.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PaperLink href="/planner" tone="teal" size="lg">
                Build my week
                <ArrowRight size={15} aria-hidden="true" />
              </PaperLink>
              <PaperLink href="/planner" variant="flat" size="lg">
                See the overbooked demo
              </PaperLink>
            </div>

            <dl className="mt-8 grid max-w-[520px] grid-cols-3 gap-3">
              <Promise label="Deterministic" value="Timestamps" detail="The engine owns every minute. The model never guesses one." />
              <Promise label="Honest" value="Capacity" detail="Placed + unplaced always equals what you asked for." />
              <Promise label="Your call" value="Writes" detail="Nothing reaches your calendar until you approve it." />
            </dl>
          </div>

          <div className="relative">
            <PaperSheet mat className="overflow-hidden p-2.5">
              <div className="overflow-hidden rounded-[var(--radius-cut-sm)]">
                <DioramaScene variant="dawn" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2.5 pb-1">
                <p className="text-[11.5px] font-semibold text-ink-soft">
                  Cut paper, layered a few millimetres apart — exactly how a week works.
                </p>
                <div className="flex gap-1.5">
                  <PaperChip tone="teal">deep work</PaperChip>
                  <PaperChip tone="olive">light</PaperChip>
                  <PaperChip tone="frost">meetings</PaperChip>
                </div>
              </div>
            </PaperSheet>
            <p className="mt-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Scenery and objects only — no characters, no faces
            </p>
          </div>
        </div>
      </section>

      <CutEdge variant="scallop" className="text-paper-sand" height={16} />

      {/* ── how it works ─────────────────────────────────────────────── */}
      <section className="bg-paper-sand/60 paper-fibre py-16">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <h2 className="max-w-[26ch] text-[28px] leading-tight sm:text-[34px]">
            Four layers, glued in this order
          </h2>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
            Most planners fail because they let a language model do arithmetic. Paperweek splits the job: the agent reads your
            language and chooses a strategy, a deterministic engine decides every timestamp, and your existing calendar is a
            fixed layer everything else is placed around.
          </p>

          <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Layer
              index="01"
              icon={<ScrollText size={16} aria-hidden="true" />}
              title="Say it however you like"
              body="“Finish the deck by Thursday 5pm, gym three times, PRs daily.” Fragments, shorthand and implied deadlines are read, then shown back to you before anything is committed."
            />
            <Layer
              index="02"
              icon={<Ruler size={16} aria-hidden="true" />}
              title="The engine places every minute"
              body="Working hours, focus peak, buffers, lunch, daily caps and blackout windows become free slots. Chunks are scored on energy match, deadline head-room, contiguity and fragmentation."
            />
            <Layer
              index="03"
              icon={<Target size={16} aria-hidden="true" />}
              title="Tell the truth about capacity"
              body="If the week cannot hold everything, the report says how much is left over, which deadlines are at risk, and ranks what you could split, shorten, defer or drop."
            />
            <Layer
              index="04"
              icon={<CalendarCheck size={16} aria-hidden="true" />}
              title="Write only what you approve"
              body="Dry-run first to see the exact events. Approve, and they are tagged so a re-sync updates instead of duplicating — and “undo this plan” removes exactly what it added."
            />
          </ol>
        </div>
      </section>

      <CutEdge variant="scallop" flip className="text-paper-sand" height={16} />

      {/* ── what makes it different ─────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div>
            <h2 className="text-[28px] leading-tight sm:text-[34px]">What you get that a blank grid cannot give you</h2>
            <ul className="mt-6 space-y-3">
              <Point icon={<Brain size={15} aria-hidden="true" />} title="Every block explains itself">
                Each tile carries the reason it landed where it did — your focus peak, a deadline with room to spare, a gap too
                small to be useful. Reasons are generated by the same code that computed the score, so the explanation can never
                drift from the algorithm.
              </Point>
              <Point icon={<ShieldCheck size={15} aria-hidden="true" />} title="Nothing is silently dropped">
                Placed minutes plus unplaced minutes always equals what you asked for. Overflow is reported per task, with the
                reason it did not fit.
              </Point>
              <Point icon={<Layers size={15} aria-hidden="true" />} title="It plans around your real week">
                Import free/busy and existing meetings become an immovable layer. Move something yourself and it is pinned —
                it survives every rebuild.
              </Point>
              <Point icon={<Sparkles size={15} aria-hidden="true" />} title="Works with zero configuration">
                No API key? A deterministic local reasoner handles the language step, and scheduling is identical. Add a model
                later and the same plan pipeline gets better at understanding you.
              </Point>
            </ul>
          </div>

          <PaperSheet mat className="self-start p-3">
            <div className="overflow-hidden rounded-[var(--radius-cut-sm)]">
              <DioramaScene variant="focus" />
            </div>
            <div className="px-2 pt-3 pb-1">
              <h3 className="text-[17px]">Paper, not plastic</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Warm cream stock, dyed sheets, hand-cut edges and soft depth shadows between layers. Depth comes from the shadow
                between sheets, never from a gradient — which is also a good rule for plans.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <PaperChip tone="teal">teal · deep work</PaperChip>
                <PaperChip tone="olive">olive · light</PaperChip>
                <PaperChip tone="kraft">kraft · admin</PaperChip>
                <PaperChip tone="plum">plum · social</PaperChip>
                <PaperChip tone="terracotta">terracotta · physical</PaperChip>
                <PaperChip tone="frost">frost · meetings</PaperChip>
              </div>
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
            <h2 className="text-[30px] leading-tight sm:text-[38px]">Open it. Your week is already loaded.</h2>
            <p className="mx-auto mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">
              A realistic week and a deliberately overbooked one are both one click away, so you can see the report tell the
              truth before you trust it with anything real.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <PaperLink href="/planner" tone="teal" size="lg">
                Open the planner
                <ArrowRight size={15} aria-hidden="true" />
              </PaperLink>
            </div>
          </div>
        </PaperSheet>
      </section>

      <footer className="border-t border-dashed border-[color:rgba(120,98,70,0.25)] py-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 text-[11.5px] text-ink-faint sm:px-8">
          <p>
            Paperweek · Next.js · LangChain · Google Calendar API — built as a demonstration of honest AI planning.
          </p>
          <p>Cut-paper diorama aesthetic. No characters, no faces.</p>
        </div>
      </footer>
    </main>
  )
}

function Promise({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="paper-well p-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-[family-name:var(--font-display)] text-[17px] font-semibold text-ink">{value}</dd>
      <p className="mt-1 text-[11px] leading-snug text-ink-faint">{detail}</p>
    </div>
  )
}

function Layer({ index, icon, title, body }: { index: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="paper-sheet relative p-5">
      <span className="absolute top-3 right-4 font-[family-name:var(--font-display)] text-[26px] font-semibold text-ink-ghost">
        {index}
      </span>
      <span className="paper-tile mb-3 flex h-8 w-8 items-center justify-center text-teal-deep">{icon}</span>
      <h3 className="text-[16.5px] leading-tight">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
    </li>
  )
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="paper-sheet flex gap-3 p-4">
      <span className="paper-tile mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-teal-deep">{icon}</span>
      <div>
        <h3 className="text-[15.5px] leading-tight">{title}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{children}</p>
      </div>
    </li>
  )
}
