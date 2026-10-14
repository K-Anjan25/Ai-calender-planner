import { WEEKDAY_LABEL, type BusyEvent, type PlacedBlock, type Preferences, type Task } from '@/lib/types'
import { fmtClock, fmtDuration } from '@/lib/scheduler/slots'

/**
 * Prompts. All model-facing text lives here (RULES.md §7) so it can be reviewed and diffed as copy.
 *
 * The system prompt is the contract: the model reasons about language and strategy, and is forbidden
 * from producing timestamps because the deterministic engine owns time (D-001).
 */

export const SYSTEM_PROMPT = `You are Paperweek's planning agent. You turn messy human input into a realistic week.

## What you do
- Read tasks, deadlines and preferences out of whatever the user wrote, including fragments and implied times.
- Decide on a scheduling strategy when there is a trade-off (what to protect, what to move, what to drop).
- Explain decisions in plain, specific language with real numbers.

## Hard rules
1. NEVER invent a date, time, or duration for a scheduled block. You do not schedule. The
   deterministic engine does, through the build_schedule and revise_plan tools. Any time you
   mention must come from a tool result.
2. Use parse_tasks for free text; do not hand back JSON of your own shape.
3. Durations are integer minutes. If the user did not give one, make a reasonable estimate and flag it.
4. If the week does not fit, say so plainly with the numbers, and offer concrete trade-offs. Never
   pretend work fits when it does not, and never silently drop something the user asked for.
5. Respect protected time: lunch, blackouts, working hours, existing meetings.
6. When you are unsure between two valid strategies, pick the one that protects the user's focus peak
   and their deadlines, and say which you picked and why.

## Voice
Warm, plain, specific. No hype, no emoji, no exclamation marks. "3h 30m does not fit, here are three
ways to make it fit" — not "Uh oh, your week is packed!".

## Tool sequence
Input (free text) → parse_tasks (if there is text) → build_schedule → critique_plan.
Follow-up message → revise_plan → critique_plan. Use explain_block when the user asks about one block.`

export const PARSE_PROMPT = `Extract every task from the text below.

For each task, give:
- title: a short imperative phrase a human would recognise later ("Finish Q4 board deck")
- estimateMinutes: an integer number of minutes. Infer from stated durations or typical effort. Flag inferred ones.
- deadline: ISO 8601 local time, if the text implies one ("by Thursday 5pm" → that Thursday at 17:00).
- priority: P0 (must happen, someone is waiting) · P1 (important this week) · P2 (should happen) · P3 (nice to have)
- energy: deep (demanding thought) · light (easy but real) · admin (mindless) · social (with people) · physical (body)
- category: work · study · health · life · admin · creative
- splittable: whether it can be broken into sessions
- minChunkMinutes: the shortest session that is still worth doing
- location: only if the text implies one
- repeatDays: weekday codes ['mon','tue',...] when the task repeats ("every weekday", "Mon/Wed/Fri"). For repeating tasks, estimateMinutes is PER OCCURRENCE.

Also return notes: any ambiguity you resolved, one short sentence each.`

export const INTERPRET_PROMPT = `The user is refining an existing plan. Read their message and produce a patch.

Return:
- preferences: only the fields they changed (working hours, focus peak, lunch, buffers, caps, blackout windows, weekend mode, overflow preference)
- tasks: full updated task list only if they added, removed, retitled, re-prioritised or re-estimated work
- pins: [{ taskId, date, startMin, minutes }] when they asked for a specific placement ("move the deck to Tuesday morning"). startMin is minutes from midnight.
- changes: short human-readable descriptions of what you changed, one per line, max 4
- reply: one or two sentences answering them, with real numbers if you mention time

Do not produce a schedule. Do not include times for anything except explicit pins or stated deadlines.`

export const EXPLAIN_PROMPT = `Explain why this block sits where it does, in one or two sentences, second person,
using only the facts given (its reasons, its neighbours, and the day's load). No new claims, no invented
times. Example shape: "This is your focus peak and Thursday is your quietest morning, so the hardest
part of the deck lives here — with a 30-minute buffer before the 1:1s."`

/* ------------------------------------------------------------------ *
 * Compact context builders — kept small on purpose (cost control, RULES.md §7)
 * ------------------------------------------------------------------ */

export function formatTasksForModel(tasks: Task[]): string {
  if (!tasks.length) return '(no tasks yet)'
  return tasks
    .map((task) => {
      const bits = [
        `${task.id} · “${task.title}” · ${fmtDuration(task.estimateMinutes)} · ${task.priority} · ${task.energy}/${task.category}`,
      ]
      if (task.deadline) bits.push(`due ${task.deadline.replace('T', ' ').slice(0, 16)}`)
      if (task.repeatDays?.length) bits.push(`repeats ${task.repeatDays.join('/')} (per occurrence)`)
      if (!task.splittable) bits.push('must stay in one sitting')
      if (task.earliestStart) bits.push(`not before ${task.earliestStart.slice(0, 16).replace('T', ' ')}`)
      return `- ${bits.join(' · ')}`
    })
    .join('\n')
}

export function formatPreferencesForModel(prefs: Preferences): string {
  const hours = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)
    .map((day) => {
      const value = prefs.workingHours[day]
      return value ? `${WEEKDAY_LABEL[day].slice(0, 3)} ${fmtClock(value.start)}–${fmtClock(value.end)}` : `${WEEKDAY_LABEL[day].slice(0, 3)} off`
    })
    .join(', ')
  const peak =
    typeof prefs.focusPeak === 'string'
      ? prefs.focusPeak
      : `${fmtClock(prefs.focusPeak.start)}–${fmtClock(prefs.focusPeak.end)}`
  return [
    `working hours: ${hours}`,
    `focus peak: ${peak}`,
    `buffer between blocks: ${prefs.bufferMinutes}m · min block: ${prefs.minBlockMinutes}m`,
    `daily caps: ${fmtDuration(prefs.maxPlannedMinutesPerDay)} total, ${fmtDuration(prefs.maxDeepWorkMinutesPerDay)} deep`,
    prefs.lunch ? `lunch protected ${fmtClock(prefs.lunch.start)}–${fmtClock(prefs.lunch.end)}` : 'no fixed lunch',
    `weekend: ${prefs.weekendMode} · when the week is full, prefer: ${prefs.overflowPreference}`,
    prefs.blackouts.length
      ? `blackouts: ${prefs.blackouts
          .map((b) => `${b.label}${b.weekday ? ` (${b.weekday})` : ' (daily)'} ${fmtClock(b.start)}–${fmtClock(b.end)}`)
          .join('; ')}`
      : 'no blackouts',
  ].join('\n')
}

export function formatBusyForModel(busy: BusyEvent[]): string {
  if (!busy.length) return '(nothing on the calendar)'
  return busy
    .map((event) => `- ${event.date} ${fmtClock(event.startMin)}–${fmtClock(event.endMin)} ${event.title}`)
    .join('\n')
}

export function formatBlocksForModel(blocks: PlacedBlock[], limit = 24): string {
  if (!blocks.length) return '(nothing placed)'
  return blocks
    .slice(0, limit)
    .map(
      (block) =>
        `- [${block.id}] ${block.title} · ${block.date} ${fmtClock(block.startMin)}–${fmtClock(block.endMin)} · ${block.energy}${block.pinned ? ' · pinned' : ''}${block.conflict ? ` · ${block.conflict}` : ''} · because: ${block.reasons.map((r) => r.label).join(', ') || 'best available slot'}`,
    )
    .join('\n')
}

export function formatBlockContext(block: PlacedBlock, blocks: PlacedBlock[]): string {
  const sameDay = blocks
    .filter((b) => b.date === block.date && b.id !== block.id)
    .sort((a, b) => a.startMin - b.startMin)
    .map((b) => `${b.title} ${fmtClock(b.startMin)}–${fmtClock(b.endMin)}${b.pinned ? ' (pinned)' : ''}`)
  const before = blocks
    .filter((b) => b.taskId === block.taskId && b.id !== block.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin))
    .map((b) => `${b.date} ${fmtClock(b.startMin)}`)
  return [
    `Block: ${block.title} (${block.chunkCount > 1 ? `session ${block.chunkIndex + 1} of ${block.chunkCount}, ` : ''}${fmtDuration(block.minutes)} on ${block.date} at ${fmtClock(block.startMin)})`,
    `Reasons recorded by the engine: ${block.reasons.map((r) => r.label).join(', ') || 'best available slot'}`,
    `Score: ${block.score.toFixed(2)} of 1.00${block.conflict ? ` · flagged ${block.conflict}` : ''}`,
    before.length ? `Other sessions of this task: ${before.join(', ')}` : 'This is the only session of that task.',
    sameDay.length ? `Same day: ${sameDay.join(', ')}` : 'Nothing else is on that day.',
  ].join('\n')
}
