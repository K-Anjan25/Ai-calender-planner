# Calendra: launch readiness and setup

Reviewed 2026-10-16. This is an implementation audit, not a claim of hosted end-to-end verification.

## Is it complete?

No: usable planner MVP, not a finished paid SaaS. A percentage would hide critical missing features.

| Area | Implemented | Remaining proof or work |
|---|---|---|
| Landing, auth, pricing, docs UI | Yes | Real-browser acceptance on desktop and phone |
| Tasks, preferences, scheduling, dragging, reports, ICS | Yes | Wider real-user testing |
| Google identity | Yes; user confirmed sign-in | Stable domain, production OAuth configuration |
| Calendar read/write and approval | Code implemented | User must verify connection, dry-run, approved write and rollback with real calendar |
| LangChain live providers | Implemented with local fallback | Valid provider key/model and successful live request in deployment |
| Storage | Browser localStorage | Database, account ownership, migrations, backups, cross-device sync |
| Payments | Not implemented | Razorpay order creation, verification, webhooks, entitlements, refunds |
| Paid tiers / team features | Pricing descriptions, not finished features | Enforcement, history, collaboration; no functional waitlist storage |
| Operations | Tests and capability endpoints | Rate limits, abuse/cost caps, monitoring, privacy/deletion workflow, security review |

Signing in does not upload local tasks or make them available on another device.

## AI: what, where, why and how

No credible percentage can be assigned to "how much AI"; it depends on mode and actions.
Without a provider key, or with DEMO_MODE=true/1, no external LLM is used. The local path uses
rules, not a trained local language model. A configured key alone is not proof of successful inference.

- `src/lib/agent/providers.ts`: resolves OpenAI, Anthropic, Google or local mode.
- `src/lib/agent/planner-agent.ts`: LangChain model calls, schema validation, tool loop (up to six
  tool iterations), fallback; one user action can make several provider requests.
- `src/lib/agent/prompts.ts`: task extraction, refinement and explanation instructions.
- `src/lib/agent/tools.ts`: validated parse/build/critique/revise/explain tools.
- `src/lib/scheduler/`: deterministic feasibility, scoring and actual time placement.

AI reduces manual task entry by extracting titles, effort, deadlines and priorities from text;
interprets follow-up requests as preference/task/pin changes; chooses tools; and explains results.
Missing duration estimates are guesses to review, not measurements. The scheduler, not the LLM,
calculates block timestamps and conflicts. AI does not handle authentication, payment decisions,
or calendar write approval. Final review remains the user's responsibility.

Flow: free text → model interpretation → schema-validated tasks/changes → deterministic scheduler
→ critique/report → explanation → user review → explicit approval → Google Calendar write.
Failures fall back to local rules with a note. Review the result's mode/provider/notes, not only health.
Task titles, preferences and relevant calendar context can be sent to the selected provider. Do not
submit sensitive data before reviewing its policies and informing users.

## LLM setup: OpenAI example

Dashboard labels can change; use the named sections if a button moves.

1. Open https://platform.openai.com/ and sign in. Select the intended organization/project.
2. Open Settings → Billing; add payment details/credit as required. API billing is separate from
   a ChatGPT subscription. Set available project budgets/alerts; alerts are not necessarily hard caps.
3. Open Dashboard → API keys → Create new secret key. Select the project, create and copy it once.
   Do not paste it in chat or commit it.
4. Vercel → aicalenderplanner → Settings → Environment Variables. Add or edit, save each:

   ```text
   LLM_PROVIDER=openai
   OPENAI_API_KEY=(your private API key, entered only in Vercel)
   LLM_MODEL=gpt-4o-mini
   DEMO_MODE=false
   ```

   The model shown is the code's OpenAI default; use a currently available tool-calling model
   enabled for your account if unavailable. Set the environment scopes used by your deployment.
   None of these names should start with NEXT_PUBLIC_. Leave existing OAuth variables intact.
5. Deployments → the intended branch's deployment → ⋯ → Redeploy. When Ready, click Visit.
6. On that exact host, open `/api/health`. Under `data.agent`, expect `mode: "agent"`,
   `provider: "openai"`, and the model name. This confirms configuration only.
7. Open Planner, select agent/auto mode rather than local if offered, enter new task text and
   generate a plan. Check response mode/provider and notes (browser DevTools → Network → plan/chat
   response if needed). Confirm a successful request in OpenAI's Usage page. A fallback note means
   the live call failed even if health reports agent mode.
8. If it falls back, check provider billing, model access, Vercel runtime logs and API errors. Do not
   post raw logs containing tokens or user content. Do not repeatedly retry costly requests.

Local development: put the same values in ignored `.env.local`, restart `npm run dev`, use localhost.

Alternatives (choose one, not all):
- Google AI Studio → API keys → create a key in your project. Use `LLM_PROVIDER=google`,
  `GOOGLE_API_KEY` and an explicitly selected, currently supported tool-calling `LLM_MODEL`.
  This is NOT GOOGLE_CLIENT_SECRET: OAuth credentials do not pay for or authenticate Gemini calls.
- Anthropic Console → API keys → Create Key, configure billing. Use `LLM_PROVIDER=anthropic`,
  `ANTHROPIC_API_KEY` and an available tool-calling `LLM_MODEL`.

The code's Google/Anthropic defaults may age; explicitly select a model your provider currently offers.
No live-provider inference was verified in this sandbox: no real provider credentials were supplied.

## India payments: Razorpay with UPI

Razorpay is the intended integration. UPI is a payment method, not a substitute for a verified billing
backend. This release does not accept payments; adding keys cannot enable checkout. A direct UPI QR
or browser success callback is not reliable evidence to unlock an account. Merchant availability,
KYC approval and payment methods must be confirmed with Razorpay; don't assume eligibility.

Account preparation:
1. Open https://dashboard.razorpay.com/ → create/sign into the merchant account.
2. Complete the account activation/business/KYC steps shown in the dashboard; submit requested
   business, bank, identity and website information privately to Razorpay.
3. Use Test mode first. Settings (or Account & Settings) → API Keys → Generate Test Key.
   Store test credentials in your own secret manager until the integration is implemented.
4. Review available UPI methods in the dashboard. Do not promise recurring UPI payments until the
   account and chosen subscription/mandate product support them.

Engineering still needed before real charges:
1. Define INR prices and plan entitlements server-side; add account/order/payment tables.
2. Authenticated server endpoint creates Razorpay orders; browser cannot choose price or user id.
3. Open Razorpay Checkout with the order id and public key id (never the secret).
4. Server verifies the checkout signature, matches order/user/currency/amount and confirms payment
   capture status. Browser success alone never grants access.
5. Signed webhook endpoint verifies the raw request body, handles captured/failed/refunded events,
   deduplicates event ids and reconciles entitlement state. Handle retries and out-of-order events.
6. Test success, cancellation, failure, duplicate callback/webhook, refund, forged signature and
   wrong amount; add reconciliation and operational alerts.
7. Complete merchant activation, use Live keys and a production webhook secret, publish terms,
   privacy/refund/support details, then verify a real payment/refund before enabling paid CTAs.

Do not collect bank details, secrets or KYC documents through the app/chat. Subscription billing and
one-time UPI payments require different renewal/expiry handling; choose the product before coding.

## Calendar action/state audit — 2026-10-24

This is a focused reliability pass, not a declaration that the entire application is production-ready.
No LLM provider integration or RAG was added in this pass.

| Action | State handling and recovery now verified |
|---|---|
| Build / re-plan / chat | One draft-changing operation at a time; clear pending feedback; duplicate submission guards; late results cannot overwrite edits; explicit Cancel planning discards the pending result |
| Move / resize | Last confirmed schedule stays visible until server acceptance; rejection/network failure preserves original blocks and pins; retry works; successful moves reconcile server pins and selection |
| Drag cancellation | Escape, pointer cancellation, window blur and outside-grid drops do not commit; listeners cleaned up when grid unmounts |
| Resize gesture | Remains on the original day; extending at the end of the time axis does not move the block's start |
| Keyboard / touch alternative | Selected details expose date/start/duration controls and Apply move or resize; Enter/tap reveals focused details; Escape/close returns focus to the block |
| Edit tasks / rules | Existing calendar is explicitly marked out of date; moving/export/publish blocked until re-plan; controls locked during pending operations; removed task cannot silently publish from the old snapshot |
| Unpin | Failed request retains the old pin; success updates both store and proposal pin collections |
| Protected time | Server also rejects user pins into lunch, blackouts, before/after working hours and overlapping pinned blocks |
| Selection / filtering | Closing details does not reopen on returned focus; collapsing report clears selection; empty filter results explain how to recover |
| Dry run / export | Chosen task IDs used consistently; empty selection disabled; changing selection clears old preflight feedback; export has timeout handling and excludes unselected meetings |
| Publish / undo | Duplicate operation guards; error feedback announced and retry remains available; undo requires an additional confirmation; pending write cannot be cancelled as if it were merely draft planning |
| Empty / saved state | Intentional empty backlog survives reload; malformed saved tasks/preferences/session data cannot break hydration; empty state routes to task intake |

Evidence: lint, typecheck, 198 tests across 49 suites, scheduler smoke and production build passed.
Chromium landing regressions pass at seven widths (320–1440px DPR2). Planner interactions run at
390/768/1280px, covering tabs/focus, publishing navigation, drag cancellation, injected network
failure/retry, deletion → stale warning → re-plan, editor input geometry and page/tile containment.
Screenshots and logs are local artifacts, not evidence of a hosted deployment promotion.

### Still requires acceptance / further product work

- Real Google OAuth, meeting import, approved writes, partial provider failures and rollback with a
  test account. Automated local tests do not establish live Google behaviour.
- Actual live-model inference, credentials/quota handling and provider usage evidence. Hugging Face
  support and RAG remain absent, deliberately outside this UI pass.
- Physical touch-device/assistive-technology testing, zoom and broader browser coverage; the current
  checks use Chromium and jsdom, not a WCAG certification or an exhaustive UI bug guarantee.
- Server-backed user storage, cross-device sync and durable publication/undo history. Browser
  persistence is still local; undo targets the current proposal, not an account-wide plan history.
- Cancel planning invalidates the client result; it does not guarantee an already-running server
  or model-provider request has stopped or avoided charges. Calendar writes are not exposed to this
  cancellation action. Inputs edited during a pending request are retained, not silently merged.


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

## Rules and shared-control bug fixes — 2026-10-24

- Day switches now reflect effective scheduler hours, including legacy weekend-mode fallback.
  Turning a single weekend day off materializes the other day's hours before disabling fallback;
  the master switch enables/disables both explicit weekend windows consistently.
- Switches have independent 44×44 targets, a contained thumb, visibly distinct on/off fills, and
  native keyboard operation. Pressed buttons now expose aria-pressed and a distinct selected fill.
- Rules use a responsive two-column desktop layout and a single column on mobile. Time pairs and
  blackout controls no longer squeeze five controls into one row. Selects have visible chevrons;
  shared inputs/selects and rule sliders have 44px targets; secondary cards use subtle borders.
- Shared time-window fields retain incomplete/reversed/off-grid edits locally, announce the error,
  and only commit valid 15-minute windows. Midnight end is represented as 1440. Editing lunch start
  does not unexpectedly shift its end. Custom peak/lunch/day hours restore while editing the panel.
- Meeting caps and edited task durations no longer turn empty text into zero/15 or persist invalid
  estimates. Task minimum chunks shrink with a shortened estimate. Required task/blackout names
  can be edited locally without persisting empty names. Correcting a preview estimate after clearing
  it now recovers its minimum chunk and re-enables confirmation.
- Removed misleading automatic-overflow controls: hard constraints stay protected and the Plan
  Report is the explicit path for trade-offs. Slider bounds now cover the actual preference schema.

Evidence: lint/typecheck; 230 tests across 54 suites; production build; Chromium landing checks at
320/390/768/900/1024/1280/1440px and planner/Rules checks at 320/390/768/1280px. Browser regressions
cover Space-key switches, state restoration, master/individual weekends, invalid cap recovery,
switch thumb containment/on-off fill, 44px field geometry, no page overflow, and existing calendar,
preview/discard, move failure/retry, export/publish and stale-state flows. This is not a claim of
exhaustive device/browser coverage or live Google/provider verification.
