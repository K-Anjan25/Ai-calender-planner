# Calendra — Task Ledger

| Field | Value |
| --- | --- |
| Document | Task breakdown & build ledger |
| Version | 1.0 |
| Last updated | 2026-10-14 |
| Legend | ✅ done · 🟡 in progress · ⬜ todo · ⏸ blocked |

Status below reflects the state of `main`/working branch at the time of writing.
A task is only ✅ when **lint + build pass** and its acceptance criteria are met (`RULES.md` §2).

---

## Phase 0 — Foundations

| ID | Task | Owner | Depends | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T-001 | Repo scaffold: Next.js 15 + TS strict + Tailwind v4 + ESLint | Eng | — | ✅ | `npm run dev` serves; `npm run build` clean |
| T-002 | Dependency set: zod, date-fns, zustand, framer-motion, langchain, googleapis, lucide | Eng | T-001 | ✅ | Installed, no peer conflicts |
| T-003 | `docs/PRD.md` — problem, personas, journeys, FRs, invariants, metrics | Product | — | ✅ | Reviewed against non-goals |
| T-004 | `docs/ARCHITECTURE.md` — layers, data model, pipeline, agent, calendar | Eng | T-003 | ✅ | Matches implemented file map |
| T-005 | `docs/RULES.md` — binding engineering rules | Eng | T-004 | ✅ | 8 laws + layer discipline |
| T-006 | `docs/DESIGN.md` — cut-paper diorama design language | Design | — | ✅ | Tokens match `globals.css` |
| T-007 | `docs/TASK.md`, `docs/MEMORY.md` | Eng | — | ✅ | Ledger + ADRs live |
| T-008 | Design tokens in `globals.css` `@theme`: palette, shadows, radii, textures | Design+Eng | T-006 | ✅ | Zero bare hex in components |

## Phase 1 — Domain core (the engine)

| ID | Task | Owner | Depends | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T-101 | `lib/types.ts`: zod schemas + inferred types for Task, Preferences, BusyEvent, PlacedBlock, PlanReport, PlanProposal | Eng | T-002 | ✅ | Single source of truth; no duplicate hand-written types |
| T-102 | `lib/scheduler/slots.ts`: horizon build, snap grid, free-slot derivation, energy profile per slot | Eng | T-101 | ✅ | Pure; subtracts blackouts/lunch/busy; deterministic |
| T-103 | `lib/scheduler/policies.ts`: WEIGHTS, urgency/Critical-Ratio ordering, chunking strategy | Eng | T-102 | ✅ | Weights in one place; chunk rules documented |
| T-104 | `lib/scheduler/engine.ts`: placement loop with `isFeasible()` gate + scoring + reason emission | Eng | T-103 | ✅ | INV-1…5, INV-7 hold |
| T-105 | `lib/scheduler/conflicts.ts`: overlap repair, daily caps, escalation ladder, buffer/lunch insertion | Eng | T-104 | ✅ | Bounded repair (≤3 passes); no silent loss |
| T-106 | `lib/scheduler/score.ts`: report evaluation, fragmentation/balance metrics, ranked trade-offs | Eng | T-105 | ✅ | INV-6 reconciliation; `fits` classification |
| T-107 | Scheduler invariant + property tests | Eng | T-106 | ✅ | `tests/scheduler.test.ts` — INV-1…8 asserted on demo, overloaded and seeded random weeks |

## Phase 2 — Agent

| ID | Task | Owner | Depends | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T-201 | `lib/agent/prompts.ts`: system prompt encoding role, invariants, tool contract, no-timestamp law | Eng | T-104 | ✅ | Prompt references tools + L1 |
| T-202 | `lib/agent/tools.ts`: `parse_tasks`, `build_schedule`, `critique_plan`, `revise_plan`, `explain_block` | Eng | T-201 | ✅ | zod in/out; engine-only time |
| T-203 | `lib/agent/providers.ts`: provider resolution (openai/anthropic/google/local), never throws | Eng | T-202 | ✅ | Missing key → `local` |
| T-204 | `lib/agent/local-reasoner.ts`: deterministic demo agent (lexicons, duration heuristics, scripted tools) | Eng | T-203 | ✅ | Same contract as live provider |
| T-205 | `lib/agent/planner-agent.ts`: tool loop (≤6 steps), structured output, one repair, fallback | Eng | T-204 | ✅ | Malformed JSON → repair → fallback |

## Phase 3 — Integrations & API

| ID | Task | Owner | Depends | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T-301 | `lib/google/oauth.ts` + `scopes.ts`: OAuth2 client, minimal scopes, token refresh | Eng | T-002 | ✅ | Tokens server-side only |
| T-302 | `lib/google/calendar.ts`: freebusy, upsert by `calendraBlockId`, `dryRun`, per-block failures | Eng | T-301 | ✅ | No blind insert; partial failure safe |
| T-303 | `POST /api/plan`: validate → agent or local → proposal | Eng | T-205 | ✅ | zod at boundary; envelope shape |
| T-304 | `POST /api/chat`: refinement + diff summary | Eng | T-303 | ✅ | Returns changed blocks |
| T-305 | `GET /api/calendar/{auth,callback}` + `POST /api/calendar/sync` | Eng | T-302 | ✅ | Drift → 409; approval required |
| T-306 | `GET /api/health`: capability probe (provider + calendar) | Eng | T-203 | ✅ | Never leaks secrets |

## Phase 4 — Design system & UI

| ID | Task | Owner | Depends | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T-401 | `paper/` primitives: PaperSheet, PaperCard, PaperButton, PaperChip, PaperInput, PaperTabs, LoadBar | Design+Eng | T-008 | ✅ | Tokens only; keyboard + focus |
| T-402 | `paper/DioramaScene.tsx` + `DioramaLayer` + `CutEdge` + `Grain`: layered SVG scenery | Design | T-008 | ✅ | Depth via per-layer shadow; no figures |
| T-403 | `planner/TaskInbox.tsx`: structured + free-text intake, parsed-task confirmation | Eng | T-401 | ✅ | Nothing committed without confirmation |
| T-404 | `planner/PreferencePanel.tsx`: hours, peak, lunch, buffers, caps, blackouts, weekend | Eng | T-401 | ✅ | All FR-2 fields |
| T-405 | `planner/WeekGrid.tsx` + `ScheduleBlock.tsx`: layered week, drag/resize, pins, keyboard move | Eng | T-104 | ✅ | Recompute-on-drop; pins survive regen |
| T-406 | `planner/AgentChat.tsx`: conversational refine + visible tool trace | Eng | T-304 | ✅ | Streamed/stepwise trace |
| T-407 | `planner/PlanReportPanel.tsx` + `TradeoffPanel.tsx`: fits/tight/overbooked, risks, ranked options | Eng | T-106 | ✅ | Always quantifies capacity |
| T-408 | `planner/InsightsRail.tsx`: per-day load bars, category mix, anti-pattern flags | Design+Eng | T-106 | ✅ | Flags match report warnings |
| T-409 | `planner/CalendarPanel.tsx`: connect state, approve-and-sync, dry run, rollback | Eng | T-305 | ✅ | Explicit approval only |
| T-410 | `app/planner/page.tsx`: 3-column workspace shell, responsive | Eng | T-403…409 | ✅ | Works ≥1280 / 900 / mobile |
| T-411 | `app/page.tsx`: marketing surface with diorama hero | Design | T-402 | ✅ | Style mandate visible |
| T-412 | `layout.tsx`: fonts w/ fallbacks, grain overlay, metadata | Eng | T-402 | ✅ | No build-time font fetch |

## Phase 5 — Quality gates

| ID | Task | Owner | Depends | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| T-501 | `npm run lint` clean | Eng | T-410 | ✅ | 0 errors |
| T-502 | `npm run build` clean (type-check included) | Eng | T-501 | ✅ | Production build succeeds |
| T-503 | Manual end-to-end pass in dev server | Eng | T-502 | ✅ | Text → tasks → plan → report → sync(payload) |
| T-504 | A11y sweep: keyboard grid, focus rings, aria labels, reduced motion | Design+Eng | T-503 | 🟡 | Keyboard parity + focus rings implemented; needs a real browser pass (see T-507) |
| T-505 | Responsive sweep 1440 / 1280 / 1024 / 768 / 390 | Design | T-503 | 🟡 | Layouts implemented + verified in markup/CSS; visual confirmation still browser-bound |
| T-506 | README with setup, env matrix, demo walkthrough | Eng | T-502 | ✅ | Copy-paste runnable; `.env.example` included |
| T-507 | Real-browser verification (Playwright: paint, responsive, OAuth redirect) | Eng | T-506 | ⬜ | No headless browser in the build sandbox. Behaviour is covered by T-509; pixels are not. |
| T-508 | Agent + adapter contract tests (`tests/agent.test.ts`) | Eng | T-205 | ✅ | 46 assertions over zod boundaries, lexicons, Google adapter |
| T-509 | jsdom UI harness + interaction tests (`tests/ui.test.ts`) | Eng | T-410 | ✅ | 21 assertions driving real pointer/keyboard events through store → route → engine. Found and fixed three drag bugs (§Bugs found) |
| T-510 | Interaction performance: no blended layers on repeated chrome; geometry measured once per gesture; memoised day columns | Eng | T-509 | ✅ | `tests/perf.test.ts` measures it: 72 → 0 forced layouts per 24 moves, 345 ms → 181 ms. See MEMORY §5c / D-023 |

## Phase 6 — Post-MVP backlog (not in this build)

| ID | Task | Priority | Notes |
| --- | --- | --- | --- |
| T-601 | Recurring-task engine (daily/weekly RRULE) | P1 | "review PRs daily" currently expands to explicit tasks |
| T-602 | Dependency enforcement (`dependsOn`) | P1 | Field exists; ordering not yet enforced |
| T-603 | Multi-week horizon + rolling replan | P1 | Engine is week-scoped by design |
| T-604 | ICS export | P2 | ✅ shipped post-MVP — `POST /api/export/ics`, `src/lib/ics.ts`, `tests/ics.test.ts` (12 assertions); see the note below |
| T-605 | Persistence (DB) + accounts | P1 | MVP is stateless + Google |
| T-606 | Per-user weight tuning from feedback | P2 | Collect signals now, tune in v2 |
| T-607 | "What changed since yesterday" diff view | P2 | Reuses block diff from `/api/chat` |
| T-608 | Focus-time defence (decline invites) | P3 | Needs write scope on invites — PRD amendment |
| T-609 | Playwright E2E + CI workflow | P1 | Documented in ARCHITECTURE §11 |

---

## Verification ledger (what was actually executed)

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Build | `NODE_OPTIONS=--max-old-space-size=3072 npm run build` | succeeds (all routes) |
| Tests | `npm test` | 103 / 103 pass (30 engine, 38 agent, 12 export, 21 UI-in-jsdom, 2 drag-performance) |
| Drag cost | `npm run test:perf` | 24 pointer moves: 0 forced layouts (was 72), 181 ms (was 345 ms) |
| Engine smoke | `npm run smoke` | demo FITS 78% · overloaded OVERBOOKED · invariants 0/0/0 |
| Agent walkthrough | `npm run agent:check` | 9 conversational turns carrying tasks, preferences and pins — ends `PASS: 9 turns, 8 tasks, 1 pin carried` |
| API | `POST /api/plan`, `POST /api/chat`, `POST /api/calendar/sync` | 200 with verified payloads |
| Routes | `/`, `/planner`, `/api/health` | 200 |
| Art | `npm run scene` | four scenes rasterised and inspected |
| Export | `POST /api/export/ics` | 200, `text/calendar`, 12.6 kB, 20 VEVENTs, CRLF and 75-octet folding checked by an independent parser |

**Not verified, and why:** there is no headless browser in the build sandbox. Components are now
*executed* in jsdom (T-509), which covers behaviour but not paint — overlap, overflow, focus rings,
responsive reflow and the OAuth redirect are still unobserved. Tracked as T-507.

---

## Bugs found by executing the UI (T-509)

Three defects in the flagship interaction, every one of them invisible to review and to the build:

| Bug | Symptom for a user | Cause |
| --- | --- | --- |
| A drop was discarded | Drag a block, it follows the cursor, release — it snaps back and nothing happens. | `endDrag` read `ghost` from the closure in which `pointerup` was registered, where it is still `null`. Now mirrored in a ref. |
| Grab near the top threw it up | Grab a tile by its top edge and drop it: it lands at the very start of the day. | `grabOffsetMin` included `day.windowStart` — an absolute minute subtracted from an absolute minute. Now a within-block offset. |
| Resizing slid the block | Pull the bottom grip down and the whole block moves down with it. | The pointer position drove `startMin` in both gestures. Resize now holds `originStart`. |

Two further inconsistencies were found the same way: `Dry run` was disabled unless Google was
connected (contradicting D-015), and the calendar panel's unconfigured state was never asserted.

**A fourth defect was found by the walkthrough (N-9), not by the UI run:** the client threw a drag
away whenever the user then asked the agent anything. `buildWeek` and `sendMessage` reset `pins: []`,
and the toolkit replaced its pin set on every `revise_plan` — so "what fits in the week?" silently
undid a move the user had made. Fixed by making the plan the authority (D-021): the report names the
pins it could not keep (`droppedPins`), the proposal publishes only the pins that are in force, and
every path in the store adopts `proposal.pins`.

---

## Post-MVP: interaction performance (T-510)

Reported from a real browser as an Interaction-to-Next-Paint warning, with a chip element named as the
culprit. The chip was a symptom of two independent costs — and neither is visible in a screenshot or
catchable by a functional test, which is why they are now measured rather than eyeballed:

1. **A blended layer cannot be composited independently.** `mix-blend-mode: multiply` sat on every
   chip and button (via `paper-fibre`), every sheet (via `paper-tooth`) and on a *fixed, full-viewport*
   grain overlay. Any repaint beneath one of those forces the browser to re-blend it, so a drag meant a
   full-screen composite per frame. The textures keep their noise and opacity; the blend is gone.
2. **A forced reflow per pointer event.** The move handler read `clientWidth` and
   `getBoundingClientRect()` on every `pointermove`, and the browser answers a layout read by first
   recomputing style and layout — three synchronous reflows per event, ~120/second from a 120 Hz mouse.
   Geometry is now captured once in `beginDrag` and reused for the gesture.

On top of that, the render: `visible.filter(...)` handed each column a new array every render, so all
seven columns re-rendered on every move regardless of which one the ghost was in. The blocks are
partitioned once, the ghost is passed only to the column it targets, and `DayColumn` is memoised.

Both properties are asserted in `tests/perf.test.ts` — the first as "layout reads must not scale with
the number of events", the second as "a burst of moves must not produce a render each".

## Post-MVP: ICS export (T-604)

The one backlog item pulled forward, because the product's argument is *honesty* and the only way to
prove a planner is honest is to let a stranger take the week with them:

- `POST /api/export/ics` takes the plan the client is displaying and returns `text/calendar`. No
  Google, no OAuth, no cookie, no database — the same "works on a fresh clone" property as the dry
  run (D-015), which makes it the export path that can never be broken by configuration.
- The file is written to be *importable*, not merely present: CRLF endings, 75-octet folding on
  octet (not character) boundaries, TEXT escaping, floating local `DTSTART`/`DTEND` with
  `X-WR-TIMEZONE`, stable `UID:<blockId>@calendra` so re-importing updates rather than duplicates,
  `X-CALENDRA-*` properties for round-tripping, and a `VJOURNAL` carrying the verdict so the file
  explains itself a month later.
- Default scope is `kind === 'task'` only — a plan, not a diary; ritual rows (lunch, focus breaks)
  and imported meetings are opt-in via `includeMeetings`.
- Ten of the twelve assertions in `tests/ics.test.ts` are structural (folding, escaping, CRLF,
  determinism, uniqueness), because a malformed `.ics` imports as *nothing at all* and gives the
  user no way to tell why.

---

## Definition of done (any task)

1. Implements the FR/INV it references, nothing more.
2. zod-validated at every boundary it touches.
3. No scheduling logic outside `lib/scheduler`.
4. Visual output uses design tokens only (`RULES.md` L8).
5. Explained to the user where relevant (reason chips / report warnings).
6. `npm run lint` and `npm run build` pass.
7. `TASK.md` and, for design/architecture decisions, `MEMORY.md` updated.
