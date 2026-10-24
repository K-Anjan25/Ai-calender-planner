/** Boundary conversions only: scheduler inputs/outputs remain local wall-clock minutes. */
const formatters = new Map<string, Intl.DateTimeFormat>()
export function zonedParts(instant: Date, timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    formatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) }
}
export function localWallISO(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.date}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}
/** Resolve local midnight including offsets and DST; never use the server's system timezone. */
export function zonedMidnight(date: string, timeZone: string): Date {
  return zonedWallInstant(date, 0, timeZone)
}
export function zonedWallInstant(date: string, minute: number, timeZone: string): Date {
  const desired = Date.parse(`${date}T00:00:00Z`) + minute * 60_000
  let guess = desired
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = zonedParts(new Date(guess), timeZone)
    const actual = Date.parse(`${p.date}T00:00:00Z`) + (p.hour * 3600 + p.minute * 60 + p.second) * 1000
    const delta = desired - actual
    if (!delta) break
    guess += delta
  }
  return new Date(guess)
}
