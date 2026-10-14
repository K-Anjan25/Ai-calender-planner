# Paperweek — Engineering Rules

| Field | Value |
| --- | --- |
| Document | Rules (binding) |
| Version | 1.0 |
| Last updated | 2026-10-14 |
| Related | `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `TASK.md`, `MEMORY.md` |

> These rules are **binding**, not aspirational. A change that violates one is rejected in review
> unless `MEMORY.md` records an explicit, dated decision to amend the rule.

---

## 1. Non-negotiables (the eight laws)

| # | Law | Rationale |
| --- | --- | --- |
| **L1** | **The engine owns time.** No component, route, or model writes a `start`/`end` that did not come from `lib/scheduler`. | LLMs hallucinate timestamps; arithmetic must be testable. |
| **L2** | **Never write to a real calendar without explicit approval.** `approvedBlockIds[]` is required on every sync call. | Irreversible user-facing side effect. |
| **L3** | **Every plan is explainable.** A block with an empty `reasons[]` is a bug. | Trust is the product (PRD G2). |
| **L4** | **No silent loss.** Minutes placed + minutes unscheduled = minutes demanded (INV-6). | The whole point is telling the truth about capacity. |
| **L5** | **Degrade, never break.** Every optional integration has a working fallback path. | The demo must always run. |
| **L6** | **Deterministic scheduling.** No `Date.now()`, `Math.random()`, or locale-dependent comparison inside `lib/scheduler/*`. | INV-7 idempotence. |
| **L7** | **Validate at the boundary.** Every route handler parses its body with zod before use. | Untrusted input never reaches the engine. |
| **L8** | **Paper, not plastic.** Visual tokens come from `DESIGN.md` only. No bare hex, no default Tailwind palette, no pure black, no flat shadows. | The design *is* the differentiator. |

## 2. Language & tooling

- **TypeScript strict.** `strict: true`, `noUncheckedIndexedAccess` on. `any` is banned; use `unknown` + narrowing. `@ts-expect-error` requires a comment justifying it.
- **Node 20+**, ESM, Next.js 15 App Router, React 19.
- **Path aliases:** `@/lib/*`, `@/components/*`, `@/app/*`. No `../../../` chains.
- **Package manager:** npm. Lockfile committed.
- **Lint must pass** (`npm run lint`) and **build must pass** (`npm run build`) before a task is marked done in `TASK.md`.
- **Tests must pass** (`npm test`). `tests/scheduler.test.ts` is the executable form of INV-1…INV-8: if a change requires editing an invariant assertion, it needs a `MEMORY.md` ADR explaining why the old behaviour was wrong.

## 3. Naming & structure

| Thing | Convention | Example |
| --- | --- | --- |
| React component file | `PascalCase.tsx` | `WeekGrid.tsx` |
| Non-component module | `kebab-case.ts` | `planner-agent.ts` |
| Type / interface | `PascalCase`, no `I` prefix | `PlanProposal` |
| Zod schema | `camelCase` + `Schema` | `taskSchema` |
| Constant | `SCREAMING_SNAKE` | `WEIGHTS`, `SLOT_MINUTES` |
| Booleans | `is/has/can/should` prefix | `isPinned`, `hasConflict` |
| Server-only module | suffix or guard | `import 'server-only'` where secrets are touched |

One responsibility per file. A file over ~350 lines is a signal to split, not a hard error.

## 4. Layer discipline

```
app/*  →  components/*  →  store/*  →  lib/{agent,google}  →  lib/scheduler  →  lib/types
```

- **`lib/scheduler/*` may import only `lib/types.ts` and `date-fns`.** No React, no `fetch`, no `next/*`, no LLM SDK, no `fs`. This is what makes it testable and trustworthy.
- **`components/*` must not contain scheduling logic.** If a component needs to know whether something fits, ask the engine.
- **`lib/*` must never import from `app/*` or `components/*`.** Inward only.
- Server-only code (`lib/google/*`, agent providers) must never be imported by a client component. Secrets stay in route handlers.

## 5. Scheduler rules

- Hard constraints (INV-2/3/4/5) are checked in a single `isFeasible()` gate — never duplicated as scattered `if`s.
- Scores are **weights × normalised signals**, all raw signals clamped to `[0,1]`. Adding a signal means adding a weight in `WEIGHTS` and a matching reason code. Never a naked magic number inside a comparison.
- **Ties break deterministically:** `taskId` ascending, then `start` ascending, then `chunkIndex`. Never rely on `Object.keys` or `Map` iteration order for correctness.
- Every placement writes its reason codes from the same code path that wrote the score (L3 + §5.3 of the architecture doc).
- Repair passes are bounded: max 3 iterations, then escalate down the ladder. No unbounded `while` loops.
- The engine returns a `PlanProposal`; it never mutates its inputs (clone, then build).

## 6. Type & data rules

- **zod is the source of truth.** Declare `const xSchema = z.object({...})`, then `type X = z.infer<typeof xSchema>`. Never hand-write a type that duplicates a schema.
- Times are **ISO 8601 strings** at the boundary (serialisable, JSON-safe); converted to `Date` only inside the engine. No `Date` objects in React props or store state.
- Durations are **integer minutes**, never hours-with-decimals.
- Weekdays are the literal union `'mon'|'tue'|…|'sun'`. No numeric weekday indices outside `slots.ts`.
- Discriminated unions for state machines: `{status:'idle'|'parsing'|'planning'|'ready'|'error'}` — never parallel boolean flags.
- Optional fields are `?:`; never encode absence as `null` unless the schema says so deliberately.

## 7. Agent rules

- **The agent may not invent a time** (L1). Its structured output schema contains no `start`/`end`/`minute` fields. If a future feature needs one, it must come from a tool result and be passed through verbatim.
- The agent may not loop more than **6 tool steps**; exceeding the budget returns the best plan so far with a trace.
- Every tool has a zod input schema and a json-serialisable output. Tool results are trimmed to the fields the model needs (cost control).
- Schema validation failure → **one** repair round trip → deterministic fallback. Never retry blindly more than once.
- Prompts live in `lib/agent/prompts.ts` as exported template strings. No inline prompt text scattered in tools.
- Provider failures are caught and converted into `{ ok:false, reason }` — they must never throw out of a route handler.
- **Demo mode is a first-class implementation**, not a stub. It must satisfy the same contract as a live provider and is the default in tests.
- Never log user task text in production. Log counts, ids, durations, and error codes.

## 8. Calendar rules

- Scopes are exactly `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/calendar.readonly`. Asking for more requires a PRD amendment.
- Tokens: server-side only, `httpOnly` + `sameSite=lax`, never serialised to the client.
- Every written event carries `extendedProperties.private.paperweekBlockId` — **upsert, never blind insert**.
- Re-verify availability with `freebusy.query` immediately before writing; on drift return `409` with the conflicting blocks instead of writing.
- `dryRun: true` must return the exact payloads that would be sent, byte-for-byte — and must work with **no** Google configuration and no connected account, because the preview is what the user approves against.
- A partial failure returns `failed[]` per block and **never** discards successful writes or the local plan.
- All-day events and multi-day events are treated as busy for the whole span they cover.

## 9. API rules

- Route handlers are thin: **validate (zod) → orchestrate → shape response**. No algorithm bodies.
- Response envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, detail? } }`. Never a bare array.
- Error codes are stable `SCREAMING_SNAKE` strings (`INVALID_BODY`, `PROVIDER_UNAVAILABLE`, `CALENDAR_NOT_CONNECTED`, `CALENDAR_DRIFT`, `RATE_LIMITED`) — the UI switches on codes, never on message text.
- Never leak stack traces or provider payloads to the client. Log server-side, return the code.
- Set an explicit timeout on every outbound call (LLM 20 s, Google 10 s).
- No secrets in responses, ever — not even a masked prefix.

## 10. UI rules

- **Server Components by default**; add `'use client'` only where interaction demands it, as deep in the tree as possible.
- No `useEffect` for derived state. Derive during render; memoise only with measured need.
- One source of truth for layout constants and tokens (`globals.css` `@theme`) — never a hardcoded `#hex` or `px` shadow in JSX.
- All interactive elements are real elements: `<button>`, `<a>`, `<input>`. No `div` with `onClick`.
- Every action is keyboard-reachable and has a visible focus ring.
- Grid blocks are focusable and labelled for screen readers: `role="button"` + `aria-label="Design review, Tuesday 9:00 to 10:30, deep work, pinned"`.
- Respect `prefers-reduced-motion` — animations collapse to opacity-only or none. See `DESIGN.md` §7.
- Text contrast ≥ 4.5:1 on paper surfaces; never place `ink-faint` on `paper-sand` for body copy.
- Loading states are **paper skeletons** (cut-out placeholders), never spinners alone.

## 11. Scope & process rules

- Non-goals in `PRD.md` §3 are enforced. A PR adding team scheduling, time tracking, or native mobile is rejected.
- One concern per commit; conventional message (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`).
- Docs are part of the change: behaviour changes update `PRD.md`/`ARCHITECTURE.md`; a design decision gets an ADR entry in `MEMORY.md`.
- `TASK.md` is the ledger. Mark status as you go; never mark `done` without lint + build passing.
- Deleting or weakening an invariant requires a dated amendment in `MEMORY.md` §Decisions.
- Every new dependency must be justified in one line in the PR/MEMORY — no decorative packages.

## 12. Anti-patterns (explicitly banned)

| Banned | Why |
| --- | --- |
| `new Date()` inside the engine | Breaks determinism (L6). Pass `now` in. |
| Scheduling logic in a component | Two sources of truth for time. |
| `any`, `as unknown as X` casts to silence errors | Hides real breakage. |
| Nested ternaries in JSX | Unreadable; use early returns or a lookup map. |
| `margin`-based spacing to fake layering | Use the paper elevation tokens so shadows stay consistent. |
| Pure black text (`#000`) or default Tailwind grays | Wrong material (L8). |
| Silently dropping a task that does not fit | Violates L4. Report it. |
| Auto-syncing to Google "to be helpful" | Violates L2. |
| A spinner with no skeleton | Feels like a web app, not a paper object. |
| Client-side secrets or tokens | Security. |
