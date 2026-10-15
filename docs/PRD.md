# Calendra — Product Requirements Document

> **Calendra** is an AI calendar planner. You hand it tasks, deadlines, and preferences;
> it returns a realistic, defensible week — built layer by layer, like a paper diorama.
>
> *Working title: "AI Calendar Planner". Shipping name used across the app: **Calendra**.*

| Field | Value |
| --- | --- |
| Document | PRD |
| Version | 1.0 |
| Status | Approved for MVP build |
| Owner | Product |
| Last updated | 2026-10-14 |
| Related | `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASK.md`, `MEMORY.md` |

---

## 1. Problem

Knowledge workers do not fail to plan. They fail to plan **realistically**, then quietly abandon the plan.

Today's tools fall into two camps:

1. **Blank-grid calendars** (Google Calendar, Outlook) — perfectly flexible, zero judgement. They tell you *when*, never *whether it fits*.
2. **Rigid task managers** (Todoist, Linear) — perfectly opinionated about *what*, completely blind to *whether there is time*.

The gap is arithmetic nobody wants to do by hand: **how many hours do I actually have this week, and which of these 40 commitments deserve them?**

The failure modes are consistent and measurable:

| Failure | What it looks like |
| --- | --- |
| **Fantasy planning** | 9 hours of "deep work" booked on a day with 5 hours of meetings. |
| **Deadline blindness** | The important-but-not-urgent task gets scheduled *after* its own deadline. |
| **Swiss-cheese days** | Six 25-minute fragments where one 90-minute block was needed. |
| **Energy mismatch** | Hardest cognitive work lands at 4pm; admin lands at peak focus. |
| **No explanation** | The plan is a black box, so it earns no trust and gets deleted. |
| **Re-entry cost** | One meeting moves; the planner must re-plan the entire week by hand. |

## 2. Goals

**G1 — Feasibility over aspiration.** Every generated plan must state whether the week's commitments actually fit. If they do not, say so explicitly, with numbers, instead of silently overbooking.

**G2 — Explainability as a first-class feature.** Every scheduled block carries human-readable reasons ("deep work → your 9:00–11:30 focus peak", "placed Tuesday to protect Wednesday's deadline"). No unexplained placement.

**G3 — Respect existing reality.** The planner schedules *around* the user's real Google Calendar (meetings, commute, personal blocks) via free/busy, not in a vacuum.

**G4 — One-screen trust loop.** Ingest → generate → inspect → adjust → approve → sync, without leaving a single workspace.

**G5 — Ambitious-but-honest AI.** LLM used where language and judgement live (parsing messy input, choosing between valid strategies, narrating tradeoffs). Deterministic code used where correctness lives (time arithmetic, conflicts, deadlines).

## 3. Non-Goals (MVP)

- ❌ Team/shared calendar scheduling, meeting negotiation, or availability polling.
- ❌ Mobile-native apps (the web workspace is responsive, not native).
- ❌ Time tracking, actuals-vs-plan analytics, invoicing.
- ❌ Multi-account / multi-timezone-heavy enterprise calendars (single user, single primary TZ in MVP; TZ stored per user).
- ❌ Auto-syncing without human approval. **Every write to a real calendar requires explicit confirmation** (see `RULES.md` §8).
- ❌ Video/voice intake.
- ❌ Team billing, seat management, invoices or tax handling (access tiers are described in §6.7; the
  *payment* integration is deliberately a switch, not a checkout — D-025).
- ❌ Server-side session revocation in the MVP (D-024: a signed cookie with no store; signing out clears
  the browser, and a copied cookie stays valid until it expires).

## 4. Personas

| Persona | Context | Primary need |
| --- | --- | --- |
| **Maya — the over-committed IC** | Engineer/designer. 22–28 meetings/week, 3 real projects, one deadline always on fire. | "Tell me the truth about what fits and protect my mornings." |
| **Devin — the founder/operator** | Context-switches constantly; calendar is a warzone; no two days alike. | "Re-plan the moment something moves, without me re-entering anything." |
| **Priya — the deep-work researcher/student** | Few meetings, long attention blocks, thesis/exam deadlines. | "Give me one long unbroken block per day and never fragment it." |

Shared trait: they have **tried** a planner and bounced, because it lied to them.

## 5. Core user journeys

### J1 — First plan (the "wow" path) — target < 90 seconds
1. User lands on the marketing surface; understands the premise in one screen.
2. Opens **Planner** → sees a pre-loaded demo week (realistic tasks, existing meetings) so nothing is empty.
3. Pastes or types tasks in free text: *"finish Q4 deck by Thu, 2h; gym 3x this week; review PRs daily; prep 1:1"*.
4. Sets/confirms preferences: working hours, focus peak, buffers, lunch, blackout windows.
5. Hits **Build my week**.
6. Gets a layered week grid: placed blocks, each with reason chips, plus a **Plan Report** (fits / tight / overbooked, utilisation, deadline risk list).
7. Adjusts by dragging, or by telling the agent *"move deep work to mornings"* / *"I'm out Friday afternoon"*.
8. Approves → pushes selected blocks to Google Calendar.

### J2 — Refine by conversation
User types natural-language constraints. Agent interprets → updates task/preference state → **re-runs the deterministic engine** → presents a diff ("moved 2 blocks, extended 1, now 96% utilised"). Agent never hand-writes times.

### J3 — Connect a real calendar
OAuth consent → free/busy import → existing meetings render as fixed, immovable layers → regenerate plan around them.

### J4 — Triage the overflow
When commitment > capacity, the app must not silently drop work. It presents a **Trade-off Panel**: which tasks to defer, shorten, split, or drop — ranked, with the consequence of each choice ("deferring the deck risks the Thu 5pm deadline by 1 day").

## 6. Functional requirements

### 6.1 Intake

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1.1 | Accept tasks via structured form (title, estimate, deadline, priority, energy demand, category, splittable, earliest start, location). | P0 |
| FR-1.2 | Accept tasks via **free text**; LLM extracts structured records, user confirms before they are committed. | P0 |
| FR-1.3 | Estimate duration when the user omits it, using category + title heuristics; mark the estimate as *inferred* and editable. | P1 |
| FR-1.4 | Detect duplicate/repeated tasks ("review PRs daily") and model them as recurring. | P1 |
| FR-1.5 | Support dependencies between tasks (task B cannot start before A). | P2 |

### 6.2 Preferences

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-2.1 | Working hours per weekday, plus timezone. | P0 |
| FR-2.2 | Focus peak window(s) (morning / afternoon / evening / custom). | P0 |
| FR-2.3 | Lunch / recovery break, protected and non-negotiable by default. | P0 |
| FR-2.4 | Buffer minutes between blocks; minimum block length. | P0 |
| FR-2.5 | Blackout windows (school run, therapy, no-meeting blocks, weekends off). | P0 |
| FR-2.6 | Daily caps: max deep-work minutes/day, max meeting minutes/day, max total. | P1 |
| FR-2.7 | Energy trough window (used to place admin/light work). | P1 |

### 6.3 Planning

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-3.1 | Generate a full week (Mon–Sun) plan from tasks + preferences + busy events. | P0 |
| FR-3.2 | Never place a block inside a busy event, blackout, outside working hours, or across the day boundary. | P0 |
| FR-3.3 | Respect deadline *and* earliest-start constraints for every chunk; a task's final chunk must end at or before its deadline. | P0 |
| FR-3.4 | P0/P1 tasks are attempted before P2/P3 (weighted by deadline urgency, not priority alone). | P0 |
| FR-3.5 | Match energy demand to time-of-day energy profile (deep work → peak; admin → trough). | P0 |
| FR-3.6 | Split long tasks into chunks ≥ minimum block length, preferring same-day contiguity. | P1 |
| FR-3.7 | Cap deep work per day; prefer distributing load instead of overloading one day. | P1 |
| FR-3.8 | Produce a Plan Report: utilisation %, placed/unplaced counts, deadline risk, structural warnings. | P0 |
| FR-3.9 | Every block exposes 1–3 plain-language reasons for its placement. | P0 |
| FR-3.10 | Manual override: drag/resize a block; overrides are **pinned** and survive regeneration. | P1 |
| FR-3.11 | When work does not fit, generate ranked trade-off options rather than dropping or overbooking. | P1 |

### 6.4 Agent

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-4.1 | Multi-step LangChain agent with tools for parse, schedule, critique, and revise. | P0 |
| FR-4.2 | Agent must call the **deterministic scheduler tool** for all time decisions; it may not invent timestamps. | P0 |
| FR-4.3 | Structured output validated by schema; a schema violation triggers one repair attempt, then falls back to the deterministic plan. | P0 |
| FR-4.4 | Conversational refinement loop with a visible trace of what the agent did ("parsed 3 tasks → scheduled → found conflict → moved 1 block"). | P1 |
| FR-4.5 | Runs with zero API keys in **Demo mode** using a deterministic local reasoner, so the product is always demonstrable. | P0 |
| FR-4.6 | Provider-agnostic: OpenAI, Anthropic, or Google Gemini selected by env var. | P0 |

### 6.5 Google Calendar

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-5.1 | OAuth 2.0 connect flow with minimal scopes (`calendar.events`, `calendar.readonly`). | P0 |
| FR-5.2 | Import free/busy for the planning horizon; render as immovable context. | P0 |
| FR-5.3 | Push approved blocks as events, tagged with an app marker for idempotency. | P0 |
| FR-5.4 | Re-running sync updates existing events instead of duplicating them. | P1 |
| FR-5.5 | Delete/rollback a pushed plan. | P1 |
| FR-5.6 | Token refresh handling; clear re-auth prompt on expiry. | P1 |
| FR-5.7 | Export the week as an `.ics` file with no account, no OAuth and no configuration. | P2 |
| FR-5.8 | The exported file is importable by a standard client: RFC 5545 folding/escaping, floating local times, stable UIDs so re-importing updates rather than duplicates. | P2 |

### 6.6 Insights

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-6.1 | Week-at-a-glance load bars per day (planned vs capacity). | P1 |
| FR-6.2 | Category mix breakdown (deep / admin / health / life). | P2 |
| FR-6.3 | Flag calendar anti-patterns: fragmentation, back-to-back marathons, no-break days, deadline cliffs. | P1 |

### 6.7 Accounts, plans and access

| Ref | Requirement | Status |
| --- | --- | --- |
| FR-7.1 | A visitor can evaluate the whole product — plan, drag, export — without an account. | ✅ `/planner` is open by default |
| FR-7.2 | Sign in with Google, asking for **identity only** (`openid email profile`); the calendar grant is a separate, later consent. | ✅ `/api/auth/google`, D-026 |
| FR-7.3 | Where Google is not configured, offer a **labelled demo session** rather than a dead button — the label appears wherever the account appears. | ✅ `/api/auth/demo`, D-027 |
| FR-7.4 | The session is a signed, `httpOnly`, expiring cookie; a forged, edited or expired cookie resolves to signed-out. | ✅ `lib/auth/session.ts`, `tests/auth.test.ts` |
| FR-7.5 | A self-hoster can make the planner private with `REQUIRE_AUTH=true`; the decision is enforced on the server, before any bundle is sent. | ✅ `app/planner/page.tsx` |
| FR-7.6 | Redirect targets after sign-in are same-site paths only. | ✅ `safeNext()` |
| FR-7.7 | Three access tiers are described and priced; if no payment provider is configured the page says so and offers a waitlist instead of a checkout. | ✅ `/pricing`, D-025 |
| FR-7.8 | The deployment's real capability is readable by anyone: `/api/health` and `/api/auth/session` report booleans, never claims. | ✅ |

## 7. Scheduling specification (normative)

The engine is deterministic and is the single source of truth for time. Full algorithm in `ARCHITECTURE.md` §5.

**INV-1 No overlap.** No two placed blocks, or a block and a busy event, may overlap.
**INV-2 Containment.** Every block lies fully inside a working window for its weekday.
**INV-3 Deadline.** `block.end ≤ task.deadline` for the final chunk of each task.
**INV-4 Earliness.** `block.start ≥ task.earliestStart` when set.
**INV-5 Granularity.** Blocks snap to a 15-minute grid; no block shorter than `minBlockMinutes`.
**INV-6 Conservation.** `Σ scheduled chunks + unscheduled remainder = task estimate`. No silent loss.
**INV-7 Idempotence.** Same inputs → byte-identical plan.
**INV-8 Pins.** Pinned (user-placed) blocks are immovable inputs to regeneration.

**Placement scoring** — candidate slots are ranked by a weighted sum (weights in `lib/scheduler/policies.ts`):

| Signal | Intent |
| --- | --- |
| Energy match | deep → peak window, light → trough |
| Deadline pressure | low slack → earliest viable day |
| Contiguity | reward adjacency to same-task / same-category blocks |
| Fragmentation penalty | punish leaving unusable gaps in a day |
| Day balance | spread load; avoid overloading any single day |
| Rhythm preference | work blocks, then a buffer, then the next block; protect lunch |
| Context batching | group same-location / same-category work |

**Escalation ladder when a task cannot be fully placed**
`shift within the week` → `reduce chunk count by merging` → `allow adjacent-day spillover` → `extend into shoulder hours (with warning)` → `flag as WILL-NOT-FIT with quantified deficit` → `offer trade-offs`.

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| **Performance** | Plan generation ≤ 400 ms server-side for 60 tasks × 1 week. UI interaction ≤ 100 ms. No blocking layout shift on load. |
| **Agent latency** | Full agent pass ≤ 20 s p95 with a live provider; streamed trace so the UI is never frozen. |
| **Reliability** | Any provider outage degrades to the deterministic plan. Zero-key demo mode always works. Partial calendar failure never discards the user's plan. |
| **Accessibility** | WCAG 2.1 AA. Full keyboard operation of the grid (arrow keys / move / resize), visible focus rings, contrast ≥ 4.5:1, `prefers-reduced-motion` respected, screen-reader labels on every block. |
| **Privacy** | Calendar tokens server-side only, never in localStorage. No task text logged in production. Minimum OAuth scopes. |
| **Determinism** | Same input → same plan (INV-7). No hidden randomness in scheduling. |
| **Portability** | Node 20+; no proprietary runtime required; Vercel-deployable. |

## 9. Success metrics

| Metric | Target (60 days post-launch) |
| --- | --- |
| Time to first plan | < 90 s median |
| **Plan acceptance rate** (generated → approved with ≤ 2 edits) | ≥ 60% |
| Blocks with explanations viewed | ≥ 40% of plans |
| Google Calendar connect rate among retained users | ≥ 45% |
| Weekly retention (returns to build a 2nd week) | ≥ 35% |
| Median deadline-risk items surfaced per plan | > 0 (proves it tells the truth) |
| Zero silent overbooking incidents | 0 (hard gate) |

## 10. Release scope

**MVP (this repository)**
Structured + free-text intake · preference model · deterministic week scheduler with explanations · agent with tools, structured output, and demo fallback · layered week grid with drag-to-adjust · Plan Report with trade-offs · Google Calendar OAuth + free/busy + approved push · insights rail · responsive paper-diorama UI.

**Post-MVP, shipped (see `TASK.md`)**
Recurring task engine with per-occurrence estimates (FR-1.4, T-601) · dependency enforcement with an
ordering gate, an `after-dependency` reason and a `dependency-unmet` audit (FR-1.5, T-602) ·
credential-free `.ics` export (FR-5.7–5.8, T-604) · the public site (landing, pricing, docs) ·
signed-cookie authentication with a Google identity grant and a labelled demo session (FR-7.1–7.8, T-701
… T-707) · a responsive-containment pass with an asserted overflow guard (T-708).

**v1.1**
Calendar *import* (and `.ics` as a sync target), multi-week horizon, plan templates, "what changed"
diff view, persistence + accounts.

**v2**
Team availability, focus-time defence against external invites, mobile PWA with offline plan cache, actuals-vs-plan learning loop that tunes the weights per user.

## 11. Open questions

| # | Question | Owner | Blocking? |
| --- | --- | --- | --- |
| Q1 | Should declined-but-visible meetings count as free time? | Product | MVP: treated as busy |
| Q2 | Default when a task can be split but the user has no preference? Splittable if ≥ 120 min. | Design+Eng | No |
| Q3 | Do we honour a "deadline" as midnight of the day, or the stated time? | Product | MVP: midnight of stated date unless a time is given |
| Q4 | Per-user weight tuning — collect feedback signals from day 1, train in v2. | Eng | No |
| Q5 | Do we need server-side session revocation (a store, or short-lived sessions with refresh)? Today a copied cookie is valid until it expires. | Eng | Not for a single-user self-hosted tool; yes before multi-tenant seats |
| Q6 | Which provider for billing, and does the free tier need a card at all? | Product | No — the switch is in place and the page is honest until then |

## 12. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LLM hallucinates times | Catastrophic trust loss | Agent is forbidden from producing timestamps; engine owns all time math (FR-4.2). |
| Over-claiming "realistic" | Reputation | Plan Report always quantifies capacity vs demand, even when it fits. |
| Google API quota / verification | Sync unavailable at launch | Demo mode + manual ICS-free operation; sync is additive, never required. |
| Provider cost per plan | Unit economics | Cheap model for parsing, strong model only for strategy/narration; deterministic engine does the heavy lifting. |
| Scope creep into project management | Lost focus | Non-goals §3 are enforced in review (`RULES.md` §11). |
