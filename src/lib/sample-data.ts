import {
  WEEKDAYS,
  type BusyEvent,
  type Preferences,
  type Task,
  type Weekday,
} from '@/lib/types'
import { addDaysISO, parseDate, weekStartOf } from '@/lib/scheduler/slots'

/**
 * Demo data. It exists so the product is never an empty screen (PRD J1) and so demo mode has
 * something honest to plan. All dates are computed relative to "now", so the demo week is always
 * the current week — but nothing here is random, so plans stay reproducible (INV-7).
 */

export const DEMO_TIMEZONE = 'UTC'

export function currentWeekStart(now = new Date(), weekStartsOn: Weekday = 'mon'): string {
  return weekStartOf(now.toISOString(), weekStartsOn)
}

function at(date: string, hour: number, minute = 0): string {
  const d = parseDate(date)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}T${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}:00`
}

export function defaultPreferences(timezone = DEMO_TIMEZONE): Preferences {
  const weekdays: Partial<Record<Weekday, { start: number; end: number } | null>> = {
    mon: { start: 9 * 60, end: 18 * 60 },
    tue: { start: 9 * 60, end: 18 * 60 },
    wed: { start: 9 * 60, end: 18 * 60 },
    thu: { start: 9 * 60, end: 18 * 60 },
    fri: { start: 9 * 60, end: 16 * 60 + 30 },
    sat: null,
    sun: null,
  }
  const workingHours = {} as Preferences['workingHours']
  for (const day of WEEKDAYS) workingHours[day] = weekdays[day] ?? null

  return {
    timezone,
    weekStartsOn: 'mon',
    workingHours,
    focusPeak: 'morning',
    energyTrough: { start: 15 * 60, end: 17 * 60 },
    lunch: { start: 12 * 60 + 30, end: 13 * 60 + 30, minutes: 45 },
    bufferMinutes: 10,
    minBlockMinutes: 30,
    maxDeepWorkMinutesPerDay: 270,
    maxPlannedMinutesPerDay: 420,
    blackouts: [
      { id: 'bo_school', label: 'School pick-up', weekday: 'tue', start: 15 * 60 + 30, end: 16 * 60 + 30 },
      { id: 'bo_therapy', label: 'Therapy', weekday: 'wed', start: 17 * 60, end: 18 * 60 },
      { id: 'bo_nomeet', label: 'No-meeting Thursday', weekday: 'thu', start: 15 * 60, end: 17 * 60 },
    ],
    weekendMode: 'off',
    overflowPreference: 'shoulder',
  }
}

export function demoTasks(weekStart: string): Task[] {
  const d = (offset: number) => addDaysISO(weekStart, offset)
  return [
    {
      id: 't_deck',
      title: 'Finish Q4 board deck',
      notes: 'Narrative, numbers, and the three charts nobody reads.',
      estimateMinutes: 240,
      deadline: at(d(3), 17),
      priority: 'P0',
      energy: 'deep',
      category: 'work',
      splittable: true,
      minChunkMinutes: 60,
      source: 'demo',
    },
    {
      id: 't_spec',
      title: 'Write the search revamp spec',
      estimateMinutes: 180,
      deadline: at(d(4), 12),
      priority: 'P1',
      energy: 'deep',
      category: 'work',
      splittable: true,
      minChunkMinutes: 90,
      source: 'demo',
    },
    {
      id: 't_interviews',
      title: 'User interviews synthesis',
      estimateMinutes: 120,
      deadline: at(d(2), 18),
      priority: 'P1',
      energy: 'light',
      category: 'study',
      splittable: true,
      minChunkMinutes: 45,
      source: 'demo',
    },
    {
      id: 't_1on1prep',
      title: 'Prep for Thursday 1:1s',
      estimateMinutes: 45,
      deadline: at(d(3), 11),
      priority: 'P1',
      energy: 'admin',
      category: 'work',
      splittable: false,
      minChunkMinutes: 45,
      source: 'demo',
    },
    {
      id: 't_prs',
      title: 'Review incoming PRs',
      estimateMinutes: 30,
      priority: 'P2',
      energy: 'admin',
      category: 'work',
      splittable: true,
      minChunkMinutes: 30,
      repeatDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      source: 'demo',
    },
    {
      id: 't_gym',
      title: 'Gym',
      estimateMinutes: 45,
      priority: 'P2',
      energy: 'physical',
      category: 'health',
      splittable: false,
      minChunkMinutes: 45,
      location: 'Riverside gym',
      repeatDays: ['mon', 'wed', 'fri'],
      source: 'demo',
    },
    {
      id: 't_expenses',
      title: 'Expenses + inbox zero',
      estimateMinutes: 45,
      priority: 'P3',
      energy: 'admin',
      category: 'admin',
      splittable: false,
      minChunkMinutes: 45,
      source: 'demo',
    },
    {
      id: 't_course',
      title: 'Systems course — module 4',
      estimateMinutes: 120,
      deadline: at(d(6), 22),
      priority: 'P2',
      energy: 'deep',
      category: 'study',
      splittable: true,
      minChunkMinutes: 45,
      source: 'demo',
    },
    {
      id: 't_sideproject',
      title: 'Side project: paper textures',
      estimateMinutes: 120,
      priority: 'P3',
      energy: 'light',
      category: 'creative',
      splittable: true,
      minChunkMinutes: 45,
      location: 'Studio',
      source: 'demo',
    },
  ]
}

export function demoBusy(weekStart: string): BusyEvent[] {
  const d = (offset: number) => addDaysISO(weekStart, offset)
  return [
    { id: 'b_mon_1', title: 'Eng standup', date: d(0), startMin: 10 * 60, endMin: 10 * 60 + 15, source: 'demo' },
    { id: 'b_mon_2', title: 'Roadmap sync', date: d(0), startMin: 14 * 60, endMin: 15 * 60, source: 'demo' },
    { id: 'b_tue_1', title: 'Design critique', date: d(1), startMin: 10 * 60, endMin: 11 * 60 + 30, source: 'demo' },
    { id: 'b_tue_2', title: 'Customer call — Northwind', date: d(1), startMin: 13 * 60 + 30, endMin: 14 * 60 + 30, source: 'demo' },
    { id: 'b_wed_1', title: 'Eng standup', date: d(2), startMin: 10 * 60, endMin: 10 * 60 + 15, source: 'demo' },
    { id: 'b_wed_2', title: 'Architecture review', date: d(2), startMin: 11 * 60, endMin: 12 * 60, source: 'demo' },
    { id: 'b_wed_3', title: 'Hiring panel', date: d(2), startMin: 15 * 60, endMin: 16 * 60, source: 'demo' },
    { id: 'b_thu_1', title: '1:1s (block)', date: d(3), startMin: 13 * 60, endMin: 15 * 60, source: 'demo' },
    { id: 'b_thu_2', title: 'Finance review', date: d(3), startMin: 16 * 60, endMin: 17 * 60, source: 'demo' },
    { id: 'b_fri_1', title: 'Eng standup', date: d(4), startMin: 10 * 60, endMin: 10 * 60 + 15, source: 'demo' },
    { id: 'b_fri_2', title: 'Demo day', date: d(4), startMin: 14 * 60, endMin: 16 * 60, source: 'demo' },
  ]
}

export const DEMO_FREE_TEXT =
  'Finish the Q4 board deck (4h) by Thursday 5pm. Write the search revamp spec, 3 hours, before Friday lunch. Review PRs every weekday, 30 minutes. Prep for Thursday 1:1s, 45 minutes. Gym Mon/Wed/Fri, 45 minutes. Expenses and inbox zero sometime this week. Systems course module 4, 2 hours before Sunday night.'

/** A second demo task set that provably does not fit — used to demo the trade-off panel. */
export function overloadedTasks(weekStart: string): Task[] {
  const base = demoTasks(weekStart)
  const d = (offset: number) => addDaysISO(weekStart, offset)
  return [
    ...base,
    {
      id: 't_launch',
      title: 'Launch comms plan',
      estimateMinutes: 360,
      deadline: at(d(1), 18),
      priority: 'P0',
      energy: 'deep',
      category: 'work',
      splittable: true,
      minChunkMinutes: 90,
      source: 'demo',
    },
    {
      id: 't_boardpack',
      title: 'Investor update letter',
      estimateMinutes: 180,
      deadline: at(d(2), 12),
      priority: 'P0',
      energy: 'deep',
      category: 'work',
      splittable: true,
      minChunkMinutes: 60,
      source: 'demo',
    },
    {
      id: 't_audit',
      title: 'Security questionnaire',
      estimateMinutes: 240,
      deadline: at(d(4), 17),
      priority: 'P1',
      energy: 'admin',
      category: 'work',
      splittable: true,
      minChunkMinutes: 60,
      source: 'demo',
    },
  ]
}
