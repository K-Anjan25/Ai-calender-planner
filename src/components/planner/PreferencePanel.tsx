'use client'

import { useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { WEEKDAYS, WEEKDAY_LABEL, WEEKDAY_SHORT, type Preferences, type Weekday } from '@/lib/types'
import { fmtDuration, workingHoursFor } from '@/lib/scheduler/slots'
import { plannerLocked, usePlanner } from '@/lib/store/planner-store'
import { PaperButton, PaperLabel, PaperSelect, PaperToggle } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'
import { ValidatedTextInput } from '@/components/paper/ValidatedTextInput'
import { ValidatedMinutesInput } from '@/components/paper/ValidatedMinutesInput'
import { RuleTimeWindow, type TimeWindow } from './RuleTimeWindow'

const PEAK_OPTIONS = [
  { id: 'morning', label: 'Morning' }, { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' }, { id: 'custom', label: 'Custom' },
] as const


export function PreferencePanel() {
  const locked = usePlanner(plannerLocked)
  const { preferences, setPreferences } = usePlanner()
  const rememberedHours = useRef<Partial<Record<Weekday, TimeWindow>>>({})
  const rememberedPeak = useRef<TimeWindow>({ start: 540, end: 720 })
  const rememberedLunch = useRef({ start: 750, end: 810, minutes: 60 })
  useEffect(() => {
    for (const day of WEEKDAYS) { const hours = workingHoursFor(preferences, day); if (hours) rememberedHours.current[day] = hours }
    if (typeof preferences.focusPeak === 'object') rememberedPeak.current = preferences.focusPeak
    if (preferences.lunch) rememberedLunch.current = preferences.lunch
  }, [preferences])
  const update = (patch: Partial<Preferences>) => { if (!plannerLocked(usePlanner.getState())) setPreferences(patch) }
  const customPeak = typeof preferences.focusPeak === 'object' ? preferences.focusPeak : rememberedPeak.current
  const peakId = typeof preferences.focusPeak === 'string' ? preferences.focusPeak : 'custom'
  const weekendEnabled = Boolean(workingHoursFor(preferences, 'sat') || workingHoursFor(preferences, 'sun'))
  const zones = (() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [] }
  })()

  function toggleDay(day: Weekday) {
    const current = workingHoursFor(preferences, day)
    if (current) rememberedHours.current[day] = current
    const next = current ? null : rememberedHours.current[day] ?? (day === 'sat' || day === 'sun' ? { start: 600, end: 780 } : { start: 540, end: 1020 })
    // Materialize effective weekend hours before disabling the legacy mode fallback. Otherwise a
    // null Saturday is silently re-enabled by weekendMode, despite its switch displaying "off".
    const workingHours = { ...preferences.workingHours, sat: workingHoursFor(preferences, 'sat'), sun: workingHoursFor(preferences, 'sun'), [day]: next }
    update({ workingHours, weekendMode: 'off' })
  }

  return <fieldset disabled={locked} aria-busy={locked} className="grid min-w-0 grid-cols-1 items-start gap-4 disabled:opacity-60 lg:grid-cols-2">
    <legend className="sr-only">Rule editing</legend>
    <PaperSheet className="space-y-2 p-3.5 lg:col-span-2">
      <PaperLabel htmlFor="planning-timezone">Planning timezone</PaperLabel>
      <PaperSelect id="planning-timezone" value={preferences.timezone} onChange={event => update({ timezone: event.target.value })}>
        {[...new Set(['UTC', 'Asia/Kolkata', preferences.timezone, ...zones])].sort().map(zone => <option key={zone}>{zone}</option>)}
      </PaperSelect>
      <p className="text-xs text-ink-soft">Task dates, times and imported availability use this timezone.</p>
      <PaperLabel htmlFor="meeting-cap" className="mt-3">Daily meeting warning threshold (minutes)</PaperLabel>
      <ValidatedMinutesInput id="meeting-cap" min={0} max={1440} value={preferences.maxMeetingMinutesPerDay} onValueChange={maxMeetingMinutesPerDay => update({ maxMeetingMinutesPerDay })} />
      <p className="text-xs text-ink-soft">Existing meetings are never moved or deleted. Days above this threshold are flagged in the report.</p>
    </PaperSheet>

    <PaperSheet className="p-3.5">
      <h3 className="mb-2 text-[15px]">Working hours</h3>
      <p className="mb-3 text-xs text-ink-soft">Enable each day you want to plan. Turning a day back on restores its last hours.</p>
      <ul className="space-y-2">
        {WEEKDAYS.map(day => {
          const hours = workingHoursFor(preferences, day)
          return <li key={day} className="min-w-0 space-y-2 rounded-xl border border-[color:rgba(55,112,191,0.18)] p-2.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="text-sm font-semibold">{WEEKDAY_LABEL[day]} <span className="ml-1 text-xs font-normal text-ink-soft">{hours ? 'On' : 'Off'}</span></span>
              <PaperToggle checked={Boolean(hours)} onChange={() => toggleDay(day)} label={`${WEEKDAY_LABEL[day]} is a working day`} tone="olive" />
            </div>
            {hours && <RuleTimeWindow label={WEEKDAY_LABEL[day]} value={hours} onChange={value => update({ workingHours: { ...preferences.workingHours, [day]: value } })} />}
          </li>
        })}
      </ul>
    </PaperSheet>

    <div className="min-w-0 space-y-4">
    <PaperSheet className="space-y-3 p-3.5">
      <h3 className="text-[15px]">Energy</h3>
      <div>
        <PaperLabel>Focus peak — where deep work goes</PaperLabel>
        <div role="group" aria-label="Focus peak" className="flex flex-wrap gap-1.5">
          {PEAK_OPTIONS.map(option => <PaperButton key={option.id} size="sm" variant="press" active={peakId === option.id} onClick={() => update({ focusPeak: option.id === 'custom' ? customPeak : option.id })}>{option.label}</PaperButton>)}
        </div>
      </div>
      {peakId === 'custom' && <RuleTimeWindow label="Focus peak" value={customPeak} onChange={focusPeak => update({ focusPeak })} />}
      <div><PaperLabel>Low-energy window — where admin goes</PaperLabel><RuleTimeWindow label="Low-energy window" value={preferences.energyTrough ?? { start: 900, end: 1020 }} onChange={energyTrough => update({ energyTrough })} /></div>
    </PaperSheet>

    <PaperSheet className="space-y-3 p-3.5">
      <h3 className="text-[15px]">Rhythm &amp; limits</h3>
      {([
        { key: 'bufferMinutes', label: 'Buffer between blocks', aria: 'Buffer between blocks in minutes', min: 0, max: 60, step: 5 },
        { key: 'minBlockMinutes', label: 'Shortest useful block', aria: 'Shortest useful block in minutes', min: 15, max: 180, step: 15 },
        { key: 'maxDeepWorkMinutesPerDay', label: 'Deep work per day, max', aria: 'Maximum deep work per day', min: 60, max: 600, step: 30 },
        { key: 'maxPlannedMinutesPerDay', label: 'All work per day, max', aria: 'Maximum planned work per day', min: 60, max: 900, step: 30 },
      ] as const).map(control => <div key={control.key}>
        <div className="mb-1 flex items-start justify-between gap-2"><label htmlFor={`rule-${control.key}`} className="text-xs font-semibold text-ink-soft">{control.label}</label><span className="shrink-0 text-xs font-bold text-ink">{fmtDuration(preferences[control.key])}</span></div>
        <input id={`rule-${control.key}`} type="range" min={control.min} max={control.max} step={control.step} value={preferences[control.key]} aria-label={control.aria} aria-valuetext={fmtDuration(preferences[control.key])} onChange={event => update({ [control.key]: Number(event.target.value) })} className="min-h-11 w-full accent-teal-deep" />
      </div>)}
    </PaperSheet>

    <PaperSheet className="space-y-3 p-3.5">
      <div className="flex items-center justify-between gap-2"><h3 className="text-[15px]">Lunch</h3><PaperToggle checked={Boolean(preferences.lunch)} onChange={next => update({ lunch: next ? rememberedLunch.current : null })} label="Protect a lunch break" tone="olive" /></div>
      {preferences.lunch ? <>
        <RuleTimeWindow label="Lunch" value={preferences.lunch} onChange={value => update({ lunch: { ...value, minutes: value.end - value.start } })} />
        <p className="text-xs text-ink-soft">{fmtDuration(preferences.lunch.end - preferences.lunch.start)} protected. This time is not available for tasks.</p>
      </> : <p className="text-xs text-ink-soft">No break blocked out</p>}
    </PaperSheet>

    </div>
    <PaperSheet className="p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[15px]">Blackout windows</h3><PaperButton size="sm" variant="flat" onClick={() => update({ blackouts: [...preferences.blackouts, { id: `bo_${crypto.randomUUID()}`, label: 'Busy', start: 900, end: 960 }] })}><Plus size={14} aria-hidden="true" />Add</PaperButton></div>
      {!preferences.blackouts.length ? <p className="text-xs text-ink-soft">Nothing blocked. Add school runs, therapy, travel or other unavailable time.</p> : <ul className="space-y-3">
        {preferences.blackouts.map((blackout, index) => {
          const patch = (value: Partial<typeof blackout>) => update({ blackouts: preferences.blackouts.map(item => item.id === blackout.id ? { ...item, ...value } : item) })
          return <li key={blackout.id} className="min-w-0 space-y-2 rounded-xl border border-[color:rgba(55,112,191,0.18)] p-2.5">
            <div className="flex min-w-0 items-center gap-2"><ValidatedTextInput aria-label="Blackout label" maxLength={60} value={blackout.label} onValueChange={label => patch({ label })} /><button type="button" aria-label={`Remove ${blackout.label || 'blackout'}`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-frost-light disabled:opacity-45" onClick={() => update({ blackouts: preferences.blackouts.filter(item => item.id !== blackout.id) })}><Trash2 size={16} aria-hidden="true" /></button></div>
            <PaperLabel htmlFor={`blackout-${blackout.id}-day`}>Repeat</PaperLabel>
            <PaperSelect id={`blackout-${blackout.id}-day`} aria-label="Blackout day" value={blackout.weekday ?? 'every'} onChange={event => patch({ weekday: event.target.value === 'every' ? undefined : event.target.value as Weekday })}><option value="every">Every day</option>{WEEKDAYS.map(day => <option key={day} value={day}>{WEEKDAY_SHORT[day]}</option>)}</PaperSelect>
            <RuleTimeWindow label={`Blackout ${index + 1}`} value={blackout} onChange={patch} />
          </li>
        })}
      </ul>}
    </PaperSheet>

    <PaperSheet className="space-y-3 p-3.5">
      <div className="flex items-center justify-between gap-3"><h3 className="text-[15px]">Weekend planning</h3><PaperToggle checked={weekendEnabled} label="Allow weekend planning" tone="olive" onChange={next => {
        if (!next) { for (const day of ['sat', 'sun'] as const) { const hours = workingHoursFor(preferences, day); if (hours) rememberedHours.current[day] = hours } }
        update({ weekendMode: 'off', workingHours: { ...preferences.workingHours, sat: next ? rememberedHours.current.sat ?? { start: 600, end: 780 } : null, sun: next ? rememberedHours.current.sun ?? { start: 600, end: 780 } : null } })
      }} /></div>
      <p className="text-xs text-ink-soft">{weekendEnabled ? 'Use the Saturday and Sunday controls above to choose each day’s hours.' : 'Saturday and Sunday are off. Enable weekends to open their working hours.'}</p>
      <h3 className="text-[15px]">When the week is full</h3>
      <p className="text-xs text-ink-soft">Your rules stay protected. Work that does not fit appears in the Plan Report, where you can explicitly choose a trade-off before replanning.</p>
    </PaperSheet>
  </fieldset>
}
