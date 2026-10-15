import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { walkSource } from './harness/walk'
import { layoutColumns } from '@/components/planner/WeekGrid'
import type { PlacedBlock } from '@/lib/types'

/** A tile for the overlap layout; only the fields the layout reads matter. */
function tile(id: string, startMin: number, minutes: number): PlacedBlock {
  return { id, taskId: id, title: id, kind: 'task', date: '2026-10-12', startMin, endMin: startMin + minutes, minutes } as PlacedBlock
}

/**
 * Layout invariants of the paper controls and the week grid.
 *
 * Every assertion here stands for a bug that shipped and that the user could see:
 *
 *  - `w-full` in a control's base classes silently cancels any width its caller passes. Both are
 *    utilities at the same specificity, so the cascade decides by source order — and Tailwind emits
 *    `.w-full` *after* `.w-[86px]`. The working-hours rows in the rules panel were 100% wide inside a
 *    330px rail, which is the "text overflowing" that was reported.
 *  - seven day columns sharing a phone's width is 43px each, and no amount of wrapping makes a
 *    calendar readable at 43px.
 *
 * These are static checks. They cannot see a pixel — there is no layout engine here (T-507) — but both
 * bugs were *visible in the source*, and a test that reads the source catches them for free.
 */

const ROOT = join(import.meta.dirname, '..')
const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
const controls = readFileSync(join(ROOT, 'src/components/paper/PaperControls.tsx'), 'utf8')
const weekGrid = readFileSync(join(ROOT, 'src/components/planner/WeekGrid.tsx'), 'utf8')

describe('a control’s default width can always be overridden', () => {
  it('sets the field default from the components layer, not from a utility class', () => {
    const rule = css.match(/\.paper-field\s*\{([^}]*)\}/)
    assert.ok(rule, '.paper-field is gone from globals.css — fields have no default width')
    assert.match(rule[1], /width:\s*100%/, 'the field default width was changed or removed')
    assert.match(rule[1], /min-width:\s*0/, 'a field must be able to shrink inside a flex row')
  })

  it('never puts `w-full` in a control’s base classes', () => {
    // Only the three field shells carry `paper-well paper-field`; `paper-well` alone is the recess
    // used by tabs and lists, which may size themselves however they like.
    const classLists = controls.match(/'paper-well paper-field[^']*'/g) ?? []
    assert.equal(classLists.length, 3, `expected input/textarea/select to carry .paper-field, found ${classLists.length}`)
    for (const list of classLists) {
      assert.doesNotMatch(list, /\bw-full\b/, `${list} — \`w-full\` here makes every caller's width override dead code`)
      assert.match(list, /paper-field/, `${list} — a field must carry the .paper-field default`)
    }
  })

  it('sizes fields in the rules panel to adapt, not to force', () => {
    /*
     * Policy, not arithmetic: a field that should flex says so (`flex-1 min-w-[74px]`, so it shares
     * the row and keeps a floor it will not shrink past). A field with a hard `w-[Npx]` must *also*
     * say `shrink-0`, which marks the size as deliberate — the one such control is the blackout day
     * select, where every option is three letters wide and a flexible width would jitter on change.
     * A bare `w-[86px]` is how the overflowing rows were written.
     */
    const panel = readFileSync(join(ROOT, 'src/components/planner/PreferencePanel.tsx'), 'utf8')
    const offenders = [...panel.matchAll(/<Paper(?:Input|Select|Textarea)[^>]{0,240}?className="([^"]*)"/g)]
      .map((match) => match[1] ?? '')
      .filter((classes) => /(^|\s)w-\[/.test(classes) && !/(^|\s)shrink-0/.test(classes))
    assert.deepEqual(offenders, [], `fields with a bare fixed width in the rules panel:\n${offenders.join('\n')}`)
  })
})

describe('the week survives a narrow window', () => {
  it('stops compressing below a legible minimum and scrolls instead', () => {
    // Seven days need a floor, and the floor has to be inside something that can scroll.
    const floor = weekGrid.match(/min-w-\[(\d+)px\]/)
    assert.ok(floor, 'the week has no minimum width — it will squeeze to a sliver on a phone')
    const perDay = (Number(floor[1]) - 48) / 7
    assert.ok(perDay >= 90, `min-w-[${floor[1]}px] leaves only ${perDay.toFixed(0)}px per day`)
    assert.match(weekGrid, /overflow-x-auto/, 'the week needs a horizontal scroller to go with its minimum')
  })

  it('keeps the hour gutter visible while the week scrolls', () => {
    const sticky = weekGrid.match(/sticky left-0/g) ?? []
    assert.ok(sticky.length >= 2, 'both the day header and the hour gutter must stick to the left edge')
  })

  it('takes the touch gesture away from the scroller for the tiles', () => {
    // Without this the browser claims the touch for panning and a finger never drags a block.
    const tile = readFileSync(join(ROOT, 'src/components/planner/ScheduleBlock.tsx'), 'utf8')
    assert.match(tile, /touch-none/, 'the schedule tile must set touch-action: none to be draggable by touch')
  })
})

describe('the rules panel and the grid keep their content inside', () => {
  it('gives every flex row of controls a shrinkable child', () => {
    const panel = readFileSync(join(ROOT, 'src/components/planner/PreferencePanel.tsx'), 'utf8')
    // Rows that hold two fields must let them share space; `flex-1` on the field is the mechanism.
    const pairs = [...panel.matchAll(/aria-label="[^"]*(?:start|end)"[\s\S]{0,200}?className="([^"]*)"/g)]
    assert.ok(pairs.length >= 8, `expected the time-range inputs, found ${pairs.length}`)
    for (const [, classes] of pairs) {
      assert.match(classes ?? '', /min-w-\[74px\]/, `time input is not shrinkable: class="${classes}"`)
      assert.match(classes ?? '', /flex-1/, `time input does not share its row: class="${classes}"`)
    }
  })

  it('clips a protected band to its own window', () => {
    // A 15-minute band is 11px tall and its label is 13px.
    assert.match(weekGrid, /overflow-hidden border-y border-dashed/, 'band labels can spill into the next slot')
  })

  it('does not let a tile silently lose its last line', () => {
    const tile = readFileSync(join(ROOT, 'src/components/planner/ScheduleBlock.tsx'), 'utf8')
    // Content is chosen by height: a one-line clamp for short tiles, and no chips where none fit.
    assert.match(tile, /titleClamp/, 'the title clamp is not height-aware')
    assert.match(tile, /chipBudget/, 'reason chips are not budgeted by tile height')
    assert.match(tile, /hiddenReasons/, 'the reason counter must agree with the chips actually shown')
  })
})

describe('overlapping tiles get their own column', () => {
  it('separates two tiles that start at the same minute', () => {
    // The bug: both were given index 0 and half the column, so one was drawn exactly on top of the
    // other and became invisible and ungrabbable.
    // Ties in start time are broken by duration, longest first, so the taller tile sits left and the
    // result is stable across renders (a reorder mid-drag would make a tile jump columns).
    const layout = layoutColumns([tile('a', 540, 60), tile('b', 540, 90)])
    assert.equal(layout.get('b')?.index, 0)
    assert.equal(layout.get('a')?.index, 1, 'a tile starting at the same minute as another was stacked under it')
    assert.equal(layout.get('a')?.columns, 2)
    assert.equal(layout.get('b')?.columns, 2)
  })

  it('reuses a column once the tile in it has ended', () => {
    const layout = layoutColumns([tile('a', 540, 60), tile('b', 600, 60)])
    assert.equal(layout.get('a')?.index, 0)
    assert.equal(layout.get('b')?.index, 0, 'a column was not reused after the previous tile ended')
    assert.equal(layout.get('a')?.columns, 1)
  })

  it('lays out a three-way pile-up without any two sharing a column', () => {
    const layout = layoutColumns([tile('a', 540, 120), tile('b', 540, 120), tile('c', 600, 60)])
    const used = [layout.get('a')?.index, layout.get('b')?.index, layout.get('c')?.index]
    assert.equal(new Set(used).size, 3, `two tiles shared a column: ${used.join(', ')}`)
    assert.equal(layout.get('a')?.columns, 3)
  })

  it('keeps separate clusters independent', () => {
    const layout = layoutColumns([tile('a', 540, 60), tile('b', 540, 60), tile('c', 720, 60)])
    assert.equal(layout.get('c')?.index, 0, 'a later, uncontested tile was pushed into column 2')
    assert.equal(layout.get('c')?.columns, 1, 'a later, uncontested tile was narrowed to a third of the day')
  })
})

describe('the audit reads the real source', () => {
  it('found the files it is asserting about', () => {
    const files = walkSource(join(ROOT, 'src'), (path) => path.endsWith('.tsx'))
    for (const name of ['PreferencePanel.tsx', 'WeekGrid.tsx', 'ScheduleBlock.tsx', 'PaperControls.tsx']) {
      assert.ok(
        files.some((file) => relative(ROOT, file).endsWith(name)),
        `${name} was not found by the walker`,
      )
    }
  })
})
