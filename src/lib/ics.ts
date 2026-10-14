import type { PlacedBlock, PlanProposal } from '@/lib/types'
import { addDaysISO } from '@/lib/scheduler/slots'

/**
 * iCalendar export (T-604).
 *
 * Why this exists next to a full Calendar API integration: the honest path should not require
 * Google at all. Anyone can take their week to Apple Calendar, Outlook, Fastmail or a paper
 * printer's queue — and the export needs no credentials, exactly like the dry run (D-015).
 *
 * Scope is deliberately small and standards-shaped (RFC 5545 §3.6.1):
 *  - CRLF line endings, 75-octet line folding, escaped text;
 *  - a stable `UID` per block, so re-importing updates instead of duplicating;
 *  - `DTSTART`/`DTEND` as *floating* local times with `X-WR-TIMEZONE` on the calendar, because the
 *    plan is expressed in the user's wall clock (MEMORY.md §5.8);
 *  - `SEQUENCE`/`LAST-MODIFIED` omitted: they imply change tracking this app does not do.
 */

export type IcsInput = {
  proposal: PlanProposal
  /** Which blocks to include. Omitted means every task block (not the ritual rows). */
  approvedBlockIds?: string[]
  /** Include meetings imported from the calendar as busy placeholders. */
  includeMeetings?: boolean
}

const PRODID = '-//Paperweek//AI calendar planner//EN'
const MAX_LINE_OCTETS = 75

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are the only escapes in TEXT. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Fold a content line to 75 octets, continuation lines beginning with a single space. */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= MAX_LINE_OCTETS) return line

  const parts: string[] = []
  let current = Buffer.alloc(0)
  let limit = MAX_LINE_OCTETS
  for (const char of line) {
    const charBytes = Buffer.from(char, 'utf8')
    if (current.length + charBytes.length > limit) {
      parts.push(current.toString('utf8'))
      current = Buffer.alloc(0)
      limit = MAX_LINE_OCTETS - 1 // continuation lines start with a space, which counts
    }
    current = Buffer.concat([current, charBytes])
  }
  parts.push(current.toString('utf8'))
  return parts.join('\r\n ')
}

function stamp(date: string, minutes: number): string {
  const [year, month, day] = date.split('-')
  const hours = `${Math.floor(minutes / 60)}`.padStart(2, '0')
  const mins = `${minutes % 60}`.padStart(2, '0')
  return `${year}${month}${day}T${hours}${mins}00`
}

function planStamp(generatedAt: string): string {
  return `${generatedAt.replace(/[-:]/g, '').split('.')[0]}Z`
}

/** `DTSTAMP` must be UTC; the plan carries the moment it was generated. */
export function buildIcs(input: IcsInput): string {
  const { proposal } = input
  const wanted = input.approvedBlockIds ? new Set(input.approvedBlockIds) : null
  const selected = proposal.blocks.filter((block) => {
    if (block.kind === 'task') return !wanted || wanted.has(block.id)
    return Boolean(input.includeMeetings) && block.kind === 'break'
  })

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`Paperweek · ${proposal.weekLabel}`)}`,
    `X-WR-TIMEZONE:${proposal.preferences.timezone}`,
  ]

  const lastDay = addDaysISO(proposal.weekStart, 6)
  for (const block of selected) {
    const meeting = block.kind !== 'task'
    lines.push(
      'BEGIN:VEVENT',
      // Stable and collision-proof: the same block re-exported keeps its identity, which is what
      // makes "import again after editing" update the event instead of duplicating it.
      `UID:${block.id}@paperweek`,
      `DTSTAMP:${planStamp(proposal.generatedAt)}`,
      `DTSTART:${stamp(block.date, block.startMin)}`,
      `DTEND:${stamp(block.date, block.endMin)}`,
      `SUMMARY:${escapeIcsText(`${block.title} · PW`)}`,
      `DESCRIPTION:${escapeIcsText(describe(block, proposal))}`,
      `CATEGORIES:${escapeIcsText(meeting ? 'Paperweek meeting' : `Paperweek, ${block.category}`)}`,
      `X-PAPERWEEK-BLOCK-ID:${block.id}`,
      `X-PAPERWEEK-PLAN:${escapeIcsText(`${proposal.weekStart}_${proposal.generatedAt}`)}`,
      `X-PAPERWEEK-PRIORITY:${block.priority}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }

  lines.push(
    'BEGIN:VJOURNAL',
    `UID:paperweek-note-${proposal.weekStart}@paperweek`,
    `DTSTAMP:${planStamp(proposal.generatedAt)}`,
    `DTSTART;VALUE=DATE:${proposal.weekStart.replace(/-/g, '')}`,
    `SUMMARY:${escapeIcsText(`Paperweek: ${proposal.report.headline}`)}`,
    `DESCRIPTION:${escapeIcsText(
      [
        proposal.report.headline,
        '',
        `Placed ${Math.round(proposal.report.scheduledMinutes / 60)}h of ${Math.round(
          proposal.report.demandMinutes / 60,
        )}h requested.`,
        proposal.report.warnings.length > 0
          ? `Warnings: ${proposal.report.warnings.map((warning) => warning.message).join(' ')}`
          : '',
        '',
        `Exported from Paperweek for the week of ${proposal.weekStart}–${lastDay}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    )}`,
    'END:VJOURNAL',
    'END:VCALENDAR',
  )

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}

function describe(block: PlacedBlock, proposal: PlanProposal): string {
  const task = proposal.tasks.find((item) => item.id === block.taskId)
  return [
    block.reasonText,
    '',
    `Priority ${block.priority} · ${block.energy} · ${task?.category ?? block.category}`,
    block.chunkCount > 1 ? `Session ${block.chunkIndex + 1} of ${block.chunkCount}` : '',
    task?.deadline ? `Deadline ${task.deadline}` : '',
    '',
    'Planned with Paperweek. Move it here and Paperweek will plan around your change next time.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** A filename a browser and a filesystem both accept. */
export function icsFilename(proposal: PlanProposal): string {
  const label = proposal.weekLabel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `paperweek-${label || proposal.weekStart}.ics`
}
