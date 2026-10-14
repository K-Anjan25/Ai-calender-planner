import { writeFileSync } from 'node:fs'
import { buildScene } from '@/lib/diorama'

for (const variant of ['dawn', 'dusk', 'week', 'focus'] as const) {
  const scene = buildScene(variant)
  const layers = [...new Set(scene.shapes.map((s) => s.layer))].sort((a, b) => a - b)
  const defs = `
  <defs>
    <filter id="s1" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#58442C" flood-opacity="0.18"/></filter>
    <filter id="s2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#58442C" flood-opacity="0.22"/></filter>
    <filter id="s3" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="11" stdDeviation="11" flood-color="#58442C" flood-opacity="0.26"/></filter>
    <filter id="s4" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#58442C" flood-opacity="0.3"/></filter>
  </defs>`
  const body = layers
    .map((layer) => {
      const filter = layer <= 1 ? 's1' : layer <= 3 ? 's2' : layer <= 6 ? 's3' : 's4'
      const shapes = scene.shapes
        .filter((s) => s.layer === layer)
        .map((s) => {
          const op = s.opacity ? ` opacity="${s.opacity}"` : ''
          const parts: string[] = []
          if (s.d) parts.push(`<path d="${s.d}"/>`)
          for (const c of s.circles ?? []) parts.push(`<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`)
          if (s.pine) {
            const { x, baseY, height } = s.pine
            const w = height * 0.5
            const tiers = [
              { down: 0.62, spread: 0.3 },
              { down: 0.3, spread: 0.42 },
              { down: 0, spread: 0.5 },
            ]
            const p = [`M ${x} ${baseY - height}`]
            for (const t of tiers) {
              const lowY = baseY - height * t.down
              const highY = baseY - height + height * (1 - t.down) * 0.42
              const halfLow = w * (t.spread + 0.08)
              const halfHigh = w * t.spread * 0.55
              p.push(`L ${x + halfHigh} ${highY}`, `L ${x + halfLow} ${lowY}`, `L ${x + halfLow * 0.5} ${lowY}`, `L ${x + w * (t.spread + 0.16)} ${lowY + height * 0.06}`, `L ${x} ${baseY}`, `L ${x - w * (t.spread + 0.16)} ${lowY + height * 0.06}`, `L ${x - halfLow * 0.5} ${lowY}`, `L ${x - halfLow} ${lowY}`, `L ${x - halfHigh} ${highY}`)
            }
            p.push('Z')
            parts.push(`<path d="${p.join(' ')}"/>`)
          }
          for (const b of s.bars ?? []) {
            const rot = b.rotate ? ` transform="rotate(${b.rotate} ${b.x + b.w / 2} ${b.y + b.h / 2})"` : ''
            parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r ?? 4}"${rot}/>`)
          }
          for (const st of s.strokes ?? []) parts.push(`<path d="${st.d}" fill="none" stroke="${s.fill === 'none' ? '#6C6052' : s.fill}" stroke-width="${st.width}" stroke-linecap="round" opacity="${st.opacity ?? 0.5}"/>`)
          const fill = s.strokes && !s.d && !s.circles && !s.pine && !s.bars ? 'none' : s.fill
          return `<g fill="${fill}"${op}>${parts.join('')}</g>`
        })
        .join('')
      return `<g filter="url(#${filter})">${shapes}</g>`
    })
    .join('\n')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}">${defs}
  <rect width="${scene.width}" height="${scene.height}" fill="#F2EAD9"/>
  ${body}
</svg>`
  writeFileSync(`/tmp/scene-${variant}.svg`, svg)
  console.log('wrote', variant, svg.length)
}
