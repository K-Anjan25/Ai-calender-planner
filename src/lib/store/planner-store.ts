'use client'

import { create } from 'zustand'
import {
  type AgentStep,
  type BusyEvent,
  type Pin,
  type PlanProposal,
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
  buildWeek(freeText?: string): Promise<void>
  sendMessage(message: string): Promise<void>
  pinBlock(blockId: string, date: string, startMin: number, minutes?: number): Promise<void>
  unpinTask(taskId: string): Promise<void>
  applyTradeoff(kind: string, taskId: string): Promise<void>
  explainBlock(blockId: string): Promise<void>
  refreshCapability(): Promise<void>
  dryRun(): Promise<void>
  exportIcs(): Promise<void>
  approveAndSync(blockIds: string[]): Promise<void>
  rollback(): Promise<void>
}

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

export const usePlanner = create<State & Actions>((set, get) => ({
  tasks: [],
  preferences: defaultPreferences(),
  busy: [],
  pins: [],
  proposal: null,
  status: 'idle',
  error: null,
  notes: [],
  trace: [],
  mode: 'auto',
  demoSet: 'realistic',
  capability: null,
  railTab: 'tasks',
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
      if (raw) restored = JSON.parse(raw) as Partial<State>
    } catch {
      restored = {}
    }
    const demoSet = restored.demoSet ?? 'realistic'
    const hasTasks = Array.isArray(restored.tasks) && restored.tasks.length > 0
    set({
      tasks: hasTasks ? (restored.tasks as Task[]) : demoTasks(weekStart),
      preferences: { ...defaultPreferences(), ...(restored.preferences ?? {}) },
      demoSet,
      mode: restored.mode ?? 'auto',
      busy: demoBusy(weekStart),
      pins: [],
    })
  },

  setRailTab(railTab) {
    set({ railTab })
  },

  setMode(mode) {
    set({ mode })
    persist({ ...get(), mode })
  },

  setPreferences(patch) {
    const preferences = { ...get().preferences, ...patch }
    set({ preferences })
    persist({ ...get(), preferences })
  },

  setTasks(tasks) {
    set({ tasks })
    persist({ ...get(), tasks })
  },

  addTask(task) {
    const tasks = [...get().tasks, task]
    set({ tasks })
    persist({ ...get(), tasks })
  },

  updateTask(id, patch) {
    const tasks = get().tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
    set({ tasks })
    persist({ ...get(), tasks })
  },

  removeTask(id) {
    const tasks = get().tasks.filter((task) => task.id !== id)
    const pins = get().pins.filter((pin) => pin.taskId !== id)
    set({ tasks, pins })
    persist({ ...get(), tasks })
  },

  loadDemoSet(which) {
    const weekStart = currentWeekStart()
    set({
      demoSet: which,
      tasks: which === 'overloaded' ? overloadedTasks(weekStart) : demoTasks(weekStart),
      busy: demoBusy(weekStart),
      pins: [],
      chat: [],
      selectedBlockId: null,
    })
    persist({ ...get(), demoSet: which })
  },

  clearTasks() {
    set({ tasks: [], pins: [], proposal: null, status: 'idle' })
    persist({ ...get(), tasks: [] })
  },

  setBusy(busy) {
    set({ busy })
  },

  selectBlock(selectedBlockId) {
    set({ selectedBlockId })
  },

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } })
  },

  async buildWeek(freeText) {
    const { tasks, preferences, busy, pins, mode } = get()
    set({ status: 'planning', error: null })
    const result = await postPlan({
      tasks,
      preferences,
      busy,
      pins,
      mode,
      instruction: freeText && freeText.trim().length > 2 ? freeText : undefined,
      ...request(new Date()),
    })

    if (!result.ok) {
      set({ status: 'error', error: result.error })
      return
    }

    set({
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
    const { tasks, preferences, busy, pins, mode, chat, proposal } = get()
    const entry: ChatEntry = { id: `u_${chat.length}_${message.length}`, role: 'user', text: message }
    set({ chat: [...chat, entry], chatBusy: true, error: null })

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
        .map((block) => ({ id: block.id, taskId: block.taskId, date: block.date, startMin: block.startMin, minutes: block.minutes })),
      ...request(new Date()),
    })

    if (!result.ok) {
      set({
        chatBusy: false,
        chat: [
          ...get().chat,
          { id: `a_err_${Date.now()}`, role: 'agent', text: result.error.message },
        ],
      })
      return
    }

    const data = result.data
    set({
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
        { id: `a_${get().chat.length}_${data.reply.length}`, role: 'agent', text: data.reply, changes: data.changes, trace: data.trace },
      ],
    })
    persist({ ...get(), tasks: data.tasks, preferences: data.preferences })
  },

  async pinBlock(blockId, date, startMin, minutes) {
    const { proposal, pins, tasks, preferences, busy, mode } = get()
    if (!proposal) return
    const block = proposal.blocks.find((b) => b.id === blockId)
    if (!block) return

    const snap = (value: number) => Math.round(value / SNAP_MINUTES) * SNAP_MINUTES
    const nextPins: Pin[] = [
      ...pins.filter((pin) => pin.taskId !== block.taskId || pin.date !== date),
      { taskId: block.taskId, date, startMin: snap(startMin), minutes: snap(minutes ?? block.minutes) },
    ]

    // Optimistic: show the move immediately, then let the engine confirm or correct it (D-009).
    set({
      pins: nextPins,
      status: 'planning',
      proposal: {
        ...proposal,
        blocks: proposal.blocks.map((b) =>
          b.id === blockId ? { ...b, date, startMin: snap(startMin), endMin: snap(startMin) + snap(minutes ?? b.minutes), pinned: true } : b,
        ),
      },
    })

    const result = await postPlan({ tasks, preferences, busy, pins: nextPins, mode, ...request(new Date()) })
    if (!result.ok) {
      set({ status: 'error', error: result.error })
      return
    }
    set({
      proposal: result.data.proposal,
      pins: result.data.proposal.pins,
      status: 'ready',
      trace: result.data.trace,
      selectedBlockId: result.data.proposal.blocks.find((b) => b.taskId === block.taskId)?.id ?? null,
    })
  },

  async unpinTask(taskId) {
    const { pins, tasks, preferences, busy, mode } = get()
    const nextPins = pins.filter((pin) => pin.taskId !== taskId)
    set({ pins: nextPins, status: 'planning' })
    const result = await postPlan({ tasks, preferences, busy, pins: nextPins, mode, ...request(new Date()) })
    if (!result.ok) {
      set({ status: 'error', error: result.error })
      return
    }
    set({ proposal: result.data.proposal, status: 'ready' })
  },

  /**
   * Trade-off options are the human end of the escalation ladder. Applying one is expressed as a
   * concrete preference/task change and then planned normally — never as a special case in the engine.
   */
  async applyTradeoff(kind, taskId) {
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
    const { tasks, preferences, busy, pins, mode, chat, proposal } = get()
    const block = proposal?.blocks.find((item) => item.id === blockId)
    if (!block) return
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
    if (result.ok) {
      set({
        chatBusy: false,
        chat: [...chat, { id: `a_explain_${blockId}`, role: 'agent', text: result.data.reply, trace: result.data.trace }],
      })
    } else {
      set({ chatBusy: false, chat: [...chat, { id: `a_explain_err_${blockId}`, role: 'agent', text: result.error.message }] })
    }
  },

  async refreshCapability() {
    const [health, calendar] = await Promise.all([getHealth(), getCalendarStatus()])
    const agent = health.ok ? health.data.agent : { mode: 'local' as const, provider: 'local', model: '', reason: 'Health check failed' }
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

  async dryRun() {
    const { proposal } = get()
    if (!proposal) return
    const blockIds = proposal.blocks.filter((b) => b.kind === 'task').map((b) => b.id)
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

  async exportIcs() {
    const { proposal, syncState } = get()
    if (!proposal) return
    set({ syncState: { ...syncState, status: 'syncing', message: 'Building the calendar file…' } })
    try {
      const blockIds = proposal.blocks.filter((block) => block.kind === 'task').map((block) => block.id)
      const response = await fetch('/api/export/ics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposal, approvedBlockIds: blockIds, includeMeetings: true }),
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
    }
  },

  async approveAndSync(blockIds) {
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
