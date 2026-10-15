/**
 * UI tests — the planner, executed.
 *
 * Everything here runs the real components in jsdom against the real route handlers, the real agent
 * and the real engine (see `./harness/dom.ts`). The only mocks are geometry and the two OAuth routes
 * that need cookie scope.
 *
 * This is the closest thing to a browser that exists in this build sandbox. It is *not* a browser: it
 * proves the components wire up, the store round-trips, a drag produces the pin it should and the
 * keyboard behaves like the mouse. It proves nothing about pixels.
 */
import './harness/setup-dom'

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import React, { type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js'
import {
  applyRect,
  blockRect,
  dayWindow,
  HOUR_HEIGHT,
  pointerDown,
  pointerMove,
  pointerUp,
  routerStub,
  STRIP_RECT,
  xForDay,
  yFor,
} from './harness/dom'
import { usePlanner } from '@/lib/store/planner-store'
import { WeekGrid, HOUR_HEIGHT as GRID_HOUR_HEIGHT } from '@/components/planner/WeekGrid'
import { TaskInbox } from '@/components/planner/TaskInbox'
import { PlanReportPanel } from '@/components/planner/PlanReportPanel'
import { AgentChat } from '@/components/planner/AgentChat'
import { CalendarPanel } from '@/components/planner/CalendarPanel'
import PlannerPage from '@/app/planner/workspace'
import { addDaysISO } from '@/lib/scheduler/slots'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks } from '@/lib/sample-data'
import type { PlanProposal, PlacedBlock } from '@/lib/types'

const WEEK_START = currentWeekStart(new Date())
const Context = AppRouterContext as unknown as React.Context<unknown>

/** `next/link` needs an app-router context; there is no Next server in these tests. */
function Wrapper({ children }: { children: ReactNode }) {
  return React.createElement(Context.Provider, { value: routerStub }, children)
}

/** Hydrate into the demo week, then plan once through the real API route. */
async function buildDemoWeek(): Promise<PlanProposal> {
  window.localStorage.clear()
  await act(async () => {
    usePlanner.getState().hydrate()
  })
  await act(async () => {
    await usePlanner.getState().buildWeek()
  })
  const state = usePlanner.getState()
  assert.equal(state.status, 'ready', state.error?.message ?? 'the plan never arrived')
  assert.ok(state.proposal, 'no proposal')
  return state.proposal
}

function gridProps(proposal: PlanProposal) {
  return {
    blocks: proposal.blocks,
    busy: proposal.busy,
    preferences: proposal.preferences,
    weekLabel: proposal.weekLabel,
    weekStart: proposal.weekStart,
  }
}

/** The strip the drag maths measures against — given the geometry jsdom cannot compute. */
function strip() {
  const element = document.querySelector('[data-day-strip]')
  assert.ok(element, 'the day strip is missing from the grid')
  return applyRect(element, STRIP_RECT)
}

/** The day column's own display window, read from the DOM (see harness `dayWindow`). */
const windowOf = (date: string) => dayWindow(date)

/** The tile for a task, matched on the leading part of its accessible name. */
function tileFor(block: PlacedBlock) {
  const name = new RegExp(`^${block.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24)}`)
  const tiles = screen.getAllByRole('button').filter((button) => name.test(button.getAttribute('aria-label') ?? ''))
  assert.ok(tiles.length > 0, `no tile rendered for “${block.title}”`)
  return tiles[0] as HTMLElement
}

beforeEach(() => {
  cleanup()
  usePlanner.setState({
    proposal: null,
    pins: [],
    chat: [],
    status: 'idle',
    error: null,
    selectedBlockId: null,
    notes: [],
    trace: [],
    syncState: { status: 'idle' },
    filters: { energy: [], categories: [], pinnedOnly: false },
  })
})

before(() => {
  // The harness mirrors the grid's scale; if they ever drift, every drag test is a lie.
  assert.equal(HOUR_HEIGHT, GRID_HOUR_HEIGHT)
})

after(() => {
  cleanup()
})

describe('the workspace renders a real week', () => {
  it('plans over HTTP, then draws the blocks, the tasks and the verdict', async () => {
    const proposal = await buildDemoWeek()
    assert.ok(proposal.blocks.length > 5)

    render(
      React.createElement(
        'div',
        null,
        React.createElement(TaskInbox),
        React.createElement(WeekGrid, gridProps(proposal)),
        React.createElement(PlanReportPanel),
      ),
      { wrapper: Wrapper },
    )

    assert.equal(screen.queryByText(/Unrolling the paper/i), null, 'the grid never left its skeleton')
    for (const block of proposal.blocks.filter((item) => item.kind === 'task')) {
      tileFor(block)
    }

    assert.ok(screen.getByText(proposal.report.headline))
    assert.ok(screen.getAllByText(/Q4 board deck/i).length > 0)
  })

  it('protects lunch and the blackouts on the sheet', async () => {
    const proposal = await buildDemoWeek()
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    assert.ok(screen.getAllByText(/Lunch/i).length > 0, 'the protected lunch band is missing')
    for (const blackout of proposal.preferences.blackouts.filter((item) => item.weekday)) {
      const days = proposal.preferences.workingHours[blackout.weekday as 'mon']
      if (!days) continue
      // A blackout on a working day must be drawn; one that falls on a day off is simply not rendered.
      assert.ok(screen.getAllByText(new RegExp(blackout.label, 'i')).length >= 0)
    }
  })

  it('keeps the week inside a scroller instead of squeezing it, and puts the gutter on top', async () => {
    const proposal = await buildDemoWeek()
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })

    const stripElement = document.querySelector('[data-day-strip]')
    assert.ok(stripElement, 'the day strip is missing')

    // Walk up to the element that owns the horizontal overflow.
    let scroller: HTMLElement | null = stripElement.parentElement
    while (scroller && !/(^|\s)overflow-x-auto(\s|$)/.test(scroller.className)) scroller = scroller.parentElement
    assert.ok(scroller, 'the week is not inside a horizontal scroller — it will squeeze to a sliver on a phone')

    const floor = scroller.querySelector('[class*="min-w-["]')
    assert.ok(floor, 'the week has no minimum width, so seven days will compress to unreadable columns')

    // A 15-minute band is 11px tall; its label must not spill into the slot below it.
    const lunch = screen.getAllByText(/^Lunch$/i)[0]
    const band = lunch.closest('div[aria-hidden="true"]')
    assert.ok(band, 'the lunch band is not rendered as a band')
    assert.match(band.className, /overflow-hidden/, 'the protected band does not clip its own label')
  })

  it('labels each tile with its time, priority and reasons', async () => {
    const proposal = await buildDemoWeek()
    const block = proposal.blocks.find((item) => item.kind === 'task' && item.reasons.length > 0)
    assert.ok(block)
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    const label = tileFor(block).getAttribute('aria-label') ?? ''
    assert.match(label, /mon|tue|wed|thu|fri|sat|sun/i)
    assert.match(label, /\d{1,2}:\d{2}/, 'the tile does not state a time')
    assert.ok(label.length > 20, 'the tile carries no explanation (L3)')
  })
})

describe('drag and drop', () => {
  it('turns a drop into a pin, and the server replans around it', async () => {
    const proposal = await buildDemoWeek()
    const target = proposal.blocks.find((block) => block.kind === 'task' && block.weekday === 'mon' && block.minutes <= 90)
    assert.ok(target, 'no Monday block to drag')

    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    strip()
    const tile = tileFor(target)
    const from = blockRect(0, target.startMin, target.minutes, windowOf(target.date))
    applyRect(tile, from)

    // Wednesday 13:30 — inside working hours, clear of the demo meetings and their buffers.
    const wednesday = addDaysISO(proposal.weekStart, 2)
    const to = { x: xForDay(2), y: yFor(13 * 60 + 30, windowOf(wednesday)) }
    // A browser delivers these in separate tasks, and React flushes in between; do the same.
    await act(async () => pointerDown(tile, { x: xForDay(0), y: from.top }))
    await act(async () => pointerMove({ x: (xForDay(0) + to.x) / 2, y: (from.top + to.y) / 2 }))
    await act(async () => pointerMove(to))
    await act(async () => pointerUp(to))

    await waitFor(() => {
      const pin = usePlanner.getState().pins.find((item) => item.taskId === target.taskId)
      assert.ok(pin, 'the drop produced no pin')
      assert.equal(pin.date, wednesday)
      // Grabbed at the very top of the tile, dropped at 13:30 — so it lands at 13:30, not at the top
      // of the day (the bug this test exists for) and not on the neighbouring quarter hour.
      assert.equal(pin.startMin, 13 * 60 + 30, 'the block did not land where it was dropped')
      assert.equal(pin.minutes, target.minutes, 'the drop changed the block length')
    })

    await waitFor(() => {
      const refreshed = usePlanner.getState().proposal
      assert.ok(refreshed)
      const moved = refreshed.blocks.find((block) => block.taskId === target.taskId && block.startMin === 13 * 60 + 30)
      assert.ok(moved, 'the server did not honour the pin')
      assert.equal(moved?.pinned, true)
      assert.equal(refreshed.report.warnings.some((warning) => warning.code === 'pin-ignored'), false)
    })
  })

  it('does not throw away a drag when the user then asks the agent something (N-9)', async () => {
    const proposal = await buildDemoWeek()
    const target = proposal.blocks.find((block) => block.kind === 'task' && block.weekday === 'mon' && block.minutes <= 90)
    assert.ok(target, 'no Monday block to drag')

    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    strip()
    const tile = tileFor(target)
    const from = blockRect(0, target.startMin, target.minutes, windowOf(target.date))
    applyRect(tile, from)
    const wednesday = addDaysISO(proposal.weekStart, 2)
    const to = { x: xForDay(2), y: yFor(13 * 60 + 30, windowOf(wednesday)) }

    await act(async () => pointerDown(tile, { x: xForDay(0), y: from.top }))
    await act(async () => pointerMove(to))
    await act(async () => pointerUp(to))
    await waitFor(() => assert.ok(usePlanner.getState().pins.some((pin) => pin.taskId === target.taskId)))

    // Now talk to the agent about something else entirely. A drag is a decision; asking a question
    // must not silently undo it.
    await act(async () => {
      await usePlanner.getState().sendMessage('what fits in the week?')
    })

    const pin = usePlanner.getState().pins.find((item) => item.taskId === target.taskId)
    assert.ok(pin, 'the refinement erased the pin the user made by dragging')
    assert.equal(pin.date, wednesday)
    assert.equal(pin.startMin, 13 * 60 + 30)
    const block = usePlanner.getState().proposal?.blocks.find((item) => item.taskId === target.taskId && item.date === wednesday)
    assert.equal(block?.startMin, 13 * 60 + 30, 'the block left the spot the user put it in')
  })

  it('refuses a drop onto a meeting, and says so instead of quietly moving it elsewhere', async () => {
    const proposal = await buildDemoWeek()
    const target = proposal.blocks.find((block) => block.kind === 'task' && block.weekday === 'mon' && block.minutes <= 90)
    assert.ok(target)
    const wednesday = addDaysISO(proposal.weekStart, 2)
    // Wednesday 15:00 is the “Hiring panel”. Dropping there is a request the engine cannot grant.
    const meeting = proposal.busy.find((event) => event.date === wednesday && event.startMin === 15 * 60)
    assert.ok(meeting, 'the demo week no longer has a Wednesday meeting to collide with')

    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    strip()
    const tile = tileFor(target)
    const from = blockRect(0, target.startMin, target.minutes, windowOf(target.date))
    applyRect(tile, from)

    await act(async () => pointerDown(tile, { x: xForDay(0), y: from.top }))
    await act(async () => pointerMove({ x: xForDay(2), y: yFor(15 * 60, windowOf(wednesday)) }))
    await act(async () => pointerUp({ x: xForDay(2), y: yFor(15 * 60, windowOf(wednesday)) }))

    await waitFor(() => {
      const refreshed = usePlanner.getState().proposal
      assert.ok(refreshed)
      // The block is not sitting on the meeting…
      const onTopOfMeeting = refreshed.blocks.some(
        (block) => block.taskId === target.taskId && block.date === wednesday && block.startMin < meeting.endMin && meeting.startMin < block.endMin,
      )
      assert.equal(onTopOfMeeting, false, 'the engine wrote a block over a meeting')
      // …and the refusal is reported rather than silently swallowed (D-014).
      assert.ok(
        refreshed.report.warnings.some((warning) => warning.code === 'pin-ignored'),
        'a refused pin went unreported',
      )
    })
  })

  it('ignores a click that never moves', async () => {
    const proposal = await buildDemoWeek()
    const target = proposal.blocks.find((block) => block.kind === 'task')
    assert.ok(target)
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    strip()
    const tile = tileFor(target)
    const from = blockRect(0, target.startMin, target.minutes, windowOf(target.date))
    applyRect(tile, from)

    const point = { x: from.left + 10, y: from.top }
    await act(async () => pointerDown(tile, point))
    await act(async () => pointerUp(point))

    assert.equal(usePlanner.getState().pins.length, 0, 'a motionless click created a pin')
  })

  it('resizes by dragging the handle, and keeps the start put', async () => {
    const proposal = await buildDemoWeek()
    // A single-chunk Monday block, so there is exactly one grip with that name.
    const target =
      proposal.blocks.find((block) => block.kind === 'task' && block.weekday === 'mon' && block.chunkCount === 1 && block.minutes >= 30) ??
      proposal.blocks.find((block) => block.kind === 'task' && block.weekday === 'mon' && block.minutes >= 30)
    assert.ok(target)

    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    strip()
    // The grip is a `role="separator"` inside the tile, not a button. A repeated task has one per
    // occurrence, and they are rendered in day order, so the Monday one comes first.
    const handle = screen.getAllByRole('separator', { name: `Resize ${target.title}` })[0] as HTMLElement

    // A tile of `minutes` occupies `minutes / 60 * HOUR_HEIGHT` pixels; pull its base down 30 minutes.
    const top = blockRect(0, target.startMin, target.minutes, windowOf(target.date)).top
    const bottom = top + (target.minutes / 60) * HOUR_HEIGHT
    applyRect(handle, { left: 56, top: bottom - 6, width: 140, height: 12, right: 196, bottom: bottom + 6, x: 56, y: bottom - 6 })

    const to = { x: xForDay(0), y: bottom + (HOUR_HEIGHT / 2) }
    await act(async () => pointerDown(handle, { x: xForDay(0), y: bottom - 3 }))
    await act(async () => pointerMove(to))
    await act(async () => pointerUp(to))

    await waitFor(() => {
      const pin = usePlanner.getState().pins.find((item) => item.taskId === target.taskId)
      assert.ok(pin, 'resizing produced no pin')
      assert.equal(pin.startMin, target.startMin, 'resizing moved the block')
      assert.ok(pin.minutes > target.minutes, 'the block did not get longer')
      assert.equal(pin.minutes, target.minutes + 30, 'the resize ignored the pointer distance')
    })
  })

  it('selects a block when it is clicked', async () => {
    const proposal = await buildDemoWeek()
    const target = proposal.blocks.find((block) => block.kind === 'task')
    assert.ok(target)
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    const tile = tileFor(target)
    await act(async () => {
      fireEvent.click(tile)
    })
    assert.equal(usePlanner.getState().selectedBlockId, target.id)
  })
})

describe('keyboard parity', () => {
  /**
   * A block with a genuinely free quarter-hour after it. Most blocks in the demo week are packed
   * against a meeting, where a move *should* be refused and reported (D-014) — that path has its
   * own test; this one is about the move that works.
   */
  function movableBlock(proposal: PlanProposal): PlacedBlock | undefined {
    const SHIFT = 15
    const taken = (block: PlacedBlock, start: number, end: number) =>
      proposal.busy.some((event) => event.date === block.date && event.startMin < end && start < event.endMin) ||
      proposal.blocks.some((other) => other.id !== block.id && other.date === block.date && other.startMin < end && start < other.endMin)
    return proposal.blocks.find((block) => {
      if (block.kind !== 'task') return false
      const hours = proposal.preferences.workingHours[block.weekday]
      if (!hours || block.endMin + SHIFT > hours.end) return false
      return !taken(block, block.endMin, block.endMin + SHIFT)
    })
  }

  it('moves a block with the arrow keys, exactly like a drag', async () => {
    const proposal = await buildDemoWeek()
    const target = movableBlock(proposal)
    assert.ok(target)
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    const tile = tileFor(target)
    tile.focus()
    assert.equal(document.activeElement, tile, 'the tile is not focusable')

    await act(async () => {
      fireEvent.keyDown(tile, { key: 'ArrowDown' })
    })

    await waitFor(() => {
      const pin = usePlanner.getState().pins.find((item) => item.taskId === target.taskId)
      assert.ok(pin, 'the arrow key did not move the block')
      assert.equal(pin.date, target.date)
      assert.ok(pin.startMin > target.startMin, 'the block did not move later')
      assert.ok(pin.startMin - target.startMin <= 60, 'one arrow jumped more than an hour')
    })
  })

  it('resizes with alt+arrows without moving the start', async () => {
    const proposal = await buildDemoWeek()
    const target = proposal.blocks.find((block) => block.kind === 'task' && block.minutes >= 45)
    assert.ok(target, 'no block long enough to resize')
    render(React.createElement(WeekGrid, gridProps(proposal)), { wrapper: Wrapper })
    const tile = tileFor(target)

    await act(async () => {
      fireEvent.keyDown(tile, { key: 'ArrowUp', altKey: true })
    })

    await waitFor(() => {
      const pin = usePlanner.getState().pins.find((item) => item.taskId === target.taskId)
      assert.ok(pin, 'alt+arrow produced no pin')
      assert.equal(pin.startMin, target.startMin, 'resizing moved the block')
      assert.ok(pin.minutes < target.minutes, 'alt+up did not shorten the block')
    })
  })
})

describe('free-text intake', () => {
  it('turns a brief into tasks and a plan, through the chat route', async () => {
    window.localStorage.clear()
    await act(async () => {
      usePlanner.getState().hydrate()
      usePlanner.getState().setTasks([])
    })
    render(React.createElement(TaskInbox), { wrapper: Wrapper })

    const brief = screen.getByLabelText(/what your week holds/i)
    fireEvent.change(brief, {
      target: { value: 'Finish the board deck by Thursday 5pm (4 hours). Gym three times this week for 45 minutes.' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /build my week/i }))
    })

    await waitFor(() => assert.ok(usePlanner.getState().tasks.length >= 2, 'the brief produced no tasks'))
    const tasks = usePlanner.getState().tasks
    assert.ok(tasks.some((task) => /deck/i.test(task.title)))
    assert.ok(tasks.some((task) => /gym/i.test(task.title)))
    assert.equal(usePlanner.getState().status, 'ready')
    const proposal = usePlanner.getState().proposal
    assert.ok(proposal)
    assert.ok(proposal.blocks.length > 0)
  })
})

describe('conversation', () => {
  it('shows the reply and applies the change to the plan on screen', async () => {
    const proposal = await buildDemoWeek()
    assert.equal(proposal.preferences.blackouts.filter((item) => item.weekday === 'fri').length, 0)
    render(React.createElement(AgentChat), { wrapper: Wrapper })

    const box = screen.getByLabelText(/message the planner agent/i)
    fireEvent.change(box, { target: { value: "I'm out Friday afternoon" } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    })

    await waitFor(() => assert.equal(usePlanner.getState().chat.length, 2, 'the agent never replied'))
    const reply = usePlanner.getState().chat.at(-1)
    assert.equal(reply?.role, 'agent')
    assert.ok((reply?.text ?? '').length > 0)
    assert.ok(
      (document.body.textContent ?? '').includes((reply?.text ?? '').slice(0, 16)),
      'the reply never reached the DOM',
    )

    // The absence reached the plan, not just the chat transcript.
    const friday = usePlanner.getState().preferences.blackouts.find((item) => item.weekday === 'fri')
    assert.ok(friday, 'the Friday absence was not recorded')
    assert.equal(friday?.start, 12 * 60)
  })

  it('reveals the tool trace so the plan is auditable', async () => {
    await buildDemoWeek()
    render(React.createElement(AgentChat), { wrapper: Wrapper })
    const state = usePlanner.getState()
    assert.ok(state.trace.length > 0, 'no tool trace was recorded')
    assert.ok(state.trace.some((step) => step.tool === 'build_schedule'), 'the engine step is missing from the trace')
  })
})

describe('recurrence in the task list (T-601)', () => {
  it('shows the cadence of a repeating task instead of a bare count', async () => {
    window.localStorage.clear()
    await act(async () => {
      usePlanner.getState().hydrate()
      usePlanner.getState().setTasks([
        {
          id: 't_prs',
          title: 'Review incoming PRs',
          estimateMinutes: 30,
          priority: 'P2',
          energy: 'admin',
          category: 'work',
          splittable: false,
          minChunkMinutes: 30,
          repeatDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          source: 'user',
        },
      ])
    })
    render(React.createElement(TaskInbox), { wrapper: Wrapper })
    assert.ok(screen.getByText(/weekdays/i), 'the repeating task does not say when it repeats')
  })
})

describe('calendar panel', () => {
  it('previews the exact events without any Google configuration', async () => {
    await buildDemoWeek()
    await act(async () => {
      await usePlanner.getState().refreshCapability()
    })
    render(React.createElement(CalendarPanel), { wrapper: Wrapper })

    assert.ok(screen.getByText(/Google Calendar/i))
    // Unconfigured is its own state: setup instructions, no pretence of a connection.
    assert.ok(screen.getByText(/Not configured on this deployment/i))
    assert.equal(screen.queryByRole('link', { name: /connect google calendar/i }), null)
    assert.ok(screen.getAllByText(/GOOGLE_CLIENT_ID/).length > 0)

    // The honest gates: writing is unavailable until a calendar is connected.
    const approve = screen.getByRole('button', { name: /approve/i })
    assert.equal(approve.hasAttribute('disabled'), true, 'a write was offered without a connected calendar')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dry run/i }))
    })
    await waitFor(() => {
      const state = usePlanner.getState().syncState
      assert.equal(state.status, 'done', state.message ?? 'the dry run failed')
      assert.ok((state.lastCount ?? 0) > 0, 'the dry run previewed nothing')
    })
  })

  it('exports the week as an .ics file with no Google account involved', async () => {
    await buildDemoWeek()
    await act(async () => {
      await usePlanner.getState().refreshCapability()
    })
    render(React.createElement(CalendarPanel), { wrapper: Wrapper })

    const button = screen.getByRole('button', { name: /download \.ics/i })
    assert.equal(button.hasAttribute('disabled'), false, 'the export was gated behind Google')

    // jsdom has no object URLs or downloads; record what the code tried to hand the browser.
    const created: string[] = []
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = (blob: Blob) => {
      created.push(blob.type)
      return 'blob:calendra'
    }
    URL.revokeObjectURL = () => {}
    const click = HTMLAnchorElement.prototype.click
    let downloaded: string | null = null
    HTMLAnchorElement.prototype.click = function clickAnchor(this: HTMLAnchorElement) {
      downloaded = this.download
    }

    try {
      await act(async () => {
        fireEvent.click(button)
      })
      await waitFor(() => {
        const state = usePlanner.getState().syncState
        assert.equal(state.status, 'done', state.message ?? 'the export failed')
      })
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      HTMLAnchorElement.prototype.click = click
    }

    assert.equal(created.length, 1, 'the export did not produce a download')
    assert.match(created[0] ?? '', /^text\/calendar/, 'the exported blob was not a calendar file')
    assert.match(downloaded ?? '', /^calendra-.*\.ics$/)
  })
})

describe('the planner page', () => {
  it('renders the whole workspace and plans on arrival', async () => {
    render(React.createElement(PlannerPage), { wrapper: Wrapper })
    await waitFor(() => assert.ok(screen.getAllByText(/Your week/i).length > 0), { timeout: 5000 })

    // Nothing is planned until the user asks: the page renders an empty week and a call to action.
    assert.equal(usePlanner.getState().proposal, null)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /build my week/i })[0] as HTMLElement)
    })
    await waitFor(() => assert.ok(usePlanner.getState().proposal, 'the page never planned a week'))
    assert.ok(screen.getAllByText(/Plan report/i).length > 0)
    assert.ok(screen.getAllByText(/Talk to the plan/i).length > 0)
  })

  it('never nests a button inside a link', async () => {
    render(React.createElement(PlannerPage), { wrapper: Wrapper })
    await waitFor(() => {
      const capability = usePlanner.getState().capability
      assert.ok(capability, 'the capability probe never ran')
    })
    for (const anchor of Array.from(document.querySelectorAll('a'))) {
      assert.equal(anchor.querySelector('button'), null, `button inside anchor: ${anchor.getAttribute('href')}`)
    }
  })

  it('says the reasoner is local when there is no key', async () => {
    render(React.createElement(PlannerPage), { wrapper: Wrapper })
    await waitFor(() => {
      const capability = usePlanner.getState().capability
      assert.ok(capability, 'the capability probe never ran')
      assert.equal(capability?.agent.mode, 'local')
      assert.equal(capability?.calendar.configured, false)
    })
    assert.ok(screen.getAllByText(/demo|local|sample|reasoner/i).length > 0)
  })
})

describe('demo data', () => {
  it('hydrates a realistic week, not an empty one', async () => {
    await buildDemoWeek()
    const state = usePlanner.getState()
    assert.ok(state.tasks.length >= 6, 'the demo week has no tasks')
    assert.ok(state.busy.length > 0, 'the demo week has no meetings')
    assert.equal(state.busy[0]?.date.slice(0, 7), WEEK_START.slice(0, 7))
    assert.deepEqual(state.preferences.blackouts.length, defaultPreferences().blackouts.length)
    assert.equal(demoBusy(WEEK_START).length, state.busy.length)
    assert.ok(demoTasks(WEEK_START).length <= state.tasks.length + 2)
  })
})
