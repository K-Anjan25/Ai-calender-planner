import './harness/setup-dom'

import assert from 'node:assert/strict'
import { after, afterEach, describe, it } from 'node:test'
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { buildScene, type DioramaVariant } from '@/lib/diorama'
import { DioramaScene } from '@/components/paper/DioramaScene'

/**
 * Shape identity in the diorama scenes.
 *
 * Every shape is rendered as a React child keyed by its `id`, so two shapes sharing an id means two
 * children claiming the same identity. React warns about it and then resolves it arbitrarily — one of
 * them can be dropped or duplicated on a later render, which for a decorative background is the kind
 * of thing nobody notices until a hill flickers.
 *
 * The bug that prompted this: both birds built their id from `path.length`, and the two flight paths
 * happen to be exactly the same number of characters, so both became `birds-3-37`. Nothing in the code
 * looked wrong — the collision was only visible in the browser console, and the error pointed at
 * `DioramaScene`, nowhere near the cause.
 */

const VARIANTS: DioramaVariant[] = ['dawn', 'dusk', 'week', 'focus']

describe('every shape in every scene has its own identity', () => {
  for (const variant of VARIANTS) {
    it(`${variant}: ids are unique and well formed`, () => {
      const scene = buildScene(variant)
      // The `week` scene is deliberately sparse; anything under six means it stopped building.
      assert.ok(scene.shapes.length >= 6, `${variant} has only ${scene.shapes.length} shapes — is it still building?`)

      const seen = new Map<string, number>()
      for (const shape of scene.shapes) {
        assert.ok(shape.id.length > 0, `${variant} has a shape with an empty id`)
        seen.set(shape.id, (seen.get(shape.id) ?? 0) + 1)
      }

      const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([id, count]) => `${id} ×${count}`)
      assert.deepEqual(duplicates, [], `${variant} renders duplicate child keys: ${duplicates.join(', ')}`)
    })
  }

  it('produces the same ids on every build', () => {
    /*
     * Not cosmetic. These ids are React keys, and React identifies children by them across renders: an
     * id that shifts between builds — from a counter, a random, or an iteration order — makes React
     * unmount and remount the node, which replays the layer animation every time the scene re-renders.
     */
    for (const variant of VARIANTS) {
      const first = buildScene(variant).shapes.map((shape) => shape.id)
      const second = buildScene(variant).shapes.map((shape) => shape.id)
      assert.deepEqual(second, first, `${variant} produced different shape ids on a second build`)
    }
  })
})

/**
 * The reported symptom, rendered.
 *
 * The data-level assertions above prove the ids are unique; this proves React agrees. It is worth
 * both, because a duplicate key is reported *at render time* — the console error names
 * `DioramaScene`, which is where the keys are consumed, not where they were generated.
 */
describe('React renders every scene without a key warning', () => {
  const errors: string[] = []
  const original = console.error

  afterEach(() => cleanup())
  after(() => {
    console.error = original
  })

  it('produces no duplicate-key warning for any variant', () => {
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      for (const variant of VARIANTS) {
        const { container } = render(React.createElement(DioramaScene, { variant, animated: false }))
        assert.ok(container.querySelector('svg'), `${variant} did not render an svg`)
        assert.ok(container.querySelectorAll('path').length > 2, `${variant} rendered almost nothing`)
      }
    } finally {
      console.error = original
    }

    const keyWarnings = errors.filter((message) => /same key/i.test(message))
    assert.deepEqual(keyWarnings, [], `React warned about duplicate keys:\n${keyWarnings.join('\n')}`)
    assert.deepEqual(errors, [], `React logged errors while rendering the scenes:\n${errors.join('\n')}`)
  })
})
