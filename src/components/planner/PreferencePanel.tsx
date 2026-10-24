'use client'

import { Plus, Trash2, Info } from 'lucide-react'
import { SNAP_MINUTES, WEEKDAYS, WEEKDAY_LABEL, WEEKDAY_SHORT, type Preferences, type Weekday } from '@/lib/types'
import { fmtClock, fmtDuration } from '@/lib/scheduler/slots'
import { plannerLocked, usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperInput, PaperLabel, PaperSelect, PaperToggle } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'

/**
 * Preferences (FR-2.x).
 *
 * This panel is the difference between a plan and a *realistic* plan: working hours, focus peak,
 * buffers, daily caps and blackouts are all first-class inputs to the engine, and every one of them
 * shows up in the reason chips on the blocks it produced.
 */

const PEAK_OPTIONS: { id: 'morning' | 'afternoon' | 'evening' | 'custom'; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'custom', label: 'Custom' },
]

function toTime(minutes: number): string {
  return `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`
}

function fromTime(value: string): number {
  const [hours, minutes] = value.split(':')
  return Number(hours) * 60 + Number(minutes ?? 0)
}

export function PreferencePanel() {
  const locked = usePlanner(plannerLocked)
  const { preferences, setPreferences } = usePlanner()
  const customPeak = typeof preferences.focusPeak === 'object' ? preferences.focusPeak : { start: 9 * 60, end: 12 * 60 }

  const update = (patch: Partial<Preferences>) => setPreferences(patch)

  const setHours = (weekday: Weekday, part: 'start' | 'end', value: number) => {
    const current = preferences.workingHours[weekday] ?? { start: 9 * 60, end: 17 * 60 }
    update({ workingHours: { ...preferences.workingHours, [weekday]: { ...current, [part]: value } } })
  }

  const toggleWorkday = (weekday: Weekday) => {
    const current = preferences.workingHours[weekday]
    const next = current
      ? null
      : weekday === 'sat' || weekday === 'sun'
        ? { start: 10 * 60, end: 13 * 60 }
        : { start: 9 * 60, end: 17 * 60 }
    update({ workingHours: { ...preferences.workingHours, [weekday]: next } })
  }

  const peakId = typeof preferences.focusPeak === 'string' ? preferences.focusPeak : 'custom'
  // Narrowed once: the lunch object is optional in the schema, and every handler needs the whole thing.
  const lunch = preferences.lunch
    ? { start: preferences.lunch.start, end: preferences.lunch.end, minutes: preferences.lunch.minutes }
    : null

  return (
    <fieldset disabled={locked} aria-busy={locked} className="flex min-w-0 flex-col gap-3 disabled:opacity-60">
      <legend className="sr-only">Rule editing</legend>
      <PaperSheet className="p-3.5">
        <PaperLabel htmlFor="planning-timezone">Planning timezone</PaperLabel>
        <PaperSelect id="planning-timezone" value={preferences.timezone} onChange={event => update({ timezone: event.target.value })}>
          {[...new Set(['UTC', 'Asia/Kolkata', preferences.timezone, ...Intl.supportedValuesOf('timeZone')])].sort().map(zone => <option key={zone}>{zone}</option>)}
        </PaperSelect>
        <p className="mt-2 text-xs text-ink-soft">Task dates, times and imported availability use this timezone.</p>
        <PaperLabel htmlFor="meeting-cap" className="mt-3">Daily meeting warning threshold (minutes)</PaperLabel>
        <PaperInput id="meeting-cap" type="number" min={0} max={1440} step={15} value={preferences.maxMeetingMinutesPerDay} onChange={event => update({ maxMeetingMinutesPerDay: Math.max(0, Math.min(1440, Number(event.target.value))) })} />
        <p className="mt-2 text-xs text-ink-soft">Existing meetings are never moved or deleted. Days above this threshold are flagged in the report.</p>
      </PaperSheet>
      <PaperSheet className="p-3.5">
        <h3 className="mb-2 text-[15px]">Working hours</h3>
        <ul className="space-y-1.5">
          {WEEKDAYS.map((weekday) => {
            const hours = preferences.workingHours[weekday]
            return (
              <li key={weekday} className="flex items-center gap-2">
                <span className="w-[42px] shrink-0 text-xs font-bold text-ink-soft">{WEEKDAY_SHORT[weekday]}</span>
                <PaperToggle
                  checked={Boolean(hours)}
                  onChange={() => toggleWorkday(weekday)}
                  label={`${WEEKDAY_LABEL[weekday]} is a working day`}
                  tone="olive"
                />
                {/*
                  The two bounds share whatever is left after the toggle, and each keeps a floor it
                  will not shrink past instead of forcing the row wider than the sheet. Fixed pixel
                  widths here were what overflowed the rail; `flex-1 min-w-0` cannot.
                */}
                {hours ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <PaperInput
                      type="time"
                      aria-label={`${WEEKDAY_LABEL[weekday]} start`}
                      className="min-w-[74px] flex-1"
                      step={900}
                      value={toTime(hours.start)}
                      onChange={(event) => setHours(weekday, 'start', fromTime(event.target.value))}
                    />
                    <span className="shrink-0 text-ink-faint">–</span>
                    <PaperInput
                      type="time"
                      aria-label={`${WEEKDAY_LABEL[weekday]} end`}
                      className="min-w-[74px] flex-1"
                      step={900}
                      value={toTime(hours.end)}
                      onChange={(event) => setHours(weekday, 'end', fromTime(event.target.value))}
                    />
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-ink-faint">off</span>
                )}
              </li>
            )
          })}
        </ul>
      </PaperSheet>

      <PaperSheet className="p-3.5">
        <h3 className="mb-2 text-[15px]">Energy</h3>
        <div className="mb-2">
          <PaperLabel>Focus peak — where deep work goes</PaperLabel>
          <div className="flex flex-wrap gap-1.5">
            {PEAK_OPTIONS.map((option) => (
              <PaperButton
                key={option.id}
                size="sm"
                variant="press"
                active={peakId === option.id}
                onClick={() =>
                  option.id === 'custom'
                    ? update({ focusPeak: { start: customPeak.start, end: customPeak.end } })
                    : update({ focusPeak: option.id })
                }
              >
                {option.label}
              </PaperButton>
            ))}
          </div>
          {peakId === 'custom' ? (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <PaperInput
                type="time"
                aria-label="Focus peak start"
                className="min-w-[74px] flex-1"
                value={toTime(customPeak.start)}
                onChange={(event) => {
                  const start = fromTime(event.target.value)
                  update({ focusPeak: { start, end: customPeak.end } })
                }}
              />
              <span className="shrink-0 text-ink-faint">–</span>
              <PaperInput
                type="time"
                aria-label="Focus peak end"
                className="min-w-[74px] flex-1"
                value={toTime(customPeak.end)}
                onChange={(event) => {
                  const end = fromTime(event.target.value)
                  update({ focusPeak: { start: customPeak.start, end } })
                }}
              />
            </div>
          ) : null}
        </div>

        <div>
          <PaperLabel>Low-energy window — where admin goes</PaperLabel>
          <div className="flex min-w-0 items-center gap-2">
            <PaperInput
              type="time"
              aria-label="Low-energy window start"
              className="min-w-[74px] flex-1"
              value={toTime(preferences.energyTrough?.start ?? 15 * 60)}
              onChange={(event) =>
                update({
                  energyTrough: { start: fromTime(event.target.value), end: preferences.energyTrough?.end ?? 17 * 60 },
                })
              }
            />
            <span className="shrink-0 text-ink-faint">–</span>
            <PaperInput
              type="time"
              aria-label="Low-energy window end"
              className="min-w-[74px] flex-1"
              value={toTime(preferences.energyTrough?.end ?? 17 * 60)}
              onChange={(event) =>
                update({
                  energyTrough: {
                    start: preferences.energyTrough?.start ?? 15 * 60,
                    end: fromTime(event.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      </PaperSheet>

      <PaperSheet className="p-3.5">
        <h3 className="mb-2 text-[15px]">Rhythm &amp; limits</h3>
        <div className="space-y-2.5">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <PaperLabel className="mb-0">Buffer between blocks</PaperLabel>
              <span className="text-xs font-bold text-ink-soft">{preferences.bufferMinutes}m</span>
            </div>
            <input
              type="range"
              min={0}
              max={45}
              step={5}
              value={preferences.bufferMinutes}
              aria-label="Buffer between blocks in minutes"
              onChange={(event) => update({ bufferMinutes: Number(event.target.value) })}
              className="w-full accent-teal-deep"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <PaperLabel className="mb-0">Shortest useful block</PaperLabel>
              <span className="text-xs font-bold text-ink-soft">{fmtDuration(preferences.minBlockMinutes)}</span>
            </div>
            <input
              type="range"
              min={SNAP_MINUTES}
              max={120}
              step={SNAP_MINUTES}
              value={preferences.minBlockMinutes}
              aria-label="Shortest useful block in minutes"
              onChange={(event) => update({ minBlockMinutes: Number(event.target.value) })}
              className="w-full accent-teal-deep"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <PaperLabel className="mb-0">Deep work per day, max</PaperLabel>
              <span className="text-xs font-bold text-ink-soft">
                {fmtDuration(preferences.maxDeepWorkMinutesPerDay)}
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={480}
              step={30}
              value={preferences.maxDeepWorkMinutesPerDay}
              aria-label="Maximum deep work per day"
              onChange={(event) => update({ maxDeepWorkMinutesPerDay: Number(event.target.value) })}
              className="w-full accent-teal-deep"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <PaperLabel className="mb-0">All work per day, max</PaperLabel>
              <span className="text-xs font-bold text-ink-soft">
                {fmtDuration(preferences.maxPlannedMinutesPerDay)}
              </span>
            </div>
            <input
              type="range"
              min={120}
              max={720}
              step={30}
              value={preferences.maxPlannedMinutesPerDay}
              aria-label="Maximum planned work per day"
              onChange={(event) => update({ maxPlannedMinutesPerDay: Number(event.target.value) })}
              className="w-full accent-teal-deep"
            />
          </div>
        </div>
      </PaperSheet>

      <PaperSheet className="p-3.5">
        <h3 className="mb-2 text-[15px]">Lunch</h3>
        <div className="flex min-w-0 items-center gap-2">
          <PaperToggle
            checked={Boolean(preferences.lunch)}
            onChange={(next) =>
              update({ lunch: next ? { start: 12 * 60 + 30, end: 13 * 60 + 30, minutes: 45 } : null })
            }
            label="Protect a lunch break"
            tone="olive"
          />
          {lunch ? (
            <span className="flex min-w-0 flex-1 items-center gap-1">
              <PaperInput
                type="time"
                aria-label="Lunch start"
                className="min-w-[74px] flex-1"
                value={toTime(lunch.start)}
                onChange={(event) => {
                  const start = fromTime(event.target.value)
                  update({ lunch: { minutes: lunch.minutes, start, end: start + 60 } })
                }}
              />
              <span className="shrink-0 text-ink-faint">–</span>
              <PaperInput
                type="time"
                aria-label="Lunch end"
                className="min-w-[74px] flex-1"
                value={toTime(lunch.end)}
                onChange={(event) =>
                  update({ lunch: { start: lunch.start, minutes: lunch.minutes, end: fromTime(event.target.value) } })
                }
              />
            </span>
          ) : (
            <span className="text-xs text-ink-faint">No break blocked out</span>
          )}
        </div>
      </PaperSheet>

      <PaperSheet className="p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[15px]">Blackout windows</h3>
          <PaperButton
            size="sm"
            variant="flat"
            onClick={() =>
              update({
                blackouts: [
                  ...preferences.blackouts,
                  {
                    id: `bo_${preferences.blackouts.length}_${Date.now()}`,
                    label: 'Busy',
                    start: 15 * 60,
                    end: 16 * 60,
                  },
                ],
              })
            }
          >
            <Plus size={13} aria-hidden="true" />
            Add
          </PaperButton>
        </div>
        {preferences.blackouts.length === 0 ? (
          <p className="text-xs text-ink-faint">
            Nothing blocked. School runs, therapy, no-meeting windows and travel days belong here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {preferences.blackouts.map((blackout, index) => (
              /*
               * Two rows, not one wrapped row.
               *
               * One row of five controls cannot fit a 330px rail at any font size: the label is
               * `flex-1` (basis 0) so it collapses to a sliver rather than wrapping, and the four
               * fixed controls beside it set a floor the sheet cannot shrink below. Splitting it into
               * a name row and a when row means every control has a real width at every rail size.
               */
              <li key={blackout.id} className="paper-well grid gap-1.5 p-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <PaperInput
                    aria-label="Blackout label"
                    className="min-w-0 flex-1"
                    value={blackout.label}
                    onChange={(event) => {
                      const blackouts = [...preferences.blackouts]
                      blackouts[index] = { ...blackout, label: event.target.value }
                      update({ blackouts })
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${blackout.label}`}
                    className="shrink-0 rounded-[var(--radius-cut-xs)] p-1 text-ink-faint hover:bg-paper-sand hover:text-rose-deep"
                    onClick={() =>
                      update({ blackouts: preferences.blackouts.filter((item) => item.id !== blackout.id) })
                    }
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <PaperSelect
                    aria-label="Blackout day"
                    className="w-[86px] shrink-0"
                    value={blackout.weekday ?? 'every'}
                    onChange={(event) => {
                      const blackouts = [...preferences.blackouts]
                      blackouts[index] = {
                        ...blackout,
                        weekday: event.target.value === 'every' ? undefined : (event.target.value as Weekday),
                      }
                      update({ blackouts })
                    }}
                  >
                    <option value="every">Daily</option>
                    {WEEKDAYS.map((weekday) => (
                      <option key={weekday} value={weekday}>
                        {WEEKDAY_SHORT[weekday]}
                      </option>
                    ))}
                  </PaperSelect>
                  <PaperInput
                    type="time"
                    aria-label="Blackout start"
                    className="min-w-[74px] flex-1"
                    value={toTime(blackout.start)}
                    onChange={(event) => {
                      const blackouts = [...preferences.blackouts]
                      blackouts[index] = { ...blackout, start: fromTime(event.target.value) }
                      update({ blackouts })
                    }}
                  />
                  <span className="shrink-0 text-ink-faint">–</span>
                  <PaperInput
                    type="time"
                    aria-label="Blackout end"
                    className="min-w-[74px] flex-1"
                    value={toTime(blackout.end)}
                    onChange={(event) => {
                      const blackouts = [...preferences.blackouts]
                      blackouts[index] = { ...blackout, end: fromTime(event.target.value) }
                      update({ blackouts })
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </PaperSheet>

      <PaperSheet className="p-3.5">
        <h3 className="mb-2 text-[15px]">When the week is full</h3>
        <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
          Something has to give when demand beats capacity. Tell the engine which compromise you would rather make — it
          will always tell you what it did.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'shoulder', label: 'Earlier / later hours' },
              { id: 'longer-days', label: 'Longer days' },
              { id: 'weekend', label: 'Weekend mornings' },
            ] as const
          ).map((option) => (
            <PaperButton
              key={option.id}
              size="sm"
              variant="press"
              active={preferences.overflowPreference === option.id}
              onClick={() => update({ overflowPreference: option.id })}
            >
              {option.label}
            </PaperButton>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <PaperLabel className="mb-0">Weekend planning</PaperLabel>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
              <Info size={11} aria-hidden="true" />
              Off by default — your evenings and weekends are yours.
            </p>
          </div>
          <PaperToggle
            checked={preferences.weekendMode !== 'off'}
            onChange={(next) =>
              update({ weekendMode: next ? 'light' : 'off', overflowPreference: next ? 'weekend' : 'shoulder' })
            }
            label="Allow weekend planning"
            tone="rose"
          />
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Starting a day at {fmtClock(preferences.workingHours.mon?.start ?? 9 * 60)} · current week starts{' '}
          {WEEKDAY_LABEL[preferences.weekStartsOn]}
        </p>
      </PaperSheet>
    </fieldset>
  )
}
