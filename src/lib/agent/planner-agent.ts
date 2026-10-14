import { z } from 'zod'
import {
  SNAP_MINUTES,
  type AgentStep,
  type BusyEvent,
  type Pin,
  type PlanProposal,
  type Preferences,
  type Task,
} from '@/lib/types'
import { createToolkit, type Interpreter, type InterpretedMessage, type ParsedTasks, type Toolkit } from '@/lib/agent/tools'
import { createLocalInterpreter } from '@/lib/agent/local-reasoner'
import { resolveProvider, type ResolvedProvider } from '@/lib/agent/providers'
import {
  EXPLAIN_PROMPT,
  INTERPRET_PROMPT,
  PARSE_PROMPT,
  SYSTEM_PROMPT,
  formatBusyForModel,
  formatPreferencesForModel,
  formatTasksForModel,
} from '@/lib/agent/prompts'
import { fmtDuration } from '@/lib/scheduler/slots'

/**
 * The planner agent (`ARCHITECTURE.md` §6).
 *
 * Two implementations, one contract:
 *  - **live** — a LangChain tool-calling loop over a real model, where the model decides *what* to do
 *    and the tools own *when* (`build_schedule` is the only source of timestamps, D-001);
 *  - **local** — the same pipeline with the language step done by deterministic rules.
 *
 * The live path can fail in a dozen ways (no key, provider 500, malformed tool call, exhausted step
 * budget). Every one of them returns the local plan plus a note, so the user never sees a dead screen.
 */

export type PlannerInput = {
  tasks: Task[]
  preferences: Preferences
  busy: BusyEvent[]
  pins: Pin[]
  weekStartDate: string
  nowISO: string
  /** Free text to parse into tasks, if the user pasted a brief. */
  freeText?: string
  /** A refinement message, if this is a follow-up. */
  message?: string
  /** Explain one block instead of replanning. */
  explainBlockId?: string
  mode: 'auto' | 'agent' | 'local'
  provider?: string
}

export type PlannerResult = {
  proposal: PlanProposal
  tasks: Task[]
  preferences: Preferences
  pins: Pin[]
  trace: AgentStep[]
  notes: string[]
  reply: string
  provider: string
  mode: 'agent' | 'local'
}

const MAX_TOOL_STEPS = 6

/* ------------------------------------------------------------------ *
 * Live model helpers
 * ------------------------------------------------------------------ */

async function invokeJson<S extends z.ZodTypeAny>(
  model: unknown,
  system: string,
  user: string,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; reason: string }> {
  const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
  const chat = model as { invoke: (messages: unknown[]) => Promise<{ content: unknown }> }
  const instruction = `${system}\n\nRespond with a single JSON object and nothing else. No prose, no markdown fences.`

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await chat.invoke([new SystemMessage(instruction), new HumanMessage(user)])
      const text = contentToText(response.content)
      const parsed = schema.safeParse(extractJson(text))
      if (parsed.success) return { ok: true, data: parsed.data }
      if (attempt === 0) {
        // One repair round trip (RULES.md §7) — the schema error goes back to the model verbatim.
        const repaired = await chat.invoke([
          new SystemMessage(instruction),
          new HumanMessage(user),
          new HumanMessage(`Your previous reply did not match the schema: ${parsed.error.issues[0]?.message ?? 'invalid JSON'}. Reply with corrected JSON only.`),
        ])
        const second = schema.safeParse(extractJson(contentToText(repaired.content)))
        if (second.success) return { ok: true, data: second.data }
      }
      return { ok: false, reason: 'MODEL_SCHEMA_MISMATCH' }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message.slice(0, 120) : 'MODEL_ERROR' }
    }
  }
  return { ok: false, reason: 'MODEL_SCHEMA_MISMATCH' }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text)
        return ''
      })
      .join('')
  }
  return ''
}

/** Models sometimes wrap JSON in fences or prose. Take the first balanced object. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, '```').trim()
  const fenced = cleaned.match(/```([\s\S]*?)```/)
  const candidate = (fenced?.[1] ?? cleaned).trim()
  const firstBrace = candidate.indexOf('{')
  const firstBracket = candidate.indexOf('[')
  const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket)
  if (start === -1) return null
  const opener = candidate[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i]
    if (char === opener) depth += 1
    else if (char === closer) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const patchSchema = z.object({
  preferences: z.record(z.string(), z.unknown()).optional(),
  tasks: z.array(z.unknown()).optional(),
  pins: z
    .array(z.object({ taskId: z.string(), date: z.string(), startMin: z.number(), minutes: z.number().optional() }))
    .optional(),
  changes: z.array(z.string()).max(6).optional(),
  reply: z.string().max(600).optional(),
})

/* ------------------------------------------------------------------ *
 * Live interpreter — language enters through the model, validated by zod
 * ------------------------------------------------------------------ */

function createLiveInterpreter(model: unknown): Interpreter {
  const local = createLocalInterpreter()

  return {
    async parseTasks(text, ctx): Promise<ParsedTasks> {
      const result = await invokeJson(model, PARSE_PROMPT, text, z.object({ tasks: z.array(z.unknown()) }))
      if (!result.ok) return local.parseTasks(text, ctx)
      // The model produces raw task objects; the toolkit's normaliser validates and fills defaults.
      const raw = {
        tasks: z
          .array(z.record(z.string(), z.unknown()))
          .safeParse(result.data.tasks).success
          ? (result.data.tasks as Record<string, unknown>[])
          : [],
        notes: [],
      }
      const toolkit = createToolkit({ context: { ...ctx, tasks: ctx.existingTasks, preferences: ctx.existingPreferences, busy: [], pins: [] }, interpreter: local })
      try {
        const outcome = await toolkit.parse_tasks({ tasks: raw.tasks as never, notes: raw.notes })
        return { tasks: outcome.tasks ?? [], notes: outcome.notes ?? [] }
      } catch {
        return local.parseTasks(text, ctx)
      }
    },

    async interpretMessage(message, ctx): Promise<InterpretedMessage> {
      const contextBlock = [
        `Now: ${ctx.nowISO}`,
        `Week starts: ${ctx.weekStartDate} · timezone ${ctx.timezone}`,
        'Preferences:',
        formatPreferencesForModel(ctx.existingPreferences),
        'Tasks:',
        formatTasksForModel(ctx.existingTasks),
        `Message: ${message}`,
      ].join('\n')

      const result = await invokeJson(model, INTERPRET_PROMPT, contextBlock, patchSchema)
      if (!result.ok) return local.interpretMessage(message, ctx)

      const patch = result.data
      let preferences: Preferences | undefined
      if (patch.preferences) {
        const merged = { ...ctx.existingPreferences, ...patch.preferences }
        const validated = z
          .custom<Preferences>()
          .safeParse(merged)
        if (validated.success) preferences = merged
      }
      let tasks: Task[] | undefined
      if (patch.tasks) {
        const toolkit = createToolkit({
          context: { ...ctx, tasks: ctx.existingTasks, preferences: ctx.existingPreferences, busy: [], pins: [] },
          interpreter: local,
        })
        try {
          const outcome = await toolkit.parse_tasks({ tasks: patch.tasks as never })
          tasks = outcome.tasks
        } catch {
          tasks = undefined
        }
      }
      const pins = patch.pins
        ?.filter((pin) => ctx.existingTasks.some((task) => task.id === pin.taskId))
        .map((pin) => ({
          taskId: pin.taskId,
          date: pin.date,
          startMin: Math.round(pin.startMin / SNAP_MINUTES) * SNAP_MINUTES,
          minutes: pin.minutes ?? 60,
        }))

      return {
        tasks,
        preferences,
        pins,
        changes: patch.changes ?? [],
        reply: patch.reply ?? '',
      }
    },

    async explainBlock(context): Promise<string> {
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
      try {
        const chat = model as { invoke: (messages: unknown[]) => Promise<{ content: unknown }> }
        const response = await chat.invoke([new SystemMessage(EXPLAIN_PROMPT), new HumanMessage(context)])
        const text = contentToText(response.content).trim()
        return text.length > 0 ? text : local.explainBlock(context)
      } catch {
        return local.explainBlock(context)
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * Live tool-calling loop
 * ------------------------------------------------------------------ */

function baseContext(input: PlannerInput, tasks: Task[]) {
  return {
    tasks,
    preferences: input.preferences,
    busy: input.busy,
    pins: input.pins,
    weekStartDate: input.weekStartDate,
    nowISO: input.nowISO,
  }
}

async function runLiveToolLoop(
  toolkit: Toolkit,
  provider: Extract<ResolvedProvider, { kind: 'live' }>,
  input: PlannerInput,
): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  void provider
  const { HumanMessage, SystemMessage, ToolMessage } = await import('@langchain/core/messages')
  const { toLangChainTools } = await import('@/lib/agent/tools')

  try {
    const model = (await createModel(provider)) as unknown as {
      bindTools: (tools: unknown[]) => { invoke: (messages: unknown[]) => Promise<unknown> }
    }
    const tools = await toLangChainTools(toolkit)
    const bound = model.bindTools(tools)

    const request = [
      `Now: ${input.nowISO}`,
      `Week starts: ${input.weekStartDate} (${input.preferences.timezone})`,
      '',
      'Preferences:',
      formatPreferencesForModel(input.preferences),
      '',
      'Already on the calendar:',
      formatBusyForModel(input.busy),
      '',
      'Tasks I already have:',
      formatTasksForModel(toolkit.context.tasks),
      '',
      input.freeText ? `New work to add:\n${input.freeText}` : '',
      input.message ? `What I just said: ${input.message}` : '',
      '',
      'Plan the week, or apply what I asked for. Use the tools.',
    ]
      .filter(Boolean)
      .join('\n')

    const messages: unknown[] = [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(request)]
    let reply = ''

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const response = (await bound.invoke(messages)) as {
        content: unknown
        tool_calls?: { name: string; args: Record<string, unknown>; id?: string }[]
      }
      messages.push(response)
      const calls = response.tool_calls ?? []
      const text = contentToText(response.content).trim()
      if (text) reply = text

      if (calls.length === 0) break

      for (const call of calls) {
        const result = await dispatchTool(toolkit, call.name, call.args)
        messages.push(
          new ToolMessage({
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: call.id ?? call.name,
          }),
        )
      }
    }

    if (!toolkit.proposal) {
      // The model never scheduled anything; let the engine do it rather than returning nothing.
      await toolkit.parse_tasks({ tasks: [] })
      await toolkit.build_schedule({ rationale: 'Fallback: the model did not call build_schedule.' })
    }
    return { ok: true, reply }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 160) : 'AGENT_ERROR' }
  }
}

async function dispatchTool(toolkit: Toolkit, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'parse_tasks':
      return toolkit.parse_tasks(args as never)
    case 'build_schedule':
      return toolkit.build_schedule(args as never)
    case 'critique_plan':
      return toolkit.critique_plan()
    case 'revise_plan':
      return toolkit.revise_plan(args as never)
    case 'explain_block':
      return toolkit.explain_block(args as never)
    case 'estimate_duration':
      return toolkit.estimate_duration(args as never)
    default:
      return { error: `Unknown tool ${name}` }
  }
}

/* ------------------------------------------------------------------ *
 * Local pipeline (also the fallback for every live failure)
 * ------------------------------------------------------------------ */

export async function runLocalPlanner(
  input: PlannerInput,
  interpreter: Interpreter = createLocalInterpreter(),
  inheritedNotes: string[] = [],
): Promise<PlannerResult> {
  const notes: string[] = [...inheritedNotes]
  const traces: AgentStep[] = []
  const toolkit = createToolkit({ context: baseContext(input, input.tasks), interpreter, traces })

  if (input.freeText && input.freeText.trim().length > 2) {
    const parsed = await interpreter.parseTasks(input.freeText, {
      nowISO: input.nowISO,
      weekStartDate: input.weekStartDate,
      timezone: input.preferences.timezone,
      existingTasks: input.tasks,
      existingPreferences: input.preferences,
    })
    const outcome = await toolkit.parse_tasks({
      tasks: parsed.tasks.map(stripForRaw) as never,
      notes: parsed.notes,
    })
    notes.push(...(outcome.notes ?? []))
  }

  let changes: string[] = []
  let reply = ''

  if (input.message && !input.explainBlockId) {
    const interpreted = await interpreter.interpretMessage(input.message, {
      nowISO: input.nowISO,
      weekStartDate: input.weekStartDate,
      timezone: input.preferences.timezone,
      existingTasks: toolkit.context.tasks,
      existingPreferences: toolkit.context.preferences,
    })
    changes = interpreted.changes
    reply = interpreted.reply
    if (interpreted.tasks || interpreted.preferences || interpreted.pins) {
      await toolkit.revise_plan({
        tasks: interpreted.tasks,
        preferences: interpreted.preferences,
        pins: interpreted.pins,
        rationale: interpreted.changes[0] ?? 'Applied your changes',
      })
    }
  }

  if (!toolkit.proposal) {
    await toolkit.build_schedule()
  }

  const critique = await toolkit.critique_plan()
  const proposal = toolkit.proposal as PlanProposal

  if (input.explainBlockId) {
    const explained = await toolkit.explain_block({ blockId: input.explainBlockId })
    reply = explained.reply ?? reply
  } else if (!reply || changes.length === 0) {
    // A message that changed nothing still deserves an answer: give them the state of the week
    // rather than a canned line about phrasing.
    const status = composeReply(critique)
    reply = reply && reply.length > 0 ? `${reply} ${status}` : status
  }

  return {
    proposal,
    tasks: toolkit.context.tasks,
    preferences: toolkit.context.preferences,
    pins: toolkit.context.pins,
    trace: toolkit.trace,
    notes: dedupe(notes),
    reply,
    provider: 'local',
    mode: 'local',
  }
}

function stripForRaw(task: Task): Record<string, unknown> {
  const { id, source, estimatedByAI, ...rest } = task
  void id
  void source
  void estimatedByAI
  return rest
}

export function composeReply(critique: {
  fits: string
  headline: string
  unscheduled: { title: string; minutes: number; why: string }[]
  deadlineRisks: { title: string; severity: string }[]
}): string {
  const lines: string[] = [critique.headline]
  const critical = critique.deadlineRisks.filter((risk) => risk.severity === 'critical')
  for (const risk of critical.slice(0, 2)) {
    lines.push(`${risk.title} is at risk of missing its deadline.`)
  }
  for (const item of critique.unscheduled.slice(0, 2)) {
    lines.push(`${item.title} — ${fmtDuration(item.minutes)} unplaced: ${item.why.toLowerCase()}.`)
  }
  if (critique.fits === 'overbooked') {
    lines.push('Pick a trade-off on the right and I will rebuild the week around it.')
  }
  return lines.join(' ')
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export async function runPlannerAgent(input: PlannerInput): Promise<PlannerResult> {
  const resolved = resolveProvider(input.provider)
  const wantsLocal = input.mode === 'local' || resolved.kind === 'local'

  if (wantsLocal) {
    const result = await runLocalPlanner(input)
    return {
      ...result,
      provider: 'local',
      mode: 'local',
      notes: dedupe([
        ...result.notes,
        input.mode === 'local'
          ? 'Local engine mode: language parsing is rule-based, scheduling is identical.'
          : `Demo mode — ${resolved.kind === 'local' ? resolved.reason : 'no provider'}. Plans are fully real; only the language step is rule-based.`,
      ]),
    }
  }

  // Live path — if anything at all goes wrong, the deterministic plan ships instead.
  const notes: string[] = []
  try {
    const interpreter = createLiveInterpreter(await createModel(resolved))
    const traces: AgentStep[] = []
    const toolkit = createToolkit({ context: baseContext(input, input.tasks), interpreter, traces })

    const loop = await runLiveToolLoop(toolkit, resolved, input)

    if (!loop.ok || !toolkit.proposal) {
      const fallback = await runLocalPlanner(input)
      return {
        ...fallback,
        notes: dedupe([
          ...fallback.notes,
          `The ${resolved.name} model did not return a usable plan (${loop.ok ? 'no schedule produced' : loop.reason}). The deterministic engine built this week instead — nothing was lost.`,
        ]),
      }
    }

    const proposal = toolkit.proposal
    return {
      proposal,
      tasks: toolkit.context.tasks,
      preferences: toolkit.context.preferences,
      pins: toolkit.context.pins,
      trace: toolkit.trace,
      notes,
      reply: loop.reply || composeReply(proposal.report),
      provider: `${resolved.name}:${resolved.model}`,
      mode: 'agent',
    }
  } catch (error) {
    const fallback = await runLocalPlanner(input)
    return {
      ...fallback,
      notes: dedupe([
        ...fallback.notes,
        `Live planning failed (${error instanceof Error ? error.message.slice(0, 120) : 'unknown error'}). The deterministic engine built this week instead.`,
      ]),
    }
  }
}

async function createModel(provider: Extract<ResolvedProvider, { kind: 'live' }>) {
  if (provider.name === 'openai') {
    const { ChatOpenAI } = await import('@langchain/openai')
    return new ChatOpenAI({ model: provider.model, temperature: 0.2, timeout: 20_000 })
  }
  if (provider.name === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic')
    return new ChatAnthropic({ model: provider.model, temperature: 0.2 })
  }
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
  return new ChatGoogleGenerativeAI({ model: provider.model, temperature: 0.2 })
}
