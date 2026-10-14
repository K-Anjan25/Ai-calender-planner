import { clsx } from 'clsx'
import { buildScene, type DioramaVariant, type DioramaShape } from '@/lib/diorama'

/**
 * Layered cut-paper scenery (DESIGN.md §9).
 *
 * Depth is carried entirely by per-layer drop shadows and back-to-front reveal — the same trick a
 * real diorama uses when the layers are glued a few millimetres apart. Silhouettes only: no people,
 * no characters, no faces (style mandate).
 */

const LAYER_SHADOW = ['', 'layer-shadow-1', 'layer-shadow-1', 'layer-shadow-2', 'layer-shadow-2', 'layer-shadow-3', 'layer-shadow-3', 'layer-shadow-4', 'layer-shadow-4']

export function DioramaScene({
  variant = 'dawn',
  className,
  opacity = 1,
  animated = true,
  ariaHidden = true,
}: {
  variant?: DioramaVariant
  className?: string
  opacity?: number
  animated?: boolean
  ariaHidden?: boolean
}) {
  const scene = buildScene(variant)
  const layers = [...new Set(scene.shapes.map((shape) => shape.layer))].sort((a, b) => a - b)

  return (
    <svg
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      preserveAspectRatio="xMidYMid slice"
      className={clsx('block h-full w-full', className)}
      role={ariaHidden ? 'presentation' : 'img'}
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : `${variant} paper diorama`}
      style={{ opacity }}
    >
      {layers.map((layer, index) => (
        <g
          key={layer}
          className={clsx(LAYER_SHADOW[Math.min(layer, LAYER_SHADOW.length - 1)], animated && 'animate-layer-in')}
          style={animated ? { animationDelay: `${index * 70}ms` } : undefined}
        >
          {scene.shapes
            .filter((shape) => shape.layer === layer)
            .map((shape) => (
              <Shape key={shape.id} shape={shape} />
            ))}
        </g>
      ))}
    </svg>
  )
}

function Shape({ shape }: { shape: DioramaShape }) {
  return (
    <g fill={shape.fill} opacity={shape.opacity}>
      {shape.d ? <path d={shape.d} /> : null}
      {shape.circles?.map((circle, index) => <circle key={index} cx={circle.cx} cy={circle.cy} r={circle.r} />)}
      {shape.pine ? <Pine {...shape.pine} /> : null}
      {shape.bars?.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={bar.r ?? 4}
          transform={bar.rotate ? `rotate(${bar.rotate} ${bar.x + bar.w / 2} ${bar.y + bar.h / 2})` : undefined}
        />
      ))}
      {shape.strokes?.map((stroke, index) => (
        <path
          key={index}
          d={stroke.d}
          fill="none"
          stroke={shape.fill === 'none' ? 'currentColor' : shape.fill}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          opacity={stroke.opacity ?? 0.5}
          className={shape.fill === 'none' ? 'text-ink-soft' : undefined}
        />
      ))}
    </g>
  )
}

function Pine({ x, baseY, height }: { x: number; baseY: number; height: number }) {
  const w = height * 0.5
  const tiers = [
    { down: 0.62, spread: 0.3 },
    { down: 0.3, spread: 0.42 },
    { down: 0, spread: 0.5 },
  ]
  const parts = [`M ${x} ${baseY - height}`]
  for (const tier of tiers) {
    const lowY = baseY - height * tier.down
    const highY = baseY - height + height * (1 - tier.down) * 0.42
    const halfLow = w * (tier.spread + 0.08)
    const halfHigh = w * tier.spread * 0.55
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
  return <path d={parts.join(' ')} />
}

/** Alias kept for the file map in ARCHITECTURE.md §9 — a layer is a group with its own shadow. */
export const DioramaLayer = 'g'
