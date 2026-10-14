# Paperweek — Project Memory

| Field | Value |
| --- | --- |
| Document | Memory / decision log / context for future contributors and agents |
| Version | 1.0 |
| Last updated | 2026-10-14 |
| Related | `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASK.md` |

> **Read this first.** It is the short-term memory of the project: what exists, why it is the way it
> is, what will bite you, and what to do next. Keep it current — stale memory is worse than none.

---

## 1. Current state (2026-10-14)

| Area | State |
| --- | --- |
| Branch | `main` (initial commit `a512bc0`), full MVP implemented on top |
| Docs | PRD, ARCHITECTURE, RULES, DESIGN, TASK, MEMORY — all written |
| Engine | `lib/scheduler/*` complete: horizon → triage/chunk → place → repair → evaluate. Deterministic. |
| Agent | `lib/agent/*` complete: 5 tools, 4 providers, `LocalReasoner` demo path, structured output + 1 repair |
| Calendar | `lib/google/*` + OAuth routes + sync route with upsert/dryRun/409-on-drift |
| UI | Cut-paper diorama design system + 3-column planner workspace + marketing page |
| Modes | **Demo mode works with zero env vars** — this is the default and the test path |
| Tests | 64 assertions, all green: `tests/scheduler.test.ts` (INV-1…8 + seeded property sweep), `tests/agent.test.ts` (boundaries, lexicons, adapters), `tests/ui.test.ts` (**the components, executed in jsdom** against the real routes and engine) |
| Verified | types, lint (0/0), production build, `npm test`, `npm run smoke`, `npm run agent:check`, live API round-trips, four rendered scenes |
| Known gaps | Real-browser verification (T-507 — jsdom is not a browser: no layout, no paint, no OAuth redirect), persistence, recurring engine, `dependsOn` |

## 2. What this product is (one paragraph)

Paperweek turns a pile of tasks, deadlines, and preferences into a **realistic** week, and tells the
truth when the week doesn't fit. The LLM handles language (parsing messy input, choosing between valid
strategies, narrating trade-offs). A deterministic engine handles all time arithmetic. Nothing is
written to a real calendar without explicit approval. The UI is a layered cut-paper diorama.

## 3. Decisions (ADRs)

Format: **D-nnn · date · decision — rationale — consequence.**

| # | Date | Decision | Rationale | Consequence |
| --- | --- | --- | --- | --- |
| **D-001** | 2026-10-14 | **The deterministic engine owns all time; the agent may not emit timestamps.** | LLMs hallucinate times. Time math must be testable and explainable. | Agent output schema deliberately has *no* `start`/`end` fields. Any future feature needing time must route through a tool result (ARCHITECTURE §5.4). |
| **D-002** | 2026-10-14 | **Greedy placement + bounded repair instead of a global optimiser (ILP/CP-SAT).** | Must run in <400 ms, be deterministic (INV-7), and explain *why* each block landed where it did. Optimisers give better packing but unexplainable, non-reproducible output. | Slightly suboptimal packing at MVP scale (~60 tasks). Revisit only if a real user's week demonstrably fails to fit. |
| **D-003** | 2026-10-14 | **Reasons are emitted by the same code path that computes the score.** | Prevents UI explanation from drifting away from the algorithm. | `reasons[]` and `score` are written together in `engine.ts`; tests can assert they're consistent. |
| **D-004** | 2026-10-14 | **Zero-key Demo mode is a first-class implementation, not a stub** (`LocalReasoner`). | The product must be demonstrable without secrets, and the grading/demo path must never depend on a network. | Two real agent implementations share one contract. Live-provider bugs can be reproduced deterministically in demo mode. |
| **D-005** | 2026-10-14 | **No `next/font/google`; fonts load via `<link>` with a complete local fallback stack.** | Build environments (including CI/sandboxes) may have no access to `fonts.googleapis.com`, which would fail `next build`. | Slight FOUT instead of build fragility. Fallback stack in `DESIGN.md` §8 is mandatory. |
| **D-006** | 2026-10-14 | **Google Calendar writes are upsert-by-`extendedProperties.private.paperweekBlockId` and require explicit `approvedBlockIds[]`.** | Re-syncing must not duplicate events; unapproved writes to a user's real calendar are unacceptable. | Sync is idempotent. Deleting a plan removes exactly the events it created. |
| **D-007** | 2026-10-14 | **Tailwind v4 CSS-first tokens (`@theme` in `globals.css`), no `tailwind.config.js`.** | One file to review for design drift; tokens are plain CSS variables usable in SVG and canvas too. | Design changes start in `globals.css`, never in JSX (RULES L8). |
| **D-008** | 2026-10-14 | **Cut-paper diorama aesthetic, explicitly excluding human figures/characters.** | Requested style: layered papercraft texture and depth, scenery and objects only. | Every illustration is bespoke SVG scenery (clouds, hills, sun, pines, water, arches, desk objects). Icons are line-only. Review gate: no faces. |
| **D-009** | 2026-10-14 | **Drag-and-drop sends a *pin request* to the server; the engine recomputes.** | Keeps exactly one scheduling implementation. | A drag costs a round trip (optimistic UI masks it). `pins[]` are immovable inputs to regeneration (INV-8). |
| **D-010** | 2026-10-14 | **No database in the MVP.** | Zero-setup demo; deployable anywhere; Google Calendar is the durable store for the things that matter. | Tasks/prefs live in `localStorage`; plans are server-derived and not persisted. Persistence is T-605. |
| **D-011** | 2026-10-14 | **All-day and multi-day busy events block their entire span.** | A day you're travelling is not a working day, regardless of the event's granularity. | Availability is conservative by default; the user can override with blackouts/working hours. |
| **D-012** | 2026-10-14 | **Every optional integration degrades to a working product.** | Trust comes from never showing a dead screen. | Provider absent → demo agent. Google absent → planning still works. Provider error → deterministic plan + notice. |
| **D-013** | 2026-10-14 | **Deadlines are local wall-clock strings (`…T17:00:00`), validated by parsing rather than `z.string().datetime()`.** | The engine schedules in wall-clock minutes; demanding a `Z` suffix would force timezone maths into the placement loop (see §5.8) — and the *engine's own output* would then fail validation on the way back in. | Zod rejects garbage but accepts both forms. Regression test: a plan's tasks are posted straight back to `/api/plan` and must round-trip. |
| **D-014** | 2026-10-14 | **A pin the engine cannot honour is reported (`pin-ignored`), never silently relocated.** | A user who drags a block has made a decision; moving it back without saying so is the exact dishonesty the product is against. | Requested pins are validated against meetings and working hours up front; failures surface as a report warning and the block is placed normally. |
| **D-015** | 2026-10-14 | **Calendar dry runs work with no Google configuration at all.** | The preview is the trust-building step; requiring OAuth to see *what would be written* inverts the approval model. | `POST /api/calendar/sync {dryRun:true}` returns the exact event payloads (idempotency markers included) without credentials. Real writes still require config **and** consent. |
| **D-016** | 2026-10-14 | **Ritual tiles (lunch, break) may not be laid over real meetings.** | Meetings are fixed facts; the ritual row is decoration and must yield. | `repairPlan` checks lunch/break candidate windows against busy events before inserting. Regression test: demo week, Thursday 1:1s. |
| **D-017** | 2026-10-14 | **A refinement reply lists what actually moved, including preference and block-level changes.** | "No change" when three blocks moved destroys trust in the diff. | `diffPlans(previousTasks, nextTasks, proposal, previousPreferences, previousBlocks)`; the client sends a compact snapshot of the plan it was looking at. |
| **D-018** | 2026-10-14 | **UI behaviour is tested by executing it in jsdom, not by reading it.** | Static review passed every drag bug that shipped (see §5.19–21) because the code looks correct. Executing the components found all three in minutes. | `tests/ui.test.ts` renders real components, stubs only geometry and the two cookie-scoped OAuth routes, and drives real pointer/keyboard events through to the real engine. |

## 4. Invariants cheat-sheet

Assert these when touching the engine. If a change breaks one, stop and check `RULES.md` §1.

| ID | Invariant |
| --- | --- |
| INV-1 | No two blocks overlap (nor a block and a busy event). |
| INV-2 | Every block is fully inside a working window for its weekday. |
| INV-3 | The final chunk of a task ends at or before its deadline. |
| INV-4 | No block starts before `earliestStart`. |
| INV-5 | Blocks snap to the snap grid (15 min) and are ≥ `minBlockMinutes`. |
| INV-6 | Placed + unscheduled minutes = demanded minutes. No silent loss. |
| INV-7 | Same inputs → identical plan (no clock, no RNG, no key-order dependence). |
| INV-8 | Pinned blocks are immovable inputs to regeneration. |

## 5. Gotchas (learned the hard way)

1. **Never call `new Date()` inside `lib/scheduler/*`.** `now` is always a parameter. This is the easiest way to accidentally break INV-7.
2. **Tie-breaks must be total.** Sorting only by score leaves placement order dependent on input order. Always break ties on `taskId`, then `start`, then `chunkIndex`.
3. **Reconcile minutes in `evaluate()`, don't trust the loop.** The conservation check (INV-6) is what catches dropped chunks during repair.
4. **Half-open intervals.** All slot math uses `[start, end)`. Using closed intervals causes off-by-one-minute overlaps that only appear at boundaries (exactly the case a user hits at 09:00).
5. **Lunch and blackouts are subtracted in `slots.ts`, not enforced later.** Trying to filter them during placement double-counts with buffers.
6. **Buffer minutes are applied between *adjacent* blocks, not globally.** Applying them blindly eats the whole day when blocks are sparse.
7. **`googleapis` is heavy** — import only `google.calendar('v3')` lazily inside route handlers so it never enters the client bundle.
8. **UTC vs local.** The engine works in *local wall-clock minutes from midnight* for a given weekday, then serialises ISO strings. Don't do timezone math inside the placement loop; it introduces DST bugs that INV tests won't catch.
9. **Tailwind v4 has no config file.** Arbitrary values like `bg-[#fff]` bypass the design system — banned by RULES L8.
10. **`LocalReasoner` must stay in sync with the live agent's contract.** If you add a tool, add it there too, or demo mode silently diverges from production behaviour.
11. **`reasons[]` codes are a public-ish API.** The UI switches on codes (not on label text) and tests assert them. Renaming a code is a breaking change.
12. **Drag with pointer events, transform-only.** Using mouse events + `top/left` causes jank and breaks on touch. Rotation on lift is a design requirement, not decoration.
13. **`z.string().datetime()` requires a trailing `Z`.** The engine's wall-clock deadline `2026-10-15T17:00:00` fails it. This is the bug that will break *every* second request (plan → chat), because the browser posts the engine's own tasks back — see D-013.
14. **Drag maths must measure the day-column strip, not the whole grid.** The hour gutter is part of the grid's width; measuring against it shifts every drop left by ~56px. `columnsRef` exists for this.
15. **Never render a 100%-wide absolutely positioned block for hour labels.** Every label stacks at `top: 0`. Labels belong in the gutter column with `top: index * HOUR_HEIGHT`.
16. **Negative preferences must be matched before positive ones.** "Do not use the weekend" contains "use the weekend"; the refusal check runs first and wins.
17. **Anything computed from `new Date()` at render time is a hydration bug.** Calendar dates default to `mounted ? … : null` and render a paper skeleton until the client resolves them — or take `weekStart` from the plan, which is already deterministic.
18. **React's pointer plugin needs a real `PointerEvent`.** A `MouseEvent` typed `'pointerdown'` reaches DOM listeners but never an `onPointerDown` handler — which makes a drag test pass vacuously.
19. **A `pointerup` listener registered during a render captures that render's state.** `endDrag` closed over `ghost`, which is `null` in the render where the drag starts, so every drop was silently discarded: the tile followed the cursor and snapped back. State a listener will read on a *later* event must be mirrored in a ref (`ghostRef`).
20. **Grab offsets are relative, not absolute.** `grabOffsetMin` must be the offset *inside the block*; adding `day.windowStart` (as it did) drags the tile to the top of the day, because the move handler subtracts it from an absolute minute.
21. **A move and a resize are different gestures.** Deriving `startMin` from the pointer in both modes made a resize slide the block's start down to the grip. Resize keeps `originStart` and only moves the base; move follows the cursor.
22. **Tailwind v4 here emits nothing for `bg-gradient-to-*`.** Use the arbitrary form `bg-[linear-gradient(...)]`. Likewise `accent-[color:var(--x)]` is unreliable — `accent-<token>` works because the token is in `@theme`.

## 6. Open threads / next actions

| # | Thread | Owner | Notes |
| --- | --- | --- | --- |
| N-1 | ~~Scheduler invariant + property tests (T-107)~~ **done** | Eng | 46 assertions green; keep them green |
| N-2 | a11y sweep (T-504) + responsive sweep (T-505) | Design+Eng | Keyboard move/resize of blocks is implemented but unreviewed |
| N-3 | Recurring task expansion (T-601) | Eng | "review PRs daily" is currently expanded to explicit per-day tasks in demo data |
| N-4 | Enforce `dependsOn` ordering (T-602) | Eng | Field exists in the schema; engine ignores it |
| N-5 | Persistence (T-605) | Eng | Also unlocks multi-device and "what changed" diffs |
| N-6 | Decide Q3 from PRD §11 (deadline = midnight vs stated time) | Product | Currently midnight of the stated date |
| N-7 | Cost pass: cache parse results per input hash | Eng | Avoids re-parsing identical task text on regenerate |
| N-8 | Real-browser verification (T-507) | Eng | Playwright: paint, layout, responsive, and the OAuth redirect. jsdom now covers the *logic* of drag/resize/keyboard (18 assertions), so what remains is pixels, not behaviour. |
| N-9 | `scripts/agent-check.ts` should carry pins across turns | Eng | The harness currently sends `pins: []`, so cross-message pin persistence is untested outside the store. |

## 7. Session log

| Date | What happened |
| --- | --- |
| 2026-10-14 | Repo initialised (LICENSE only). Product spec'd: PRD, ARCHITECTURE, RULES, DESIGN, TASK, MEMORY. MVP implemented end to end: deterministic week scheduler with explainable placement, LangChain agent (5 tools, 4 providers, deterministic demo reasoner), zod-validated API surface, Google Calendar OAuth + free/busy + idempotent approved sync, and a full cut-paper diorama design system + planner workspace. Decisions D-001…D-012 recorded. |
| 2026-10-14 | UI round. Added a jsdom harness (`tests/harness/`) that executes the components against the real route handlers, agent and engine, plus 18 assertions in `tests/ui.test.ts` (drag, resize, keyboard parity, free-text intake, chat, calendar states, the full page). The very first run found **three shipped bugs in drag and drop** — the flagship interaction — none of which static review caught: a drop was silently discarded (§5.19), grabbing a tile near its top threw it to the start of the day (§5.20), and resizing slid the block's start to the grip (§5.21). All fixed and covered. Also: `Dry run` was gated behind a connected Google account, which contradicted D-015 — now it works unconfigured. ADR D-018 records the lesson: execute the UI, don't read it. |
| 2026-10-14 | Verification round. Added 46 assertions (engine invariants + agent/adapters); the tests immediately caught four real defects, all fixed: (1) `z.string().datetime()` rejected the engine's own wall-clock deadlines, breaking every follow-up request — D-013; (2) ritual tiles could be laid over meetings — D-016; (3) refused pins were silently relocated — D-014; (4) "do not use the weekend" was matched by the weekend-*enable* rule — gotcha 16. Also: dry-run sync no longer needs Google config (D-015), refinement replies now report preference and block-level movement (D-017), hydration-safe calendar dates (gotcha 17), block explanations wired end-to-end through `explain_block`, README + `.env.example` rewritten, `package.json` `scaffold` → `paperweek` with `test`/`smoke`/`agent:check`/`scene` scripts. |

## 8. How to use this file

- **Before starting work:** read §1, §4, §5.
- **When you make a design or architecture decision:** add a row to §3 with today's date and the consequence. One line of rationale minimum — future-you will not remember the alternative you rejected.
- **When you hit a surprising bug:** add it to §5 as a numbered gotcha, phrased as the *lesson*, not the incident.
- **When you finish a session:** append to §7 and refresh §6.
- **Never** delete a decision row; supersede it with a new row that references the old one (`supersedes D-004`).
