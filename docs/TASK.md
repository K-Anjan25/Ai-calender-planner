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

## Round 3: production scope (T-701 … T-709, 2026-10-15)

Requested: "head to complete production" — a real front door, accounts, pricing, and the copy cleaned of
material references. What that turned into:

| # | Task | Where | Status |
| --- | --- | --- | --- |
| T-701 | Remove the "paper, not plastic" section and every paper-material reference from user-facing copy; keep the style, drop the vocabulary | `src/app/page.tsx` ("Trustworthy by construction"; the layer cards lost their numbers; the hero caption and section heading lost craft nouns) | ✅ done |
| T-702 | A logo that says what the product is: a calendar glyph, not a stack of layers | `components/paper/CalendraMark.tsx` — bound leaf, header band, month grid; `currentColor`, so it inherits tone | ✅ done |
| T-703 | Shared site chrome: nav for the product sections, **Pricing**, **Docs**, and the account block | `components/site/SiteHeader.tsx` + `SiteFooter.tsx`; mobile disclosure; the account slot reserves its height so session resolution causes no shift | ✅ done |
| T-704 | Landing page rebuilt as a real front page: hero, live week excerpt, how it works, features, CTA | `src/app/page.tsx` | ✅ done |
| T-705 | Authentication: sign up / sign in with Google, identity scopes only, plus a labelled demo session | `lib/auth/*`, `api/auth/*`, `/signin`, `/signup` (D-024, D-026, D-027) | ✅ done |
| T-706 | An optional private mode: `REQUIRE_AUTH=true` gates `/planner` on the **server**, with a filtered `next=` | `app/planner/page.tsx`, `safeNext()` | ✅ done |
| T-707 | Pricing page with three tiers, an FAQ, and an honest state when no payment provider is configured | `/pricing`, `lib/billing.ts` (D-025) | ✅ done |
| T-708 | Text overflow fixed and, as far as this environment allows, asserted | `globals.css` guard + `tests/responsive.test.ts`; see the caveat below | ✅ done |
| T-709 | Docs page carrying the six documents, the live environment matrix, the API table and the deploy checklist | `/docs`, `.env.example`, README | ✅ done |

### What was deliberately not done

A payment **integration**. The pricing page describes three tiers, and when no `STRIPE_*` variables are
present it says billing is not connected and takes a waitlist — rather than showing a *Upgrade* button
that cannot charge. That is D-025, and it is the same rule as the rest of the product: never claim a
capability the deployment does not have.

### Caveat on T-708, stated rather than buried

There is no browser and no layout engine in this environment. `tests/responsive.test.ts` asserts the two
*mechanisms* behind the reported overflow — that the global `overflow-wrap`/`max-width` guard is still
installed, and that no element forcing a width above 320px escapes its scroll container — and asserts
that overflow was not merely hidden at the root. It cannot prove a page *looks* right at 375px. Real
viewport verification remains T-507.

---

## Round 4: reported UI defects (T-710 … T-715, 2026-10-15)

Reported against the demo session: the rules panel's working hours overflow, and "the worst UI" in the
week grid. Each item below was reproduced, root-caused, fixed, and covered.

| # | Defect | Root cause | Fix |
| --- | --- | --- | --- |
| T-710 | Working-hours rows overflowed the sheet | `w-full` in `PaperInput`'s base classes made every caller's `w-[86px]` dead code — same specificity, and Tailwind emits `.w-full` later (D-028) | `.paper-field` in the components layer; rows rewritten as `flex-1 min-w-[74px]`; `tests/layout.test.ts` |
| T-711 | Blackout row collapsed to a sliver | One wrapping row: a `basis: 0` label beside four fixed controls that set an unshrinkable floor | Split into a name row and a when row |
| T-712 | Week grid unreadable on a narrow window | Seven `flex-1` day columns at any width | Legible minimum inside an `overflow-x-auto` scroller, sticky hour gutter, `touch-action: none` on tiles (D-029) |
| T-713 | Sliders felt like the app had hung | `localStorage.setItem` on every input event (synchronous disk I/O, ~60×/s) and `days` rebuilt on every preference change, re-rendering all seven columns | Coalesced writes (leading + one trailing per 250 ms) and `days` built from the two values that decide it |
| T-714 | Two tiles starting at the same minute covered each other | `layoutColumns` used "tiles that started earlier" as the column index | Greedy interval colouring, four assertions |
| T-715 | Small clip-and-spill defects | First/last hour labels centred on the grid edge; 15-minute band with a 13px label; tiles losing their last line to `overflow: hidden`; a `+n` chip counter computed against the wrong base; colliding band keys | Pinned edge labels, `overflow-hidden` bands, height-aware tile density, corrected counter, indexed keys |

`npm test` 132/132 · lint 0 · typecheck clean.

---

## Round 5: reported runtime defects (T-716, T-717, 2026-10-15)

| # | Report | Root cause | Fix |
| --- | --- | --- | --- |
| T-716 | `Encountered two children with the same key, birds-3-37` | The bird shapes built their React key from `path.length`, and both flight paths happen to be exactly 37 characters (D-031) | `birds()` takes an explicit name; four assertions in `tests/diorama.test.ts` — uniqueness per variant, stability across builds, and a render of all four scenes that fails on any duplicate-key warning. Both levels were verified to fail on the old id. |
| T-717 | `Access blocked: device_id and device_name are required for private IP: http://192.168.1.2:3000/...` | Next prints a LAN address in its dev banner, so it is the natural thing to open on a phone; Google cannot use a private IP as a redirect target and its error page explains nothing (D-032) | `googleOriginProblem()` catches private ranges, bare IPs and reserved TLDs; the app explains in place and names the host, instead of bouncing the user to Google's error. Loopback and deployed hosts are asserted *not* to be flagged. |

147/147 tests · lint 0 · typecheck clean · build clean.

---

## Definition of done (any task)

1. Implements the FR/INV it references, nothing more.
2. zod-validated at every boundary it touches.
3. No scheduling logic outside `lib/scheduler`.
4. Visual output uses design tokens only (`RULES.md` L8).
5. Explained to the user where relevant (reason chips / report warnings).
6. `npm run lint` and `npm run build` pass.
7. `TASK.md` and, for design/architecture decisions, `MEMORY.md` updated.

## 2026-10-16 — branding and honest launch readiness

- Done: remove auth panel's duplicate wordmark; remove the requested landing caption.
- Done: calendar-mark SVG and ICO favicon; regression tests.
- Done: remove misleading Stripe activation instructions; paid readiness remains false until an
  actual Razorpay integration exists; retain free planner access.
- Done: correct cross-device storage claims; add `docs/LAUNCH-READINESS.md` with LLM setup,
  AI responsibilities, limitations, payment integration work and release gates.
- Pending: database-backed accounts/sync, Razorpay verified payments/entitlements, hosted live LLM
  proof, real Calendar write/rollback acceptance and public-launch operational/security review.

## 2026-10-16 — hide internal docs and refresh favicon

- Done: `/docs` 404; remove docs links and contents from public UI, retain repository files.
- Done: standalone `/legal` terms/privacy and updated auth/footer links.
- Done: explicit versioned favicon and Apple touch assets; built-page and HTTP verification.
- Verified: 157 tests, lint, typecheck and production build.

## Immersive single-file Calendra site

- Built `public/calendra.html`: four hash-routed React views, self-contained production bundle,
  CSS Modules, Google Fonts fallback, Lucide UI icons and inline brand social icons.
- Canvas particles, layered calendar, parallax, reveal/counter motion, reduced-motion support,
  native-dialog hamburger navigation, pricing/FAQs, back-to-top/sticky CTA and fat footer/map.
- Contact/newsletter validation with explicit submission failure until owner endpoints are configured.
- Existing planner untouched. Deployment/rebuild and operational caveats in `standalone/calendra/README.md`.
- Delivered-bundle smoke test covers navigation/menu, form validation/failure, pricing, accordion.

## 2026-10-23 — promote immersive design into the live Next.js app

- Done: native homepage, scoped CSS Modules, Next links and metadata; single scrolling marketing page.
- Done: Product/Pricing/FAQ/Contact anchors and dashboard/sign-in links; preserve auth and planner.
- Done: permanent `/calendra.html` compatibility redirect, `/pricing` → `/#plans`.
- Done: contact/newsletter server handlers, validated payloads and configurable HTTPS delivery.
- Verified: native-component behavior check, homepage SSR and route HTTP smoke, demo session → planner.
- Deployment: push branch to Vercel; promoting a Preview to Production still requires the owner's
  Vercel action, no PR/merge authorized.

## 2026-10-23 — original logo/palette and review follow-up

- Restored shared original logo in landing header, drawer and footer; retained matching favicon.
- Rebased landing colors on the original global cream/teal/olive/terracotta design tokens.
- Added FAQs to menu, verified accessible social labels, and focused contact textarea from paid-tier CTAs.
- Stacked tablet hero earlier; enlarged preview labels and contained calendar overflow in its own region.
- Verified native interaction checks, 165 tests, lint/typecheck and key text-pair numeric AA contrast.

## 2026-10-23 — exclusive five-color palette

- Applied the supplied five colors to landing, auth, dashboard, controls, illustrations and icons.
- Removed old brand hues and grayscale noise, recolored shadows; versioned favicon URLs to v3.
- Removed section-number labels, retained meaningful schedule/statistics values.
- Replaced multicolor Google icon with text-only sign-in rather than recoloring Google's trademark.
- Added source-wide palette and section-label guards; 167 tests and native landing behavior pass.

## 2026-10-23 — latest six-color reference

- Replaced previous five swatches across landing/auth/planner/illustrations and icon assets.
- Preserved original logo shape and removed section indices; favicon cache keys now v4.
- Updated source-wide palette guard to exactly the six requested base colors.
- Verified 167 tests, lint/typecheck; production build and native behavior smoke run before push.

## 2026-10-23 — current four-color reference

- Applied Slate/Amethyst/Mist/Keylime across landing, auth, planner, SVG scenes and icons.
- Preserved logo geometry and no-section-number requirement; refreshed favicon URLs to v5.
- Source-wide exact-palette guard, contrast tests, 167 regression tests and native UI smoke pass.

## 2026-10-24 — coastal palette and particle removal

- Applied Driftwood Beige, Harbor Blue, Seafoam Steel, Midnight Tide exclusively as live base colors.
- Removed hero canvas particle component, animation loop and unused CSS; retained calendar preview.
- Updated icon assets/cache keys v6 and palette/no-particle tests. 168 tests and native smoke pass.

## 2026-10-24 — new four-color reference; retire diorama presentation

- Applied 005F73 / 0A9396 / EE9B00 / FFF9F4 across live routes and refreshed icons (v7).
- Removed scenery mounts in planner/footer, grain mount, scenery source/generation scripts and their
  retired render tests. Removed cut-edge and layer-stack helpers, material gradients/shadows/texture,
  uneven radii and tilted UI panels. Preserved functional controls and dashboard.
- Added removal regression coverage. 163 current tests, lint/typechecks and native UI smoke pass.

## 2026-10-24 — review-driven landing polish

- Grouped logo/tagline; retained hamburger-only navigation.
- Fixed preview geometry (112px columns), local scroll, integer block positions; removed grid parallax.
- Shared sticky/primary CTA component, icon and radius; 44px back-to-top target.
- Added header/geometry/control tests and all-eight-badge contrast check.
- Verified 167 tests and native interaction smoke; real-browser Retina/zoom visual review remains external.

## 2026-10-24 — requested palette roles and contact-form repairs

- Applied all four specified colors; gold main CTAs/warnings, dark footer, ocean accents, sand surfaces.
- Fixed invisible outlines, email flex width, responsive form columns, placeholders/focus, validation
  cleanup and consent-text wrapping. Floating actions hide while forms are visible.
- Added Playwright/packaged Chromium browser test (`npm run test:browser`) against a running site.
  Checks 320/390/768/1024/1440px at DPR2: visible fields, no horizontal page overflow, validation,
  retained values on failure, success reset, newsletter, menu navigation and no form-covering CTA.
- Delivery responses in browser success/failure tests are mocked, not proof of external delivery.
- Unit/integration baseline: 169 tests; lint/typecheck and native landing behavior checks pass.

## Latest exclusive palette request — Moon Tint / Sunny Herb / Blue Harbor / Ice Blue

Replaced all previous live base hex/RGB colors with F3F6FF, CEF26D, 3770BF, 8DC2FF.
Canvas/normal text/secondary cards/main attention roles match the supplied reference.
Blue-on-lime labels use large bold text; blue-on-ice small labels retain Moon Tint inset fills.
Updated icons/cache v9 and palette regression assertions. Preserve form repairs and no particles.

Final verification: 169 tests, lint/typecheck, native interaction check and production build passed.
Real Chromium checks passed at 320/390/768/1024/1440px (DPR2), including computed Sunny Herb CTA fill,
Blue Harbor text/large bold geometry, form visibility, no page overflow and mocked delivery states.
Production HTTP landing/signin/signup/planner/icon v9 endpoints returned200. No PR created.

## FAQ overlap/truncation feedback

Fixed floating-action overlap by extending form protection to FAQ/pricing sections. Long question
text wraps separately from the fixed18px plus/minus; no clipping or icon shrink. Consistent56–88px
responsive padding for pricing/FAQs. Verified170 tests, lint/typecheck, native interactions and
production build. Real Chromium DPR2 checks all FAQ rows at320/390/768/1024/1440px for label/icon
clearance, no CTA overlay, click and Enter toggling, plus existing form/menu/palette checks.

## Repeated CTA/header/FAQ feedback — permanent layout solution

- Replaced overlay CTA with static action bar; back-to-top is also in flow. No content can slide
  underneath either control. Removed intersection-based suppression and unused scroll state.
- Bounded header container, shared button states/radii, consistent section64–96px vertical spacing.
- FAQ text16px, fixed icon column, expanded answer padding and labelled regions; footer links44x44.
- Explicit same-page smooth anchors with destination focus, hash updates and reduced-motion handling.
- User approved fifth dark text color#102C50 for AAA contrast (12.97/7.54/11.04:1 on Moon/Ice/Sunny).
-172 tests, lint/typecheck/native smoke and production build passed. Chromium tests at five widths/
  DPR2 passed geometry/no overlaps, footer target sizing, FAQ padding/click/keyboard and both motion
  preferences. Form submission states remain mocked, not proof of live webhook delivery.

## Link/routing, pricing intent and conversion review

- Verified relative routes/anchors are valid, not template placeholders. No rendered raw Markdown URLs.
- Explicit Pro/Teams enquiry selection, focus and submitted context; schema validates and forwards it.
  Cards clearly explain in-page form action and no payment. Existing general-contact clients work.
- Removed repeated EndCTA; repaired heading progression by making decorative preview title a paragraph.
- Strong dark CTA boundary/focus states; kept approved AAA dark text and four brand surfaces.
-173 tests + lint/typecheck/native smoke/build passed. Real Chromium five-width/DPR2 suite verifies
  all anchors/routes, heading progression, Pro/Teams prefill/focus, pending disabled/busy state,
  retained values on failure, selected tier in outgoing JSON and success reset. API test verifies
  tier survives relay parsing/forwarding. Delivery tests mocked; real webhook delivery not claimed.
- Checks use local production build; supplied immutable Vercel deployment was not tested/promoted.

## Card alignment / missing side visuals / FAQ pacing review

- Uniform pricing borders/padding; seven shared tracks align desktop card heights/prices/CTA baselines.
  Personal now has an action explanation just like enquiry cards; no false active-selection border.
- Responsive single-column pricing below1100px avoids cramped actions/clipping.
- Existing task/capacity previews remain inline DOM mockups, now labelled figures with framed surfaces
  and shrink-safe alternating layout; hero note no longer overlaps the calendar.
- Increased FAQ top and heading/list whitespace; bottom actions remain in-flow, not floating.
-174 tests, lint/typecheck/native smoke/build passed. Chromium DPR2 checks seven widths:
  320/390/768/900/1024/1280/1440px. Verifies same card height/top/CTA baselines on desktop, all child
  containment, no overflow, matching borders/padding, visible previews alongside text and FAQ clearance.
- Verification is local production build; supplied Vercel snapshot was not promoted or verified.

## Hero scroll / side visuals / footer / dense planner feedback

- Hero stays right on desktop and fits without horizontal scrolling; compact mobile agenda.
- Removed heavy blue outer visual borders; maintained inline illustrative product mockups.
- Fixed inverse footer logo and dark-on-dark headings; stacked/separated links, newsletter readability,
  responsive columns/location/bottom row. All existing form/link/a11y behavior retained.
- Increased calendar hour scale to112px, adaptive pixel-based metadata, shared meeting/task overlap
  lanes, uniform reason chips and full accessible details. No timestamps changed by layout.
- Arrows inspect without mutation; Ctrl/Command+arrows moves, Alt resizes. Visible drag preview flags
  protected time and is validated by server. Existing pointer/keyboard API round-trips still pass.
- Editor tabs now show only one pane; assistant/example prompts collapsed. Unplaced cards have real
  working-hours review and eligible smaller-chunk/re-plan actions, no fabricated scheduling fix.
-177 tests, lint/typecheck/native smoke/build passed. Real Chromium at seven landing widths/DPR2
  checks no hero scroll, footer logo fill/heading colors/separate44px links plus previous regression
  cases. At1280px it builds a real planner week, checks tile content bounds/minimum heights, keyboard
  focus, visible drop preview and collapsed assistant. Local build only, not Vercel promotion.


## Focused planner completion — 2026-10-24

- Isolated Tasks/Rules/Calendar panels with associated tabs, manual keyboard activation, obvious
  active styling and focus transfer; one global build/re-plan and review/publish action bar.
- Persistent unplaced/deadline summary routes to detailed remedies. Reports/insights/help/assistant
  are collapsed; publishing replaces the weekly view with an explicit Back to week path.
- Real smaller-chunk preview is nonmutating and shows actual placements/residual unplaced work.
  Use preview explicitly replaces the draft; snapshot guards reject stale edits/moves/rebuilds/modes.
  No calendar write occurs. Dry runs now respect selected block IDs, matching approval scope.
- Fixed shoulder-slot generation bypassing blackouts/lunch. Regression proves an unsplittable task
  remains unplaced while 15-minute chunks fit real gaps. Aligned time axes include all placements,
  preventing early/late blocks overlapping headers or escaping day bounds.
- Verification: lint/typecheck, 180 tests/49 suites, native smoke, production build, Chromium at
  320/390/768/900/1024/1280/1440px DPR2. Browser tests exercise panel isolation, Arrow/End and
  Enter/Space activation, focus, publishing/back flow and tile/day containment. Preview tests cover
  unchanged tasks before apply, stale-edit rejection and explicit apply; selected dry run returns one.
- Build required NODE_OPTIONS=--max-old-space-size=4096 after the default Node heap was exhausted.
  Local verification only: no real provider inference, OAuth approval/write or Vercel promotion claim.

## Calendar UI action/state reliability pass — 2026-10-24

- [x] Pending/success/error/retry paths for draft planning, move/resize, unpin and dry run.
- [x] Late-response and duplicate-operation guards; cancel planning without overwriting new drafts.
- [x] Stale-input warning and publish/export/move gates; consistent confirmed schedule on failure.
- [x] Drag cancellation/cleanup; same-day resize; accessible explicit block editor and focus return.
- [x] Pin protected-time validation; empty-filter/backlog and corrupt-storage recovery.
- [x] Selection-aware export/preflight; confirmation before undo; touch-safe core controls.
- [x] 198 tests, lint/typecheck, smoke/build; browser planner checks at390/768/1280 and landing at seven widths.
- [ ] Real Google-account read/write/undo acceptance; physical-device and assistive-technology review.
- [ ] Live LLM-provider integration verification next; RAG only after a concrete retrieval requirement.


## PRD completion audit — 2026-10-24

Implemented confirmation-before-commit intake; editable structured constraints; planning timezone;
connected-calendar refresh before plan/chat; zoned freebusy/DST boundaries; fail-closed calendar
rechecks; strict hours/deadlines/caps and pin conservation/dependency safety; meeting-only cap warnings;
explicit extend-hours trade-off; real tool-step NDJSON progress and a bounded provider-loop fallback.
Private deployments reject demo identities on page/API entry; real production accounts require
AUTH_SECRET. Calendar sync expiry clears the connected capability for recovery.

PRD §15 contains the 48-row traceability matrix: 47 implementation paths plus one qualified meeting
cap; 38 locally covered, 9 live-integration sign-offs pending, 1 product interpretation qualified.
This is not 98% of a paid SaaS or proof of live AI/Google integration. No credentials were supplied,
no provider inference or Google writes were claimed, and no RAG/payments/database scope was invented.

Validation: 215 tests / 52 suites, lint/typecheck, production build, seven-width Chromium regression
(including planner at 390/768/1280). New tests cover timezone/DST, context refresh/errors, private
access, streamed tool steps/default JSON, provider budget, strict constraints and conservation.
60-day metrics, live p95, full WCAG/device acceptance and live Google/LLM sign-off remain pending.

## Rules/day-enabler and shared control repair — 2026-10-24

- [x] Resolve weekend fallback vs day/master switch disagreement using effective scheduler hours.
- [x] Fix switch targets/thumb/fills, pressed-state semantics, select arrows and field target sizes.
- [x] Responsive Rules layout; validated times, meeting caps, lunch edits, blackout/name editing.
- [x] Safe task-duration edits, min-chunk resizing and recovery after clearing a preview estimate.
- [x] Remove ineffective automatic-overflow UI; preserve explicit report trade-offs and hard rules.
- [x] 230 tests / 54 suites, lint/typecheck, production build; seven-width landing and four-width
  planner/Rules Chromium regressions. No live external-integration claims.

## Site-wide Bauhaus rollout — 2026-10-27

- [x] Shared Bauhaus palette, DM Sans typography, square controls/cards, accessible primary accents.
- [x] Sign-in/sign-up editorial layouts with retained Google/demo/private/error handling.
- [x] Responsive shared header/footer, native mobile dialog, account state, long-name truncation.
- [x] Full planner workspace styling, tabs/rules/calendar/reports/insights/publishing shared controls.
- [x] Legal, branded 404/retry and scoped loading screens; actual 404 for retired docs preserved.
- [x] Versioned favicon/Apple identity; 233 tests, lint/typecheck/build, landing + site browser suites.
- [ ] External Google/LLM acceptance and production deployment remain independent verification.
