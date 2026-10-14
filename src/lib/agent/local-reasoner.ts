import {
  SNAP_MINUTES,
  WEEKDAYS,
  type Blackout,
  type BusyEvent,
  type Pin,
  type Preferences,
  type Task,
  type Weekday,
} from '@/lib/types'
import { addDaysISO, fmtClock, fmtDuration, parseDate, weekdayOfDate } from '@/lib/scheduler/slots'
import { estimateDurationMinutes, type InterpretedMessage, type Interpreter, type ParsedTasks } from '@/lib/agent/tools'

/**
 * LocalReasoner — a real, deterministic implementation of the agent contract (D-004).
 *
 * It exists so Paperweek works with zero API keys, and so tests exercise the same code path the
 * product ships. It is deliberately rule-based: keyword lexicons for categories and energy,
 * pattern matching for durations and deadlines, and phrase matching for preference changes.
 * It never guesses a time for a block — the engine does that.
 */

type LexiconEntry = { pattern: RegExp; energy: Task['energy']; category: Task['category'] }

/* Every pattern below is case-insensitive: clauses commonly start with a capitalised keyword. */

const LEXICON: LexiconEntry[] = [
  // Order matters: most specific first. Every pattern is case-insensitive because clauses
  // usually start with a capitalised keyword.
  { pattern: /\b(gym|run|running|swim|yoga|climb|workout|lift weights|walk|cycle|football|tennis|pilates)\b/i, energy: 'physical', category: 'health' },
  { pattern: /\b(doctor|dentist|therapy|physio|checkup|appointment|prescription|vaccination)\b/i, energy: 'physical', category: 'health' },
  { pattern: /\b(cook|groceries|grocery|shop|errand|clean|laundry|tidy|pick(?:ing)? up|school|kids|family|birthday)\b/i, energy: 'light', category: 'life' },
  { pattern: /\b(prep|preparing|prepare|planning|plan for|outline|agenda|organise|organize|review notes|tidy notes)\b/i, energy: 'admin', category: 'work' },
  { pattern: /\b(email|inbox|expenses|invoice|reimburs|book(?:ing)? a|renew|paperwork|timesheet|scheduling|admin|filing|tax)\b/i, energy: 'admin', category: 'admin' },
  { pattern: /\b(review|reviews|pr\b|prs\b|pull request|triage|approve|merge|code review|refactor review)\b/i, energy: 'admin', category: 'work' },
  { pattern: /\b(research|synthes|analyse|analyze|audit|survey results|data)\b/i, energy: 'deep', category: 'study' },
  { pattern: /\b(standup|stand-up|1:?1s?|one on one|catch ?up|call|coffee|lunch with|dinner with|meeting|interview|panel|demo)\b/i, energy: 'social', category: 'work' },
  { pattern: /\b(deck|slides|presentation|pitch|proposal|board pack|report)\b/i, energy: 'deep', category: 'work' },
  { pattern: /\b(spec|design doc|write|writing|draft|architecture|migrat|implement|refactor|build|ship|code)\b/i, energy: 'deep', category: 'work' },
  { pattern: /\b(study|course|module|thesis|chapter|revision|revise|exam|lecture|reading|read)\b/i, energy: 'deep', category: 'study' },
  { pattern: /\b(side project|sketch|illustration|paint|music|blog|paper|craft|edit|video|recipe)\b/i, energy: 'light', category: 'creative' },
]


const EFFORT_WORDS: [RegExp, number][] = [
  [/\b(quick|tiny|small|short)\b/i, 0.6],
  [/\b(big|major|large|huge|deep|heavy)\b/i, 1.4],
  [/\b(final|finish|polish|wrap up|tighten)\b/i, 0.8],
]

const PRIORITY_WORDS: [RegExp, Task['priority']][] = [
  [/\b(must|critical|urgent|asap|blocker|non-negotiable|p0)\b/i, 'P0'],
  [/\b(important|needs? to|should|p1)\b/i, 'P1'],
  [/\b(nice to have|if (i|there'?s) time|someday|eventually|p3|low priority)\b/i, 'P3'],
]

const DEADLINE_DAY: Record<string, number> = {
  monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2,
  thursday: 3, thu: 3, thurs: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6,
}

const REPEAT_WORDS: [RegExp, Weekday[]][] = [
  [/\b(every ?day|daily|each day)\b/i, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']],
  [/\b(every ?weekday|each weekday|weekdays|mon(day)? ?[–\-/] ?fri(day)?)\b/i, ['mon', 'tue', 'wed', 'thu', 'fri']],
  [/\b(three times a week|3x a week|3 times a week)\b/i, ['mon', 'wed', 'fri']],
  [/\b(twice a week|2x a week)\b/i, ['tue', 'thu']],
  [/\bmon(day)?[,/ ]+(wed(nesday)?|and wed)[,/ ]+(fri(day)?|and fri)\b/i, ['mon', 'wed', 'fri']],
  [/\btue(sday)?[,/ ]+and thu(rsday)?\b/i, ['tue', 'thu']],
]

/* ------------------------------------------------------------------ *
 * Duration / deadline parsing
 * ------------------------------------------------------------------ */

export function parseDuration(text: string): number | null {
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h\b|hr\b|hrs\b|hours?\b)/i)
  if (hours?.[1]) return Math.round(Number.parseFloat(hours[1]) * 60)
  const minutes = text.match(/(\d+)\s*(?:m\b|min\b|mins\b|minutes?\b)/i)
  if (minutes?.[1]) return Number.parseInt(minutes[1], 10)
  const halfDay = text.match(/\bhalf ?day\b/i)
  if (halfDay) return 240
  const allDay = text.match(/\b(all ?day|full ?day)\b/i)
  if (allDay) return 420
  return null
}

export function parseTimeOfDay(text: string): { hour: number; minute: number } | null {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i)
  if (!match) return null
  const hourRaw = Number.parseInt(match[1] ?? '', 10)
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '')
  if (Number.isNaN(hourRaw) || hourRaw > 23) return null
  if (meridiem === 'pm' && hourRaw < 12) return { hour: hourRaw + 12, minute }
  if (meridiem === 'am' && hourRaw === 12) return { hour: 0, minute }
  if (!meridiem && hourRaw <= 7) return { hour: hourRaw + 12, minute } // "5" in a deadline = 5pm
  return { hour: hourRaw, minute }
}

/** Keywords like "lunch", "end of day", "tonight" imply a deadline clock. */
function impliedDeadlineClock(text: string): { hour: number; minute: number } | null {
  if (/\blunch\b|\bmidday\b|\bnoon\b/i.test(text)) return { hour: 12, minute: 0 }
  if (/\bend of (the )?day\b|\beod\b|\btonight\b|\bthis evening\b/i.test(text)) return { hour: 18, minute: 0 }
  if (/\b(end of|by) (the )?week\b|\bsunday night\b/i.test(text)) return { hour: 22, minute: 0 }
  if (/\bmorning\b/i.test(text)) return { hour: 12, minute: 0 }
  if (/\bafternoon\b/i.test(text)) return { hour: 17, minute: 0 }
  return null
}

function isoAt(date: string, hour: number, minute: number): string {
  const d = parseDate(date)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}T${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}:00`
}

export function parseDeadline(text: string, ctx: { nowISO: string; weekStartDate: string }): string | undefined {
  const weekStart = ctx.weekStartDate
  const nowDay = weekdayOfDate(ctx.nowISO.slice(0, 10))
  const nowIndex = WEEKDAYS.indexOf(nowDay)
  const clock = impliedDeadlineClock(text)

  const explicit = text.match(
    /\b(?:by|before|due|deadline|on)\s+(?:(this|next|coming)\s+)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b([^.;,]*)/i,
  )
  if (explicit) {
    const word = (explicit[2] ?? '').toLowerCase()
    const target = DEADLINE_DAY[word]
    if (target !== undefined) {
      // `target` is an index into the week (0 = the week's first day), not a delta from today.
      let offset = target
      if (offset < nowIndex) offset += 7 // that weekday has already passed — mean the next one
      if (explicit[1] === 'next') offset += 7
      const tail = explicit[3] ?? ''
      const time = parseTimeOfDay(tail) ?? clock ?? { hour: 17, minute: 0 }
      return isoAt(addDaysISO(weekStart, offset), time.hour, time.minute)
    }
  }

  if (/\btoday\b/i.test(text)) {
    const time = parseTimeOfDay(text) ?? clock ?? { hour: 18, minute: 0 }
    return isoAt(ctx.nowISO.slice(0, 10), time.hour, time.minute)
  }
  if (/\btomorrow\b/i.test(text)) {
    const time = parseTimeOfDay(text) ?? clock ?? { hour: 12, minute: 0 }
    return isoAt(addDaysISO(ctx.nowISO.slice(0, 10), 1), time.hour, time.minute)
  }
  if (/\bthis week\b|\bby friday\b/i.test(text)) {
    const time = clock ?? { hour: 17, minute: 0 }
    return isoAt(addDaysISO(weekStart, 4), time.hour, time.minute)
  }
  if (/\bnext week\b/i.test(text)) {
    const time = clock ?? { hour: 12, minute: 0 }
    return isoAt(addDaysISO(weekStart, 8), time.hour, time.minute)
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * Task extraction
 * ------------------------------------------------------------------ */

function classify(title: string): { energy: Task['energy']; category: Task['category'] } {
  for (const entry of LEXICON) {
    if (entry.pattern.test(title)) return { energy: entry.energy, category: entry.category }
  }
  return { energy: 'light', category: 'work' }
}

function detectPriority(clause: string): Task['priority'] {
  for (const [pattern, priority] of PRIORITY_WORDS) {
    if (pattern.test(clause)) return priority
  }
  return 'P2'
}

function detectRepeat(clause: string): Weekday[] | undefined {
  for (const [pattern, days] of REPEAT_WORDS) {
    if (pattern.test(clause)) return days
  }
  const explicit = clause.match(/\b(mon|tue|tues|wed|thu|thurs|fri|sat|sun)(?:day)?\b/gi)
  if (explicit && explicit.length >= 2) {
    const days = new Set<Weekday>()
    for (const token of explicit) {
      const key = token.toLowerCase().slice(0, 3)
      const found = WEEKDAYS.find((day) => day === key || day === `${key.slice(0, 3)}`)
      if (found) days.add(found)
    }
    return days.size >= 2 ? [...days].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b)) : undefined
  }
  return undefined
}

const STOP_CLAUSE = /\b(?:also|and then|plus|then)\b|,|\n/i

/**
 * Split free text into clauses, one per task.
 *
 * A fragment that is only a duration ("30 minutes") or only a deadline phrase ("before Friday lunch")
 * belongs to the clause before it, not to a task of its own — otherwise "Review PRs every weekday,
 * 30 minutes" turns into two tasks, one of which is called "Minutes".
 */
function splitClauses(text: string): string[] {
  const heads: string[] = []
  const fragments = text
    .split(/(?:\.\s+|\n+|;\s+|\s+•\s+|\s+\*\s+)/)
    .flatMap((sentence) => sentence.split(STOP_CLAUSE))
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 1)

  for (const raw of fragments) {
    const fragment = raw.replace(/[.;,]+$/, '').trim()
    if (!fragment) continue
    const isModifier =
      /^(?:for\s+)?\d/.test(fragment) ||
      /^(?:by|before|due|deadline|no later than|prior to)\b/i.test(fragment) ||
      /^(?:it|this|that)(?:'s|\s+is)?\s*(?:p[0-3]|priority)/i.test(fragment)
    if (isModifier && heads.length > 0) {
      const last = heads.length - 1
      heads[last] = `${heads[last]}, ${fragment}`
    } else {
      heads.push(fragment)
    }
  }
  return heads.filter((head) => head.length > 2)
}

function cleanTitle(clause: string): string {
  let title = clause
    .replace(/^[-*\u2022\d.)\s]+/, '')
    .replace(/\b(?:by|before|due|deadline)\s+(?:(?:this|next|coming)\s+)?(?:monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun|today|tomorrow|the end of the week)[^,.;]*/gi, '')
    .replace(/\((?:\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)[^)]*)\)/gi, '')
    .replace(/\b(?:about|around|roughly|approximately)?\s*\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/gi, '')
    .replace(/\b(?:every|each)\s+(?:day|weekday|week)\b/gi, '')
    .replace(/\b\d+x\s*(?:a|per)\s*week\b/gi, '')
    .replace(
      /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?(?:\s*[/,&+]\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?)+\b/gi,
      '',
    )
    .replace(/\bfor\s+(?:about|around|roughly)?\s*\d+\s*(?:m|min|mins|minutes?|h|hr|hrs|hours?)\b/gi, '')
    .replace(/\b(?:sometime|at some point|whenever|at some stage)\b(?:\s+(?:this|next)\s+week)?/gi, '')
    .replace(/\b(?:this|next)\s+week\b/gi, '')
    .replace(/\b(?:it|this|that)(?:'s|\s+is)?\s*(?:priority\s*)?p[0-3]\b/gi, '')
    .replace(/\b(?:it|this|that)(?:'s|\s+is)?\s+(?:critical|urgent|top priority)\b/gi, '')
    .replace(/\b(?:and\s+)?(?:it|that)\s+(?:is|must|needs? to)\s+(?:be\s+)?(?:done\s+)?first\b/gi, '')
    .replace(/\b(?:i|we)\s+(?:should|need to|must|have to)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,–-]+$/, '')
    .trim()
  if (title.length < 3) title = clause.trim()
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export function parseTasksLocally(text: string, ctx: { nowISO: string; weekStartDate: string }): ParsedTasks {
  const notes: string[] = []
  const clauses = splitClauses(text)
  const tasks: Task[] = []
  const seen = new Set<string>()

  for (const clause of clauses) {
    const repeatDays = detectRepeat(clause)
    const title = cleanTitle(clause)
    if (title.length < 3) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const { energy, category } = classify(clause)
    const stated = parseDuration(clause)
    let minutes = stated ?? estimateDurationMinutes(title, energy, category)
    if (!stated) {
      for (const [pattern, factor] of EFFORT_WORDS) {
        if (pattern.test(clause)) {
          minutes = Math.round((minutes * factor) / SNAP_MINUTES) * SNAP_MINUTES
          break
        }
      }
      notes.push(`Estimated “${title}” at ${fmtDuration(minutes)}.`)
    }
    minutes = Math.max(SNAP_MINUTES, Math.min(720, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES))

    const deadline = parseDeadline(clause, ctx)
    const priority = detectPriority(clause)
    const minChunk = energy === 'deep' ? 60 : energy === 'admin' ? 30 : 45
    const splittable = minutes >= 120 && !/\b(?:in one (?:sitting|go)|single session|all at once)\b/i.test(clause)

    tasks.push({
      id: `t_${slug(title)}`,
      title,
      estimateMinutes: minutes,
      deadline,
      priority,
      energy,
      category,
      splittable,
      minChunkMinutes: Math.min(minChunk, minutes),
      repeatDays,
      source: 'agent',
      estimatedByAI: stated ? undefined : true,
    })
  }

  return { tasks, notes: notes.slice(0, 6) }
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
}

/* ------------------------------------------------------------------ *
 * Message interpretation (refinement loop, FR-4.4)
 * ------------------------------------------------------------------ */

const WEEKDAY_RE = /\b(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b/i

function parseWeekday(text: string): Weekday | null {
  const match = text.match(WEEKDAY_RE)
  if (!match || !match[1]) return null
  const key = match[1].toLowerCase().slice(0, 3)
  return WEEKDAYS.find((day) => day === key) ?? (key === 'tue' ? 'tue' : key === 'thu' ? 'thu' : null)
}

const STATUS_HINT =
  'Here is where the week stands — capacity I can actually use, minutes committed, and anything that did not fit.'


export function interpretLocally(
  message: string,
  ctx: { nowISO: string; weekStartDate: string; preferences: Preferences; tasks: Task[] },
): InterpretedMessage & { statusIntent?: boolean } {
  const text = message.trim()
  const lower = text.toLowerCase()
  const changes: string[] = []
  let preferences: Preferences | undefined
  let tasks: Task[] | undefined
  const pins: Pin[] = []

  const patchPrefs = (patch: Partial<Preferences>, note: string) => {
    preferences = { ...(preferences ?? ctx.preferences), ...patch }
    changes.push(note)
  }

  /* --- overflow preference --- */
  // Refusal is checked first: "do not use the weekend" must never read as "use the weekend".
  const refusesWeekend = /\b(no|not|never|don'?t|do not|avoid|keep off|protect)\b[\s\S]{0,24}\bweekend\b/.test(lower)
  const allowsWeekend = /\b(use|allow|open|fine with)\b[\s\S]{0,24}\b(weekend|saturday|sunday)\b/.test(lower) || /\bweekend is fine\b/.test(lower)
  if (refusesWeekend) {
    patchPrefs({ weekendMode: 'off', overflowPreference: 'shoulder' }, 'Weekends stay protected.')
  } else if (allowsWeekend) {
    patchPrefs({ weekendMode: 'light', overflowPreference: 'weekend' }, 'Weekend mornings are now available as overflow.')
  }
  if (/\b(longer days|rather work longer|extend the days|work later|stay late)\b/.test(lower)) {
    patchPrefs({ overflowPreference: 'longer-days' }, 'When the week is full, the engine will stretch days before touching your mornings.')
  }
  if (/\b(earlier starts?|start earlier|shoulder|before work|early mornings?)\b/.test(lower) && !/\b(no|don'?t)\b/.test(lower)) {
    patchPrefs({ overflowPreference: 'shoulder' }, 'When the week is full, the engine will use shoulder hours first.')
  }

  /* --- working hours: "start at 8", "finish by 5", "work 9 to 6" --- */
  const range = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|until|till|–|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (range && /\b(work|hours|day)\b/i.test(lower)) {
    const startHour = normaliseHour(Number.parseInt(range[1] ?? '9', 10), range[3])
    const endHour = normaliseHour(Number.parseInt(range[4] ?? '17', 10), range[6])
    if (startHour !== null && endHour !== null && endHour > startHour) {
      const workingHours = { ...ctx.preferences.workingHours }
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]) {
        workingHours[day] = { start: startHour * 60, end: endHour * 60 }
      }
      patchPrefs({ workingHours }, `Weekdays now run ${fmtClock(startHour * 60)}–${fmtClock(endHour * 60)}.`)
    }
  } else {
    const startMatch = lower.match(/\b(?:start|begin|from)\b[^0-9]{0,12}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
    if (startMatch) {
      const startMin = toMinutes(startMatch[1], startMatch[2], startMatch[3] ?? range?.[3])
      if (startMin !== null) {
        const workingHours = { ...ctx.preferences.workingHours }
        for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]) {
          const current = workingHours[day]
          workingHours[day] = { start: startMin, end: current?.end ?? 18 * 60 }
        }
        patchPrefs({ workingHours }, `Days now start at ${fmtClock(startMin)}.`)
      }
    }
    const endMatch = lower.match(/\b(?:finish|end|until|stop)\b[^0-9]{0,12}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
    if (endMatch) {
      const endMin = toMinutes(endMatch[1], endMatch[2], endMatch[3] ?? 'pm')
      if (endMin !== null) {
        const workingHours = { ...ctx.preferences.workingHours }
        for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]) {
          const current = workingHours[day]
          workingHours[day] = { start: current?.start ?? 9 * 60, end: endMin }
        }
        patchPrefs({ workingHours }, `Days now finish at ${fmtClock(endMin)}.`)
      }
    }
  }

  /* --- focus peak --- */
  if (/\b(deep work|focus|hardest|best work|thinking)\b/.test(lower)) {
    if (/\bmorning/.test(lower)) patchPrefs({ focusPeak: 'morning' }, 'Your focus peak is set to the morning.')
    else if (/\bafternoon/.test(lower)) patchPrefs({ focusPeak: 'afternoon' }, 'Your focus peak is set to the afternoon.')
    else if (/\bevening|night/.test(lower)) patchPrefs({ focusPeak: 'evening' }, 'Your focus peak is set to the evening.')
  }

  /* --- lunch --- */
  const lunchMatch = lower.match(/\blunch\b[^0-9]{0,14}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (lunchMatch) {
    const startMin = toMinutes(lunchMatch[1], lunchMatch[2], lunchMatch[3])
    if (startMin !== null) {
      patchPrefs(
        { lunch: { start: startMin, end: startMin + 60, minutes: 45 } },
        `Lunch is protected from ${fmtClock(startMin)}.`,
      )
    }
  }
  if (/\b(no|lskip|skip)\b.{0,12}\blunch\b.*\b(protect|fixed|block)?\b/.test(lower) && /\bskip lunch\b|\bno lunch\b/.test(lower)) {
    patchPrefs({ lunch: null }, 'Lunch is no longer blocked out.')
  }

  /* --- buffers / caps --- */
  const bufferMatch = lower.match(/\b(\d{1,3})\s*(?:min|minutes?)\s*(?:buffer|gap|between)\b/)
  if (bufferMatch) {
    const minutes = Number.parseInt(bufferMatch[1] ?? '10', 10)
    patchPrefs({ bufferMinutes: Math.max(0, Math.min(60, minutes)) }, `Buffers set to ${minutes} minutes.`)
  }
  const capMatch = lower.match(/\b(?:max|no more than|cap|limit)\b[^0-9]{0,14}(\d{1,2})\s*(?:h|hrs?|hours?)\b/)
  if (capMatch) {
    const minutes = Math.min(900, Number.parseInt(capMatch[1] ?? '7', 10) * 60)
    patchPrefs({ maxPlannedMinutesPerDay: minutes }, `Daily cap set to ${fmtDuration(minutes)} of planned work.`)
  }
  const deepCapMatch = lower.match(/\b(?:deep work|focus)\b[^0-9]{0,16}(\d{1,2})\s*(?:h|hrs?|hours?)\b/)
  if (deepCapMatch) {
    const minutes = Math.min(600, Number.parseInt(deepCapMatch[1] ?? '4', 10) * 60)
    patchPrefs({ maxDeepWorkMinutesPerDay: minutes }, `Deep-work cap set to ${fmtDuration(minutes)} per day.`)
  }

  /* --- absences / blackouts --- */
  // "block" alone is far too common in task descriptions ("writing block") to mean an absence.
  const outPattern =
    /\b(?:i'?m|i am|we'?re|we are)\s+(?:out|away|off|busy|travelling|traveling)\b|\bno work\b|\bblackout\b|\bnot working\b|\bout of (?:the )?office\b/
  const weekday = parseWeekday(lower)
  if (weekday && (outPattern.test(lower) || /\b(?:meeting|appointment|dentist|doctor|school|travel|flight|pickup|pick up)\b/.test(lower))) {
    const half = /\bmorning\b/.test(lower) ? 'morning' : /\bafternoon\b/.test(lower) ? 'afternoon' : /\bevening\b/.test(lower) ? 'evening' : 'all'
    const time = parseTimeOfDay(lower)
    const windows: Record<string, { start: number; end: number }> = {
      morning: { start: 8 * 60, end: 12 * 60 },
      afternoon: { start: 12 * 60, end: 17 * 60 },
      evening: { start: 17 * 60, end: 22 * 60 },
      all: { start: 8 * 60, end: 18 * 60 },
    }
    const range2 = /\b(?:from|between)\b/.test(lower) ? parseRange(lower) : null
    const window = range2 ?? (time ? { start: time.hour * 60, end: time.hour * 60 + 60 } : windows[half] ?? windows.all)
    const blackout: Blackout = {
      id: `bo_${weekday}_${window.start}`,
      label: half === 'all' ? `Out (${weekday})` : `Out ${half} (${weekday})`,
      weekday,
      start: window.start,
      end: window.end,
    }
    const blackouts = [...(preferences?.blackouts ?? ctx.preferences.blackouts).filter((b) => b.id !== blackout.id), blackout]
    patchPrefs({ blackouts }, `Blocked ${weekday} ${fmtClock(window.start)}–${fmtClock(window.end)}.`)
  }

  /* --- explicit placement requests → pins --- */
  const moveMatch = lower.match(/\b(?:move|put|place|pin|schedule)\b\s+(?:the\s+)?(.{3,40}?)\s+(?:to|on|at)\s+([a-z0-9: ]{2,24})/)
  if (moveMatch) {
    const needle = (moveMatch[1] ?? '').trim()
    const target = moveMatch[2] ?? ''
    const targetDay = parseWeekday(target)
    const matched = ctx.tasks.find((t) => t.title.toLowerCase().includes(needle.split(' ')[0] ?? '') || needle.includes(t.title.toLowerCase().slice(0, 12)))
    if (matched && targetDay) {
      const date = dateOfWeekday(targetDay, ctx.weekStartDate)
      const time = parseTimeOfDay(target)
      const startMin = time ? time.hour * 60 + time.minute : 9 * 60
      pins.push({ taskId: matched.id, date, startMin, minutes: Math.min(matched.estimateMinutes, 90) })
      changes.push(`Pinned “${matched.title}” to ${targetDay} ${fmtClock(startMin)}.`)
    }
  }

  /* --- new work described in the message --- */
  const looksLikeNewTask =
    /\b(add|also|new task|remember to|don'?t forget|need to|i (?:have|need) to)\b/.test(lower) &&
    !/\b(remove|delete|drop|move|push)\b/.test(lower)
  if (looksLikeNewTask) {
    const cleaned = text
      .replace(/^\s*(?:add|also|new task|remember to|don'?t forget|need to|i (?:have|need) to)\b[:,]?\s*/i, '')
      .replace(/\b(?:it|this|that)(?:'s|\s+is)?\s+(?:p[0-3]|critical|urgent|top priority)\b/gi, '')
    const parsed = parseTasksLocally(cleaned, ctx)
    if (parsed.tasks.length) {
      const hint = normalisePriority(priorityMatchWhole(text) ?? '')
      const withHint = hint ? parsed.tasks.map((task) => ({ ...task, priority: hint })) : parsed.tasks
      tasks = mergeInto(ctx.tasks, withHint)
      changes.push(
        `Added ${withHint.length} task${withHint.length === 1 ? '' : 's'}${hint ? ` at ${hint}` : ''}.`,
      )
    }
  }

  /* --- removals --- */
  const removeMatch = lower.match(/\b(?:remove|delete|drop|cancel|forget)\b\s+(?:the\s+)?(.{3,40})/)
  if (removeMatch && tasks === undefined) {
    const needle = (removeMatch[1] ?? '').trim().toLowerCase()
    const matched = ctx.tasks.find((t) => needle.includes(t.title.toLowerCase().slice(0, 12)) || t.title.toLowerCase().includes(needle.split(' ')[0] ?? ''))
    if (matched) {
      tasks = ctx.tasks.filter((t) => t.id !== matched.id)
      changes.push(`Removed “${matched.title}”.`)
    }
  }

  /* --- priority change --- */
  const priorityMatch = text.match(/\b(p0|p1|p2|p3|top priority|critical)\b/i)
  if (priorityMatch && tasks === undefined && /\b(is|now|make|set|should be)\b/.test(lower)) {
    const level = normalisePriority(priorityMatch[1] ?? 'P1')
    const matched = ctx.tasks.find((t) => lower.includes(t.title.toLowerCase().slice(0, 12)))
    if (matched && level) {
      tasks = ctx.tasks.map((t) => (t.id === matched.id ? { ...t, priority: level } : t))
      changes.push(`“${matched.title}” is now ${level}.`)
    }
  }

  const statusIntent = /\b(?:what|how)\b.{0,24}\b(?:fit|fits|fits in|busy|full|look|looking|scheduled|left|remain|status|summary|overview)\b|\bhow does (?:the )?week\b|\bshow me (?:the )?(?:week|plan|status)\b/i.test(lower)

  const reply = changes.length === 0 ? (statusIntent ? STATUS_HINT : buildReply(changes, ctx)) : buildReply(changes, ctx)

  return { tasks, preferences, pins: pins.length ? pins : undefined, changes, reply, statusIntent }
}

function priorityMatchWhole(text: string): string | undefined {
  const match = text.match(/\b(p[0-3])\b/i)
  if (match?.[1]) return match[1]
  if (/\b(top priority|critical|urgent|non-negotiable)\b/i.test(text)) return 'P0'
  return undefined
}

function parseRange(text: string): { start: number; end: number } | null {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|until|till|–|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!match) return null
  const startHour = normaliseHour(Number.parseInt(match[1] ?? '', 10), match[3])
  const endHour = normaliseHour(Number.parseInt(match[4] ?? '', 10), match[6] ?? match[3])
  if (startHour === null || endHour === null) return null
  const startMin = startHour * 60 + (match[2] ? Number.parseInt(match[2], 10) : 0)
  const endMin = endHour * 60 + (match[5] ? Number.parseInt(match[5], 10) : 0)
  return endMin > startMin ? { start: startMin, end: endMin } : null
}

/** Hour + minute + optional meridiem → minutes from midnight. */
function toMinutes(hourRaw: string | undefined, minuteRaw: string | undefined, meridiem?: string): number | null {
  const hour = normaliseHour(Number.parseInt(hourRaw ?? '', 10), meridiem)
  if (hour === null) return null
  const minute = minuteRaw ? Math.max(0, Math.min(59, Number.parseInt(minuteRaw, 10))) : 0
  return hour * 60 + minute
}

function normaliseHour(hour: number, meridiem?: string): number | null {
  if (Number.isNaN(hour) || hour > 23) return null
  const m = meridiem?.toLowerCase().replace(/\./g, '')
  if (m === 'pm' && hour < 12) return hour + 12
  if (m === 'am' && hour === 12) return 0
  if (!m && hour <= 7) return hour + 12
  return hour
}

function normalisePriority(token: string): Task['priority'] | null {
  const upper = token.toUpperCase()
  if (upper === 'P0' || upper === 'P1' || upper === 'P2' || upper === 'P3') return upper
  if (/top|critical/.test(token.toLowerCase())) return 'P0'
  return null
}

function dateOfWeekday(weekday: Weekday, weekStartDate: string): string {
  return addDaysISO(weekStartDate, WEEKDAYS.indexOf(weekday))
}

function mergeInto(existing: Task[], incoming: Task[]): Task[] {
  const result = [...existing]
  for (const task of incoming) {
    const match = result.find((t) => t.title.toLowerCase() === task.title.toLowerCase())
    if (match) {
      result[result.indexOf(match)] = { ...task, id: match.id }
    } else {
      result.push(task)
    }
  }
  return result
}

function buildReply(changes: string[], ctx: { tasks: Task[] }): string {
  if (!changes.length) {
    return `I did not find a concrete change in that. Tell me things like “I'm out Friday afternoon”, “start at 8:30”, “use the weekend if it helps”, or “add a 90-minute writing block by Thursday”. I'm holding ${ctx.tasks.length} tasks right now.`
  }
  const lead = changes.length === 1 ? 'Done.' : `Done — ${changes.length} changes.`
  return `${lead} ${changes.join(' ')}`
}

/* ------------------------------------------------------------------ *
 * The Interpreter implementation
 * ------------------------------------------------------------------ */

export function createLocalInterpreter(): Interpreter {
  return {
    async parseTasks(text, ctx): Promise<ParsedTasks> {
      return parseTasksLocally(text, { nowISO: ctx.nowISO, weekStartDate: ctx.weekStartDate })
    },
    async interpretMessage(message, ctx): Promise<InterpretedMessage> {
      return interpretLocally(message, {
        nowISO: ctx.nowISO,
        weekStartDate: ctx.weekStartDate,
        preferences: ctx.existingPreferences,
        tasks: ctx.existingTasks,
      })
    },
    async explainBlock(context): Promise<string> {
      const lines = context.split('\n')
      const reasonsLine = lines.find((line) => line.startsWith('Reasons recorded')) ?? ''
      const reasons = reasonsLine
        .replace('Reasons recorded by the engine: ', '')
        .split(', ')
        .map((r) => r.trim())
        .filter(Boolean)
      const sameDayLine = lines.find((line) => line.startsWith('Same day')) ?? ''
      const flagLine = lines.find((line) => line.includes('flagged')) ?? ''
      const parts: string[] = []
      if (reasons.length) {
        // Reason labels mix noun phrases ("your focus peak") with verb phrases ("balances the day's
        // load"), so a colon-list is the only join that stays grammatical for every code.
        const top = reasons.slice(0, 3)
        const counted = top.length === 1 ? 'one reason' : top.length === 2 ? 'two reasons' : 'three reasons'
        const listed = top.map((reason) => reason.charAt(0).toLowerCase() + reason.slice(1)).join(' · ')
        parts.push(`It landed here for ${counted}: ${listed}.`)
      }
      if (sameDayLine && !sameDayLine.startsWith('Nothing else')) {
        parts.push(`Around it that day: ${sameDayLine.replace('Same day: ', '')}.`)
      }
      if (flagLine) parts.push('It is flagged because it costs you something — check the report.')
      return parts.join(' ') || 'It is the best slot the engine could find without breaking your working hours.'
  },
  }
}

/* ------------------------------------------------------------------ *
 * Busy-event helpers shared with the UI
 * ------------------------------------------------------------------ */

export function busyFromText(text: string, ctx: { weekStartDate: string }): BusyEvent[] {
  const events: BusyEvent[] = []
  const weekday = parseWeekday(text)
  if (!weekday) return events
  const time = parseTimeOfDay(text)
  if (!time) return events
  const duration = parseDuration(text) ?? 60
  events.push({
    id: `manual_${weekday}_${time.hour * 60}`,
    title: cleanTitle(text),
    date: addDaysISO(ctx.weekStartDate, WEEKDAYS.indexOf(weekday)),
    startMin: time.hour * 60 + time.minute,
    endMin: time.hour * 60 + time.minute + duration,
    source: 'manual',
  })
  return events
}
