import {
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type BusyEvent,
  type PlacedBlock,
  type Preferences,
  type Weekday,
} from '@/lib/types'

/**
 * Horizon construction — `ARCHITECTURE.md` §5.1 stage 1.
 *
 * Everything here is pure and deterministic (RULES.md L6): no `Date.now()`, no `Math.random()`,
 * no reliance on object key order. Time inside the engine is expressed as *local wall-clock minutes
 * from midnight* within a weekday; ISO serialisation happens only at the edges.
 *
 * All intervals are half-open `[start, end)` — see MEMORY.md §5.4.
 */

export type DayRef = { weekday: Weekday; date: string; dayIndex: number }

export type WeekFrame = {
  weekStartDate: string
  dates: Record<Weekday, string>
  days: DayRef[]
  weekLabel: string
}

export type EnergyProfile = 'peak' | 'normal' | 'trough'

export type FreeSlot = {
  id: string
  weekday: Weekday
  date: string
  dayIndex: number
  start: number
  end: number
  minutes: number
  profile: EnergyProfile
  weekend: boolean
}

/* ------------------------------------------------------------------ *
 * Date helpers (yyyy-MM-dd strings, local wall clock)
 * ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000

/** Parse a `yyyy-MM-dd` date at local noon to dodge DST edge cases. */
export function parseDate(dateISO: string): Date {
  return new Date(`${dateISO.slice(0, 10)}T12:00:00`)
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = parseDate(dateISO)
  return toDateKey(new Date(d.getTime() + days * MS_PER_DAY))
}

export function weekdayOfDate(dateISO: string): Weekday {
  const jsDay = parseDate(dateISO).getDay() // 0 = Sunday
  const idx = (jsDay + 6) % 7 // Monday-first
  return WEEKDAYS[idx] ?? 'mon'
}

export function dayIndexFrom(dateISO: string, weekStartDate: string): number {
  const a = parseDate(dateISO).getTime()
  const b = parseDate(weekStartDate).getTime()
  return Math.round((a - b) / MS_PER_DAY)
}

/** Monday (or `weekStartsOn`) of the week containing `instantISO`. */
export function weekStartOf(instantISO: string, weekStartsOn: Weekday = 'mon'): string {
  const date = new Date(instantISO)
  const key = toDateKey(date)
  const offset = WEEKDAYS.indexOf(weekStartsOn)
  const jsDay = ((parseDate(key).getDay() + 6) % 7 - offset + 7) % 7
  return addDaysISO(key, -jsDay)
}

function formatRangeLabel(startISO: string): string {
  const d = parseDate(startISO)
  const end = new Date(d.getTime() + 6 * MS_PER_DAY)
  const sameMonth = d.getMonth() === end.getMonth()
  const startStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  })
  return `${startStr} – ${endStr}`
}

export function buildWeekFrame(weekStartDate: string, weekStartsOn: Weekday = 'mon'): WeekFrame {
  const dates = {} as Record<Weekday, string>
  const days: DayRef[] = []
  const offset = WEEKDAYS.indexOf(weekStartsOn)
  for (let i = 0; i < 7; i += 1) {
    const weekday = WEEKDAYS[(offset + i) % 7] as Weekday
    const date = addDaysISO(weekStartDate, i)
    dates[weekday] = date
    days.push({ weekday, date, dayIndex: i })
  }
  return { weekStartDate, dates, days, weekLabel: formatRangeLabel(weekStartDate) }
}

/* ------------------------------------------------------------------ *
 * Interval helpers — half-open [start, end)
 * ------------------------------------------------------------------ */

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function snapUp(minutes: number, snap = SNAP_MINUTES): number {
  return Math.ceil(minutes / snap) * snap
}

export function snapDown(minutes: number, snap = SNAP_MINUTES): number {
  return Math.floor(minutes / snap) * snap
}

export function clampToDay(minutes: number): number {
  return clamp(minutes, 0, MINUTES_PER_DAY)
}

export function fmtMinutes(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${`${h}`.padStart(2, '0')}:${`${mm}`.padStart(2, '0')}`
}

export function fmtClock(minutes: number): string {
  const m = Math.round(minutes) % MINUTES_PER_DAY
  const h24 = Math.floor(m / 60)
  const mm = m % 60
  const suffix = h24 >= 12 ? 'pm' : 'am'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${`${mm}`.padStart(2, '0')}${suffix}`
}

export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h === 0) return `${mm}m`
  if (mm === 0) return `${h}h`
  return `${h}h ${mm}m`
}

/** ISO instant → minutes from midnight in wall-clock terms. */
export function minutesOfIso(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function dateKeyOfIso(iso: string): string {
  return toDateKey(new Date(iso))
}

export type Occupancy = {
  id: string
  taskId?: string
  kind: 'busy' | 'block' | 'lunch' | 'blackout'
  start: number
  end: number
  label?: string
  location?: string
}

/* ------------------------------------------------------------------ *
 * Static occupancy: what the day already contains before planning
 * ------------------------------------------------------------------ */

/**
 * Weekend hours, from the mode alone.
 *
 * Exported so callers that only need a *day window* can pass the two values that decide it instead of
 * a whole `Preferences` object — which is what lets `WeekGrid` depend on exactly what it reads and
 * skip re-rendering the week when an unrelated preference changes (see the note there).
 */
export function weekendHours(mode: Preferences['weekendMode']): { start: number; end: number } | null {
  if (mode === 'off') return null
  if (mode === 'light') return { start: 10 * 60, end: 13 * 60 }
  return { start: 9 * 60, end: 17 * 60 }
}

export function workingHoursFor(
  prefs: Preferences,
  weekday: Weekday,
): { start: number; end: number } | null {
  const explicit = prefs.workingHours[weekday]
  if (explicit && explicit.end > explicit.start) return { start: explicit.start, end: explicit.end }
  if (weekday === 'sat' || weekday === 'sun') return weekendHours(prefs.weekendMode)
  return null
}

/** Resolve the focus-peak window for a day, expressed relative to that day's working hours. */
export function peakWindowFor(prefs: Preferences, hours: { start: number; end: number }) {
  const span = hours.end - hours.start
  if (typeof prefs.focusPeak === 'string') {
    if (prefs.focusPeak === 'morning') return { start: hours.start, end: hours.start + Math.round(span * 0.45) }
    if (prefs.focusPeak === 'afternoon') {
      return { start: hours.start + Math.round(span * 0.35), end: hours.start + Math.round(span * 0.8) }
    }
    return { start: hours.start + Math.round(span * 0.6), end: hours.end }
  }
  return {
    start: clamp(prefs.focusPeak.start, hours.start, hours.end),
    end: clamp(prefs.focusPeak.end, hours.start, hours.end),
  }
}

export function troughWindowFor(prefs: Preferences, hours: { start: number; end: number }) {
  if (prefs.energyTrough) {
    return {
      start: clamp(prefs.energyTrough.start, hours.start, hours.end),
      end: clamp(prefs.energyTrough.end, hours.start, hours.end),
    }
  }
  const span = hours.end - hours.start
  return { start: clamp(hours.start + Math.round(span * 0.72), 0, hours.end), end: hours.end }
}

export function profileFor(
  prefs: Preferences,
  hours: { start: number; end: number },
  start: number,
  end: number,
): EnergyProfile {
  const peak = peakWindowFor(prefs, hours)
  const trough = troughWindowFor(prefs, hours)
  const mid = (start + end) / 2
  if (mid >= peak.start && mid < peak.end) return 'peak'
  if (mid >= trough.start && mid < trough.end) return 'trough'
  return 'normal'
}

/** Static occupancy for one day: meetings, blackouts and lunch. */
export function staticOccupancy(
  weekday: Weekday,
  date: string,
  prefs: Preferences,
  busy: BusyEvent[],
): Occupancy[] {
  const items: Occupancy[] = []
  for (const event of busy) {
    if (event.date !== date) continue
    items.push({
      id: event.id,
      kind: 'busy',
      start: clampToDay(Math.min(event.startMin, event.endMin)),
      end: clampToDay(Math.max(event.startMin, event.endMin)),
      label: event.title,
    })
  }
  for (const blackout of prefs.blackouts) {
    if (blackout.weekday && blackout.weekday !== weekday) continue
    items.push({
      id: blackout.id,
      kind: 'blackout',
      start: clampToDay(Math.min(blackout.start, blackout.end)),
      end: clampToDay(Math.max(blackout.start, blackout.end)),
      label: blackout.label,
    })
  }
  if (prefs.lunch) {
    const end = Math.max(prefs.lunch.start + prefs.lunch.minutes, prefs.lunch.end)
    items.push({ id: 'lunch', kind: 'lunch', start: clampToDay(prefs.lunch.start), end: clampToDay(end), label: 'Lunch' })
  }
  return items
}

/* ------------------------------------------------------------------ *
 * Free slot derivation
 * ------------------------------------------------------------------ */

export function subtractRanges(intervals: { start: number; end: number }[], holes: { start: number; end: number }[]) {
  let result = intervals
  for (const hole of holes) {
    const next: { start: number; end: number }[] = []
    for (const interval of result) {
      if (!overlaps(interval.start, interval.end, hole.start, hole.end)) {
        next.push(interval)
        continue
      }
      if (hole.start > interval.start) next.push({ start: interval.start, end: Math.min(hole.start, interval.end) })
      if (hole.end < interval.end) next.push({ start: Math.max(hole.end, interval.start), end: interval.end })
    }
    result = next
  }
  return result.filter((i) => i.end > i.start)
}

/** Split an interval wherever the energy profile changes, so every slot is profile-homogeneous. */
function splitByProfile(
  prefs: Preferences,
  hours: { start: number; end: number },
  interval: { start: number; end: number },
) {
  const boundaries = new Set<number>([interval.start, interval.end])
  const peak = peakWindowFor(prefs, hours)
  const trough = troughWindowFor(prefs, hours)
  for (const point of [peak.start, peak.end, trough.start, trough.end]) {
    if (point > interval.start && point < interval.end) boundaries.add(point)
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  const out: { start: number; end: number }[] = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start === undefined || end === undefined || end <= start) continue
    out.push({ start, end })
  }
  return out
}

/**
 * Build every placeable window for the week, with static reality already subtracted:
 * working hours − meetings − blackouts − lunch, split at energy-profile boundaries.
 */
export function buildFreeSlots(input: {
  frame: WeekFrame
  preferences: Preferences
  busy: BusyEvent[]
  pinnedBlocks?: PlacedBlock[]
  minBlockMinutes?: number
}): FreeSlot[] {
  const { frame, preferences, busy, pinnedBlocks = [] } = input
  const minBlock = input.minBlockMinutes ?? preferences.minBlockMinutes
  const slots: FreeSlot[] = []

  for (const day of frame.days) {
    const hours = workingHoursFor(preferences, day.weekday)
    if (!hours) continue
    const occupied = staticOccupancy(day.weekday, day.date, preferences, busy)
    for (const block of pinnedBlocks) {
      if (block.date !== day.date) continue
      occupied.push({
        id: block.id,
        kind: 'block',
        taskId: block.taskId,
        start: block.startMin,
        end: block.endMin,
        label: block.title,
        location: undefined,
      })
    }

    const free = subtractRanges(
      [{ start: Math.max(0, hours.start), end: Math.min(MINUTES_PER_DAY, hours.end) }],
      occupied,
    )

    for (const interval of free) {
      for (const part of splitByProfile(preferences, hours, interval)) {
        const start = snapUp(part.start)
        const end = snapDown(part.end)
        const minutes = end - start
        if (minutes < Math.max(SNAP_MINUTES, minBlock)) continue
        slots.push({
          id: `slot_${day.weekday}_${start}`,
          weekday: day.weekday,
          date: day.date,
          dayIndex: day.dayIndex,
          start,
          end,
          minutes,
          profile: profileFor(preferences, hours, start, end),
          weekend: day.weekday === 'sat' || day.weekday === 'sun',
        })
      }
    }
  }

  return slots
}

/** Total placeable minutes in the horizon (the honest capacity number in the report). */
export function totalCapacity(slots: FreeSlot[]): number {
  return slots.reduce((sum, slot) => sum + slot.minutes, 0)
}

export function weekdayLabel(weekday: Weekday): string {
  return WEEKDAY_LABEL[weekday]
}
