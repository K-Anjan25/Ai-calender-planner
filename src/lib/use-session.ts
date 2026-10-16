'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * The client's view of the session (`ARCHITECTURE.md` §15).
 *
 * Deliberately a plain fetch of `/api/auth/session` rather than React context: the session can change
 * without the SPA changing (a full-page OAuth redirect, a cookie cleared in another tab), and the
 * endpoint is the single source of truth. `status` is explicit so the UI can render "unknown" rather
 * than flashing a signed-out header at a signed-in user.
 */

export type SessionUser = {
  id: string
  email: string
  name: string
  picture?: string
  provider: 'google' | 'demo'
}

export type SessionState = {
  status: 'loading' | 'ready' | 'error'
  user: SessionUser | null
  capabilities: {
    googleSignIn: boolean
    /** Names of the Google variables this deployment cannot see. Empty when sign-in is on. */
    googleMissing: string[]
    secretConfigured: boolean
    required: boolean
  }
}

const INITIAL: SessionState = {
  status: 'loading',
  user: null,
  capabilities: { googleSignIn: false, googleMissing: [], secretConfigured: false, required: false },
}

export function useSession() {
  const [state, setState] = useState<SessionState>(INITIAL)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      const payload = (await response.json()) as {
        ok: boolean
        data: { user: SessionUser | null; capabilities: SessionState['capabilities'] }
      }
      if (!payload.ok) throw new Error('unreadable')
      // `googleMissing` is defaulted rather than trusted: a client bundle cached from an earlier
      // deployment can outlive the server that shaped the payload, and an undefined list would
      // crash the panel that reads it.
      const capabilities = payload.data.capabilities
      setState({
        status: 'ready',
        user: payload.data.user,
        capabilities: { ...capabilities, googleMissing: capabilities.googleMissing ?? [] },
      })
    } catch {
      // A failed request does not prove that credentials are missing.
      setState({ ...INITIAL, status: 'error' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    await refresh()
  }, [refresh])

  /** The zero-configuration path: a real session for a clearly-labelled demo identity. */
  const startDemo = useCallback(async () => {
    await fetch('/api/auth/demo', { method: 'POST' })
    await refresh()
  }, [refresh])

  return { ...state, refresh, signOut, startDemo }
}
