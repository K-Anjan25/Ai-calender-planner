# Calendra — Project Memory

| Field | Value |
| --- | --- |
| Document | Memory / decision log / context for future contributors and agents |
| Version | 1.0 |
| Last updated | 2026-10-15 |
| Related | `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASK.md` |

> **Read this first.** It is the short-term memory of the project: what exists, why it is the way it
> is, what will bite you, and what to do next. Keep it current — stale memory is worse than none.

---

## 1. Current state (2026-10-15)

| Area | State |
| --- | --- |
| Product | **Calendra** (renamed from Paperweek, 2026-10-14 — D-022) |
| Branch | `arena/d6e1cd24-ai-calender-planner` (working); `main` holds the MVP baseline |
| Docs | PRD, ARCHITECTURE, RULES, DESIGN, TASK, MEMORY — all written |
| Engine | `lib/scheduler/*` complete: horizon → triage/chunk → place → repair → evaluate. Deterministic. |
| Agent | `lib/agent/*` complete: 5 tools, 4 providers, `LocalReasoner` demo path, structured output + 1 repair |
| Calendar | `lib/google/*` + OAuth routes + sync route with upsert/dryRun/409-on-drift; plus `POST /api/export/ics` — the same week as a file, with no account of any kind |
| UI | Cut-paper diorama design system + 3-column planner workspace |
| Public site | Landing (`/`), pricing (`/pricing`), docs (`/docs`), sign-in/sign-up (`/signin`, `/signup`) — one `SiteHeader`/`SiteFooter` chrome, no material copy, no index numbers on the layer cards |
| Auth | **Sessions are signed cookies, not rows**: `/api/auth/{session,demo,google,callback,signout}` (D-024). Google sign-in asks for identity only; the calendar grant stays separate (D-026). `REQUIRE_AUTH=true` makes `/planner` private |
| Modes | **Demo mode works with zero env vars** — this is the default and the test path |
| Tests | 109 assertions, all green: `tests/scheduler.test.ts` (INV-1…8, dependency ordering, recurrence, seeded property sweep), `tests/agent.test.ts` (boundaries, lexicons, adapters, free-text cadence), `tests/ics.test.ts` (RFC 5545 structure, escaping, determinism), `tests/ui.test.ts` (**the components, executed in jsdom** against the real routes and engine), `tests/perf.test.ts` (drag cost: forced layouts + render coalescing), `tests/auth.test.ts` (signature forgery, expiry, open-redirect targets), `tests/responsive.test.ts` (the overflow guard is installed and no wide element escapes its container) |
| Verified | types, lint (0/0), production build, `npm test`, `npm run smoke`, `npm run agent:check`, live API round-trips, four rendered scenes |
| Billing | The **switch**, not an integration: `lib/billing.ts` detects `STRIPE_*`; `/pricing` renders checkout when they exist and a waitlist that says why when they do not (D-025) |
| Known gaps | Real-browser verification (T-507 — jsdom is not a browser: no layout, no paint, no OAuth redirect), **no server-side session revocation** (D-024), persistence, multi-week horizon (T-603), calendar *import* (only export is shipped), no payment provider wired |

## 2. What this product is (one paragraph)

Calendra turns a pile of tasks, deadlines, and preferences into a **realistic** week, and tells the
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
| **D-006** | 2026-10-14 | **Google Calendar writes are upsert-by-`extendedProperties.private.calendraBlockId` and require explicit `approvedBlockIds[]`.** | Re-syncing must not duplicate events; unapproved writes to a user's real calendar are unacceptable. | Sync is idempotent. Deleting a plan removes exactly the events it created. |
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

| **D-019** | 2026-10-14 | **A cadence with no named days is spread across the week deterministically.** | "Inbox zero, four times this week" is a real instruction, and leaving it as one 30-minute block silently answers a different question than the user asked. | `spreadDays(n)` in `local-reasoner.ts` maps 2→Tue/Thu, 3→Mon/Wed/Fri, 4→Mon/Tue/Thu/Fri, 5→weekdays, and the chosen days are visible in the task list, so a wrong guess is one edit away. `recurrence.count` then trims to the exact number. |
| **D-020** | 2026-10-14 | **The export path never depends on configuration.** | The product's claim is that it plans honestly; the only way a stranger can check that is to take the week with them. An export behind OAuth cannot be tested by someone evaluating the app, and breaks whenever credentials rot. | `POST /api/export/ics` is stateless and credential-free (like the dry run, D-015). The `.ics` is written for importers, not for curl: RFC 5545 folding, escaping, floating local times, stable `UID:<blockId>@calendra`, plus a `VJOURNAL` carrying the verdict. |

| **D-022** | 2026-10-14 | **The product is named Calendra, not Paperweek.** | The style was named after the product, which made the name describe the *material* rather than the *job*. A planner has to say what it does. | Renamed across UI copy, metadata, docs, package name, `.ics` PRODID/UID domain, Google markers (`calendraBlockId`/`calendraPlanId`), label suffix (`· CAL`), cookies and the storage key. A stored session from an older build is ignored rather than migrated (no users to migrate). |
| **D-023** | 2026-10-14 | **No `mix-blend-mode` on repeated chrome, and geometry is measured once per gesture.** | An Interaction-to-Next-Paint warning pointed at a chip, but the chip was a symptom: blended layers cannot be composited independently, so every repaint beneath one re-blends it — and the texture sat on every chip, button *and* a fixed full-viewport grain. The drag also read `clientWidth`/`getBoundingClientRect()` per `pointermove`, forcing a synchronous reflow per event. | The textures keep their noise and opacity but drop the blend (greyscale at 3.5–5% is visually indistinguishable). The drag measures the strip once at `pointerdown` (`geometryRef`) and memoises the day columns. Measured: **72 → 0 forced layouts per 24 moves; 345ms → 181ms** (`tests/perf.test.ts`). |
| **D-021** | 2026-10-14 | **A pin the engine cannot honour is retired, not retried.** | Re-sending an impossible pin every turn repeats a warning the user has already read and makes the client's pin list a lie about what is in force. | `PlanReport.droppedPins` names the task ids; `proposal.pins` contains **only** honoured pins; the store sets `pins = proposal.pins` after every plan, chat turn and drag; the toolkit prunes its context the same way. The user loses the drag, never the explanation. |

| **D-024** | 2026-10-15 | **Sessions are HMAC-signed cookies, not database rows.** | The MVP has no database (D-010), and adding one to store four fields would make the app undeployable without Postgres — the opposite of the zero-setup property the product is built on. | `calendra_session` = base64url payload + `HMAC-SHA256` signature (`AUTH_SECRET`), `httpOnly` + `sameSite=lax` + `secure` in production, constant-time compare, expiry re-checked on every read. **Consequence, stated plainly:** there is no revocation list — signing out clears the cookie, and a copied cookie stays valid until it expires. |
| **D-025** | 2026-10-15 | **Billing ships the switch, not a payment integration.** | The pricing page must never show a button that cannot charge. A checkout flow with no keys produces exactly that, and a half-integrated Stripe is a liability, not a feature. | `billingConfig()` reads `STRIPE_SECRET_KEY` + a price id; present → `/pricing` renders checkout, absent → a waitlist and a sentence saying billing is not connected on this deployment. One function decides, so the page cannot claim what the deployment cannot do. |
| **D-026** | 2026-10-15 | **Sign-in asks for identity only; the calendar grant is a separate, later consent.** | Asking for read/write access to someone's calendar *before they have an account* is how a product burns trust on first contact. Identity (`openid email profile`) is what a session needs; the calendar is what planning needs, and planning is not the first thing a new user does. | `lib/auth/google.ts` owns the identity grant and never touches calendar scopes; `/api/auth/callback` verifies the ID token and does not trust the profile endpoint; the calendar flow (`calendra_gcal_state`) is unchanged and independent. One OAuth client, two redirect URIs, two explicit moments of intent. |
| **D-031** | 2026-10-15 | **A shape’s id is a name, never a property of its geometry.** | Both birds derived their React key from `path.length`, and the two flight paths are both exactly 37 characters — so both rendered as `birds-3-37`. React warns about the collision at render time and resolves it unpredictably (a child can be dropped or duplicated on a later render), and the warning names `DioramaScene`, where the keys are *consumed*, not the generator where they were *made*. | `birds(path, layer, name, fill)`, and four assertions in `tests/diorama.test.ts`: ids unique per variant in every scene, stable across builds (a shifting key remounts the node and replays its animation), and a render of all four variants that fails if React logs any duplicate-key warning. Verified to fail on the old id before the fix. |
| **D-032** | 2026-10-15 | **The app refuses a redirect target Google will reject, and says why.** | Next prints a LAN address in its dev banner (`Network: http://192.168.1.2:3000`), so it is the natural thing to open to try the app on a phone. Google answers with `device_id and device_name are required for private IP …` — its limited-input-device flow asking for parameters this app has no reason to send — and that page tells the user nothing about the cause. | `googleOriginProblem(origin)` flags private IPv4 ranges, bare IPs and reserved TLDs; `/api/auth/google` redirects to `/signin?error=origin&host=…` instead of handing the user to Google, and the panel names the refused host and the way out (localhost here, or a public HTTPS address). An explicit `AUTH_REDIRECT_URI` disables the guard, because fronting a LAN address with a public one is exactly what that variable is for. Loopback and real hosts are never flagged (asserted). |
| **D-030** | 2026-10-15 | **The OAuth `redirect_uri` is resolved from the request, not from the build.** | Found while setting up a real Google client: both grants defaulted to `http://localhost:3000/...`. On a deployment that is not merely wrong, it is *silently* wrong — Google matches the value against the registered list exactly, so sign-in fails with `redirect_uri_mismatch` while the client id and secret are perfect, and the error looks like a console mistake rather than a code one. | `lib/request-origin.ts` reads `X-Forwarded-Host`/`X-Forwarded-Proto` (Vercel terminates TLS at its edge: the request arrives as `http://<internal-host>`) and falls back to the request URL. One OAuth client now works on localhost, a preview URL and a custom domain; only the hosts actually used must be registered. The env vars still win, for proxies and tunnels. Five assertions in `tests/auth.test.ts`. |
| **D-028** | 2026-10-15 | **A control’s default width belongs in the components layer, not in its class list.** | The rules panel was reported as "text overflowing". The cause was not the markup: `PaperInput` carried `w-full` in its base classes, so every caller’s `className="w-[86px]"` was dead. Both are utilities at the same specificity, and Tailwind emits `.w-full` *after* arbitrary widths — so the cascade always chose 100%, and the working-hours rows ran out of their sheet. | `.paper-field { width: 100%; min-width: 0 }` lives in `@layer components`, where every utility beats it. Callers size fields however they like (`w-[86px]`, `flex-1 min-w-[74px]`); `tests/layout.test.ts` fails if `w-full` reappears in a field’s base classes. The same trap is waiting for any component that hardcodes a property a caller might override. |
| **D-029** | 2026-10-15 | **The week keeps a legible minimum width and scrolls; it does not compress.** | Seven day columns sharing a phone’s width is 43px each — the title, the time and the reason chips cannot be read at any font size, and the reported experience was "the worst UI". A calendar you cannot read is not a responsive calendar. | Below ~720px the grid scrolls sideways with the hour gutter `sticky left-0`, so "when" is never scrolled away. The drag maths is unaffected: geometry is measured once per gesture and `clientX - rect.left` is content-relative. On a tile, `touch-action: none` keeps the gesture a drag instead of a page pan. |
| **D-027** | 2026-10-15 | **A demo session is a real session with a labelled identity.** | The alternative — a fake "signed in with Google" state — would make the one thing the product is honest about (what it actually did) a lie in the first screen. | `POST /api/auth/demo` signs `demo@calendra.local` / "Demo session" through the same code path as a Google user. Every surface that shows the account shows the demo label, and a demo session cannot reach a real calendar. |

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
22. **The client's pin list must always equal `proposal.pins`.** Three places used to reset pins to `[]` (`buildWeek`, `sendMessage`, and the post-drag settle) — so asking the agent *any* question silently undid a drag. A pin is a user decision (INV-8); the plan is the authority on which ones survived, and `report.droppedPins` is how it says which did not (D-021). Best found by `npm run agent:check` carrying pins across turns, not by reading the store.
23. **Tailwind v4 here emits nothing for `bg-gradient-to-*`.** Use the arbitrary form `bg-[linear-gradient(...)]`. Likewise `accent-[color:var(--x)]` is unreliable — `accent-<token>` works because the token is in `@theme`.

## 5b. Post-MVP additions (2026-10-14)

Three things shipped after the MVP, all of them derived from the same principle — *say what you did*:

- **T-604 ICS export (`src/lib/ics.ts`)** — dependency-free RFC 5545 writer. Folding is on octet
  boundaries (`'é'.repeat(80)` folds into ≤75-byte lines and still unfolds byte-for-byte), TEXT
  escaping covers `\ ; ,` and newlines, `DTSTAMP` comes from `proposal.generatedAt` (never the
  clock, so the output is deterministic and diffable), and UIDs are `blockId@calendra` so a
  re-import updates instead of duplicating. Default scope is `kind === 'task'`; ritual rows and
  meetings are opt-in.
- **T-601 recurrence** — `recurrenceSchema` in `types.ts`, `occurrenceDays()` in
  `policies.ts` as the single source of truth for *which days of this week*, consumed by
  `chunksForTask()`, `totalDemandMinutes()` and the UI label. Closes the old N-3 thread: a task may
  now carry `{byWeekday, interval, count, until, anchorWeek}` and be genuinely weekly/fortnightly
  rather than pre-expanded.
- **T-602 dependencies** — depth-first `orderTasks` (cycle-safe `dependencyDepth`), an
  `AWAITING_DEPENDENCY` feasibility gate, and a post-hoc `dependencyConflicts` audit that warns
  `dependency-unmet` instead of quietly starting the deck before the spec exists.

## 5c. Performance work (2026-10-14)

The app was reported slow to respond (a browser INP warning on a chip). Two causes, both invisible to
a functional test and to a screenshot, both now asserted in `tests/perf.test.ts`:

1. **`mix-blend-mode: multiply` on every chip, button and the fixed full-viewport grain.** A blended
   layer cannot be composited on its own — the browser must blend it against its backdrop, so any
   repaint underneath forces a re-blend. During a drag that is a full-viewport composite per frame.
   The textures are unchanged visually (greyscale noise at 3.5–5%); only the blend is gone.
2. **Forced reflow per `pointermove`.** The move handler read `container.clientWidth` and
   `getBoundingClientRect()` on every event — three synchronous style+layout recalculations each time,
   ~120×/second on a 120 Hz mouse. Geometry is now captured once at `pointerdown`.

Plus the render work: `visible.filter(...)` gave every column a fresh array each render, so all seven
re-rendered on every move. The columns are partitioned once (`byDay`), the ghost is passed only to the
column it lands on, and `DayColumn` is memoised.

| Measurement (24 pointer moves) | Before | After |
| --- | --- | --- |
| Forced layout reads | 72 | 0 |
| Wall clock (jsdom, indicative) | 345 ms | 181 ms |

## 5d. Production round (2026-10-15)

The site grew a real front door: landing page, pricing, docs, sign-in/up, and an auth layer. What was
learned, in the order it bit:

1. **`cookies()` needs Next's request scope.** Unit-testing a route handler that reads `cookies()` from
   the jsdom harness throws *"`cookies` was called outside a request scope"*. Faking the scope would
   test the fake. The routes with security consequence were split: the pure parts (signature, expiry,
   redirect target) are unit-tested, the handlers are verified over HTTP with a real cookie jar.
2. **A server page cannot be rendered by the jsdom harness.** `/planner` is now a server component that
   decides the gate before sending a bundle, with the client workspace beside it — `git mv page.tsx
   workspace.tsx`. The UI tests import the island. This is the right architecture (no auth flash, no
   client-side redirect) *and* it means the page's gate is verified over HTTP, not in jsdom.
3. **`npx tsc` installs a different package** (`tsc@2.0.4`). Use `./node_modules/.bin/tsc`, i.e.
   `npm run typecheck`.
4. **`fuser -k` can lose a race with `next start`.** Killing the port and immediately starting the new
   server leaves the *old* one bound and the new one dying with `EADDRINUSE` — while curl happily
   answers from the old process, so a config change looks like it was ignored. Stop the managed process
   first, then start.
5. **Text overflow has two causes, and only one is `break-word`.** A long unbroken token needs
   `overflow-wrap`; a flex/grid child needs `min-width: 0` or it refuses to shrink and pushes the layout
   instead of wrapping. The global guard covers the first; `tests/responsive.test.ts` asserts no
   element forcing a width above 320px escapes its scroll container, and asserts the guard is still
   installed. It cannot prove the page *looks* right — there is no layout engine here — and it says so.

## 5e. The UI-defect round (2026-10-15)

Reported after the production round: *"in demo session in rules section the working hours has the
contents, texts overflowing, and your week has so many ui hanging, ui bug, errors, and worst ui
experiences."* Six real defects, each with a mechanism worth remembering:

1. **`w-full` in a component’s base classes cancels the caller’s width.** `PaperInput`,
   `PaperSelect` and `PaperTextarea` all carried it, so all eleven `w-[86px]` / `w-[90px]` /
   `w-[84px]` overrides in the rules panel were dead code and every field became 100% of its row.
   Fixed at the source with `.paper-field` in the components layer (**D-028**), then the rows were
   rewritten to share space (`flex-1 min-w-[74px]`) instead of demanding a fixed width.
   *Diagnosis tip:* read the **built** CSS, not the source — `grep -o '\.w-\[86px\]{[^}]*}'` and
   compare byte offsets with `.w-full`. Nothing in the TSX reveals this.
2. **`flex-1` beside four fixed siblings collapses to a sliver.** The blackout row was one wrapping
   flex row: the label had `basis: 0` and the select and two time inputs set a floor the sheet could
   not shrink below. Two rows (name / when) instead of one.
3. **Seven day columns at any width.** Now a minimum width inside a scroller (**D-029**).
4. **`localStorage.setItem` per input event.** Synchronous disk I/O on the main thread, ~60×/second
   while a slider was dragged — the app did not hang, it was writing. Coalesced to a leading write
   plus at most one trailing write per 250 ms; `tests/perf.test.ts` asserts ≤2 writes for 60 events.
5. **`days` depended on the whole `preferences` object.** Any change rebuilt the array, changed every
   `day` prop, changed `beginDrag`/`onBlockKeyDown` (both close over `days`), and re-rendered all
   seven memoised columns and every tile in them. It is built from the two values that decide it now.
6. **Equal start times stacked tiles on top of each other.** `layoutColumns` counted "tiles that
   started earlier" as the column index, so two blocks at 09:00 both got index 0 and half the width —
   one invisible and ungrabbable, with no error anywhere. Now a greedy interval colouring
   (`layoutColumns`, four tests). The engine never places two tasks on the same minute, but a ritual
   row can land on a task and a drag preview always can.

Smaller ones fixed in the same pass: the first and last hour labels were centred on their rule, so
they hung half a line outside the grid; a 15-minute protected band is 11px tall with a 13px label, so
its label spilled into the next slot (now `overflow-hidden`); tiles lost their last line to
`overflow: hidden` rather than declaring what fits (`titleClamp` / `chipBudget`); the `+n` reason
counter was computed against a different number of chips than were shown; band keys could collide.

## 6. Open threads / next actions

| # | Thread | Owner | Notes |
| --- | --- | --- | --- |
| N-1 | ~~Scheduler invariant + property tests (T-107)~~ **done** | Eng | 46 assertions green; keep them green |
| N-2 | a11y sweep (T-504) + responsive sweep (T-505) | Design+Eng | Keyboard move/resize of blocks is implemented but unreviewed |
| N-3 | ~~Recurring task expansion (T-601)~~ **done** | Eng | `recurrence` + `occurrenceDays()`; free text understood; covered by tests |
| N-4 | ~~Enforce `dependsOn` ordering (T-602)~~ **done** | Eng | Depth-first ordering + `AWAITING_DEPENDENCY` gate + `dependency-unmet` audit |
| N-5 | Persistence (T-605) | Eng | Also unlocks multi-device and "what changed" diffs |
| N-6 | Decide Q3 from PRD §11 (deadline = midnight vs stated time) | Product | Currently midnight of the stated date |
| N-7 | Cost pass: cache parse results per input hash | Eng | Avoids re-parsing identical task text on regenerate |
| N-8 | Real-browser verification (T-507) | Eng | Playwright: paint, layout, responsive, and the OAuth redirect. jsdom now covers the *logic* of drag/resize/keyboard (18 assertions), so what remains is pixels, not behaviour. |
| N-9 | ~~`scripts/agent-check.ts` should carry pins across turns~~ **done** | Eng | The walkthrough now carries tasks, preferences **and** pins between turns, asserts a pin from an earlier turn still holds, and reports PASS/FAIL. It immediately found the pin-drop bug (gotcha 22, D-021). |
| N-10 | Calendar *import* (busy + existing events as first-class, `.ics` as a sync target) | Eng | Export is shipped and credential-free; import still means Google free/busy only. |
| N-11 | Round-trip the `.ics` through a real client (Apple/Outlook/Thunderbird) | Eng | Structure is asserted here; a real importer accepting it is not yet observed. |

## 7. Session log

| Date | What happened |
| --- | --- |
| 2026-10-14 | Repo initialised (LICENSE only). Product spec'd: PRD, ARCHITECTURE, RULES, DESIGN, TASK, MEMORY. MVP implemented end to end: deterministic week scheduler with explainable placement, LangChain agent (5 tools, 4 providers, deterministic demo reasoner), zod-validated API surface, Google Calendar OAuth + free/busy + idempotent approved sync, and a full cut-paper diorama design system + planner workspace. Decisions D-001…D-012 recorded. |
| 2026-10-14 | UI round. Added a jsdom harness (`tests/harness/`) that executes the components against the real route handlers, agent and engine, plus 18 assertions in `tests/ui.test.ts` (drag, resize, keyboard parity, free-text intake, chat, calendar states, the full page). The very first run found **three shipped bugs in drag and drop** — the flagship interaction — none of which static review caught: a drop was silently discarded (§5.19), grabbing a tile near its top threw it to the start of the day (§5.20), and resizing slid the block's start to the grip (§5.21). All fixed and covered. Also: `Dry run` was gated behind a connected Google account, which contradicted D-015 — now it works unconfigured. ADR D-018 records the lesson: execute the UI, don't read it. |
| 2026-10-14 | Renamed the product to **Calendra** and fixed the reported INP problem. The rename touched 25 files (copy, metadata, docs, package name, `.ics` PRODID/UIDs, Google markers, label suffix `· CAL`, cookies, storage key). The performance work is recorded as D-023 and measured in `tests/perf.test.ts`: the blend modes came off the repeated chrome, the drag stopped reading layout per `pointermove` (72 → 0 forced layouts) and the day columns were memoised (345 ms → 181 ms over 24 moves). 103 assertions green, lint 0, build clean. |
| 2026-10-14 | Post-MVP round three. `npm run agent:check` (N-9) rewritten to carry pins across turns — which found a real defect within minutes: the client threw a drag away whenever the user then asked the agent anything (`buildWeek`/`sendMessage` reset `pins: []`), and the toolkit replaced its pin set on every `revise_plan`. Fixed by making the plan the authority (D-021): `PlanReport.droppedPins`, `proposal.pins` = honoured pins only, store adopts it after every path, toolkit prunes its context. Harness now ends `PASS: 9 turns, 8 tasks, 1 pin carried`. Two assertions added at the engine boundary and two at the conversation boundary; `npm test` 101/101. |
| 2026-10-14 | Post-MVP round two. T-601 recurrence and T-602 dependencies implemented end-to-end (schema → policies → engine → score → parser → prompts → UI), with `occurrenceDays()`/`recurrenceLabel()`/`dependencyDepth()`/`dependencyConflicts()` and an `AWAITING_DEPENDENCY` gate; 29 scheduler assertions and 36 agent assertions, including a fixture that *proves* the constraint bites (the dependent is placed **before** its prerequisite without it). T-604 shipped: credential-free `.ics` export (`src/lib/ics.ts` + `POST /api/export/ics` + a cell in `CalendarPanel`), 12 structural assertions, verified over HTTP (12.6 kB, 20 VEVENTs, CRLF, folding, balance, unique UIDs) and with an independent parser check. Parser now reads "every other Thursday", "until Thursday", "N times this week" — and spreads a bare count across deterministic days (D-019). `npm test` 97/97. |
| 2026-10-15 | UI-defect round. The rules panel’s working hours overflowed because `w-full` in the control’s base classes made every caller’s width override dead code (D-028, proven by reading the built CSS); the week grid squeezed seven days into a phone’s width (D-029, now a legible minimum inside a scroller with a sticky hour gutter); slider drags wrote to `localStorage` ~60×/second; `days` was rebuilt on every preference change, re-rendering the whole week; and two tiles starting at the same minute were drawn on top of each other. Six fixes, five new tests, 132/132 green. |
| 2026-10-15 | Production round. Removed the paper-material copy (the "Paper, not plastic" card became "Trustworthy by construction"; the hero caption and section headings lost their craft vocabulary) and replaced the layer glyph with a **calendar mark** (`CalendraMark`: bound leaf, header band, month grid). Landing page rebuilt with real navigation (How it works, Features, Pricing, Docs) plus `SiteHeader`/`SiteFooter` shared chrome, and `/pricing`, `/docs`, `/signin`, `/signup` added. Auth landed as signed cookie sessions with a Google identity grant, a labelled demo session, and an optional `REQUIRE_AUTH` gate on `/planner` (D-024…D-027). Billing ships the switch, not an integration (D-025). Overflow guard added and, where it can be, asserted. `npm test` 109/109, lint 0, typecheck clean, 19 routes built. |
| 2026-10-14 | Verification round. Added 46 assertions (engine invariants + agent/adapters); the tests immediately caught four real defects, all fixed: (1) `z.string().datetime()` rejected the engine's own wall-clock deadlines, breaking every follow-up request — D-013; (2) ritual tiles could be laid over meetings — D-016; (3) refused pins were silently relocated — D-014; (4) "do not use the weekend" was matched by the weekend-*enable* rule — gotcha 16. Also: dry-run sync no longer needs Google config (D-015), refinement replies now report preference and block-level movement (D-017), hydration-safe calendar dates (gotcha 17), block explanations wired end-to-end through `explain_block`, README + `.env.example` rewritten, `package.json` `scaffold` → `calendra` with `test`/`smoke`/`agent:check`/`scene` scripts. |

## 8. How to use this file

- **Before starting work:** read §1, §4, §5.
- **When you make a design or architecture decision:** add a row to §3 with today's date and the consequence. One line of rationale minimum — future-you will not remember the alternative you rejected.
- **When you hit a surprising bug:** add it to §5 as a numbered gotcha, phrased as the *lesson*, not the incident.
- **When you finish a session:** append to §7 and refresh §6.
- **Never** delete a decision row; supersede it with a new row that references the old one (`supersedes D-004`).

### 2026-10-16 — deployment sign-in diagnostics

The dashboard listing confirms names and scopes, not the values visible to an existing deployment.
`/api/auth/session` now exposes `googleMissing` (names only), and the sign-in panel names exactly
what is absent. A failed session fetch has a separate `error` state: it is not evidence that
credentials are missing. Earlier statements that a disabled button could *only* mean missing
variables were incorrect because the hook swallowed fetch failures. Verification: 151 tests,
lint, and both application/test typechecks pass. Hosted verification remains blocked by Vercel
Authentication; request the user's new deployment URL and `/api/auth/session` response, never secrets.

### 2026-10-16 — branding, AI disclosure and India billing direction

User requested removal of duplicated Calendra branding on sign-in and the "Every layer" caption,
a product favicon, candid completion status, India payments and step-by-step LLM setup.
Removed the duplicate auth-panel logo (site header retains it), removed the caption, generated
SVG/ICO from the existing calendar mark. Corrected cross-device storage marketing: current task
persistence is localStorage. Billing never becomes ready merely because keys exist: no checkout
endpoint existed. Removed Stripe activation advice; intended path is Razorpay including UPI,
not falsely advertised as implemented. See `docs/LAUNCH-READINESS.md` for setup, AI data flow and
remaining release gates. No supplied credentials were used to test external inference or payments.

### 2026-10-16 — internal docs hidden from the product

User requested hiding Markdown files and contents. Repository docs remain intact; `/docs` now returns
404 and header/footer no longer expose internal documentation, environment matrices or repository
Markdown links. Terms/privacy move to `/legal` so sign-in keeps usable legal links. Public repository
visibility is unchanged: removing website links cannot make GitHub files private.
Favicon metadata explicitly links versioned PNG assets (64px favicon and 180px Apple touch icon) to
avoid stale browser caches. Built-server HTTP checks: `/docs` and `/docs/MEMORY.md` 404, `/legal`
and both icon assets 200; sign-in HTML includes the new icon URL and no docs links. 157 tests pass.

### 2026-10-16 — customer copy is not an implementation report

Standing user preference: do not place technical demo-session descriptions or work-in-progress
explanations in customer-facing UI. Removed the signed-session/identity paragraphs, retained a
concise Demo badge, simplified unavailable sign-in errors and removed payment implementation notes.
Keep essential safety/privacy/error messages and do not imply unavailable purchases work.
Operator diagnostics remain in API responses and repository docs, not public marketing copy.
Verified 158 tests pass, lint and both typechecks clean.

### Immersive single-file redesign

Latest request specifies 3–5 pages and a single HTML with React/CSS Modules. Reconciled as four
hash-routed views in `public/calendra.html`, preserving existing Next.js planner. Editable JSX/CSS and
esbuild generator retained; bundled React has no runtime CDN dependency. Forms have no supplied
submission backend: blank endpoints produce real failure, never simulated success. Do not claim
independent per-page SEO, paid checkout, newsletter delivery or WCAG certification. Setup and caveats
in `standalone/calendra/README.md`. Reduced motion, native dialog and semantic/error states included.

### 2026-10-23 — new design is the production entry point

User selected `/calendra.html` as the new live landing, requested existing stack integration and
connection to dashboard, preferring not to distribute pages. Ported JSX/CSS Modules into Next's root
page, one scrolling document, same React runtime, server-rendered initial markup/SEO, Next links.
Archived standalone sources remain but no longer drive `/`; old HTML URL redirects to root.
Dashboard/auth endpoints remain untouched. Added bounded validated form API relay handlers with
server-only HTTPS configuration; actual delivery and global anti-abuse require deployment services.
Tests cover provider acceptance/failure, schemas/origin/body budget and native UI. Do not claim a
Vercel Preview was promoted to Production simply because the branch was pushed. No PR/merge.

### 2026-10-23 — preserve original brand on the immersive landing

User explicitly requested previous original logo and palette, and supplied a design/function review.
Keep the new native landing layout but reuse `CalendraLogo` and original global theme tokens, not
independent forest-green branding. Calendar favicon already matches the original mark. Header/drawer/
footer are warm light surfaces; ink on tinted cards and ivory on teal-deep buttons meet measured AA
normal-text contrast. Added FAQ navigation, contact focus for Pro/Teams, larger mock-calendar text and
local scrolling plus earlier tablet stacking. Existing form/links behavior preserved and checked.
No real-browser pixel/zoom or screen-reader conformance claim is made from these automated checks.

### 2026-10-23 — user replaces palette with five exact swatches

Supersedes original cream/teal palette preference: use only D7DEE6, BBCEA3, B88864, 47698C, 3F2E54.
Rebased all live src authored hex/RGB colors, shared theme, diorama fills, shadows, logo and favicon.
Legacy semantic token names remain to avoid breaking planner logic. Purple on grey/green supplies
AA text contrast; blue/suede are accents (grey on blue is only 4.22:1; purple on suede 3.90:1, so
neither is used as the normal small-text pair). Removed section indices and multicolor Google glyph
(text-only button remains). Disabled grayscale noise backgrounds; alpha effects use palette RGBs.
Native behavior smoke and 167 tests pass. Favicon cache keys v3. Repository standalone archive is
not the live route; /calendra.html still redirects to the native homepage.

### 2026-10-23 — latest palette replaces previous reference

User supplied six exact swatches: E6E1D5, 848381, 969A82, BBBCA7, 474646, AE7960. Replaced all live
hex/RGB bases, semantic theme values, diorama fills and icons. Light sage is used for text-bearing
cards/buttons, dark sage for accents. Original logo shape, no section numbers and existing dashboard
flows retained. Versioned favicon URLs v4. 167 tests, lint/typecheck and native UI smoke validate
palette boundaries, key text contrast and behavior; no claim of full pixel/browser accessibility audit.

### 2026-10-23 — four-color reference replaces six-swatch palette

Latest user image specifies 4D5C60 (Slate), 525266 (Amethyst), D1E0DE (Mist), EEF4CE (Keylime).
Replaced all live src hex/RGB bases and regenerated icons, including older PNG asset URLs; current
favicon filenames v5. No new logo shape, no section indices, no dashboard/auth behavior changes.
Updated regression palette whitelist. 167 tests, lint/typecheck and native landing smoke pass.

### 2026-10-24 — coastal palette and no hero particles

User supplied F0ECDA, 134C65, 487F86, 152740 and requested hero particle removal. Updated all live
source color bases, shared tokens, scenes and icons. Deleted Atmosphere canvas/component/animation
and unused CSS, not just hidden it. Preserved calendar visual, original mark geometry, dashboard
flows and no-section-number preference. Versioned icon URLs v6; source-wide palette guard and
no-particle regression test pass. 168 tests, lint/typecheck and native interaction smoke are green.

### 2026-10-24 — latest palette and explicit removal of material styling

User supplied 005F73, 0A9396, EE9B00, FFF9F4 and explicitly revoked the old paper/diorama direction.
All live colors/icons updated; favicon URLs v7. Remove that style, not just marketing words: no
scenery, grain, scallops, mat layers, tilted cards, irregular radii or material shadows. Deleted dead
scene renderer/generator and associated scripts/tests; functional primitives retain compatibility names
but render flat clean surfaces. Removed logo's offset backing shape while preserving calendar identity.
No hero canvas or section indices. Replacement guard verifies absence of old mounts/effects. 163 tests,
lint/typecheck and native behavior smoke pass; smaller count reflects retirement of six scene tests
and addition of one removal test. No live payment or external form delivery claims changed.

### 2026-10-24 — acted on supplied UI review

Preserve palette/layout, improve polish. Group header brand+tagline. Fixed-size illustrative calendar
provides five 112px columns with local scroll (602px box - 40px padding - 2px border), rather than
fractional columns/transformed rasterization. Removed its fractional parallax effect; event top/height
round to pixels. Sticky CTA reuses LinkButton and icon, shared corner radius; back-to-top 44px.
Added tests for structure/geometry/control consistency and every shared badge tone (>=4.5:1).
167 tests/native smoke pass. Do not represent geometry tests as an actual Retina/zoom or WCAG audit.

### 2026-10-24 — latest palette roles, real form defect and real browser checks

User palette: 258C9B, FEBF12, F3E3D2, 0C4A57 with explicit roles. Updated all live bases/icons (v8),
gold landing/dashboard main CTAs and capacity warning, Ocean accent borders, dark Petrol footer.
Missing inputs were same-color borders/background; email also used width:0 flex sizing. Fixed visible
2px dark outlines, min-height48, font16, explicit fills, flex/grid constraints, placeholders/focus,
error cleanup/aria-busy and consent wrapping. Hide floating actions around visible forms.

Browser limitation overcome: installed dev-only playwright-core and @sparticuz/chromium. Linux NSS/
NSPR libs are inside the package's al2023 archive; test script extracts them into /tmp and sets browser
LD_LIBRARY_PATH. One browser per viewport avoids packaged single-process context-close crash.
Actual Chromium tests at five widths/DPR2 cover fields, overflow, validation, retained data, success
reset, newsletter/menu. External fonts blocked to test fallback; delivery responses mocked. This is
not proof of live delivery or full WCAG certification. Keep CONTACT/NEWSLETTER webhook setup caveat.

### Latest user palette supersedes ocean/gold/sand

Exact bases now F3F6FF Moon Tint canvas, 3770BF Blue Harbor type/structure/ordinary primary buttons,
8DC2FF Ice Blue secondary cards/active slots, CEF26D Sunny Herb Build my week/capacity warning.
Blue on Moon 4.59:1; blue on Sunny 3.91:1 so attention labels must be >=19px bold. Ice Blue
small labels get Moon Tint inset surfaces (blue-on-ice only2.67:1). No fifth/darker color added.
Contact/newsletter fixes retained. Icon cache v9. Existing browser test covers five widths/DPR2.

### FAQ floating overlap and long-question wrapping

Latest fix extends viewport suppression from forms to 'form, #questions, #plans'. State renamed
interactiveInView, defaults true as safe no-observer fallback. Both floating controls hidden in
protected sections, with64px approach margin. FAQ question span + minmax(0,1fr)/20px grid, fixed18px
icon; wraps normal/overflow-wrap:anywhere. Pricing/FAQs clamp56/7vw/88px vertical padding.
170 tests + lint/typecheck/native smoke/build passed. Browser suite now tests every FAQ for geometry,
click/Enter toggles and absent sticky CTA, and pricing suppression at five widths/DPR2. Screenshot
review confirms Google Calendar question wraps to two lines on390px without icon collision.

### Current design: in-flow actions and approved fifth text swatch

User chose 'Allow darker text for AAA' via clarification. Add #102C50 ink/deep semantic text;
retained four brand surfaces. Measured dark-on-Moon12.97, dark-on-Ice7.54, dark-on-Sunny11.04.
Normal marketing buttons Blue Harbor/Moon19px bold gives AAA large4.59. No whole-site certification.

Permanent overlap fix: remove conditional floating CTA and suppression observer; always render
static nav.actionBar between main and Footer, containing shared Build my week and back-to-top.
No fixed promotional actions anywhere. HeaderInner max1120px bordered container; FAQ answer
padding12–16px/24px bottom; footer44px targets; primary section padding64–96px. Root capture handler
follows hash links smoothly after drawer closes, focuses destination without jumping, pushes hash,
uses auto for reduced motion. Existing html smooth CSS retained. Native jsdom has scrollIntoView shim.
172 tests + lint/typecheck/native smoke/build passed. Browser suite tests static bar position AND
separate main/bar/footer bounds, every footer link44x44, expanded FAQ padding, both normal/reduced
scroll behavior at five widths/DPR2 alongside existing palette/form/menu cases.
