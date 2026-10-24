import './harness/setup-dom'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js'
import { routerStub } from './harness/dom'
import { AuthPanel } from '@/components/site/AuthPanel'
import { useSession } from '@/lib/use-session'

const originalFetch = globalThis.fetch
const capabilities = { googleSignIn: false, googleMissing: ['AUTH_SECRET'], secretConfigured: false, required: true }
afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

describe('authentication failure recovery', () => {
  it('does not treat a rejected demo request as successful sign-in', async () => {
    globalThis.fetch = async input => String(input) === '/api/auth/demo'
      ? Response.json({ ok: false, error: { message: 'Demo sessions cannot unlock a private planner.' } }, { status: 403 })
      : Response.json({ ok: true, data: { user: null, capabilities } })
    const { result } = renderHook(() => useSession())
    await waitFor(() => assert.equal(result.current.status, 'ready'))
    await act(async () => { await assert.rejects(result.current.startDemo(), /cannot unlock/) })
    assert.equal(result.current.user, null)
  })

  it('shows Google recovery instead of a continue-to-planner loop for private demo sessions', async () => {
    globalThis.fetch = async () => Response.json({ ok: true, data: { user: { id: 'demo', name: 'Demo session', email: 'demo@calendra.local', provider: 'demo' }, capabilities } })
    render(React.createElement(AppRouterContext.Provider, { value: routerStub }, React.createElement(AuthPanel, { mode: 'signin', error: 'not_configured' })))
    await screen.findByText(/Demo unavailable on this private deployment/)
    assert.equal(screen.queryByRole('link', { name: /Continue to the planner/ }), null)
    assert.ok(screen.getByRole('link', { name: 'Continue with Google' }))
    assert.ok((screen.getByRole('button', { name: /Demo unavailable/ }) as HTMLButtonElement).disabled)
    assert.ok(screen.getByText(/missing its session signing secret/))
  })
})
