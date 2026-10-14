import { z } from 'zod'

/**
 * Paperweek domain types.
 *
 * `zod` schemas are the single source of truth (RULES.md §6); TypeScript types are inferred.
 * Time is represented as *local wall-clock minutes from midnight* for scheduling, and serialised
 * at the boundary as `date` (yyyy-MM-dd) + `startMin` / `endMin`. No timezone math happens inside
 * the placement loop (MEMORY.md §5.8).
 */

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const weekdaySchema = z.enum(WEEKDAYS)

export const MINUTES_PER_DAY = 24 * 60
/** Granularity all blocks snap to (INV-5). */
export const SNAP_MINUTES = 15
export const DEFAULT_MIN_BLOCK = 30
export const MAX_ESTIMATE_MINUTES = 720

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export const energySchema = z.enum(['deep', 'light', 'admin', 'social', 'physical'])
export type Energy = z.infer<typeof energySchema>

export const categorySchema = z.enum(['work', 'study', 'health', 'life', 'admin', 'creative'])
export type Category = z.infer<typeof categorySchema>

export const prioritySchema = z.enum(['P0', 'P1', 'P2', 'P3'])
export type Priority = z.infer<typeof prioritySchema>

export const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

/**
 * Deadlines and earliest-starts are *local wall-clock* instants ("2026-10-15T17:00:00") because the
 * engine schedules in wall-clock minutes and never does timezone maths inside the placement loop
 * (MEMORY.md §5.8). `z.string().datetime()` would reject those, so validity is checked by parsing:
 * both wall-clock and UTC ("…Z") forms pass, garbage does not.
 */
export const wallClockSchema = z
  .string()
  .min(16)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'Invalid ISO datetime' })

export const recurrenceSchema = z.object({
  byWeekday: z.array(weekdaySchema).min(1).max(7),
  interval: z.number().int().min(1).max(8).default(1),
  count: z.number().int().min(1).max(60).optional(),
  until: z.string().max(40).optional(),
  /** ISO date of the first occurrence week; interval parity is measured from here. */
  anchorWeek: z.string().max(40).optional(),
})
export type Recurrence = z.infer<typeof recurrenceSchema>

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  notes: z.string().max(1200).optional(),
  estimateMinutes: z.number().int().min(SNAP_MINUTES).max(MAX_ESTIMATE_MINUTES),
  /** Final chunk must end at or before this instant (INV-3). */
  deadline: wallClockSchema.optional(),
  /** No chunk may start before this (INV-4). */
  earliestStart: wallClockSchema.optional(),
  priority: prioritySchema,
  energy: energySchema,
  category: categorySchema,
  splittable: z.boolean(),
  minChunkMinutes: z.number().int().min(SNAP_MINUTES).max(240).default(DEFAULT_MIN_BLOCK),
  location: z.string().max(80).optional(),
  /** e.g. ['mon','wed','fri'] for "review PRs three times this week". */
  repeatDays: z.array(weekdaySchema).max(7).optional(),
  /**
   * A within-the-week recurrence, in the spirit of RRULE (T-601):
   *   `byWeekday` — which days; `interval` — every N weeks, counted from `anchorWeek`;
   *   `count` — stop after N occurrences; `until` — stop after this date (inclusive).
   *
   * The engine plans one week at a time (see T-603), so `interval` decides whether *this* week is an
   * occurrence week, and the rest of the fields choose which days inside it. That is deliberately
   * narrower than RFC 5545, and honest about it: a task is never silently shifted into next week.
   */
  recurrence: recurrenceSchema.optional(),
  /** Prerequisites: this task is not scheduled before they finish (T-602). */
  dependsOn: z.array(z.string()).max(20).optional(),
  source: z.enum(['user', 'agent', 'demo']).default('user'),
  /** True when the duration was inferred rather than stated (FR-1.3). */
  estimatedByAI: z.boolean().optional(),
})
export type Task = z.infer<typeof taskSchema>

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

export const dayHoursSchema = z
  .object({ start: z.number().int().min(0).max(MINUTES_PER_DAY), end: z.number().int().min(0).max(MINUTES_PER_DAY) })
  .nullable()

export const focusPeakSchema = z.union([
  z.enum(['morning', 'afternoon', 'evening']),
  z.object({ start: z.number().int(), end: z.number().int() }),
])

export const blackoutSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(60),
  weekday: weekdaySchema.optional(),
  start: z.number().int().min(0).max(MINUTES_PER_DAY),
  end: z.number().int().min(0).max(MINUTES_PER_DAY),
})

export const preferencesSchema = z.object({
  timezone: z.string().min(1).default('UTC'),
  weekStartsOn: weekdaySchema.default('mon'),
  workingHours: z.record(weekdaySchema, dayHoursSchema),
  focusPeak: focusPeakSchema.default('morning'),
  energyTrough: z.object({ start: z.number().int(), end: z.number().int() }).optional(),
  lunch: z
    .object({ start: z.number().int(), end: z.number().int(), minutes: z.number().int() })
    .nullable()
    .default({ start: 12 * 60 + 30, end: 13 * 60 + 30, minutes: 45 }),
  bufferMinutes: z.number().int().min(0).max(60).default(10),
  minBlockMinutes: z.number().int().min(SNAP_MINUTES).max(180).default(DEFAULT_MIN_BLOCK),
  maxDeepWorkMinutesPerDay: z.number().int().min(60).max(600).default(300),
  maxPlannedMinutesPerDay: z.number().int().min(60).max(900).default(480),
  blackouts: z.array(blackoutSchema).default([]),
  weekendMode: z.enum(['off', 'light', 'normal']).default('off'),
  /**
   * When the week cannot hold everything, which compromise should the engine reach for first?
   * `shoulder` — start before/end after working hours · `longer-days` — exceed the daily cap ·
   * `weekend` — open weekend morning. The ladder always tries the others afterwards.
   */
  overflowPreference: z.enum(['shoulder', 'longer-days', 'weekend']).default('shoulder'),
})
export type Preferences = z.infer<typeof preferencesSchema>
export type DayHours = z.infer<typeof dayHoursSchema>
export type Blackout = z.infer<typeof blackoutSchema>

/* ------------------------------------------------------------------ *
 * Busy events (existing reality we must plan around)
 * ------------------------------------------------------------------ */

export const busyEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  startMin: z.number().int(),
  endMin: z.number().int(),
  source: z.enum(['google', 'demo', 'manual']),
})
export type BusyEvent = z.infer<typeof busyEventSchema>

/* ------------------------------------------------------------------ *
 * Placed blocks + reasons
 * ------------------------------------------------------------------ */

export const REASON_CODES = [
  'energy-peak',
  'energy-match',
  'energy-trough',
  'deadline-headroom',
  'deadline-tight',
  'deadline-protected',
  'contiguous',
  'day-balance',
  'low-fragmentation',
  'buffer-preserved',
  'lunch-protected',
  'context-batch',
  'early-in-week',
  'morning-protected',
  'pinned',
  'after-dependency',
  'split-to-fit',
  'spillover',
  'over-capacity',
  'deadline-risk',
  'no-fit',
] as const
export const reasonCodeSchema = z.enum(REASON_CODES)
export type ReasonCode = z.infer<typeof reasonCodeSchema>

export const reasonSchema = z.object({
  code: reasonCodeSchema,
  label: z.string(),
  detail: z.string().optional(),
  weight: z.number().optional(),
})
export type Reason = z.infer<typeof reasonSchema>

export const blockKindSchema = z.enum(['task', 'break', 'lunch', 'ritual'])
export type BlockKind = z.infer<typeof blockKindSchema>

export const blockConflictSchema = z.enum(['deadline-risk', 'over-capacity', 'displaced'])
export type BlockConflict = z.infer<typeof blockConflictSchema>

export const placedBlockSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  kind: blockKindSchema,
  date: z.string(),
  dayIndex: z.number().int().min(0).max(6),
  weekday: weekdaySchema,
  startMin: z.number().int(),
  endMin: z.number().int(),
  minutes: z.number().int(),
  priority: prioritySchema,
  energy: energySchema,
  category: categorySchema,
  location: z.string().optional(),
  chunkIndex: z.number().int(),
  chunkCount: z.number().int(),
  reasonText: z.string(),
  reasons: z.array(reasonSchema),
  score: z.number(),
  pinned: z.boolean(),
  conflict: blockConflictSchema.optional(),
})
export type PlacedBlock = z.infer<typeof placedBlockSchema>

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

export const warningSchema = z.object({
  code: z.enum([
    'fragmentation',
    'no-break-day',
    'marathon',
    'deadline-cliff',
    'back-to-back',
    'over-capacity',
    'weekend-used',
    'context-thrash',
    'pin-ignored',
    'dependency-unmet',
  ]),
  severity: z.enum(['info', 'warn', 'critical']),
  message: z.string(),
  weekday: weekdaySchema.optional(),
})
export type Warning = z.infer<typeof warningSchema>

export const tradeoffOptionSchema = z.object({
  id: z.string(),
  kind: z.enum(['defer', 'shorten', 'split', 'drop', 'extend-hours', 'use-weekend']),
  taskId: z.string(),
  label: z.string(),
  consequence: z.string(),
  minutesRecovered: z.number().int(),
})
export type TradeoffOption = z.infer<typeof tradeoffOptionSchema>

export const agentStepSchema = z.object({
  tool: z.string(),
  label: z.string(),
  detail: z.string().optional(),
  ms: z.number().int().optional(),
})
export type AgentStep = z.infer<typeof agentStepSchema>

export const dayLoadSchema = z.object({
  weekday: weekdaySchema,
  date: z.string(),
  capacityMinutes: z.number().int(),
  plannedMinutes: z.number().int(),
  deepMinutes: z.number().int(),
  meetingMinutes: z.number().int(),
  blocks: z.number().int(),
})
export type DayLoad = z.infer<typeof dayLoadSchema>

export const planReportSchema = z.object({
  fits: z.enum(['fits', 'tight', 'overbooked']),
  capacityMinutes: z.number().int(),
  demandMinutes: z.number().int(),
  scheduledMinutes: z.number().int(),
  meetingMinutes: z.number().int(),
  utilisation: z.number(),
  placedCount: z.number().int(),
  unplacedCount: z.number().int(),
  unscheduled: z.array(
    z.object({ taskId: z.string(), title: z.string(), minutes: z.number().int(), why: z.string() }),
  ),
  deadlineRisks: z.array(
    z.object({
      taskId: z.string(),
      title: z.string(),
      deadline: z.string(),
      scheduledMinutes: z.number().int(),
      requiredMinutes: z.number().int(),
      severity: z.enum(['warn', 'critical']),
    }),
  ),
  warnings: z.array(warningSchema),
  /**
   * Task ids whose pins could not be honoured (D-014). Structured, not just prose in `warnings`, so
   * the client can retire a pin it can no longer keep instead of re-sending it forever.
   */
  droppedPins: z.array(z.string()).default([]),
  perDay: z.array(dayLoadSchema),
  tradeoffs: z.array(tradeoffOptionSchema),
  headline: z.string(),
})
export type PlanReport = z.infer<typeof planReportSchema>

/* ------------------------------------------------------------------ *
 * Proposal (the deliverable of the engine)
 * ------------------------------------------------------------------ */

export const pinSchema = z.object({
  taskId: z.string(),
  date: z.string(),
  startMin: z.number().int(),
  minutes: z.number().int(),
})
export type Pin = z.infer<typeof pinSchema>

export const planProposalSchema = z.object({
  weekStart: z.string(),
  weekLabel: z.string(),
  blocks: z.array(placedBlockSchema),
  report: planReportSchema,
  busy: z.array(busyEventSchema),
  tasks: z.array(taskSchema),
  preferences: preferencesSchema,
  pins: z.array(pinSchema),
  engine: z.enum(['deterministic', 'agent']),
  generatedAt: z.string(),
})
export type PlanProposal = z.infer<typeof planProposalSchema>

/* ------------------------------------------------------------------ *
 * API contracts
 * ------------------------------------------------------------------ */

export const planModeSchema = z.enum(['auto', 'agent', 'local'])
export type PlanMode = z.infer<typeof planModeSchema>

export const planRequestSchema = z.object({
  tasks: z.array(taskSchema).max(120),
  preferences: preferencesSchema,
  busy: z.array(busyEventSchema).max(200).default([]),
  pins: z.array(pinSchema).max(120).default([]),
  weekStart: z.string().optional(),
  /** ISO instant used for urgency maths. Injected so the engine stays deterministic (L6). */
  now: z.string().optional(),
  instruction: z.string().max(600).optional(),
  mode: planModeSchema.default('auto'),
  provider: z.string().optional(),
})
export type PlanRequest = z.infer<typeof planRequestSchema>

export const blockSnapshotSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  date: z.string(),
  startMin: z.number().int(),
  minutes: z.number().int(),
})
export type BlockSnapshot = z.infer<typeof blockSnapshotSchema>

export const chatRequestSchema = planRequestSchema.extend({
  message: z.string().min(1).max(1000),
  /** The plan the client is looking at, so the reply can say what moved. */
  previousBlocks: z.array(blockSnapshotSchema).max(200).optional(),
  previousPreferences: preferencesSchema.optional(),
  /** When set, the agent explains this block instead of replanning the week. */
  explainBlockId: z.string().optional(),
})
export type ChatRequest = z.infer<typeof chatRequestSchema>

export const planResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    proposal: planProposalSchema,
    provider: z.string(),
    mode: z.enum(['agent', 'local']),
    trace: z.array(agentStepSchema),
    notes: z.array(z.string()),
  }),
})
export type PlanResponse = z.infer<typeof planResponseSchema>

export const chatResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    proposal: planProposalSchema,
    reply: z.string(),
    changes: z.array(z.string()),
    tasks: z.array(taskSchema),
    preferences: preferencesSchema,
    trace: z.array(agentStepSchema),
    provider: z.string(),
  }),
})
export type ChatResponse = z.infer<typeof chatResponseSchema>

export const syncRequestSchema = z.object({
  proposal: planProposalSchema,
  approvedBlockIds: z.array(z.string()).min(1),
  dryRun: z.boolean().default(true),
  calendarId: z.string().default('primary'),
})
export type SyncRequest = z.infer<typeof syncRequestSchema>

export const syncResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    dryRun: z.boolean(),
    inserted: z.number().int(),
    updated: z.number().int(),
    skipped: z.number().int(),
    failed: z.array(z.object({ blockId: z.string(), code: z.string(), message: z.string() })),
    conflicts: z.array(z.object({ blockId: z.string(), title: z.string(), detail: z.string() })),
    payloads: z
      .array(z.object({ blockId: z.string(), summary: z.string(), start: z.string(), end: z.string() }))
      .optional(),
  }),
})
export type SyncResult = z.infer<typeof syncResultSchema>

/* ------------------------------------------------------------------ *
 * Small helpers shared across the app
 * ------------------------------------------------------------------ */

export const PRIORITY_TONE: Record<Priority, 'rose' | 'terracotta' | 'olive' | 'kraft'> = {
  P0: 'rose',
  P1: 'terracotta',
  P2: 'olive',
  P3: 'kraft',
}

export const ENERGY_ACCENT: Record<Energy, 'teal' | 'olive' | 'kraft' | 'plum' | 'terracotta'> = {
  deep: 'teal',
  light: 'olive',
  admin: 'kraft',
  social: 'plum',
  physical: 'terracotta',
}

export const ENERGY_LABEL: Record<Energy, string> = {
  deep: 'Deep work',
  light: 'Light work',
  admin: 'Admin',
  social: 'Social',
  physical: 'Physical',
}

export const CATEGORY_LABEL: Record<Category, string> = {
  work: 'Work',
  study: 'Study',
  health: 'Health',
  life: 'Life',
  admin: 'Admin',
  creative: 'Creative',
}
