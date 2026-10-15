# Calendra — Architecture

| Field | Value |
| --- | --- |
| Document | Architecture |
| Version | 1.0 |
| Last updated | 2026-10-14 |
| Stack | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · LangChain · Google Calendar API |
| Related | `PRD.md`, `RULES.md`, `DESIGN.md`, `TASK.md`, `MEMORY.md` |

---

## 1. Architectural thesis

> **The model reasons. The engine decides. The human approves.**

Three rules drive every design decision below.

1. **Time is deterministic, never generative.** LLMs are unreliable at arithmetic and catastrophic at timestamp bookkeeping. All scheduling math lives in `lib/scheduler/*` — pure, testable, idempotent (INV-7). The agent may *call* the engine and *interpret* its output, but the type system makes it structurally hard for the agent to emit a timestamp (§5.4).
2. **Capability degrades, product never breaks.** Missing API key → local reasoner. Provider 500 → deterministic plan. Google down → plan still builds, sync queue holds. There is no state in which the user sees an empty screen.
3. **The plan is data, not UI.** A plan is a validated, serialisable object (`PlanProposal`). The grid, the report, the trade-off panel, and the calendar writer are four independent renderings of the same data.

## 2. System overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BROWSER — Next.js App Router (React 19 Server + Client Components)          │
│                                                                              │
│   (marketing)  ──▶  /planner  ─────────────────────────────────────────────┐  │
│                       │                                                    │  │
│      ┌────────────────┼─────────────────┐                                  │  │
│      ▼                ▼                 ▼                                  │  │
│  TaskInbox      PreferencePanel     AgentChat                              │  │
│      │                │                 │                                  │  │
│      └────────┬───────┴─────────┬───────┘                                  │  │
│               ▼                 ▼                                          │  │
│        zustand store  ◀────  WeekGrid · PlanReport · InsightsRail  ────────┘  │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ fetch (same-origin, /api/*)
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  NEXT.JS SERVER (route handlers, Node runtime)                               │
│                                                                              │
│   POST /api/plan      ──▶ lib/agent/planner-agent.ts                         │
│                            │  1. resolveProvider()  (openai|anthropic|google|local)
│                            │  2. tool-calling loop (LangChain, max 6 steps)  │
│                            │  3. structured output → zod PlanProposal        │
│                            ▼                                                 │
│                     lib/scheduler/engine.ts  ◀── lib/scheduler/{slots,       │
│                            │                       policies, conflicts,     │
│                            │                       score}                    │
│                            ▼                                                 │
│                     PlanProposal + PlanReport                                │
│                                                                              │
│   POST /api/chat      ──▶ agent refinement loop → re-run engine → diff       │
│   POST /api/calendar/sync  ──▶ lib/google/calendar.ts (googleapis)          │
│   GET  /api/calendar/auth  ──▶ OAuth 2.0 consent redirect                    │
│   GET  /api/calendar/callback ─▶ code→token exchange → session cookie        │
│   GET  /api/health    ──▶ provider + calendar capability probe               │
└──────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
      Google Calendar API v3            LLM provider (optional)
      freebusy · events.insert/patch   OpenAI · Anthropic · Gemini
```

## 3. Layer responsibilities

| Layer | Path | Responsibility | Must not |
| --- | --- | --- | --- |
| Domain | `src/lib/types.ts`, `src/lib/scheduler/` | Types, invariants, time math, scoring, reports. Pure functions. | Import React, fetch, or an LLM SDK. |
| Agent | `src/lib/agent/` | Prompting, tool wiring, provider selection, JSON repair, demo reasoner. | Compute timestamps or bypass the engine. |
| Integration | `src/lib/google/` | OAuth, free/busy, event CRUD, idempotency. | Mutate plans or hold UI state. |
| API | `src/app/api/` | Validation, orchestration, error shaping, capability detection. | Contain business logic beyond orchestration. |
| State | `src/lib/store/` | Client session state (tasks, prefs, proposal, pins, trace). | Hold secrets or duplicate server truth. |
| UI | `src/components/` | Rendering + interaction. | Re-implement scheduling rules. |

Dependency direction is strictly inward: `app → components → store → lib/{agent,google} → lib/scheduler → lib/types`. The domain layer imports nothing from above it (enforced by review, `RULES.md` §4).

## 4. Data model

`src/lib/types.ts` — zod schemas are the source of truth; TS types are inferred from them.

```ts
Task {
  id, title, notes?
  estimateMinutes: number          // 15..720
  deadline?: ISO                   // final chunk must end ≤ deadline (INV-3)
  earliestStart?: ISO              // INV-4
  priority: 'P0'|'P1'|'P2'|'P3'
  energy: 'deep'|'light'|'admin'|'social'|'physical'
  category: 'work'|'study'|'health'|'life'|'admin'|'creative'
  splittable: boolean; minChunkMinutes: number
  location?: string
  recurring?: { days: Weekday[] }  // "review PRs daily"
  dependsOn?: string[]
  source: 'user'|'agent'|'demo'
  estimatedByAI?: boolean
}

Preferences {
  timezone, weekStartsOn
  workingHours: Record<Weekday, {start,end} | null>   // null = day off
  focusPeak: 'morning'|'afternoon'|'evening'|{start,end}
  energyTrough?: {start,end}
  lunch: {start,end,minutes} | null
  bufferMinutes, minBlockMinutes, snapMinutes
  maxDeepWorkMinutesPerDay, maxPlannedMinutesPerDay
  blackouts: {label, weekday?, start, end}[]
  weekendMode: 'off'|'light'|'normal'
}

BusyEvent { id, title, start, end, source:'google'|'demo'|'manual', allDay? }

PlacedBlock {
  id, taskId, title, start, end, minutes
  kind: 'task'|'break'|'lunch'|'buffer'|'meeting'
  energy, category, priority
  chunkIndex, chunkCount
  reasons: Reason[]                // explainability payload (FR-3.9)
  score: number; pinned: boolean
  conflict?: 'deadline-risk'|'overlap-resolved'|'over-capacity'
}
Reason { code, label, detail?, weight? }   // code drives UI chips & tests

PlanReport {
  fits: 'fits'|'tight'|'overbooked'
  capacityMinutes, demandMinutes, scheduledMinutes, utilisation
  placedCount, unplacedCount, unscheduled: {taskId, minutes, why}[]
  deadlineRisks: {taskId, deadline, shortfallMinutes, severity}[]
  warnings: Warning[]              // fragmentation, no-break, marathon, cliff
  perDay: {weekday, planned, capacity, deep, meetings}[]
  tradeoffs: TradeoffOption[]      // FR-3.11
  trace: AgentStep[]               // FR-4.4
}

PlanProposal { blocks, report, tasks, preferences, busy, generatedAt, engine:'deterministic'|'agent', pins }
```

## 5. The scheduler (the core IP)

`lib/scheduler/engine.ts` orchestrates five pure stages. Total budget ≤ 400 ms for 60 tasks × 7 days (≈ 700 candidate slots).

### 5.1 Pipeline

```
           inputs: tasks · preferences · busy events · pins
                              │
   ┌──────────────────────────▼───────────────────────────┐
   │ 1. BUILD HORIZON          slots.ts                   │
   │    week frames → working windows → snap 15 min       │
   │    subtract: blackouts · lunch · busy events         │
   │    → FreeSlot[] with day, start, end, minutes,       │
   │      energyProfile (peak / normal / trough)          │
   └──────────────────────────┬───────────────────────────┘
   ┌──────────────────────────▼───────────────────────────┐
   │ 2. TRIAGE + CHUNK         policies.ts                │
   │    urgency = f(priority, slack, effort)              │
   │    Critical Ratio  CR = timeRemaining / workRemaining│
   │    order: CR asc → priority → deadline asc → effort↓ │
   │    split into chunks: ≤90 min, ≥ minChunkMinutes     │
   └──────────────────────────┬───────────────────────────┘
   ┌──────────────────────────▼───────────────────────────┐
   │ 3. PLACE                  engine.ts                  │
   │    for each chunk: scan FreeSlots, filter by         │
   │    hard constraints (INV-2/3/4/5), score survivors,  │
   │    take argmax, commit, deduct slot capacity,        │
   │    attach reasons + score                            │
   └──────────────────────────┬───────────────────────────┘
   ┌──────────────────────────▼───────────────────────────┐
   │ 4. REPAIR                 conflicts.ts               │
   │    resolve residual overlaps, enforce daily caps,    │
   │    run escalation ladder for leftovers,              │
   │    insert buffer + lunch blocks                      │
   └──────────────────────────┬───────────────────────────┘
   ┌──────────────────────────▼───────────────────────────┐
   │ 5. EVALUATE               score.ts                   │
   │    utilisation, fragmentation, balance, deadline     │
   │    feasibility → PlanReport + ranked TradeoffOptions │
   └──────────────────────────┬───────────────────────────┘
                              ▼
                        PlanProposal
```

### 5.2 Placement scoring

```
score(slot, chunk) =
    0.30 · energyMatch          // deep→peak 1.0 · deep→trough 0.0
  + 0.22 · deadlineFit          // headroom before deadline after placing
  + 0.16 · contiguity           // adjacency to same task/category, ±/− gap
  + 0.12 · dayBalance           // penalise days already heavy
  + 0.10 · fragmentation        // penalise creating unusable gaps
  + 0.06 · rhythm               // buffers preserved, lunch untouched
  + 0.04 · contextMatch         // same location / batching win
  − penalties                   // cap exceeded, weekend use, late-evening

Weight vector lives in ONE place — policies.ts WEIGHTS — so tuning is a
one-line change and the reasons[] payload always mirrors the weights used.
```

### 5.3 Guarantees

- **Idempotent (INV-7):** no `Date.now()`, no `Math.random()`, no Map-iteration-order dependence. Ties break on `taskId` then `start` ascending.
- **Conserving (INV-6):** every minute of every task is either placed or reported in `unscheduled` with a reason. Silent loss is impossible because `evaluate()` reconciles totals against inputs.
- **Explained (FR-3.9):** reasons are emitted *by the same expression that produced the score*, so the UI can never drift from the algorithm.
- **Honest about what it could not do (FR-3.10):** a requested pin that collides with a meeting or falls outside working hours is not silently relocated — it produces a `pin-ignored` warning, and the block is placed by the normal ladder.
- **Rituals yield to reality:** lunch and break tiles are decorative layering; `repairPlan` checks their candidate windows against busy events before inserting, so a ritual row can never cover a real meeting.

### 5.4 Why the agent cannot emit a timestamp

`planner-agent.ts` never constructs a `PlacedBlock`. Its tools return `PlanProposal` values produced by the engine, and its final structured output is a *selection + narration* over engine output:

```ts
AgentOutput = {
  tasks: Task[]                 // parsed, not scheduled
  preferences: Partial<Preferences>
  strategy?: string             // e.g. "front-load deep work before Thu"
  // NOTE: no start/end fields exist anywhere in this schema
}
```

This is a type-level guarantee, not a prompt-level hope.

**Wall-clock, not UTC.** Deadlines and `earliestStart` are local wall-clock instants
(`2026-10-15T17:00:00`) — that is the coordinate system the placement loop works in (§5.1). The
boundary uses a parse-validated string rather than `z.string().datetime()`, which requires a `Z`
suffix and would reject the engine's own output on the way back in (MEMORY.md D-013). A regression
test posts a plan's tasks straight back to `/api/plan` to keep that round-trip honest.

## 6. Agent design

### 6.1 Tools (`lib/agent/tools.ts`)

| Tool | Input | Output | Purpose |
| --- | --- | --- | --- |
| `parse_tasks` | free text + now | `Task[]` | Messy language → structured tasks. Estimates inferred and flagged. |
| `build_schedule` | tasks, prefs, busy, pins | `PlanProposal` | **The only way time is assigned.** |
| `critique_plan` | proposal | `Warning[]`, `TradeoffOption[]` | Finds overload, fragmentation, deadline cliffs. |
| `revise_plan` | proposal + instruction | `PlanProposal` | Applies preference/pin changes, re-runs engine. |
| `explain_block` | proposal, blockId | `string` | Natural-language justification of one block. |

### 6.2 Loop

```
user input ──▶ provider? ──no──▶ LocalReasoner (deterministic, keyword + heuristics)
                  │yes                    │
                  ▼                       │
      LangChain tool-calling agent        │
      max 6 steps · tools as above        │
                  │                       │
        structured output (zod) ──────────┘
                  │
        validate ──fail──▶ 1 repair attempt ──fail──▶ deterministic plan
                  │pass
                  ▼
             PlanProposal  →  UI
```

- **Prompting:** system prompt encodes role, the invariants, the tool contract, and an explicit prohibition on inventing times (`RULES.md` §7).
- **Structured output:** `withStructuredOutput(schema)` on LangChain when supported; otherwise JSON-mode + `zod.safeParse` + one repair round-trip.
- **Provider matrix:** `LLM_PROVIDER=openai|anthropic|google`, `LLM_MODEL` override. `resolveProvider()` returns `null` (never throws) when keys are absent, and the caller falls back to `LocalReasoner`.
- **Cost control:** temperature ≤ 0.3 for parsing, ≤ 0.5 for narration; tool results truncated to the fields the model actually needs.

### 6.3 Demo mode (FR-4.5)

`lib/agent/local-reasoner.ts` is a real implementation of the agent contract, not a stub: keyword/regex parsing with category lexicons, duration heuristics, preference extraction, and scripted tool sequencing. It produces the same `PlanProposal` shape, so the UI, reports, and calendar writer cannot tell the difference. This guarantees the product is demonstrable with zero configuration and makes the demo path the *default* path in tests.

## 7. Google Calendar integration

```
/planner ──connect──▶ GET /api/calendar/auth
                          │ build OAuth2 client (clientId, secret, redirect)
                          │ scopes: calendar.events, calendar.readonly
                          ▼
                   accounts.google.com consent
                          │
                          ▼
                   GET /api/calendar/callback?code=…
                          │ exchange → tokens
                          │ persist server-side (httpOnly cookie / store)
                          ▼
                   redirect /planner?calendar=connected

POST /api/calendar/sync  { proposal, approvedBlockIds[] }
  1. refresh access token if expired
  2. freebusy.query → re-verify the horizon (catch drift since planning)
  3. conflicts? → return 409 with the offending blocks (never write blind)
  4. for each approved block: upsert by extendedProperties.private.calendraBlockId
       existing? events.patch : events.insert
  5. return { inserted, updated, skipped, failed[] }
```

**Idempotency:** every written event carries `extendedProperties.private = { calendraBlockId, calendraPlanId }`. Re-syncing patches instead of duplicating (FR-5.4).
**Marker in the title:** `· CAL` suffix (configurable) so blocks are identifiable in the native calendar UI.
**Write discipline:** sync requires an explicit `approvedBlockIds[]`; nothing is written by implication. `dryRun: true` returns the exact intended payloads (RULES.md §8).
**Failure mode:** per-block failures are collected and returned; a partial sync never rolls back the plan or throws away successful writes.
**Dry runs need no credentials.** `dryRun: true` touches nothing and therefore requires neither Google configuration nor consent — the user can see the exact events, idempotency markers included, before connecting anything (MEMORY.md D-015). Real writes still need config *and* a connected account.

## 8. Client state

`zustand` store, four slices:

| Slice | Contents | Persistence |
| --- | --- | --- |
| `tasks` | task list, free-text buffer, parsing state | localStorage (ids + content only) |
| `prefs` | preferences object | localStorage |
| `plan` | proposal, pins, selected block, dirty flag | memory (server-derived truth) |
| `ui` | active tab, filters, reduced-motion, trace open | memory |

Server truth is `PlanProposal`; the client never recomputes placement. Drag-and-drop produces a *pin request* → `POST /api/plan` with `pins[]` → engine re-runs → new proposal. That keeps one scheduling implementation, on the server, always.

## 9. File map

```
src/
  app/
    layout.tsx                     fonts, paper grain, theme
    page.tsx                       landing page (diorama hero, how it works, features)
    pricing/page.tsx               three tiers; waitlist when no payment provider (D-025)
    docs/page.tsx                  the six documents, live env matrix, API table, deploy checklist
    signin/ · signup/page.tsx      AuthPanel in sign-in / sign-up mode
    planner/page.tsx               server gate (REQUIRE_AUTH) → workspace
    planner/workspace.tsx          the client workspace island
    api/plan/route.ts              generate / regenerate w/ pins
    api/chat/route.ts              agent refinement + diff
    api/auth/session|demo|google|callback|signout/route.ts
    api/calendar/{auth,callback,sync}/route.ts
    api/health/route.ts            capability probe
    api/export/ics/route.ts        credential-free .ics export (T-604)
    globals.css                    Tailwind v4 @theme design tokens
  components/
    paper/                         design-system primitives (see DESIGN.md §9)
      PaperCard · PaperButton · PaperInput · PaperChip · PaperTabs
      DioramaScene · Grain · CutEdge · LayerStack · PaperSheet
      CalendraMark                 the calendar glyph + wordmark
    site/
      SiteHeader · SiteFooter      shared chrome for every non-planner page
      AuthPanel                    one panel, two modes (sign in / sign up)
    planner/
      TaskInbox · PreferencePanel · WeekGrid · ScheduleBlock · AgentChat
      PlanReportPanel · TradeoffPanel · InsightsRail · CalendarPanel
tests/
  harness/{setup-dom,dom,walk}.ts   jsdom + fetch→route-handler bridge + geometry + source walk
  scheduler.test.ts  agent.test.ts  ics.test.ts  ui.test.ts  perf.test.ts
  auth.test.ts                     signature forgery, expiry, open-redirect targets
  responsive.test.ts               overflow guard installed; wide elements contained
scripts/
  run-tests.mjs                    cross-platform test runner (TASK.md T-509)
  lib/
    types.ts  sample-data.ts  utils.ts
    scheduler/{engine,slots,policies,conflicts,score}.ts
    agent/{planner-agent,tools,prompts,providers,local-reasoner}.ts
    google/{calendar,oauth,scopes}.ts
    auth/session.ts                signed-cookie sessions, demo identity, safe redirects
    auth/google.ts                 identity grant (openid email profile) + ID-token verify
    billing.ts                     is a payment provider configured? (D-025)
    use-session.ts                 client session hook (loading → user | null)
    ics.ts                         RFC 5545 writer (folding, escaping, UIDs)
    store/planner-store.ts
docs/  PRD.md ARCHITECTURE.md RULES.md DESIGN.md TASK.md MEMORY.md
```

## 10. Configuration

| Env var | Required | Effect when absent |
| --- | --- | --- |
| `AUTH_SECRET` | **yes in production** | sessions are signed with a development key, and `/api/auth/session` reports `secretConfigured: false` |
| `REQUIRE_AUTH` | no | `/planner` is public (an evaluable demo) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | "Sign in with Google" hides itself; demo sessions remain |
| `AUTH_REDIRECT_URI` / `GOOGLE_REDIRECT_URI` | no | derived from the request origin |
| `LLM_PROVIDER` | no | defaults to `local` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | no | provider resolves to `local` (demo mode) |
| `LLM_MODEL` | no | per-provider default in `providers.ts` |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` | no | `/pricing` renders a waitlist instead of checkout |
| `DEMO_MODE` | no | auto-enabled when no keys are present |

The canonical, copy-pasteable version of this table is `.env.example`; `/docs` renders it from the same
helpers the runtime reads, so the page cannot drift from the app.

Every optional integration degrades to a working product (§1.2).

## 10b. Authentication & sessions

```
browser ──POST /api/auth/demo──────────────▶ session.ts: sign({demo identity}) ──▶ Set-Cookie
browser ──GET  /api/auth/google────────────▶ identity scopes (openid email profile) ──▶ Google
Google  ──▶ /api/auth/callback?code&state──▶ verify state (constant time)
                                         └─▶ exchange code → verify ID token → sign session
browser ──GET  /api/auth/session───────────▶ decode + verify + expiry check ──▶ {user|null}
browser ──POST /api/auth/signout───────────▶ clear cookie
```

The cookie is `base64url(payload).base64url(HMAC-SHA256(payload))`. The payload carries the user and
an expiry; the signature is compared in constant time; an expired cookie is treated as no cookie.
There is no session store, so **there is no server-side revocation** (D-024) — signing out clears the
cookie, and a copy of the cookie remains valid until it expires. That is the same trade as D-010, made
for the same reason, and it is stated in the code, not just the docs.

Identity and calendar access are **two grants on purpose** (D-026). A session proves who you are; it
confers no access to a calendar. `GET /api/calendar/auth` is a separate redirect the user triggers by
clicking *Connect Google Calendar*, with its own state cookie and its own scopes.

The planner gate is decided on the **server**, before any client bundle is sent: `REQUIRE_AUTH=true`
and no session → `redirect('/signin?next=…')`. `next` passes through `safeNext()`, which accepts only
same-site paths, so the sign-in page cannot be turned into an open redirect.

A **demo session** is a real signed session (D-027): same code path, identity labelled
`demo@calendra.local` / "Demo session", and no path from it to a real calendar.

## 11. Testing strategy

| Level | Scope | Notes |
| --- | --- | --- |
Implemented in `tests/` and run with `npm test` (node's test runner over `tsx`, 103 assertions:
38 agent, 30 engine, 12 export, 21 UI-in-jsdom, 2 drag-performance).

| Level | Scope | Where |
| --- | --- | --- |
| **Invariant tests** | scheduler | `tests/scheduler.test.ts` — INV-1…INV-8 asserted against the demo week, the overloaded week (32h into 24h), and seeded random 25–60 task sets. |
| **Property tests** | scheduler | Same file: `mulberry32`-seeded random weeks; no invariant may break, no minute may go missing (INV-6), and two runs must be identical (INV-7). |
| **Performance** | scheduler | 60 tasks must plan in under the 400 ms budget (measured in-process). |
| **Round-trip** | API | A plan's own tasks are posted back to `/api/plan`; the response must be a valid plan (the wall-clock deadline regression, D-013). |
| **Contract tests** | agent | `tests/agent.test.ts` — a nonsense payload is rejected, minimal payloads get defaults, provider resolution never throws and never leaks key material. |
| **Lexicon tests** | local reasoner | Every phrasing in `scripts/agent-check.ts` asserted for the *values* it must produce (durations, weekday deadlines, repeat days, energy, refusals, pins). |
| **Repair tests** | agent plumbing | `extractJson` on fenced/chatty/broken model output; `normaliseTasks` uniqueness and `estimatedByAI`; `mergeTasks` not duplicating on re-parse. |
| **Adapter tests** | calendar | Free/busy clamped to the week; every payload carries `calendraBlockId`/`calendraPlanId` and the `· CAL` marker. |
| **Export tests** | `lib/ics` | `tests/ics.test.ts` — CRLF, 75-octet folding on octet boundaries, TEXT escaping, floating local times, unique/stable UIDs, determinism, `approvedBlockIds` scoping, and the ritual-row exclusion. A malformed `.ics` imports as *nothing at all*, so structure is asserted rather than sampled. |
| **Carry-over** | agent session | `scripts/agent-check.ts` walks nine conversational turns carrying tasks, preferences and **pins**, then asserts a pin made earlier still holds and that none were silently relocated (D-021). |
| **UI behaviour** | components | `tests/ui.test.ts` — jsdom, real components, real routes, real engine. Drag → pin → server replan (honoured and refused), resize, keyboard parity, free-text intake, chat, calendar gates, full-page render. |
| **Interaction cost** | WeekGrid | `tests/perf.test.ts` — geometry reads must not scale with the number of `pointermove` events, and a burst of moves must not commit a render each. Both are INP-relevant and both are invisible to functional tests. |
| **A11y** | UI | Keyboard parity (move/resize/jump) and focus rings are *exercised* by the UI tests; focus-visible styling and screen-reader output still want a real browser (TASK.md T-507). |

**The harness.** `tests/harness/dom.ts` installs jsdom, routes `fetch` to the real handlers, and
shims the geometry jsdom cannot compute (`getBoundingClientRect`, `clientWidth`) from the same
constants the grid uses — `HOUR_HEIGHT` is asserted equal in both places, so a scale change fails
loudly instead of silently. Each day column publishes its own display window as `data-window-start`,
which is how a test computes where 13:30 is without reimplementing the layout.

**What is still not claimed.** jsdom has no layout engine, so nothing here proves *pixels*: no
overlap, no overflow, no focus ring, no responsive reflow, and the OAuth redirect cannot be followed.
Those remain T-507.

## 12. Performance

- Scheduler is O(chunks × slots); at MVP scale (~60 × 700) it is sub-100 ms in-process. Free slots are pre-indexed by day and sorted once.
- UI: `WeekGrid` virtualises nothing at MVP scale (168 hour-rows max). Its drag path is the hot path and is built for it: the strip's geometry is measured **once** at `pointerdown` (never per move — a layout read while React has a pending write forces a synchronous reflow), the ghost is passed only to the column it lands on, and `DayColumn` is memoised so the other six do not re-render. Nothing in the material layer uses `mix-blend-mode`: a blended layer cannot be composited independently, so a repaint beneath one re-blends it — across every chip, button and the full-viewport grain, that is a screen-sized composite per frame (D-023).
- Agent calls are the only slow path → streamed trace, optimistic skeleton, and a hard 20 s timeout after which the deterministic plan is shown with a notice.

## 13. Security & privacy

- OAuth tokens live server-side only (`httpOnly` cookie). Never in `localStorage`, never in client logs.
- Task text is sent to an LLM provider **only** when a provider key is configured; demo mode is fully local. This is disclosed in the UI.
- Route handlers validate every payload with zod before use; no unvalidated input reaches the scheduler or the calendar writer.
- No analytics or third-party scripts in MVP.
- Scopes are minimal and requested incrementally (calendar only when the user clicks Connect).
- Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production, HMAC-SHA256 signed with
  `AUTH_SECRET`, verified in constant time, with the expiry re-checked on every read. A forged or edited
  cookie resolves to "no session", never to a partial one.
- OAuth `state` is a random nonce in an `httpOnly` cookie, compared verbatim; a mismatch aborts the
  exchange instead of completing half a sign-in.
- `next=` redirect targets are filtered by `safeNext()`: same-site paths only, so `//evil.example` and
  absolute URLs fall back to `/planner`.
- No secrets are exposed to the client: `/api/health` and `/api/auth/session` report *capability booleans*
  (`configured`, `secretConfigured`), never key material or partial values.

## 14. Known constraints & deliberate trade-offs

| Decision | Trade-off accepted |
| --- | --- |
| Single-week horizon | Simpler, faster, matches how people actually plan. Multi-week is v1.1. |
| Greedy + repair instead of global optimisation (ILP/CP) | Extremely fast, explainable, deterministic. Slightly suboptimal packing; acceptable at MVP scale and worth it for the reason-by-construction model. |
| Recompute-on-drag (server round trip) | One source of scheduling truth over instant local feel; mitigated by optimistic UI. |
| No DB in MVP | Zero-setup demo, deployable anywhere; state is client-held + Google Calendar. Persistence is v1.1. |
| Sessions in a signed cookie, not a table (D-024) | Deployable with no store and no migration; the cost is no server-side revocation — signing out clears the browser, not the token. |
| Billing is a switch, not an integration (D-025) | The pricing page can never offer a button that cannot charge; the cost is no self-serve upgrade on an unconfigured deployment. |
| Tailwind v4 CSS-first tokens, no config file | Tokens live in `globals.css` `@theme`; one file to review for design drift. |
