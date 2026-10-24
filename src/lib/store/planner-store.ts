'use client'

import { create } from 'zustand'
import {
  taskSchema,
  preferencesSchema,
  type AgentStep,
  type BusyEvent,
  type Pin,
  type PlanProposal,
  type PlanResponse,
  type Preferences,
  type Task,
} from '@/lib/types'
import { getCalendarStatus, getHealth, postChat, postPlan, postSync, type ApiError } from '@/lib/api'
import { SNAP_MINUTES } from '@/lib/types'
import { DEFAULT_MIN_BLOCK } from '@/lib/types'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks, overloadedTasks } from '@/lib/sample-data'

/**
 * Client session state.
 *
 * Deliberately does **no** scheduling: dragging a block produces a *pin request* and the server
 * recomputes (D-009). One implementation of time, always on the server. The store holds inputs
 * (tasks, preferences, pins) and the last server answer (proposal), plus presentation state.
 */

export type PlannerStatus = 'idle' | 'planning' | 'ready' | 'error'
export type RailTab = 'tasks' | 'prefs' | 'calendar'
export type BuildMode = 'auto' | 'local'

export type Capability = {
  demoMode: boolean
  agent: { mode: 'agent' | 'local'; provider: string; model: string; reason?: string }
  calendar: { configured: boolean; connected: boolean; missing: string[] }
}

export type ChatEntry = { id: string; role: 'user' | 'agent'; text: string; changes?: string[]; trace?: AgentStep[] }

type State = {
  tasks: Task[]
  preferences: Preferences
  busy: BusyEvent[]
  pins: Pin[]
  proposal: PlanProposal | null
  status: PlannerStatus
  actionMessage: string | null
  error: ApiError | null
  notes: string[]
  trace: AgentStep[]
  mode: BuildMode
  demoSet: 'realistic' | 'overloaded'
  capability: Capability | null
  railTab: RailTab
  chat: ChatEntry[]
  chatBusy: boolean
  selectedBlockId: string | null
  filters: { energy: string[]; categories: string[]; pinnedOnly: boolean }
  syncState: { status: 'idle' | 'syncing' | 'done' | 'error'; message?: string; lastCount?: number }
}

type Actions = {
  hydrate(): void
  setRailTab(tab: RailTab): void
  setMode(mode: BuildMode): void
  setPreferences(next: Partial<Preferences>): void
  setTasks(tasks: Task[]): void
  addTask(task: Task): void
  updateTask(id: string, patch: Partial<Task>): void
  removeTask(id: string): void
  loadDemoSet(which: 'realistic' | 'overloaded'): void
  clearTasks(): void
  setBusy(busy: BusyEvent[]): void
  selectBlock(id: string | null): void
  setFilters(patch: Partial<State['filters']>): void
  cancelPlanning(): void
  buildWeek(freeText?: string): Promise<void>
  sendMessage(message: string): Promise<void>
  pinBlock(blockId: string, date: string, startMin: number, minutes?: number): Promise<void>
  unpinTask(taskId: string): Promise<void>
  applyTradeoff(kind: string, taskId: string): Promise<void>
  explainBlock(blockId: string): Promise<void>
  refreshCapability(): Promise<void>
  dryRun(blockIds?: string[]): Promise<void>
  acceptPreview(data: PlanResponse['data'], source: string, taskId: string): boolean
  exportIcs(blockIds?: string[]): Promise<void>
  approveAndSync(blockIds: string[]): Promise<void>
  rollback(): Promise<void>
}

let planRequestId = 0

const STORAGE_KEY = 'calendra.session.v1'

/**
 * Write to localStorage, coalesced.
 *
 * `localStorage.setItem` is *synchronous* disk I/O on the main thread. That is invisible when it runs
 * once per click and painful when it runs once per input event: a range input fires `change` on every
 * pixel, so dragging the buffer slider wrote the entire task list ~60×/second, each write blocking the
 * paint the drag was waiting for. The slider felt like the app had hung; it had not, it was on fire.
 *
 * Leading write (storage is correct immediately), then at most one trailing write per window. The
 * pending value is the latest, so nothing is lost — only the intermediate states, which nothing reads.
 */
const PERSIST_COALESCE_MS = 250
let persistTimer: ReturnType<typeof setTimeout> | null = null
/**
 * The latest state waiting to be written.
 *
 * A reference, not a serialised string: `persist` runs on every input event, and stringifying the
 * whole task list 60×/second costs more than the write it is preparing for. The store replaces state
 * objects rather than mutating them, so holding the newest reference is safe — nothing writes through
 * it after the fact.
 */
let pending: Pick<State, 'tasks' | 'preferences' | 'demoSet' | 'mode'> | null = null

function writeNow() {
  if (pending === null) return
  const snapshot = pending
  pending = null
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tasks: snapshot.tasks,
        preferences: snapshot.preferences,
        demoSet: snapshot.demoSet,
        mode: snapshot.mode,
      }),
    )
  } catch {
    // Storage is a convenience, not a requirement. A full or blocked quota must not break planning.
  }
}

function persist(state: Pick<State, 'tasks' | 'preferences' | 'demoSet' | 'mode'>) {
  if (typeof window === 'undefined') return
  pending = state
  if (persistTimer !== null) return // a write is already scheduled; it will pick up the latest value
  writeNow()
  persistTimer = setTimeout(() => {
    persistTimer = null
    writeNow()
  }, PERSIST_COALESCE_MS)
}

function request(now: Date) {
  return { now: now.toISOString() }
}

/** Snapshot identity guards previews against edits, moves, rebuilds or changed planning mode. */
export function plannerSnapshotKey(
  state: Pick<State, 'tasks' | 'preferences' | 'busy' | 'pins' | 'mode' | 'proposal'>,
) {
  return JSON.stringify([state.tasks, state.preferences, state.busy, state.pins, state.mode, state.proposal])
}

/** The visible schedule is a snapshot; edited inputs must be replanned before moving/publishing. */
export function hasDraftChanges(state: Pick<State, 'proposal' | 'tasks' | 'preferences' | 'busy' | 'pins'>): boolean {
  const p = state.proposal
  return Boolean(
    p &&
      JSON.stringify([state.tasks, state.preferences, state.busy, state.pins]) !==
        JSON.stringify([p.tasks, p.preferences, p.busy, p.pins]),
  )
}

export function plannerLocked(state: Pick<State, 'status' | 'chatBusy' | 'syncState'>): boolean {
  return state.status === 'planning' || state.chatBusy || state.syncState.status === 'syncing'
}

const changedDuringRequest: ApiError = {
  code: 'INPUTS_CHANGED',
  message:
    'Your inputs changed while planning. Your edits and previous schedule were kept. Re-plan to include the latest changes.',
}

export const usePlanner = create<State & Actions>((set, get) => ({
  tasks: [],
  preferences: defaultPreferences(),
  busy: [],
  pins: [],
  proposal: null,
  status: 'idle',
  actionMessage: null,
  error: null,
  notes: [],
  trace: [],
  mode: 'auto',
  demoSet: 'realistic',
  capability: null,
  railTab: 'calendar',
  chat: [],
  chatBusy: false,
  selectedBlockId: null,
  filters: { energy: [], categories: [], pinnedOnly: false },
  syncState: { status: 'idle' },

  hydrate() {
    if (typeof window === 'undefined') return
    const weekStart = currentWeekStart()
    let restored: Partial<State> = {}
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved: unknown = JSON.parse(raw)
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) restored = saved as Partial<State>
      }
    } catch {
      restored = {}
    }
    const demoSet = restored.demoSet === 'overloaded' ? 'overloaded' : 'realistic'
    const savedTasks =
      Array.isArray(restored.tasks) && restored.tasks.length <= 120
        ? restored.tasks.map((task) => taskSchema.safeParse(task))
        : null
    const validTasks = savedTasks?.every((task) => task.success) ?? false
    const savedPreferences = preferencesSchema.safeParse({ ...defaultPreferences(), ...(restored.preferences ?? {}) })
    set({
      tasks: validTasks ? savedTasks!.flatMap((task) => (task.success ? [task.data] : [])) : demoTasks(weekStart),
      preferences: savedPreferences.success ? savedPreferences.data : defaultPreferences(),
      demoSet,
      mode: restored.mode === 'local' ? 'local' : 'auto',
      busy: demoBusy(weekStart),
      railTab: 'calendar',
      pins: [],
    })
  },

  setRailTab(railTab) {
    set({ railTab })
  },

  setMode(mode) {
    if (get().syncState.status === 'syncing') return
    set({ mode })
    persist({ ...get(), mode })
  },

  setPreferences(patch) {
    if (get().syncState.status === 'syncing') return
    const preferences = { ...get().preferences, ...patch }
    set({ preferences, error: null, actionMessage: null, syncState: { status: 'idle' } })
    persist({ ...get(), preferences })
  },

  setTasks(tasks) {
    if (get().syncState.status === 'syncing') return
    set({ tasks, error: null, actionMessage: null, syncState: { status: 'idle' } })
    persist({ ...get(), tasks })
  },

  addTask(task) {
    if (get().syncState.status === 'syncing') return
    const tasks = [...get().tasks, task]
    set({ tasks, error: null, actionMessage: null, syncState: { status: 'idle' } })
    persist({ ...get(), tasks })
  },

  updateTask(id, patch) {
    if (get().syncState.status === 'syncing') return
    const tasks = get().tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
    set({ tasks, error: null, actionMessage: null, syncState: { status: 'idle' } })
    persist({ ...get(), tasks })
  },

  removeTask(id) {
    if (get().syncState.status === 'syncing') return
    const tasks = get().tasks.filter((task) => task.id !== id)
    const pins = get().pins.filter((pin) => pin.taskId !== id)
    set({ tasks, pins, error: null, actionMessage: null, syncState: { status: 'idle' } })
    persist({ ...get(), tasks })
  },

  loadDemoSet(which) {
    if (get().syncState.status === 'syncing') return
    planRequestId += 1
    const weekStart = currentWeekStart()
    set({
      proposal: null,
      status: 'idle',
      error: null,
      actionMessage: 'Sample tasks loaded. Build your week to schedule them.',
      syncState: { status: 'idle' },
      demoSet: which,
      tasks: which === 'overloaded' ? overloadedTasks(weekStart) : demoTasks(weekStart),
      busy: demoBusy(weekStart),
      railTab: 'calendar',
      pins: [],
      chat: [],
      chatBusy: false,
      selectedBlockId: null,
    })
    persist({ ...get(), demoSet: which })
  },

  clearTasks() {
    if (get().syncState.status === 'syncing') return
    planRequestId += 1
    set({
      tasks: [],
      pins: [],
      proposal: null,
      selectedBlockId: null,
      status: 'idle',
      chatBusy: false,
      error: null,
      actionMessage: 'Task backlog cleared.',
      syncState: { status: 'idle' },
    })
    persist({ ...get(), tasks: [] })
  },

  setBusy(busy) {
    if (get().syncState.status === 'syncing') return
    set({ busy, error: null, actionMessage: null, syncState: { status: 'idle' } })
  },

  selectBlock(selectedBlockId) {
    set({ selectedBlockId })
  },

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } })
  },

  cancelPlanning() {
    if (get().syncState.status === 'syncing' || (!get().chatBusy && get().status !== 'planning')) return
    planRequestId += 1
    set({
      status: get().proposal ? 'ready' : 'idle',
      chatBusy: false,
      error: null,
      actionMessage: 'Planning cancelled. Your previous draft and edits are unchanged.',
    })
  },

  async buildWeek(freeText) {
    if (plannerLocked(get())) return
    const id = ++planRequestId
    const source = plannerSnapshotKey(get())
    const { tasks, preferences, busy, pins, mode } = get()
    set({ status: 'planning', error: null, actionMessage: 'Planning your week…' })
    const result = await postPlan({
      tasks,
      preferences,
      busy,
      pins,
      mode,
      instruction: freeText && freeText.trim().length > 2 ? freeText : undefined,
      ...request(new Date()),
    })

    if (id !== planRequestId) return
    if (plannerSnapshotKey(get()) !== source) {
      set({ status: 'error', error: changedDuringRequest, actionMessage: null })
      return
    }
    if (!result.ok) {
      set({ status: 'error', error: result.error, actionMessage: null })
      return
    }

    set({
      actionMessage: 'Your draft week is ready. Nothing has been published.',
      selectedBlockId: null,
      busy: result.data.proposal.busy,
      proposal: result.data.proposal,
      tasks: result.data.proposal.tasks,
      preferences: result.data.proposal.preferences,
      // The plan is the authority on which pins survived: no more, no fewer (D-021).
      pins: result.data.proposal.pins,
      trace: result.data.trace,
      notes: result.data.notes,
      status: 'ready',
      error: null,
      syncState: { status: 'idle' },
    })
    persist({ ...get(), tasks: result.data.proposal.tasks, preferences: result.data.proposal.preferences })
  },

  async sendMessage(message) {
    if (plannerLocked(get()) || !message.trim()) return
    const id = ++planRequestId
    const source = plannerSnapshotKey(get())
    const { tasks, preferences, busy, pins, mode, chat, proposal } = get()
    const entry: ChatEntry = { id: `u_${chat.length}_${message.length}`, role: 'user', text: message }
    set({ chat: [...chat, entry], chatBusy: true, error: null, actionMessage: 'Checking your requested changes…' })

    const result = await postChat({
      tasks,
      preferences,
      busy,
      pins,
      mode,
      message,
      previousPreferences: preferences,
      previousBlocks: proposal?.blocks
        .filter((block) => block.kind === 'task')
        .map((block) => ({
          id: block.id,
          taskId: block.taskId,
          date: block.date,
          startMin: block.startMin,
          minutes: block.minutes,
        })),
      ...request(new Date()),
    })

    if (id !== planRequestId) return
    if (plannerSnapshotKey(get()) !== source) {
      set({
        chatBusy: false,
        error: changedDuringRequest,
        actionMessage: null,
        chat: [...get().chat, { id: `a_stale_${Date.now()}`, role: 'agent', text: changedDuringRequest.message }],
      })
      return
    }
    if (!result.ok) {
      set({
        actionMessage: null,
        error: result.error,
        chatBusy: false,
        chat: [...get().chat, { id: `a_err_${Date.now()}`, role: 'agent', text: result.error.message }],
      })
      return
    }

    const data = result.data
    set({
      busy: data.proposal.busy,
      selectedBlockId: null,
      syncState: { status: 'idle' },
      actionMessage: 'Requested changes applied to the draft. Nothing has been published.',
      proposal: data.proposal,
      tasks: data.tasks,
      preferences: data.preferences,
      // A drag is a decision. Asking the agent a question must not undo it (N-9).
      pins: data.proposal.pins,
      trace: data.trace,
      chatBusy: false,
      status: 'ready',
      chat: [
        ...get().chat,
        {
          id: `a_${get().chat.length}_${data.reply.length}`,
          role: 'agent',
          text: data.reply,
          changes: data.changes,
          trace: data.trace,
        },
      ],
    })
    persist({ ...get(), tasks: data.tasks, preferences: data.preferences })
  },

  async pinBlock(blockId, date, startMin, minutes) {
    if (plannerLocked(get()) || hasDraftChanges(get())) return
    const { proposal, pins, tasks, preferences, busy, mode } = get()
    const block = proposal?.blocks.find((b) => b.id === blockId && b.kind === 'task')
    if (!proposal || !block) return
    const snap = (value: number) => Math.round(value / SNAP_MINUTES) * SNAP_MINUTES
    const requested = { taskId: block.taskId, date, startMin: snap(startMin), minutes: snap(minutes ?? block.minutes) }
    if (requested.date === block.date && requested.startMin === block.startMin && requested.minutes === block.minutes)
      return
    const nextPins = [
      ...pins.filter((pin) => !(pin.taskId === block.taskId && (pin.date === block.date || pin.date === date))),
      requested,
    ]
    const id = ++planRequestId
    const source = plannerSnapshotKey(get())
    // Keep the confirmed schedule visible until validation succeeds. No invalid optimistic pin survives failure.
    set({
      status: 'planning',
      error: null,
      actionMessage: 'Checking the move or resize… Your previous position is kept until confirmed.',
    })
    const result = await postPlan({ tasks, preferences, busy, pins: nextPins, mode, ...request(new Date()) })
    if (id !== planRequestId) return
    if (plannerSnapshotKey(get()) !== source) {
      set({ status: 'error', error: changedDuringRequest, actionMessage: null })
      return
    }
    if (!result.ok) {
      set({
        status: 'error',
        error: { ...result.error, message: `${result.error.message} The block stayed in its previous position.` },
        actionMessage: null,
      })
      return
    }
    const confirmed = result.data.proposal.blocks.find(
      (b) =>
        b.taskId === block.taskId &&
        b.pinned &&
        b.date === date &&
        b.startMin === requested.startMin &&
        b.minutes === requested.minutes,
    )
    if (!confirmed) {
      set({
        status: 'error',
        error: {
          code: 'MOVE_REJECTED',
          message:
            'That move or resize conflicts with protected time or another constraint. The previous schedule is unchanged. Choose a different slot.',
        },
        actionMessage: null,
      })
      return
    }
    set({
      proposal: result.data.proposal,
      tasks: result.data.proposal.tasks,
      preferences: result.data.proposal.preferences,
      busy: result.data.proposal.busy,
      pins: result.data.proposal.pins,
      status: 'ready',
      error: null,
      trace: result.data.trace,
      notes: result.data.notes,
      selectedBlockId: confirmed.id,
      syncState: { status: 'idle' },
      actionMessage: 'Move or resize confirmed. Only the draft changed.',
    })
    persist(get())
  },

  async unpinTask(taskId) {
    if (plannerLocked(get()) || hasDraftChanges(get())) return
    const { pins, tasks, preferences, busy, mode } = get()
    if (!pins.some((pin) => pin.taskId === taskId)) return
    const nextPins = pins.filter((pin) => pin.taskId !== taskId)
    const id = ++planRequestId
    const source = plannerSnapshotKey(get())
    set({ status: 'planning', error: null, actionMessage: 'Replanning without this task’s pins…' })
    const result = await postPlan({ tasks, preferences, busy, pins: nextPins, mode, ...request(new Date()) })
    if (id !== planRequestId) return
    if (plannerSnapshotKey(get()) !== source) {
      set({ status: 'error', error: changedDuringRequest, actionMessage: null })
      return
    }
    if (!result.ok) {
      set({ status: 'error', error: result.error, actionMessage: null })
      return
    }
    const proposal = result.data.proposal
    set({
      proposal,
      tasks: proposal.tasks,
      preferences: proposal.preferences,
      busy: proposal.busy,
      pins: proposal.pins,
      status: 'ready',
      error: null,
      trace: result.data.trace,
      notes: result.data.notes,
      selectedBlockId: proposal.blocks.find((block) => block.taskId === taskId)?.id ?? null,
      syncState: { status: 'idle' },
      actionMessage: 'Task unpinned and draft replanned.',
    })
    persist(get())
  },

  /**
   * Trade-off options are the human end of the escalation ladder. Applying one is expressed as a
   * concrete preference/task change and then planned normally — never as a special case in the engine.
   */
  async applyTradeoff(kind, taskId) {
    if (plannerLocked(get())) return
    const { tasks, preferences } = get()
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    if (kind === 'split') {
      get().updateTask(taskId, { splittable: true, minChunkMinutes: 45 })
    } else if (kind === 'use-weekend') {
      get().setPreferences({ weekendMode: 'light', overflowPreference: 'weekend' })
    } else if (kind === 'extend-hours') {
      get().setPreferences({ overflowPreference: 'shoulder' })
    } else if (kind === 'shorten') {
      const cut = Math.max(DEFAULT_MIN_BLOCK, Math.round(task.estimateMinutes / 2 / SNAP_MINUTES) * SNAP_MINUTES)
      get().updateTask(taskId, { estimateMinutes: Math.max(SNAP_MINUTES, task.estimateMinutes - cut) })
    } else if (kind === 'defer' && task.deadline) {
      get().updateTask(taskId, { deadline: undefined, priority: 'P3' })
    } else if (kind === 'drop') {
      get().removeTask(taskId)
    }

    void preferences
    await get().buildWeek()
  },

  async explainBlock(blockId) {
    if (plannerLocked(get())) return
    const { tasks, preferences, busy, pins, mode, chat, proposal } = get()
    const block = proposal?.blocks.find((item) => item.id === blockId)
    if (!block) return
    const id = ++planRequestId
    set({ chatBusy: true })
    const result = await postChat({
      tasks,
      preferences,
      busy,
      pins,
      mode,
      message: `Why is “${block.title}” on ${block.weekday} at ${String(Math.floor(block.startMin / 60)).padStart(2, '0')}:${String(block.startMin % 60).padStart(2, '0')}?`,
      explainBlockId: blockId,
      ...request(new Date()),
    })
    if (id !== planRequestId) return
    if (result.ok) {
      set({
        chatBusy: false,
        chat: [
          ...chat,
          { id: `a_explain_${blockId}`, role: 'agent', text: result.data.reply, trace: result.data.trace },
        ],
      })
    } else {
      set({
        chatBusy: false,
        chat: [...chat, { id: `a_explain_err_${blockId}`, role: 'agent', text: result.error.message }],
      })
    }
  },

  async refreshCapability() {
    const [health, calendar] = await Promise.all([getHealth(), getCalendarStatus()])
    const agent = health.ok
      ? health.data.agent
      : { mode: 'local' as const, provider: 'local', model: '', reason: 'Health check failed' }
    set({
      capability: {
        demoMode: health.ok ? health.data.demoMode : true,
        agent,
        calendar: {
          configured: health.ok ? health.data.calendar.configured : false,
          connected: calendar.ok ? calendar.data.connected : false,
          missing: health.ok ? health.data.calendar.missing : [],
        },
      },
    })
  },

  acceptPreview(data, source, taskId) {
    if (plannerLocked(get()) || plannerSnapshotKey(get()) !== source) return false
    const proposal = data.proposal
    set({
      busy: proposal.busy,
      actionMessage: 'Preview applied to your draft. Nothing has been published.',
      proposal,
      tasks: proposal.tasks,
      preferences: proposal.preferences,
      pins: proposal.pins,
      trace: data.trace,
      notes: data.notes,
      status: 'ready',
      error: null,
      selectedBlockId: proposal.blocks.find((block) => block.taskId === taskId)?.id ?? null,
      syncState: { status: 'idle' },
    })
    persist(get())
    return true
  },

  async dryRun(approved) {
    if (plannerLocked(get()) || hasDraftChanges(get())) return
    const { proposal } = get()
    if (!proposal) return
    const blockIds = approved ?? proposal.blocks.filter((b) => b.kind === 'task').map((b) => b.id)
    if (blockIds.length === 0) return
    set({ syncState: { status: 'syncing', message: 'Checking what would be written…' } })
    const result = await postSync({ proposal, approvedBlockIds: blockIds, dryRun: true })
    if (!result.ok) {
      set({ syncState: { status: 'error', message: result.error.message } })
      return
    }
    set({
      syncState: {
        status: 'done',
        message: `${result.data.inserted} events would be written (nothing has been sent to Google).`,
        lastCount: result.data.inserted,
      },
    })
  },

  async exportIcs(approved) {
    if (plannerLocked(get()) || hasDraftChanges(get())) return
    const { proposal, syncState } = get()
    if (!proposal) return
    set({ syncState: { ...syncState, status: 'syncing', message: 'Building the calendar file…' } })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const blockIds = approved ?? proposal.blocks.filter((block) => block.kind === 'task').map((block) => block.id)
      if (!blockIds.length) {
        set({ syncState: { status: 'idle' } })
        return
      }
      const response = await fetch('/api/export/ics', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposal, approvedBlockIds: blockIds, includeMeetings: false }),
      })
      if (!response.ok) throw new Error(`Export failed (${response.status})`)
      const blob = await response.blob()

      // Same path a user expects from any "download" link: a real file, not a data URL.
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `calendra-${proposal.weekStart}.ics`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      set({
        syncState: {
          status: 'done',
          message: `Exported ${blockIds.length} blocks as an .ics file — import it in any calendar app.`,
          lastCount: blockIds.length,
        },
      })
    } catch (error) {
      set({
        syncState: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not build the calendar file.',
        },
      })
    } finally {
      clearTimeout(timer)
    }
  },

  async approveAndSync(blockIds) {
    if (plannerLocked(get()) || hasDraftChanges(get())) return
    const { proposal } = get()
    if (!proposal || blockIds.length === 0) return
    set({ syncState: { status: 'syncing', message: 'Writing approved blocks…' } })
    const result = await postSync({ proposal, approvedBlockIds: blockIds, dryRun: false })
    if (!result.ok) {
      set({ syncState: { status: 'error', message: result.error.message } })
      return
    }
    const { inserted, updated, failed } = result.data
    set({
      syncState: {
        status: failed.length ? 'error' : 'done',
        message: failed.length
          ? `${inserted + updated} written, ${failed.length} refused by Google. Re-run sync to retry those.`
          : `${inserted} added, ${updated} updated in your calendar.`,
        lastCount: inserted + updated,
      },
    })
  },

  async rollback() {
    if (plannerLocked(get())) return
    const { proposal } = get()
    if (!proposal) return
    const planId = `${proposal.weekStart}_${proposal.generatedAt}`
    set({ syncState: { status: 'syncing', message: 'Removing this plan from your calendar…' } })
    const { deletePlanEvents } = await import('@/lib/api')
    const result = await deletePlanEvents(planId)
    if (!result.ok) {
      set({ syncState: { status: 'error', message: result.error.message } })
      return
    }
    set({
      syncState: {
        status: 'done',
        message:
          result.data.deleted > 0
            ? `Removed ${result.data.deleted} events from your calendar.`
            : 'This plan has no events in your calendar — the plan itself is untouched.',
      },
    })
  },
}))

/** Convenience selectors used across the workspace. */
export const selectTaskBlocks = (state: State) => state.proposal?.blocks.filter((b) => b.kind === 'task') ?? []
export const selectSelectedBlock = (state: State) =>
  state.proposal?.blocks.find((b) => b.id === state.selectedBlockId) ?? null
