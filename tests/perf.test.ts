import './harness/setup-dom'

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import React, { type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
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
} from './harness/dom'
import { usePlanner } from '@/lib/store/planner-store'
import { WeekGrid, HOUR_HEIGHT as GRID_HOUR_HEIGHT } from '@/components/planner/WeekGrid'
import type { PlanProposal } from '@/lib/types'

/**
 * Drag performance — the interaction that has to feel immediate (INP).
 *
 * A drag fires `pointermove` far more often than the screen refreshes (high-polling-rate mice and
 * trackpads deliver 100–1000 Hz), so two things must hold no matter how many events arrive:
 *
 *  1. **No layout reads per move.** Reading `getBoundingClientRect()`/`clientWidth` while React has
 *     a pending DOM write forces the browser to recompute style and layout *before it can answer* —
 *     a synchronous reflow per frame, the classic cause of a bad INP. Geometry must be measured once
 *     per gesture, not once per event.
 *  2. **One render per frame, not one per event.** Coalescing moves into a single commit keeps the
 *     main thread free between frames; a render per event means each one has to be waited out.
 *
 * Neither is visible in a screenshot, and both are invisible to a functional test — which is exactly
 * why they are asserted here.
 */

const Context = AppRouterContext as unknown as React.Context<unknown>

function Wrapper({ children }: { children: ReactNode }) {
  return React.createElement(Context.Provider, { value: routerStub }, children)
}

async function buildDemoWeek(): Promise<PlanProposal> {
  window.localStorage.clear()
  await act(async () => {
    usePlanner.getState().hydrate()
  })
  await act(async () => {
    await usePlanner.getState().buildWeek()
  })
  const proposal = usePlanner.getState().proposal
  assert.ok(proposal, 'no proposal to render')
  return proposal
}

/** Instrument the geometry the drag maths reads, without changing what it returns. */
function trackLayoutReads(strip: HTMLElement, tile: HTMLElement) {
  let reads = 0

  const originals = [strip, tile].map((element) => {
    const original = element.getBoundingClientRect.bind(element)
    element.getBoundingClientRect = () => {
      reads += 1
      return original()
    }
    return { element, original }
  })

  const stripWidth = strip.clientWidth
  Object.defineProperty(strip, 'clientWidth', {
    configurable: true,
    get() {
      reads += 1
      return stripWidth
    },
  })

  return {
    count: () => reads,
    reset: () => {
      reads = 0
    },
    restore: () => {
      for (const { element, original } of originals) element.getBoundingClientRect = original
      Object.defineProperty(strip, 'clientWidth', { configurable: true, value: stripWidth })
    },
  }
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
  assert.equal(HOUR_HEIGHT, GRID_HOUR_HEIGHT)
})

after(() => cleanup())

describe('drag performance (INP)', () => {
  /** Render the demo week and grab a Monday tile near its top, ready to drag. */
  async function setUpDrag(onRender?: () => void) {
    const proposal = await buildDemoWeek()
    const grid = React.createElement(WeekGrid, {
      blocks: proposal.blocks,
      busy: proposal.busy,
      preferences: proposal.preferences,
      weekLabel: proposal.weekLabel,
      weekStart: proposal.weekStart,
    })
    render(onRender ? React.createElement(React.Profiler, { id: 'week', onRender }, grid) : grid, { wrapper: Wrapper })

    const stripElement = document.querySelector('[data-day-strip]')
    assert.ok(stripElement instanceof HTMLElement, 'the day strip is missing')
    const strip = applyRect(stripElement, STRIP_RECT)

    const target = proposal.blocks.find(
      (block) => block.kind === 'task' && block.weekday === 'mon' && block.minutes <= 90,
    )
    assert.ok(target, 'no Monday block to drag')

    const name = new RegExp(`^${target.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24)}`)
    const tile = screen
      .getAllByRole('button')
      .filter((button) => name.test(button.getAttribute('aria-label') ?? ''))[0] as HTMLElement
    assert.ok(tile, 'no tile for the target block')

    const windowStart = dayWindow(target.date)
    applyRect(tile, blockRect(0, target.startMin, target.minutes, windowStart))

    // Grab one minute into the tile: the offset is a minute, so a move of one slot moves the block.
    await act(async () => pointerDown(tile, { x: xForDay(0), y: HOUR_HEIGHT * 0 + 44 + 1 }))
    assert.ok(tile.className.includes('paper-lifted'), 'the drag did not start')

    return { proposal, strip, tile, target, windowStart }
  }

  it('measures geometry once per gesture, not once per pointer move', async () => {
    const { strip, tile, target, windowStart } = await setUpDrag()
    const tracker = trackLayoutReads(strip, tile)
    tracker.reset()

    const moves = 24
    const startedAt = performance.now()
    for (let index = 1; index <= moves; index += 1) {
      const y = 44 + ((target.startMin + index * 15 - windowStart) / 60) * HOUR_HEIGHT
      await act(async () => pointerMove({ x: xForDay(0), y }))
    }
    const elapsed = performance.now() - startedAt

    const reads = tracker.count()
    tracker.restore()
    await act(async () => pointerUp({ x: xForDay(0), y: 44 }))

    // Informational: jsdom timings are not a browser, but the trend across a change is meaningful.
    console.log(`      · ${moves} moves · ${reads} layout reads · ${elapsed.toFixed(1)}ms`)
    assert.ok(
      reads <= 2,
      `${moves} pointer moves caused ${reads} forced layout reads — the drag must measure the strip once and reuse it`,
    )
  })

  it('coalesces a burst of pointer moves into a single render', async () => {
    let commits = 0
    const { target, windowStart } = await setUpDrag(() => {
      commits += 1
    })

    commits = 0
    // Five events inside one frame, as a 120 Hz mouse delivers them.
    await act(async () => {
      for (let index = 1; index <= 5; index += 1) {
        const y = 44 + ((target.startMin + index * 15 - windowStart) / 60) * HOUR_HEIGHT
        pointerMove({ x: xForDay(0), y })
      }
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    })

    assert.ok(commits <= 2, `five moves inside one frame produced ${commits} renders — they must coalesce`)
  })

})

/**
 * The rules panel writes to localStorage on every input event.
 *
 * `localStorage.setItem` is synchronous disk I/O on the main thread. A range input fires `change` per
 * pixel, so dragging the buffer slider used to write the entire task list ~60×/second; the drag lagged
 * behind the cursor and the app read as hung. The write is now coalesced — the first call still writes
 * immediately, so storage is never stale for long, and the rest fold into at most one more write.
 */
describe('preference edits do not thrash storage', () => {
  it('coalesces a burst of slider events into at most two writes', async () => {
    const realSetItem = window.localStorage.setItem.bind(window.localStorage)
    let writes = 0
    window.localStorage.setItem = ((...args: Parameters<Storage['setItem']>) => {
      writes += 1
      return realSetItem(...args)
    }) as Storage['setItem']

    try {
      writes = 0
      // Sixty events, as a slider dragged across its track delivers them.
      await act(async () => {
        for (let minutes = 0; minutes <= 59; minutes += 1) {
          usePlanner.getState().setPreferences({ bufferMinutes: minutes % 46 })
        }
      })
      assert.ok(writes <= 1, `60 slider events produced ${writes} synchronous writes before settling`)

      // Let the coalescing window close, then confirm the latest value did land.
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 320))
      })
      assert.ok(writes <= 2, `60 slider events produced ${writes} writes in total — must coalesce to a leading + one trailing`)

      const stored = JSON.parse(window.localStorage.getItem('calendra.session.v1') ?? '{}') as {
        preferences?: { bufferMinutes?: number }
      }
      // The burst ended on `59 % 46`; the trailing write must carry that, not an earlier value.
      assert.equal(stored.preferences?.bufferMinutes, 59 % 46, 'the trailing write lost the final value')
    } finally {
      window.localStorage.setItem = realSetItem
    }
  })
})
