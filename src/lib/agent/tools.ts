import { z } from 'zod'
import {
  SNAP_MINUTES,
  blockConflictSchema,
  busyEventSchema,
  pinSchema,
  planProposalSchema,
  preferencesSchema,
  prioritySchema,
  energySchema,
  categorySchema,
  taskSchema,
  weekdaySchema,
  type AgentStep,
  type BusyEvent,
  type Pin,
  type PlanProposal,
  type Preferences,
  type Task,
} from '@/lib/types'
import { generatePlan } from '@/lib/scheduler/engine'
import { evaluatePlan } from '@/lib/scheduler/score'
import { buildWeekFrame, fmtClock, fmtDuration } from '@/lib/scheduler/slots'
import { totalDemandMinutes } from '@/lib/scheduler/policies'
import { formatBlockContext } from '@/lib/agent/prompts'

/**
 * Agent tools (`ARCHITECTURE.md` §6.1).
 *
 * Every tool here is a thin, zod-validated wrapper around the deterministic engine. That is the
 * point: language understanding enters through `parse_tasks` / `revise_plan` (whose *arguments* the
 * model produces), and time leaves only through `build_schedule` (whose *results* the engine owns).
 */

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

/** A task as the model supplies it: no id, no source, duration optional. */
export const rawTaskSchema = taskSchema
  .omit({ id: true, source: true, estimatedByAI: true })
  .partial({ estimateMinutes: true, priority: true, energy: true, category: true, splittable: true, minChunkMinutes: true })
  .extend({
    title: z.string().min(2).max(160),
    estimateMinutes: z.number().int().min(SNAP_MINUTES).max(720).optional(),
  })

export const parseTasksInputSchema = z.object({
  tasks: z.array(rawTaskSchema).max(60),
  notes: z.array(z.string().max(200)).max(10).optional(),
})

export const buildScheduleInputSchema = z.object({
  tasks: z.array(taskSchema).max(120).optional(),
  preferences: preferencesSchema.optional(),
  busy: z.array(busyEventSchema).max(200).optional(),
  pins: z.array(pinSchema).max(120).optional(),
  weekStart: z.string().optional(),
  rationale: z.string().max(400).optional(),
})

export const critiqueInputSchema = z.object({
  proposal: planProposalSchema.optional(),
})

export const reviseInputSchema = z.object({
  tasks: z.array(taskSchema).max(120).optional(),
  preferences: preferencesSchema.optional(),
  pins: z.array(pinSchema).max(120).optional(),
  rationale: z.string().max(400).optional(),
})

export const explainInputSchema = z.object({
  blockId: z.string().min(1),
  proposal: planProposalSchema.optional(),
})

export const estimateInputSchema = z.object({
  title: z.string().min(2).max(160),
  category: categorySchema.optional(),
  energy: energySchema.optional(),
})

export const TOOL_NAMES = [
  'parse_tasks',
  'build_schedule',
  'critique_plan',
  'revise_plan',
  'explain_block',
  'estimate_duration',
] as const
export type ToolName = (typeof TOOL_NAMES)[number]

export const TOOL_LABELS: Record<ToolName, string> = {
  parse_tasks: 'Reading your tasks',
  build_schedule: 'Building the week',
  critique_plan: 'Checking what does not fit',
  revise_plan: 'Rebuilding with your changes',
  explain_block: 'Explaining a block',
  estimate_duration: 'Estimating a duration',
}

/* ------------------------------------------------------------------ *
 * Interpreters — the only place a model's language output enters the system
 * ------------------------------------------------------------------ */

export type RawTask = z.infer<typeof rawTaskSchema>

export type InterpreterContext = {
  nowISO: string
  weekStartDate: string
  timezone: string
  existingTasks: Task[]
  existingPreferences: Preferences
}

export type ParsedTasks = { tasks: Task[]; notes: string[] }

export type InterpretedMessage = {
  tasks?: Task[]
  preferences?: Preferences
  pins?: Pin[]
  changes: string[]
  reply: string
}

export type Outcome = {
  kind: 'parse' | 'patch' | 'explanation'
  tasks?: Task[]
  preferences?: Preferences
  pins?: Pin[]
  changes?: string[]
  reply?: string
  notes?: string[]
}

/** Language work, supplied either by a live model or by the local reasoner (D-004). */
export type Interpreter = {
  parseTasks(text: string, ctx: InterpreterContext): Promise<ParsedTasks>
  interpretMessage(message: string, ctx: InterpreterContext): Promise<InterpretedMessage>
  explainBlock(context: string): Promise<string>
}

/* ------------------------------------------------------------------ *
 * Deterministic helpers the tools share
 * ------------------------------------------------------------------ */

/** Duration heuristics used when the user (or the model) did not state one (FR-1.3). */
export function estimateDurationMinutes(title: string, energy?: Task['energy'], category?: Task['category']): number {
  const text = title.toLowerCase()
  const rules: [RegExp, number][] = [
    [/quick|reply|rsvp|confirm|ping|standup/, 15],
    [/email|inbox|expenses|invoice|expense|book|order|renew|form/, 30],
    [/review|pr\b|pull request|check|read/, 45],
    [/prep|plan|outline|agenda|1:?1|sync|update/, 45],
    [/call|meeting|interview|catch ?up|chat/, 60],
    [/gym|run|walk|swim|yoga|workout|climb/, 45],
    [/grocer|shop|errand|clean|laundry|appointment|dentist|doctor/, 60],
    [/write|draft|spec|proposal|report|doc/, 120],
    [/design|build|implement|refactor|migrate/, 180],
    [/deck|presentation|slides|pitch/, 180],
    [/study|course|read|thesis|chapter|module|revise/, 120],
    [/launch|migrat|audit|research|analyse|analyze|synthes/, 240],
  ]
  for (const [pattern, minutes] of rules) {
    if (pattern.test(text)) return minutes
  }
  if (energy === 'deep') return 90
  if (energy === 'admin') return 30
  if (energy === 'physical') return 45
  if (category === 'health') return 45
  return 60
}

/** Turn the model's raw arguments into canonical tasks: ids, defaults, inferred flags. */
export function normaliseTasks(
  raw: RawTask[],
  ctx: { nowISO: string; existingTasks: Task[] },
): { tasks: Task[]; notes: string[] } {
  const notes: string[] = []
  const existing = new Set(ctx.existingTasks.map((t) => t.id))
  const tasks: Task[] = []
  let counter = 0
  for (const item of raw) {
    counter += 1
    let id = `t_${slug(item.title)}`
    while (existing.has(id)) {
      counter += 1
      id = `t_${slug(item.title)}_${counter}`
    }
    existing.add(id)
    const inferred = item.estimateMinutes === undefined
    const minutes = item.estimateMinutes ?? estimateDurationMinutes(item.title, item.energy, item.category)
    if (inferred) notes.push(`Estimated “${item.title}” at ${fmtDuration(minutes)} — change it if that is off.`)
    tasks.push({
      id,
      title: item.title,
      notes: item.notes,
      estimateMinutes: minutes,
      deadline: item.deadline,
      earliestStart: item.earliestStart,
      priority: item.priority ?? 'P2',
      energy: item.energy ?? 'light',
      category: item.category ?? 'work',
      splittable: item.splittable ?? minutes >= 120,
      minChunkMinutes: item.minChunkMinutes ?? (item.energy === 'deep' ? 60 : 30),
      location: item.location,
      repeatDays: item.repeatDays,
      dependsOn: item.dependsOn,
      source: 'agent',
      estimatedByAI: inferred || undefined,
    })
  }
  return { tasks, notes }
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

export type ScheduleContext = {
  tasks: Task[]
  preferences: Preferences
  busy: BusyEvent[]
  pins: Pin[]
  weekStartDate: string
  nowISO: string
}

/* ------------------------------------------------------------------ *
 * The toolkit
 * ------------------------------------------------------------------ */

export type Critique = {
  fits: PlanProposal['report']['fits']
  headline: string
  unscheduled: PlanProposal['report']['unscheduled']
  deadlineRisks: PlanProposal['report']['deadlineRisks']
  warnings: PlanProposal['report']['warnings']
  tradeoffs: PlanProposal['report']['tradeoffs']
  perDay: PlanProposal['report']['perDay']
}

export type Toolkit = {
  readonly context: ScheduleContext
  readonly trace: AgentStep[]
  readonly proposal: PlanProposal | null
  readonly outcome: Outcome
  parse_tasks(input: { tasks: RawTask[]; notes?: string[] }): Promise<Outcome>
  build_schedule(input?: { rationale?: string }): Promise<Outcome>
  critique_plan(): Promise<Critique>
  revise_plan(input: { tasks?: Task[]; preferences?: Preferences; pins?: Pin[]; rationale?: string }): Promise<Outcome>
  explain_block(input: { blockId: string }): Promise<Outcome>
  estimate_duration(input: { title: string; category?: Task['category']; energy?: Task['energy'] }): Promise<Outcome>
}

function pushTrace(trace: AgentStep[], tool: ToolName, label: string, detail: string | undefined, startedAt: number) {
  trace.push({ tool, label, detail: detail?.slice(0, 180), ms: Math.max(1, Date.now() - startedAt) })
}

export function createToolkit(input: { context: ScheduleContext; interpreter: Interpreter; traces?: AgentStep[] }): Toolkit {
  const traces = input.traces ?? []
  let context: ScheduleContext = { ...input.context }
  let proposal: PlanProposal | null = null
  let outcome: Outcome = { kind: 'patch' }

  const setProposal = (next: PlanProposal) => {
    proposal = next
    return next
  }

  const schedule = (rationale: string | undefined, tool: ToolName, label: string, started: number) => {
    const next = setProposal(
      generatePlan({
        tasks: context.tasks,
        preferences: context.preferences,
        busy: context.busy,
        pins: context.pins,
        nowISO: context.nowISO,
        weekStartDate: context.weekStartDate,
        engine: 'agent',
        generatedAt: context.nowISO,
      }),
    )
    pushTrace(
      traces,
      tool,
      label,
      rationale ?? `${next.report.placedCount} blocks · ${next.report.headline}`,
      started,
    )
    return next
  }

  const toolkit: Toolkit = {
    get context() {
      return context
    },
    get trace() {
      return traces
    },
    get proposal() {
      return proposal
    },
    get outcome() {
      return outcome
    },

    async parse_tasks(args) {
      const started = Date.now()
      const normalised = normaliseTasks(args.tasks, {
        nowISO: context.nowISO,
        existingTasks: context.tasks,
      })
      // Merge with what we already have: re-parsing should update, never duplicate.
      context = { ...context, tasks: mergeTasks(context.tasks, normalised.tasks) }
      const notes = [...(args.notes ?? []), ...normalised.notes]
      outcome = { kind: 'parse', tasks: context.tasks, notes }
      pushTrace(
        traces,
        'parse_tasks',
        `Read ${normalised.tasks.length} task${normalised.tasks.length === 1 ? '' : 's'}`,
        notes[0],
        started,
      )
      return outcome
    },

    async build_schedule(args = {}) {
      const started = Date.now()
      schedule(args.rationale, 'build_schedule', `Scheduled ${context.tasks.length} tasks`, started)
      outcome = { kind: 'patch' }
      return outcome
    },

    async critique_plan() {
      const started = Date.now()
      const current = requireProposal(proposal)
      const { report } = current
      const problems = report.unplacedCount + report.deadlineRisks.length
      pushTrace(
        traces,
        'critique_plan',
        problems === 0 ? 'Week holds together' : `Found ${problems} problem${problems === 1 ? '' : 's'}`,
        report.headline,
        started,
      )
      return {
        fits: report.fits,
        headline: report.headline,
        unscheduled: report.unscheduled,
        deadlineRisks: report.deadlineRisks,
        warnings: report.warnings,
        tradeoffs: report.tradeoffs,
        perDay: report.perDay,
      }
    },

    async revise_plan(args) {
      const started = Date.now()
      context = {
        ...context,
        tasks: args.tasks ?? context.tasks,
        preferences: args.preferences ? { ...context.preferences, ...args.preferences } : context.preferences,
        pins: args.pins ?? context.pins,
      }
      const next = schedule(args.rationale, 'revise_plan', 'Rebuilt the week', started)
      outcome = { kind: 'patch', tasks: context.tasks, preferences: context.preferences, pins: context.pins }
      void next
      return outcome
    },

    async explain_block(args) {
      const started = Date.now()
      const current = requireProposal(proposal)
      const block = current.blocks.find((b) => b.id === args.blockId)
      if (!block) {
        pushTrace(traces, 'explain_block', 'Block not found', args.blockId, started)
        outcome = { kind: 'explanation', reply: 'That block is not in the current plan.' }
        return outcome
      }
      const explanation = await input.interpreter.explainBlock(formatBlockContext(block, current.blocks))
      pushTrace(traces, 'explain_block', `Explained \u201c${block.title}\u201d`, undefined, started)
      outcome = { kind: 'explanation', reply: explanation }
      return outcome
    },

    async estimate_duration(args) {
      const started = Date.now()
      const minutes = estimateDurationMinutes(args.title, args.energy, args.category)
      pushTrace(traces, 'estimate_duration', `Estimated ${fmtDuration(minutes)}`, args.title, started)
      outcome = { kind: 'explanation', reply: `${args.title}: about ${fmtDuration(minutes)}.` }
      return outcome
    },
  }

  return toolkit
}

function requireProposal(proposal: PlanProposal | null): PlanProposal {
  if (!proposal) throw new Error('NO_PROPOSAL')
  return proposal
}

/** Re-parsing the same work should update it in place rather than stack duplicates (FR-1.4). */
export function mergeTasks(existing: Task[], incoming: Task[]): Task[] {
  const result = [...existing]
  for (const task of incoming) {
    const match = result.find(
      (t) => t.id === task.id || (normaliseTitle(t.title) === normaliseTitle(task.title) && t.source !== 'user'),
    )
    if (match) {
      const index = result.indexOf(match)
      result[index] = { ...task, id: match.id, source: match.source === 'user' ? 'user' : task.source }
    } else {
      result.push(task)
    }
  }
  return result
}

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

/* ------------------------------------------------------------------ *
 * LangChain tool bindings
 * ------------------------------------------------------------------ */

/**
 * Wrap the toolkit as LangChain tools. Imported lazily by the live agent so the SDK never becomes a
 * hard dependency of demo mode (RULES.md L5).
 */
export async function toLangChainTools(toolkit: Toolkit) {
  const { tool } = await import('@langchain/core/tools')

  const wrap = <S extends z.ZodTypeAny>(
    name: ToolName,
    description: string,
    schema: S,
    run: (args: z.infer<S>) => Promise<unknown>,
  ) =>
    tool(async (args: z.infer<S>) => JSON.stringify(await run(args)), {
      name,
      description,
      schema,
    } as never) as unknown

  return [
    wrap('parse_tasks', 'Validate and normalise tasks the user described in their own words. Call this instead of writing JSON yourself: ids, defaults and inferred durations are filled in.', parseTasksInputSchema, (args) => toolkit.parse_tasks(args)),
    wrap('build_schedule', 'Run the deterministic scheduler over the current tasks, preferences, calendar and pins. This is the ONLY way a block gets a time.', buildScheduleInputSchema, () => toolkit.build_schedule()),
    wrap('critique_plan', 'Inspect the most recent schedule: what fits, what does not, deadline risk, warnings and ranked trade-offs.', critiqueInputSchema, () => toolkit.critique_plan()),
    wrap('revise_plan', 'Rebuild the week after changing tasks, preferences or pins (e.g. the user is out Friday afternoon).', reviseInputSchema, (args) => toolkit.revise_plan(args)),
    wrap('explain_block', 'Explain why one placed block sits where it does, using the engine records.', explainInputSchema, (args) => toolkit.explain_block(args)),
    wrap('estimate_duration', 'Estimate how long a task will take when the user did not say.', estimateInputSchema, (args) => toolkit.estimate_duration(args)),
  ]
}

/* ------------------------------------------------------------------ *
 * Untouched re-exports so callers import from one place
 * ------------------------------------------------------------------ */

export {
  blockConflictSchema,
  busyEventSchema,
  categorySchema,
  energySchema,
  pinSchema,
  planProposalSchema,
  preferencesSchema,
  prioritySchema,
  taskSchema,
  weekdaySchema,
}
export { buildWeekFrame, fmtClock, fmtDuration, totalDemandMinutes, evaluatePlan }
