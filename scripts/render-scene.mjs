import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

for (const variant of ['dawn', 'dusk', 'week', 'focus']) {
  const svg = readFileSync(`/tmp/scene-${variant}.svg`, 'utf8')
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1000 }, background: '#F2EAD9' })
  const png = resvg.render().asPng()
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`/tmp/scene-${variant}.png`, png)
  console.log('rendered', variant, png.length, 'bytes')
}
