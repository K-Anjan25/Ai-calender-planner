# Paperweek — Task Ledger

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
| T-302 | `lib/google/calendar.ts`: freebusy, upsert by `paperweekBlockId`, `dryRun`, per-block failures | Eng | T-301 | ✅ | No blind insert; partial failure safe |
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
| T-507 | Browser-level verification (Playwright: plan → drag → approve) | Eng | T-506 | ⬜ | No headless browser in the build sandbox — UI verified statically only |
| T-508 | Agent + adapter contract tests (`tests/agent.test.ts`) | Eng | T-205 | ✅ | 46 assertions over zod boundaries, lexicons, Google adapter |

## Phase 6 — Post-MVP backlog (not in this build)

| ID | Task | Priority | Notes |
| --- | --- | --- | --- |
| T-601 | Recurring-task engine (daily/weekly RRULE) | P1 | "review PRs daily" currently expands to explicit tasks |
| T-602 | Dependency enforcement (`dependsOn`) | P1 | Field exists; ordering not yet enforced |
| T-603 | Multi-week horizon + rolling replan | P1 | Engine is week-scoped by design |
| T-604 | ICS import/export | P2 | Google-first in MVP |
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
| Tests | `npm test` | 46 / 46 pass |
| Engine smoke | `npm run smoke` | demo FITS 78% · overloaded OVERBOOKED · invariants 0/0/0 |
| Agent walkthrough | `npm run agent:check` | 5 conversational turns, all as designed |
| API | `POST /api/plan`, `POST /api/chat`, `POST /api/calendar/sync` | 200 with verified payloads |
| Routes | `/`, `/planner`, `/api/health` | 200 |
| Art | `npm run scene` | four scenes rasterised and inspected |

**Not verified, and why:** there is no headless browser in the build sandbox, so nothing above is a
DOM-level observation. Drag-and-drop, cookie OAuth, and responsive behaviour were reasoned about
from the source and the rendered HTML, not clicked. Tracked as T-507.

---

## Definition of done (any task)

1. Implements the FR/INV it references, nothing more.
2. zod-validated at every boundary it touches.
3. No scheduling logic outside `lib/scheduler`.
4. Visual output uses design tokens only (`RULES.md` L8).
5. Explained to the user where relevant (reason chips / report warnings).
6. `npm run lint` and `npm run build` pass.
7. `TASK.md` and, for design/architecture decisions, `MEMORY.md` updated.
