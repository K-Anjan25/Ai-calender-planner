/**
 * Diorama geometry (DESIGN.md §1, §11).
 *
 * Scenery is generated as plain data — shapes, fills and layers — so the React component stays a
 * dumb renderer, the art can be previewed offline, and every shape is reviewable in one file.
 *
 * House rules: silhouettes only. No people, no characters, no faces — scenery, objects and landscape
 * forms only (DESIGN.md §1 style mandate).
 */

export type DioramaVariant = 'dawn' | 'dusk' | 'week' | 'focus'

export type DioramaShape = {
  id: string
  layer: number
  fill: string
  opacity?: number
  /** Simple filled path. */
  d?: string
  /** A cloud made of overlapping discs (same fill, so it reads as one cut shape). */
  circles?: { cx: number; cy: number; r: number }[]
  /** A paper pine: built from three stacked triangles. */
  pine?: { x: number; baseY: number; height: number }
  /** A stack of flat objects, used for the desk variant. `rotate` is degrees around the bar centre. */
  bars?: { x: number; y: number; w: number; h: number; r?: number; rotate?: number }[]
  /** Thin decorative strokes (water highlights, steam, hatches). */
  strokes?: { d: string; width: number; opacity?: number }[]
}

export type DioramaScene = {
  width: number
  height: number
  shapes: DioramaShape[]
}

export const SCENE_WIDTH = 1200
export const SCENE_HEIGHT = 620

/* ------------------------------------------------------------------ *
 * Path builders
 * ------------------------------------------------------------------ */

/** Smooth organic ridge — the hills every paper diorama is built from. */
export function hillPath(x1: number, x2: number, baseY: number, crestY: number, skew = 0): string {
  const width = x2 - x1
  const mid = x1 + width * 0.5 + skew * width
  const c1x = x1 + width * 0.22
  const c2x = x1 + width * 0.4
  const c3x = x2 - width * 0.28
  const c4x = x2 - width * 0.12
  return [
    `M ${x1} ${baseY}`,
    `C ${c1x} ${crestY}, ${c2x} ${crestY - 6}, ${mid} ${crestY + 4}`,
    `C ${c3x} ${crestY + 16}, ${c4x} ${crestY + 26}, ${x2} ${baseY}`,
    'Z',
  ].join(' ')
}

/** A scalloped cut edge — the blade went round in small bumps. */
export function scallopBand(y: number, height: number, bump = 60, depth = 16, width = SCENE_WIDTH): string {
  const count = Math.ceil(width / bump)
  const parts = [`M 0 ${y + depth}`]
  for (let i = 0; i < count; i += 1) {
    const x = i * bump
    parts.push(`Q ${x + bump / 2} ${y - depth} ${x + bump} ${y + depth}`)
  }
  parts.push(`L ${width} ${y + height}`, `L 0 ${y + height}`, 'Z')
  return parts.join(' ')
}

/** Wavy horizontal band, used for water and mist. */
export function waterBand(y: number, height: number, amplitude = 9, wave = 200, width = SCENE_WIDTH): string {
  const count = Math.ceil(width / wave)
  const parts = [`M 0 ${y}`]
  for (let i = 0; i < count; i += 1) {
    const x = i * wave
    parts.push(`Q ${x + wave / 2} ${y - amplitude} ${x + wave} ${y}`)
  }
  parts.push(`L ${width} ${y + height}`, `L 0 ${y + height}`, 'Z')
  return parts.join(' ')
}

export function pineShape(x: number, baseY: number, height: number): string {
  const w = height * 0.5
  const tiers = [
    { y: baseY - height, spread: 0.3, down: 0.62 },
    { y: baseY - height * 0.62, spread: 0.42, down: 0.3 },
    { y: baseY - height * 0.3, spread: 0.5, down: 0 },
  ]
  const parts = [`M ${x} ${baseY - height}`]
  for (const tier of tiers) {
    const halfLow = w * (tier.spread + 0.08)
    const halfHigh = w * tier.spread * 0.55
    const lowY = baseY - height * tier.down
    const highY = tier.y + height * (1 - tier.down) * 0.42
    parts.push(
      `L ${x + halfHigh} ${highY}`,
      `L ${x + halfLow} ${lowY}`,
      `L ${x + halfLow * 0.5} ${lowY}`,
      `L ${x + w * (tier.spread + 0.16)} ${lowY + height * 0.06}`,
      `L ${x} ${baseY}`,
      `L ${x - w * (tier.spread + 0.16)} ${lowY + height * 0.06}`,
      `L ${x - halfLow * 0.5} ${lowY}`,
      `L ${x - halfLow} ${lowY}`,
      `L ${x - halfHigh} ${highY}`,
    )
  }
  parts.push('Z')
  return parts.join(' ')
}

/** Soft swirl, used for cloud curls and steam. */
export function curlPath(x: number, y: number, r: number, turns = 1.4): string {
  const steps = 24
  const parts = [`M ${x} ${y}`]
  for (let i = 1; i <= steps; i += 1) {
    const t = (i / steps) * turns * Math.PI * 2
    const radius = (i / steps) * r
    parts.push(`L ${(x + Math.cos(t) * radius).toFixed(1)} ${(y + Math.sin(t) * radius * 0.55).toFixed(1)}`)
  }
  return parts.join(' ')
}

/**
 * A pair of birds.
 *
 * The id takes a **name**, not a property of the path. It used to be built from `path.length`, which
 * looks unique and is not: two different flight paths can be exactly the same number of characters,
 * and these two are both 37 — so both birds rendered with the key `birds-3-37`. React then has two
 * children claiming the same identity, which it warns about and resolves unpredictably (one can be
 * duplicated or dropped on a re-render), and the console error points at `DioramaScene`, nowhere near
 * the cause. Shape ids must be unique within a scene; `tests/diorama.test.ts` now enforces that for
 * every variant, because this class of bug will otherwise recur with the next shape added.
 */
function birds(path: string, layer: number, name: string, fill = '#6C6052'): DioramaShape {
  return { id: `birds-${name}`, layer, fill, d: path }
}

/* ------------------------------------------------------------------ *
 * Scenes
 * ------------------------------------------------------------------ */

export function buildScene(variant: DioramaVariant): DioramaScene {
  if (variant === 'focus') return objectScene()
  if (variant === 'week') return weekScene()
  if (variant === 'dusk') return landscape('dusk')
  return landscape('dawn')
}

function landscape(variant: 'dawn' | 'dusk'): DioramaScene {
  const dawn = variant === 'dawn'
  const sky = dawn ? '#7FAFAE' : '#9C8CA8'
  const skyLight = dawn ? '#A8C7C4' : '#BFAFC7'
  const sun = dawn ? '#E8C8B2' : '#E6BCC1'
  const farHill = dawn ? '#C6CEA6' : '#C7BADA'
  const midHill = dawn ? '#A9B98C' : '#9C8CA8'
  const nearHill = dawn ? '#8FA878' : '#7A6A9E'
  const waterTop = '#CBDBE9'
  const waterDeep = '#B0CCCA'

  const shapes: DioramaShape[] = [
    /* --- layer 1: the sky, cut as an arch into the board ------------------ */
    {
      id: 'sky-arch',
      layer: 1,
      fill: sky,
      d: 'M 150 620 L 150 300 C 150 150, 330 96, 600 96 C 870 96, 1050 150, 1050 300 L 1050 620 Z',
    },
    {
      id: 'sky-arch-inner',
      layer: 1,
      fill: skyLight,
      opacity: 0.5,
      d: 'M 210 620 L 210 320 C 210 196, 370 150, 600 150 C 830 150, 990 196, 990 320 L 990 620 Z',
    },
    /* --- layer 2: cloud curls inside the arch ----------------------------- */
    {
      id: 'cloud-back-left',
      layer: 2,
      fill: '#F4EDDD',
      opacity: 0.85,
      circles: [
        { cx: 300, cy: 250, r: 46 },
        { cx: 352, cy: 236, r: 34 },
        { cx: 258, cy: 262, r: 30 },
      ],
    },
    {
      id: 'cloud-back-right',
      layer: 2,
      fill: '#F4EDDD',
      opacity: 0.82,
      circles: [
        { cx: 944, cy: 168, r: 40 },
        { cx: 990, cy: 188, r: 26 },
        { cx: 902, cy: 190, r: 22 },
      ],
    },
    {
      id: 'cloud-mid',
      layer: 2,
      fill: '#F4EDDD',
      opacity: 0.62,
      circles: [
        { cx: 470, cy: 300, r: 30 },
        { cx: 506, cy: 314, r: 20 },
      ],
    },
    /* --- layer 3: sun + birds -------------------------------------------- */
    { id: 'sun-halo', layer: 3, fill: '#F2EAD9', opacity: 0.62, circles: [{ cx: 812, cy: 202, r: 96 }] },
    { id: 'sun', layer: 3, fill: sun, circles: [{ cx: 812, cy: 202, r: 58 }] },
    birds('M 500 196 q 16 -14 32 0 q 16 -14 32 0', 3, 'far'),
    birds('M 578 168 q 11 -10 22 0 q 11 -10 22 0', 3, 'near'),
    /* --- layer 4: far hills ---------------------------------------------- */
    { id: 'far-hill-left', layer: 4, fill: farHill, d: hillPath(-40, 640, 452, 292, -0.04) },
    { id: 'far-hill-right', layer: 4, fill: farHill, d: hillPath(560, 1260, 452, 306, 0.05) },
    {
      id: 'far-hill-ridges',
      layer: 4,
      fill: 'none',
      strokes: [
        { d: 'M 120 372 q 90 -18 180 -4', width: 3, opacity: 0.35 },
        { d: 'M 760 366 q 110 -16 220 -2', width: 3, opacity: 0.35 },
      ],
    },
    /* --- layer 5: mid hills, pines --------------------------------------- */
    { id: 'mid-hill', layer: 5, fill: midHill, d: hillPath(160, 1040, 470, 342, 0.02) },
    { id: 'mid-hill-front', layer: 5, fill: midHill, d: hillPath(520, 1240, 470, 372) },
    {
      id: 'mid-hill-ridges',
      layer: 5,
      fill: 'none',
      strokes: [
        { d: 'M 320 392 q 110 -20 220 -6', width: 3, opacity: 0.3 },
        { d: 'M 700 406 q 120 -18 240 -4', width: 3, opacity: 0.3 },
      ],
    },
    { id: 'pine-a', layer: 5, fill: '#3D6B6E', pine: { x: 262, baseY: 428, height: 104 } },
    { id: 'pine-b', layer: 5, fill: '#54797B', pine: { x: 320, baseY: 434, height: 76 } },
    { id: 'pine-c', layer: 5, fill: '#7B7140', pine: { x: 900, baseY: 428, height: 92 } },
    { id: 'pine-d', layer: 5, fill: '#3D6B6E', pine: { x: 948, baseY: 432, height: 68 } },
    /* --- layer 6: near hills + tree clusters ------------------------------ */
    { id: 'near-hill-left', layer: 6, fill: nearHill, d: hillPath(-70, 470, 540, 424) },
    { id: 'near-hill-right', layer: 6, fill: nearHill, d: hillPath(760, 1290, 540, 416) },
    {
      id: 'near-hill-ridges',
      layer: 6,
      fill: 'none',
      strokes: [
        { d: 'M 40 476 q 90 -16 180 -4', width: 3, opacity: 0.32 },
        { d: 'M 900 468 q 90 -16 180 -2', width: 3, opacity: 0.32 },
        { d: 'M 120 508 q 110 -14 220 -2', width: 3, opacity: 0.24 },
        { d: 'M 840 500 q 110 -14 220 -2', width: 3, opacity: 0.24 },
      ],
    },
    { id: 'pine-e', layer: 6, fill: '#3D6B6E', pine: { x: 168, baseY: 512, height: 122 } },
    { id: 'pine-f', layer: 6, fill: '#54797B', pine: { x: 232, baseY: 518, height: 86 } },
    { id: 'pine-i', layer: 6, fill: '#7B7140', pine: { x: 300, baseY: 522, height: 62 } },
    { id: 'pine-g', layer: 6, fill: '#7B7140', pine: { x: 1010, baseY: 512, height: 112 } },
    { id: 'pine-h', layer: 6, fill: '#3D6B6E', pine: { x: 1068, baseY: 518, height: 80 } },
    /* --- layer 7: water --------------------------------------------------- */
    { id: 'water-1', layer: 7, fill: waterTop, opacity: 0.95, d: waterBand(506, 42, 10, 220) },
    { id: 'water-2', layer: 7, fill: waterDeep, opacity: 0.7, d: waterBand(536, 36, 8, 180) },
    { id: 'water-3', layer: 7, fill: waterTop, opacity: 0.5, d: waterBand(562, 34, 6, 260) },
    {
      id: 'water-glints',
      layer: 7,
      fill: 'none',
      strokes: [
        { d: 'M 420 518 q 42 -5 84 0', width: 3, opacity: 0.45 },
        { d: 'M 556 530 q 36 -4 72 0', width: 2.5, opacity: 0.4 },
        { d: 'M 690 516 q 48 -5 96 0', width: 3, opacity: 0.42 },
        { d: 'M 330 548 q 32 -4 64 0', width: 2.5, opacity: 0.3 },
        { d: 'M 780 546 q 38 -4 76 0', width: 2.5, opacity: 0.32 },
        { d: 'M 480 572 q 40 -4 80 0', width: 2.5, opacity: 0.26 },
        { d: 'M 900 566 q 34 -4 68 0', width: 2.5, opacity: 0.24 },
      ],
    },
    /* --- layer 8: shore + foreground bank --------------------------------- */
    { id: 'shore', layer: 8, fill: '#E8DDC7', d: waterBand(590, 30, 5, 300) },
    { id: 'bank', layer: 8, fill: '#D6C6A9', d: scallopBand(598, 26, 68, 9) },
    {
      id: 'grass',
      layer: 8,
      fill: 'none',
      strokes: [
        { d: 'M 86 616 q -4 -34 6 -52', width: 4, opacity: 0.4 },
        { d: 'M 100 616 q 4 -28 -2 -44', width: 3.5, opacity: 0.34 },
        { d: 'M 112 616 q -2 -22 8 -34', width: 3, opacity: 0.28 },
        { d: 'M 1112 616 q 4 -34 -6 -52', width: 4, opacity: 0.4 },
        { d: 'M 1098 616 q -4 -28 2 -44', width: 3.5, opacity: 0.34 },
        { d: 'M 1086 616 q 2 -22 -8 -34', width: 3, opacity: 0.28 },
      ],
    },
  ]

  return { width: SCENE_WIDTH, height: SCENE_HEIGHT, shapes }
}

/** Muted backdrop used behind the planner workspace. */
function weekScene(): DioramaScene {
  const shapes: DioramaShape[] = [
    {
      id: 'week-sun',
      layer: 1,
      fill: '#E8C8B2',
      opacity: 0.55,
      circles: [{ cx: 980, cy: 120, r: 58 }],
    },
    {
      id: 'week-cloud-1',
      layer: 1,
      fill: '#F4EDDD',
      opacity: 0.7,
      circles: [
        { cx: 240, cy: 110, r: 44 },
        { cx: 292, cy: 100, r: 32 },
        { cx: 198, cy: 122, r: 26 },
      ],
    },
    {
      id: 'week-cloud-2',
      layer: 1,
      fill: '#F4EDDD',
      opacity: 0.55,
      circles: [
        { cx: 640, cy: 74, r: 34 },
        { cx: 684, cy: 84, r: 24 },
      ],
    },
    { id: 'week-hill-far', layer: 2, fill: '#C6CEA6', opacity: 0.5, d: hillPath(-60, 660, 470, 300, -0.03) },
    { id: 'week-hill-mid', layer: 3, fill: '#A9B98C', opacity: 0.42, d: hillPath(540, 1270, 500, 316, 0.04) },
    { id: 'week-pine-1', layer: 3, fill: '#54797B', opacity: 0.45, pine: { x: 170, baseY: 470, height: 96 } },
    { id: 'week-pine-2', layer: 3, fill: '#7B7140', opacity: 0.4, pine: { x: 1040, baseY: 476, height: 84 } },
    { id: 'week-band', layer: 4, fill: '#D6C6A9', opacity: 0.5, d: scallopBand(560, 60, 96, 10) },
  ]
  return { width: SCENE_WIDTH, height: SCENE_HEIGHT, shapes }
}

/** Desk still-life for empty states — paper objects only, never a person. */
function objectScene(): DioramaScene {
  const shapes: DioramaShape[] = [
    /* --- layer 1: tunnel arch, the signature paper-diorama motif ---------- */
    { id: 'arch-outer', layer: 1, fill: '#86A7C4', d: 'M 372 560 L 372 296 C 372 164, 476 112, 600 112 C 724 112, 828 164, 828 296 L 828 560 Z' },
    { id: 'arch-mid', layer: 2, fill: '#CBDBE9', d: 'M 418 560 L 418 310 C 418 196, 500 152, 600 152 C 700 152, 782 196, 782 310 L 782 560 Z' },
    { id: 'arch-inner', layer: 3, fill: '#F4EDDD', d: 'M 464 560 L 464 324 C 464 228, 524 192, 600 192 C 676 192, 736 228, 736 324 L 736 560 Z' },
    /* --- layer 3: a landscape glimpsed through the tunnel ---------------- */
    { id: 'arch-hill', layer: 3, fill: '#C6CEA6', d: hillPath(464, 736, 552, 408) },
    { id: 'arch-hill-front', layer: 3, fill: '#A9B98C', d: hillPath(464, 736, 566, 462) },
    { id: 'arch-pine', layer: 3, fill: '#3D6B6E', pine: { x: 528, baseY: 552, height: 112 } },
    { id: 'arch-pine-2', layer: 3, fill: '#54797B', pine: { x: 578, baseY: 556, height: 78 } },
    { id: 'arch-sun', layer: 3, fill: '#E8C8B2', circles: [{ cx: 672, cy: 252, r: 34 }] },
    { id: 'arch-cloud', layer: 3, fill: '#FBF7EE', opacity: 0.92, circles: [{ cx: 516, cy: 246, r: 24 }, { cx: 552, cy: 258, r: 16 }] }
    ,{ id: 'arch-ridgelines', layer: 3, fill: 'none', strokes: [
      { d: 'M 486 442 q 60 -14 120 -4', width: 3, opacity: 0.3 },
      { d: 'M 566 480 q 74 -12 148 -2', width: 3, opacity: 0.26 },
    ] },
    /* --- layer 4: floating sheets --------------------------------------- */
    { id: 'sheet-1', layer: 4, fill: '#FBF7EE', bars: [{ x: 268, y: 242, w: 132, h: 92, r: 6, rotate: -7 }] },
    { id: 'sheet-1-lines', layer: 4, fill: 'none', strokes: [
      { d: 'M 286 280 L 378 270', width: 3, opacity: 0.3 },
      { d: 'M 288 298 L 372 289', width: 3, opacity: 0.24 },
    ] },
    { id: 'sheet-2', layer: 5, fill: '#E8DDC7', bars: [{ x: 796, y: 258, w: 126, h: 88, r: 6, rotate: 8 }] },
    { id: 'sheet-2-lines', layer: 5, fill: 'none', strokes: [{ d: 'M 848 300 L 934 308', width: 3, opacity: 0.28 }] },
    /* --- layer 5: desk surface ------------------------------------------ */
    { id: 'desk-top', layer: 5, fill: '#D6C6A9', bars: [{ x: 92, y: 546, w: 1016, h: 20, r: 5 }] },
    { id: 'desk-front', layer: 5, fill: '#C6B295', d: 'M 92 566 L 1108 566 L 1108 600 L 92 600 Z' },
    /* --- layer 6: the desk calendar (this is a calendar app) ------------- */
    { id: 'cal-shadow', layer: 6, fill: '#B9A484', opacity: 0.5, bars: [{ x: 566, y: 462, w: 224, h: 92, r: 6, rotate: -2 }] },
    { id: 'cal-body', layer: 7, fill: '#FBF7EE', bars: [{ x: 560, y: 456, w: 224, h: 92, r: 6, rotate: -2 }] },
    { id: 'cal-header', layer: 7, fill: '#5C8E90', bars: [{ x: 560, y: 456, w: 224, h: 22, r: 6, rotate: -2 }] },
    { id: 'cal-rings', layer: 8, fill: '#9B8D7A', circles: [{ cx: 616, cy: 444, r: 7 }, { cx: 660, cy: 442, r: 7 }, { cx: 704, cy: 441, r: 7 }, { cx: 748, cy: 440, r: 7 }] },
    { id: 'cal-grid', layer: 8, fill: 'none', strokes: [
      { d: 'M 578 494 H 766', width: 3, opacity: 0.22 },
      { d: 'M 578 512 H 766', width: 3, opacity: 0.22 },
      { d: 'M 626 488 V 540', width: 3, opacity: 0.18 },
      { d: 'M 674 487 V 539', width: 3, opacity: 0.18 },
      { d: 'M 722 486 V 538', width: 3, opacity: 0.18 },
    ] },
    { id: 'cal-today', layer: 8, fill: '#C67F57', bars: [{ x: 676, y: 504, w: 42, h: 26, r: 4, rotate: -2 }] },
    /* --- layer 6: books -------------------------------------------------- */
    { id: 'book-1', layer: 6, fill: '#7A6A9E', bars: [{ x: 252, y: 496, w: 206, h: 26, r: 4, rotate: -1 }] },
    { id: 'book-1-pages', layer: 6, fill: '#F4EDDD', bars: [{ x: 264, y: 498, w: 186, h: 8, r: 2, rotate: -1 }] },
    { id: 'book-2', layer: 7, fill: '#A79B5E', bars: [{ x: 264, y: 470, w: 184, h: 26, r: 4, rotate: 0.6 }] },
    { id: 'book-2-pages', layer: 7, fill: '#F4EDDD', bars: [{ x: 276, y: 472, w: 162, h: 8, r: 2, rotate: 0.6 }] },
    { id: 'book-3', layer: 8, fill: '#C0707E', bars: [{ x: 276, y: 444, w: 158, h: 26, r: 4, rotate: -0.6 }] },
    { id: 'book-3-pages', layer: 8, fill: '#F4EDDD', bars: [{ x: 288, y: 446, w: 136, h: 8, r: 2, rotate: -0.6 }] },
    /* --- layer 7: mug + steam ------------------------------------------- */
    { id: 'mug', layer: 7, fill: '#FBF7EE', bars: [{ x: 806, y: 452, w: 92, h: 96, r: 10 }, { x: 890, y: 486, w: 34, h: 26, r: 13 }] },
    { id: 'mug-band', layer: 8, fill: '#5C8E90', bars: [{ x: 806, y: 486, w: 92, h: 16, r: 2 }] },
    { id: 'steam', layer: 8, fill: 'none', strokes: [
      { d: curlPath(834, 430, 26, 1.3), width: 4, opacity: 0.4 },
      { d: curlPath(870, 418, 20, 1.15), width: 3.5, opacity: 0.32 },
    ] },
    /* --- layer 8: a pen and a paper clip -------------------------------- */
    { id: 'pen', layer: 8, fill: '#57497A', bars: [{ x: 600, y: 574, w: 172, h: 14, r: 7, rotate: -3 }, { x: 570, y: 578, w: 34, h: 8, r: 4, rotate: -3 }] },
    { id: 'clip', layer: 8, fill: 'none', strokes: [{ d: 'M 178 578 v -30 a 10 10 0 0 1 20 0 v 30 a 6 6 0 0 1 -12 0 v -22', width: 4, opacity: 0.5 }] },
  ]
  return { width: SCENE_WIDTH, height: SCENE_HEIGHT, shapes }
}
