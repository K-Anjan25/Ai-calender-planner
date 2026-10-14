import './harness/setup-dom'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildIcs, escapeIcsText, foldIcsLine, icsFilename } from '@/lib/ics'
import { generatePlan } from '@/lib/scheduler/engine'
import { currentWeekStart, defaultPreferences, demoBusy, demoTasks } from '@/lib/sample-data'

/**
 * iCalendar export (T-604).
 *
 * The export is the "no account required" path, so it has to be *correct* rather than merely
 * present: a malformed file imports as nothing at all, and the user has no way to tell why.
 * These assertions cover the parts of RFC 5545 that break real importers — folding, escaping,
 * CRLF, floating local times, and stable UIDs.
 */

const WEEK_START = currentWeekStart(new Date('2026-10-14T09:00:00Z'))
const NOW = '2026-10-14T09:00:00.000Z'

function proposal() {
  return generatePlan({
    tasks: demoTasks(WEEK_START),
    preferences: defaultPreferences(),
    busy: demoBusy(WEEK_START),
    pins: [],
    nowISO: NOW,
    weekStartDate: WEEK_START,
  })
}

/** Unfold, then split — the order an importer reads it in. */
function contentLines(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean)
}

function events(ics: string): string[][] {
  const lines = contentLines(ics)
  const out: string[][] = []
  let current: string[] | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = []
    else if (line === 'END:VEVENT') {
      if (current) out.push(current)
      current = null
    } else if (current) current.push(line)
  }
  return out
}

describe('structure', () => {
  it('is a calendar an importer will accept', () => {
    const ics = buildIcs({ proposal: proposal() })
    const lines = contentLines(ics)
    assert.equal(lines[0], 'BEGIN:VCALENDAR')
    assert.equal(lines.at(-1), 'END:VCALENDAR')
    assert.ok(lines.includes('VERSION:2.0'))
    assert.ok(lines.some((line) => line.startsWith('PRODID:')))
    assert.ok(lines.some((line) => line.startsWith('X-WR-TIMEZONE:')))
    assert.equal(events(ics).length > 0, true, 'no events were exported')
  })

  it('uses CRLF line endings and folds long lines', () => {
    const ics = buildIcs({ proposal: proposal() })
    assert.ok(ics.includes('\r\n'), 'no CRLF line endings')
    assert.equal(/[^\r]\n/.test(ics), false, 'a bare LF leaked into the file')
    for (const line of ics.split('\r\n')) {
      assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line exceeds 75 octets: ${line.slice(0, 40)}…`)
    }
  })
})

describe('events', () => {
  it('exports one VEVENT per task block, with floating local times', () => {
    const plan = proposal()
    const ics = buildIcs({ proposal: plan })
    const blocks = plan.blocks.filter((block) => block.kind === 'task')
    assert.equal(events(ics).length, blocks.length)

    const first = events(ics)[0] as string[]
    const start = first.find((line) => line.startsWith('DTSTART:'))
    const end = first.find((line) => line.startsWith('DTEND:'))
    assert.match(start ?? '', /^DTSTART:\d{8}T\d{6}$/, 'DTSTART must be a floating local time')
    assert.match(end ?? '', /^DTEND:\d{8}T\d{6}$/)
    // Never a UTC value: the plan is wall-clock, and stamping Z would move every block.
    assert.equal(start?.endsWith('Z'), false)
  })

  it('carries the plan id, the block id and a readable description', () => {
    const plan = proposal()
    const block = plan.blocks.find((item) => item.kind === 'task')
    assert.ok(block)
    const ics = buildIcs({ proposal: plan })
    const event = events(ics).find((lines) => lines.includes(`UID:${block.id}@calendra`))
    assert.ok(event, 'the block has no event')
    assert.ok(event.some((line) => line.startsWith('X-CALENDRA-PLAN:')))
    assert.ok(event.some((line) => line.startsWith(`X-CALENDRA-BLOCK-ID:${block.id}`)))
    assert.ok(event.some((line) => line.startsWith(`X-CALENDRA-PRIORITY:${block.priority}`)))
    const summary = event.find((line) => line.startsWith('SUMMARY:'))
    assert.ok(summary?.includes('· CAL'), 'the Calendra marker is missing from the title')
    const description = event.find((line) => line.startsWith('DESCRIPTION:'))
    assert.ok((description ?? '').length > 30, 'the event explains nothing')
  })

  it('keeps UIDs stable across exports and DTSTAMP from the plan', () => {
    const plan = proposal()
    const first = buildIcs({ proposal: plan })
    const second = buildIcs({ proposal: plan })
    assert.equal(first, second, 'the export is not deterministic')
    const uids = events(first).map((lines) => lines.find((line) => line.startsWith('UID:')))
    assert.equal(new Set(uids).size, uids.length, 'two events share a UID')
    const stamp = contentLines(first).find((line) => line.startsWith('DTSTAMP:'))
    assert.match(stamp ?? '', /^DTSTAMP:20261014T090000Z$/, 'DTSTAMP must come from the plan, not the clock')
  })

  it('exports only the blocks that were approved when a list is given', () => {
    const plan = proposal()
    const chosen = plan.blocks.filter((block) => block.kind === 'task').slice(0, 3)
    const ics = buildIcs({ proposal: plan, approvedBlockIds: chosen.map((block) => block.id) })
    const exported = events(ics).map((lines) => lines.find((line) => line.startsWith('X-CALENDRA-BLOCK-ID:')))
    assert.deepEqual(
      exported.sort(),
      chosen.map((block) => `X-CALENDRA-BLOCK-ID:${block.id}`).sort(),
    )
  })

  it('leaves the ritual rows (lunch, breaks) out by default', () => {
    const plan = proposal()
    assert.ok(plan.blocks.some((block) => block.kind === 'lunch'), 'the demo week has no lunch row to exclude')
    const ics = buildIcs({ proposal: plan })
    const uids = events(ics).map((lines) => lines.find((line) => line.startsWith('UID:')))
    for (const block of plan.blocks.filter((item) => item.kind === 'lunch')) {
      assert.ok(!uids.includes(`UID:${block.id}@calendra`), 'a lunch row was exported as an event')
    }
  })

  it('summarises the verdict in a journal entry, so the file explains itself', () => {
    const plan = proposal()
    const ics = buildIcs({ proposal: plan })
    const lines = contentLines(ics)
    assert.ok(lines.includes('BEGIN:VJOURNAL'))
    assert.ok(lines.some((line) => line.startsWith('SUMMARY:Calendra: ')))
    assert.ok(ics.includes(plan.report.headline.slice(0, 20).replace(/[;,]/g, '')), 'the verdict is missing')
  })
})

describe('text handling', () => {
  it('escapes the characters that break importers', () => {
    assert.equal(escapeIcsText('a; b, c\\d\ne'), 'a\\; b\\, c\\\\d\\ne')
  })

  it('folds on octet boundaries, not character boundaries', () => {
    const line = `SUMMARY:${'é'.repeat(80)}`
    const folded = foldIcsLine(line)
    for (const part of folded.split('\r\n')) {
      assert.ok(Buffer.byteLength(part, 'utf8') <= 75)
    }
    // Unfolding must give back exactly what went in — no characters lost to the split.
    assert.equal(folded.replace(/\r\n[ \t]/g, ''), line)
  })

  it('escapes a title that contains a comma without splitting the field', () => {
    const plan = proposal()
    const withComma = {
      ...plan,
      blocks: plan.blocks.map((block, index) => (index === 0 ? { ...block, title: 'Review, then send; done' } : block)),
    }
    const ics = buildIcs({ proposal: withComma })
    assert.ok(ics.includes('SUMMARY:Review\\, then send\\; done · CAL'))
  })

  it('names the file after the week, safely', () => {
    const plan = proposal()
    const name = icsFilename(plan)
    assert.match(name, /^calendra-[A-Za-z0-9-]+\.ics$/)
    assert.ok(!/[/\\:]/.test(name), 'the filename contains a path separator')
  })
})
