import './harness/setup-dom'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ValidatedMinutesInput } from '@/components/paper/ValidatedMinutesInput'
import { ValidatedTextInput } from '@/components/paper/ValidatedTextInput'
import { PreferencePanel } from '@/components/planner/PreferencePanel'
import { usePlanner } from '@/lib/store/planner-store'
import { defaultPreferences } from '@/lib/sample-data'
import { workingHoursFor } from '@/lib/scheduler/slots'
import { preferencesSchema } from '@/lib/types'

const preferences = () => usePlanner.getState().preferences
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
beforeEach(() => { usePlanner.setState({ preferences: defaultPreferences(), status: 'idle', chatBusy: false, syncState: { status: 'idle' } }); window.localStorage.clear() })
afterEach(cleanup)

describe('Rules controls change real scheduling inputs safely', () => {
  it('restores custom day hours when disabling and re-enabling a day', () => {
    usePlanner.setState({ preferences: { ...preferences(), workingHours: { ...preferences().workingHours, mon: { start: 600, end: 960 } } } })
    render(React.createElement(PreferencePanel))
    fireEvent.click(screen.getByRole('switch', { name: 'Monday is a working day' }))
    assert.equal(workingHoursFor(preferences(), 'mon'), null)
    assert.equal(screen.queryByLabelText('Monday start'), null)
    fireEvent.click(screen.getByRole('switch', { name: 'Monday is a working day' }))
    assert.deepEqual(workingHoursFor(preferences(), 'mon'), { start: 600, end: 960 })
    assert.equal(input('Monday start').value, '10:00')
  })
  it('shows legacy weekend fallback hours and really disables one day without changing the other', () => {
    usePlanner.setState({ preferences: { ...preferences(), weekendMode: 'light' } })
    render(React.createElement(PreferencePanel))
    assert.equal(screen.getByRole('switch', { name: 'Saturday is a working day' }).getAttribute('aria-checked'), 'true')
    fireEvent.click(screen.getByRole('switch', { name: 'Saturday is a working day' }))
    assert.equal(workingHoursFor(preferences(), 'sat'), null)
    assert.deepEqual(workingHoursFor(preferences(), 'sun'), { start: 600, end: 780 })
    assert.equal(screen.getByRole('switch', { name: 'Saturday is a working day' }).getAttribute('aria-checked'), 'false')
  })
  it('the weekend master switch disables explicit weekend hours and restores them', () => {
    usePlanner.setState({ preferences: { ...preferences(), workingHours: { ...preferences().workingHours, sat: { start: 660, end: 840 }, sun: { start: 600, end: 780 } } } })
    render(React.createElement(PreferencePanel))
    const master = screen.getByRole('switch', { name: 'Allow weekend planning' })
    assert.equal(master.getAttribute('aria-checked'), 'true')
    fireEvent.click(master)
    assert.equal(workingHoursFor(preferences(), 'sat'), null)
    assert.equal(workingHoursFor(preferences(), 'sun'), null)
    fireEvent.click(master)
    assert.deepEqual(workingHoursFor(preferences(), 'sat'), { start: 660, end: 840 })
    assert.deepEqual(workingHoursFor(preferences(), 'sun'), { start: 600, end: 780 })
  })
  it('keeps unfinished/reversed hours local until both bounds are valid', () => {
    render(React.createElement(PreferencePanel))
    const before = preferences().workingHours.mon
    fireEvent.change(input('Monday start'), { target: { value: '' } })
    assert.deepEqual(preferences().workingHours.mon, before)
    assert.equal(input('Monday start').getAttribute('aria-invalid'), 'true')
    fireEvent.change(input('Monday start'), { target: { value: '19:00' } })
    assert.deepEqual(preferences().workingHours.mon, before)
    fireEvent.change(input('Monday end'), { target: { value: '20:00' } })
    assert.deepEqual(preferences().workingHours.mon, { start: 1140, end: 1200 })
    assert.equal(input('Monday start').getAttribute('aria-invalid'), 'false')
    assert.equal(preferencesSchema.safeParse(preferences()).success, true)
  })
  it('rejects off-grid times and accepts midnight as an end-of-day boundary', () => {
    render(React.createElement(PreferencePanel))
    const before = preferences().workingHours.mon
    fireEvent.change(input('Monday end'), { target: { value: '18:07' } })
    assert.deepEqual(preferences().workingHours.mon, before)
    fireEvent.change(input('Monday end'), { target: { value: '00:00' } })
    assert.equal(preferences().workingHours.mon?.end, 1440)
    assert.equal(input('Monday end').value, '00:00')
  })
  it('does not replace an empty or invalid meeting cap with zero or NaN', () => {
    render(React.createElement(PreferencePanel))
    const cap = input('Daily meeting warning threshold (minutes)')
    for (const value of ['', '-15', '12', '1500']) {
      fireEvent.change(cap, { target: { value } })
      assert.equal(preferences().maxMeetingMinutesPerDay, 240)
      assert.equal(cap.getAttribute('aria-invalid'), 'true')
    }
    fireEvent.change(cap, { target: { value: '180' } })
    assert.equal(preferences().maxMeetingMinutesPerDay, 180)
  })
  it('restores a custom focus peak after selecting a preset and exposes selection', () => {
    usePlanner.setState({ preferences: { ...preferences(), focusPeak: { start: 600, end: 690 } } })
    render(React.createElement(PreferencePanel))
    fireEvent.click(screen.getByRole('button', { name: 'Morning', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Custom', exact: true }))
    assert.deepEqual(preferences().focusPeak, { start: 600, end: 690 })
    assert.equal(screen.getByRole('button', { name: 'Custom', exact: true }).getAttribute('aria-pressed'), 'true')
  })
  it('does not silently shift lunch end when changing its start; restores disabled lunch', () => {
    render(React.createElement(PreferencePanel))
    fireEvent.change(input('Lunch start'), { target: { value: '12:45' } })
    assert.deepEqual(preferences().lunch, { start: 765, end: 810, minutes: 45 })
    fireEvent.click(screen.getByRole('switch', { name: 'Protect a lunch break' }))
    assert.equal(preferences().lunch, null)
    fireEvent.click(screen.getByRole('switch', { name: 'Protect a lunch break' }))
    assert.deepEqual(preferences().lunch, { start: 765, end: 810, minutes: 45 })
  })
  it('validates blackout windows and keeps the right controls after deletion', () => {
    render(React.createElement(PreferencePanel))
    const before = preferences().blackouts[0]
    fireEvent.change(input('Blackout 1 end'), { target: { value: '14:00' } })
    assert.deepEqual(preferences().blackouts[0], before)
    fireEvent.click(screen.getByRole('button', { name: `Remove ${before.label}` }))
    assert.equal(preferences().blackouts.some(item => item.id === before.id), false)
    assert.equal(input('Blackout 1 start').getAttribute('aria-invalid'), 'false')
  })
  it('does not mutate rules while a plan is pending', () => {
    render(React.createElement(PreferencePanel))
    act(() => usePlanner.setState({ status: 'planning' }))
    const before = preferences()
    fireEvent.click(screen.getByRole('switch', { name: 'Monday is a working day' }))
    assert.deepEqual(preferences(), before)
    assert.equal((screen.getByRole('group', { name: 'Rule editing' }) as HTMLFieldSetElement).disabled, true)
  })
})

it('clearing a blackout name does not persist an invalid rule', () => {
  const initial = defaultPreferences()
  usePlanner.setState({ preferences: initial })
  render(React.createElement(PreferencePanel))
  fireEvent.change(screen.getAllByLabelText('Blackout label')[0], { target: { value: '' } })
  assert.equal(preferences().blackouts[0].label, initial.blackouts[0].label)
  assert.equal(preferencesSchema.safeParse(preferences()).success, true)
  fireEvent.change(screen.getAllByLabelText('Blackout label')[0], { target: { value: 'School run' } })
  assert.equal(preferences().blackouts[0].label, 'School run')
})


it('task-duration edits do not clamp empty input to 15 or accept invalid estimates', () => {
  const changes: number[] = []
  render(React.createElement(ValidatedMinutesInput, { value: 120, 'aria-label': 'Edit task minutes', onValueChange: value => changes.push(value) }))
  for (const value of ['', '12', '-30', '721']) fireEvent.change(input('Edit task minutes'), { target: { value } })
  assert.deepEqual(changes, [])
  fireEvent.change(input('Edit task minutes'), { target: { value: '45' } })
  assert.deepEqual(changes, [45])
  assert.equal(input('Edit task minutes').getAttribute('aria-invalid'), 'false')
})

it('task-title edits cannot persist an empty name, and recover without losing typing', () => {
  const changes: string[] = []
  render(React.createElement(ValidatedTextInput, { value: 'Existing task', 'aria-label': 'Edit task title', onValueChange: value => changes.push(value) }))
  fireEvent.change(input('Edit task title'), { target: { value: '' } })
  assert.deepEqual(changes, [])
  fireEvent.change(input('Edit task title'), { target: { value: 'Updated task' } })
  assert.deepEqual(changes, ['Updated task'])
})
