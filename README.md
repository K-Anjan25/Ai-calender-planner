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

### Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page: the promise, how it works, what is different, pricing CTA. |
| `/pricing` | Three tiers. Says so out loud when no payment provider is configured. |
| `/signin`, `/signup` | Sign in with Google, or a clearly-labelled demo session. |
| `/planner` | The workspace. Open by default; private when `REQUIRE_AUTH=true`. |
| `/docs` | The six documents, the live environment matrix, the API reference and the deployment guide. |

### Going live

Copy `.env.example` to `.env.local` and fill in what you have. **Everything is optional**; each
piece degrades to something honest rather than to a crash. The full matrix, with what each variable
does when it is absent, is on `/docs` — rendered from the same helpers the runtime reads, so the
documentation cannot drift from the app.

```bash
# Sessions — required in production, or cookies are signed with a public dev key
AUTH_SECRET=$(openssl rand -base64 32)
REQUIRE_AUTH=true              # optional: make /planner private

# Google: one OAuth client, two separate grants (identity, then calendar)
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…

# Real language model (omit entirely to stay on the deterministic local reasoner)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-…
```

**Google setup, in order:** create a project in Google Cloud Console → *APIs & Services* → *Enable
APIs* → **Google Calendar API** → *Credentials* → *Create credentials* → **OAuth client ID** → *Web
application* → **leave *Authorised JavaScript origins* empty** (this app has no browser-side Google
SDK; it is a server-side code exchange) → add **both** redirect URIs, for localhost and for the host
you actually deploy on:

```
http://localhost:3000/api/auth/callback      https://<your-host>/api/auth/callback
http://localhost:3000/api/calendar/callback  https://<your-host>/api/calendar/callback
```

→ copy the client id and secret into the environment → publish the *OAuth consent screen* (or add
test users, or only listed accounts can sign in). The redirect URI is resolved from the incoming
request, so a preview URL, a production domain and localhost all work with the same client — each
host simply has to be registered. If you set `AUTH_REDIRECT_URI`, it must match one of the registered
URIs exactly, including the scheme.

**Testing locally:** open `http://localhost:3000`, not the `Network:` address Next prints. Google refuses
a private IP as a redirect target (it answers with `device_id and device_name are required for private
IP`, which is its limited-input-device flow, and says nothing useful about the cause). The app detects
that case and tells you rather than sending you to Google's error page. To try it from a phone, put it
behind a public HTTPS address — a tunnel, or your deployment — and register that host.

**Two grants, two moments of intent.** Sign-in asks for `openid email profile` — who you are, nothing
else. Calendar access is requested separately, later, when you click *Connect Google Calendar*.
Bundling them would mean asking for read/write access to someone's calendar before they have created
an account. Tokens live in an httpOnly cookie — there is no database, and revocation is one
*Disconnect* away. Scopes are `calendar.events` and `calendar.readonly`, nothing more.

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

## Auth, in one paragraph

The session is a **signed cookie**, not a database row: base64url JSON payload, HMAC-SHA256
signature, `httpOnly`, `sameSite=lax`, constant-time verification, and an expiry checked on every
read. A forged or edited cookie fails the signature check. It is real authentication but not
server-side revocation — signing out clears the cookie, and a copied cookie stays valid until it
expires. That trade is deliberate and documented (`D-025`); revocation needs a store, which is the
same reason the Google tokens live in a cookie (`D-010`).

With no credentials at all, sign-in falls back to a **demo session**: the same signing mechanism, an
identity labelled `Demo session` / `demo@calendra.local` everywhere it appears, and no ability to
write to a real calendar. The app never shows a sign-in button that cannot work without saying so.

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

### Launch readiness, AI configuration and India payments

See [the launch-readiness guide](docs/LAUNCH-READINESS.md) for implemented versus missing features,
step-by-step LLM setup and verification, AI responsibilities, and the planned Razorpay/UPI integration.
This is a planner MVP, not a finished paid SaaS; payment keys alone do not enable purchases.

### Live landing and dashboard

The immersive design is now the native Next.js homepage at `/`, with Product, Pricing, FAQ and
Contact sections on one page. `/calendra.html` permanently redirects to `/`; `/pricing` redirects
into `/#plans`. Existing `/planner`, `/signin`, `/signup` and Google Calendar flows are unchanged.
The archived standalone build is not the production entry point; edit `src/components/landing/`
for the live site. Root content is server-rendered, uses CSS Modules, and shares Next's React runtime.

Main CTAs open `/planner`; `REQUIRE_AUTH=true` keeps the existing authentication gate in force.
The menu also links to `/signin`. No OAuth redirect URIs change for this landing migration.

Contact/newsletter delivery uses server-only `CONTACT_WEBHOOK_URL` and `NEWSLETTER_WEBHOOK_URL`
(HTTPS). Optional `MARKETING_WEBHOOK_TOKEN` is sent as a Bearer token to those receivers. Contact
payload: `{kind:"contact",name,email,message,consent:"on"}`. Newsletter: `{kind:"newsletter",email}`.
The receiver must validate/persist or queue accepted requests before responding 2xx. Configure consent,
unsubscribe/double opt-in, retention, and sender/provider security in that service. Keys remain server-side.
Without a configured receiver, the endpoint returns 503 and the UI reports a submission failure.
The included limiter is warm-instance best effort; add edge/distributed limits for global abuse protection.

Native landing checks: `node scripts/check-native-landing.mjs`; full regression: `npm test`.

### Real browser landing/form checks

With the built app running (`npm run build`, then `npm start`), run `npm run test:browser`.
Optional `SITE_URL` selects another host; default is `http://localhost:3000`. The test uses dev-only
Playwright Core and packaged Chromium, extracting minimal Linux browser libraries automatically.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an installed Chromium instead. Screenshots are
written outside Git to `/tmp/calendra-browser-check` (`BROWSER_ARTIFACTS` overrides this).

It checks seven viewport widths at DPR2 for actual form geometry, overflow, input validation,
submission feedback/reset, newsletter and menu behavior. Remote fonts are blocked to exercise
fallbacks; acceptance/failure delivery responses are mocked. This does not verify a live webhook.

Browser checks also verify the fluid hero has no horizontal overflow, the inverse footer logo and
headings are visible, and footer links stack with touch-safe spacing. At1280px the test opens the
planner, builds a real week through the local API, checks tile content bounds, keyboard inspection,
drop-preview feedback and the collapsed assistant. Planner keyboard: arrows inspect; Ctrl/Command
+ arrows move, Shift adds hour steps, Alt + up/down resizes. Every move is validated by the engine.


### Focused planner workflow

- **Tasks** → add tasks or paste a brief → **Plan this brief**. Edit estimates/priorities in this view.
- **Rules** → adjust working hours, protected time, buffers and energy preferences.
- **Calendar** → inspect the weekly schedule. **Build my week** / **Re-plan** is available globally.
- The persistent status summary shows unplaced work and deadline risks. **Review conflicts** opens
  **Plan report & quick fixes**; diagnostics and **Week insights** otherwise stay collapsed.
- For eligible unplaced tasks, **Preview 15-minute chunks** requests real scheduling results without
  changing the draft. Read the placement times and any remaining unplaced minutes; **Use preview**
  explicitly replaces the draft week. Other tasks may move. Edits invalidate old previews.
- **Review & publish** → choose task blocks → **Dry run** to inspect only that selection without writes.
  Calendar approval is separate, requires a connected account, and writes only selected blocks.
  **Back to week** returns to the schedule. Downloading .ics remains available without Google.
- Tabs use Left/Right/Home/End to move focus; Enter/Space activates and focuses the revealed panel.
  **Keyboard help** contains shared calendar shortcuts rather than repeating them on every tile.

Local verification includes real-route interaction tests and browser checks for isolated panels,
keyboard focus, dedicated publishing, and calendar tiles remaining inside the day grid (including
placements outside normal working hours). No live Google Calendar writes are exercised by these checks.

### Calendar action feedback and recovery

- Task/rule edits mark the existing schedule **out of date**. Re-plan before moving, exporting or publishing.
- Pending planning can be cancelled; late responses are ignored. Already-running provider work may still complete.
- Moves/resizes keep the last confirmed schedule until accepted; failures keep it intact and allow retry.
- Select a task, then use **Move or resize this block** → date/start/minutes → **Apply move or resize**
  as an alternative to dragging. Enter opens focused details; Escape/close returns to the block.
- Escape, pointer cancellation and outside-grid release cancel a drag without committing.
- **Download selected .ics** and **Dry run** use the selected task blocks. **Undo this plan** asks for confirmation.
- See `docs/LAUNCH-READINESS.md` for the action/state audit, evidence and remaining live-account tests.
