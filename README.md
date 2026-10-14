<div align="center">

# Calendra

**The AI calendar planner that tells you the truth.**

Give it your tasks, deadlines and preferences. It builds a realistic week —
then says so, out loud, when the week doesn't fit.

Next.js 15 · LangChain · Google Calendar API · Tailwind v4 · zod · deterministic engine

</div>

---

## What it is

Most planners accept a todo list, sketch a hopeful week, and quietly drop the rest. Calendra does
the opposite: a **deterministic scheduling engine** owns all time arithmetic, a **LangChain agent**
owns language, and the plan arrives with a verdict you can trust.

> A week with 32 hours of work and 24 hours of room is not "scheduled". It's **overbooked**, and the
> report says which 8 hours have nowhere to go and which trade-offs would recover them.

The visual language is layered **cut-paper diorama** — matte paper, cut edges, soft shadow gaps
between layers, muted dyed stock. Scenery and objects only: no people, no characters, no faces.

### What it does

| | |
| --- | --- |
| **Understands a brief** | Paste "finish the deck by Thursday, gym three times, PR reviews every weekday, I'm out Friday afternoon" and it becomes typed tasks, deadlines, repeats and blackouts. |
| **Plans honestly** | Energy-aware chunking, deadline headroom, protected lunch, meeting buffers, daily caps — then a verdict: *fits*, *tight*, or *overbooked*. |
| **Explains every block** | Each block carries the reason codes the engine used, in plain words: "It landed here for three reasons: your focus peak · balances the day's load · avoids leaving an unusable gap." |
| **Waits for approval** | Nothing reaches your real calendar until you pick blocks and approve. Sync is a dry run first, upserts are idempotent, and one click rolls the whole plan back. |
| **Leaves with you** | *Download .ics* hands the week to Apple Calendar, Outlook, Fastmail or a printer — no account, no OAuth, no configuration. The file is written to import, not just to exist. |

---

## Quickstart

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys and no Google account are needed to see the whole thing. The app starts in **demo
mode**: a realistic week, a deterministic local reasoner standing in for the model, and a banner
that says exactly that. The planner is fully functional on that path.

```bash
npm test             # 103 assertions: engine invariants, agent contract, .ics structure, UI, drag cost
npm run test:ui      # just the interaction tests (drag, resize, keyboard, intake, chat)
npm run test:perf    # just the drag cost: forced layouts and render coalescing
npm run agent:check  # walk the agent through nine turns, carrying pins between them
npm run smoke        # capacity/demand baselines for the demo + overloaded weeks
npm run build        # production build
```

The UI tests are not snapshots. They render the real components in jsdom, route `fetch` to the real
API handlers, and drive real pointer and keyboard events through to the real engine — which is how
three shipped bugs in drag-and-drop were found (see `docs/TASK.md` § *Bugs found by executing the UI*).

> Heavy build boxes: `NODE_OPTIONS=--max-old-space-size=3072 npm run build` if the default heap
> OOMs during the production build — it does on small containers.

### Keeping it fast

A drag fires `pointermove` far more often than the screen refreshes, so the grid is built for that:
the strip's geometry is measured **once** at `pointerdown` (a layout read while React has a pending
write forces a synchronous reflow — ~120 of those a second is what an INP warning looks like), the
ghost is passed only to the column it lands on, and the columns are memoised. Nothing in the material
layer uses `mix-blend-mode`: a blended layer can't be composited on its own, so a repaint underneath
one re-blends it — across every chip, button and the full-viewport grain that is a screen-sized
composite per frame.

Both properties are asserted in `tests/perf.test.ts`, because neither is visible in a screenshot:

| 24 pointer moves | Before | After |
| --- | --- | --- |
| Forced layout reads | 72 | **0** |
| Wall clock (jsdom, indicative) | 345 ms | **181 ms** |

### Going live

Copy `.env.example` to `.env.local` and fill in what you have. **Everything is optional**; each
piece degrades to something honest rather than to a crash.

```bash
# Real language model (pick one; omit entirely to stay on the local reasoner)
LLM_PROVIDER=openai            # openai | anthropic | google | local
OPENAI_API_KEY=sk-…
LLM_MODEL=gpt-4o-mini          # any model id the provider accepts

# Real calendar writes (planning works without it; sync stays available as a dry run)
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback

DEMO_MODE=false                # false hides demo data and the demo banner
```

Google setup, briefly: create an OAuth client (Web application) in Google Cloud Console, add
`http://localhost:3000/api/calendar/callback` as a redirect URI, enable the **Google Calendar
API**, then click *Connect Google Calendar* in the planner. Tokens live in an httpOnly cookie —
there is no database, and revocation is one *Disconnect* away. Scopes are
`calendar.events` and `calendar.readonly`, nothing more.

If a live key is present but the call fails, the agent falls back to the local reasoner and says so
in the chat rather than failing the request. `GET /api/health` always reports what is actually
configured.

---

## How it works

```
 free text ─┐
 task form ─┼─► normalise ─► ┌──────────────────────────────┐
 CSV/agent ─┘   (zod)        │  LangChain agent (language)  │
                             │  parse · estimate · explain  │
 meetings  ──► freebusy ───► └──────────────┬───────────────┘
                                            │  typed request
                                            ▼
                             ┌──────────────────────────────┐
                             │  Scheduling engine (time)    │
                             │  slots → placement → repair  │
                             │  → score → verdict           │
                             └──────────────┬───────────────┘
                                            │  proposal + reasons
                                            ▼
                             ┌──────────────────────────────┐
                             │  Human approves specifically │
                             └──────────────┬───────────────┘
                                            ▼
                                    Google Calendar
                                  (idempotent upsert)
```

**The model reasons; the engine decides; the human approves.** The agent never returns a start or
end time — it returns tasks, preferences and pins; the engine turns those into minutes. That single
boundary is what makes the output explainable, testable and reproducible (identical inputs produce
byte-identical plans — there is a test for it).

### Layout

```
src/
  app/                     routes: landing, /planner, /api/{plan,chat,health,calendar/*}
  components/paper/        the material layer: sheets, wells, cut edges, grain, diorama
  components/planner/      WeekGrid, TaskInbox, PreferencePanel, AgentChat, PlanReport, Calendar
  lib/
    types.ts               the domain, expressed once in zod (single source of truth)
    ics.ts                 RFC 5545 export — importable, not just present
    scheduler/             slots · policies · engine · conflicts · score   ← all time maths
    agent/                 prompts · tools · providers · local-reasoner · planner-agent
    google/                scopes · oauth · calendar   ← freebusy, drift, upsert, rollback
    diorama.ts             the cut-paper scene geometry
    store/                 zustand session store (localStorage-persisted)
tests/                     engine invariants · agent contract · UI interactions (jsdom)
scripts/                   smoke baselines, agent walkthrough, scene renderer
docs/                      PRD · ARCHITECTURE · RULES · DESIGN · TASK · MEMORY
```

### Repeats, order and export

A task can carry a **cadence** — `Mon/Wed/Fri`, `every other Thursday`, `daily until Thursday`,
`four times this week` — and one function answers the only question the rest of the codebase needs
to ask: *which days of this week?* (`occurrenceDays`). The estimate is per occurrence; a task in a
skipped week demands zero minutes and is neither planned nor reported as lost.

A task can also **depend on another** (`dependsOn`). The engine places prerequisites first (depth
first, then critical ratio), refuses to schedule a dependent before its prerequisite has finished
(`AWAITING_DEPENDENCY`, with an `after-dependency` reason on the block), and audits the result
afterwards — if a dependent still starts too early, the report says `dependency-unmet` and names
both tasks. A cycle or a dangling reference is survived, not thrown.

And `POST /api/export/ics` turns whatever is on screen into an `.ics` you keep: CRLF and 75-octet
folding, escaped text, floating local times, stable `UID:<blockId>@calendra` so re-importing
updates instead of duplicating, and a `VJOURNAL` entry carrying the verdict so the file still
explains itself a month later.

### Engine, in one breath

15-minute snapping. Tasks are chunked by energy (deep work in focus peaks, admin in troughs), never
below a minimum block, never past a per-day cap. Placement runs in working hours first; whatever
doesn't fit gets a second pass — trim to the largest gap, extend into shoulder hours, and only then,
if you allow it, the weekend — each escalation costing score and raising a flag. Lunch and your
blackouts are protected bands. Meetings get an asymmetric buffer (a block may not start before a
meeting ends, nor end within ten minutes of one starting). The result is scored, verdict-gated, and
summarised: *placed*, *unplaced*, *slack*, and up to five ranked trade-offs with the minutes each
would recover.

Any block can be dragged, and a drag becomes a **pin**: the engine re-plans around your decision
instead of arguing with it. A pin survives everything else you do — including asking the agent a
question three turns later (`npm run agent:check` asserts exactly that). If a pin is impossible — a
meeting is already there — the report says so (`pin-ignored`) and the pin is retired rather than
re-attempted forever, because silently moving your block would be the one thing this app must never do.

---

## The six documents

| Doc | What's in it |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Goals G1–G5, functional requirements FR-1.x–FR-6.x, non-functional targets, success criteria, and the eight scheduler invariants. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The layering, the five-stage pipeline, scoring weights, the agent's tool contract, the fallback path, OAuth/sync flow, file map, env. |
| [`docs/RULES.md`](docs/RULES.md) | Laws L1–L8 — the constraints this codebase is not allowed to break (typed boundaries, engine ownership of time, no hardcoded colour, layer discipline). |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Palette, shadow and radius tokens, paper texture, the four diorama scenes, motion, type scale, the no-people rule. |
| [`docs/TASK.md`](docs/TASK.md) | The build ledger: what shipped, in order, with the reason each piece exists. |
| [`docs/MEMORY.md`](docs/MEMORY.md) | ADRs D-001–D-0xx, invariants, and the gotchas that cost real debugging time. Start here before changing the engine. |

---

## Honest by construction

- **INV-6, conservation.** `placed + unscheduled === demanded`, for every task, including repeats.
  A minute is never lost between the request and the report.
- **INV-7, determinism.** Same inputs, same plan — no clock, no randomness, no model in the loop.
- **Verdict gate.** "Overbooked" is only claimed when the shortfall is real
  (`unscheduled ≥ max(minBlock, 2% of demand)`), and trade-offs must recover at least one slot.
- **Demo mode is labelled.** With no keys, the UI says the reasoner is local. It doesn't pretend.
- **Nothing writes itself.** Approve specific blocks; dry run first; roll back in one click.

## Known limits

- **No real-browser test.** jsdom executes behaviour but paints nothing: overlap, overflow, focus
  rings and responsive reflow are unobserved (TASK.md T-507). The `.ics` is checked structurally
  here; no real client has been observed importing it (TASK.md N-11).
- Single week, single timezone per plan. Multi-week horizons and travel time are not modelled —
  a fortnightly task is simply *not this week* on its off weeks, and says so.
- Importing an existing `.ics` (only export is shipped), and `.ics` as a sync target alongside
  Google, are still open (TASK.md N-10).
- The local reasoner is a rule-based interpreter, not a model. It handles the phrasings in
  `scripts/agent-check.ts` very well and unusual framing less well — that's what `LLM_PROVIDER` is for.
- Calendar tokens live in a cookie, so sync is per-browser. A server deployment wants a real store.
- No multi-user accounts, no sharing, no mobile app. It's a planner, not a platform.

## License

MIT.
