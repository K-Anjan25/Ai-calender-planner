import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { authConfig, readSession } from '@/lib/auth/session'
import PlannerWorkspace from '@/app/planner/workspace'

/**
 * The planner entry point.
 *
 * A **server** component, so the auth gate happens before any client code is sent. The workspace
 * itself is a client island (`workspace.tsx`) because a grid you drag needs the browser.
 *
 * Two modes, and the difference is a deployment decision, not a code path:
 *  - `REQUIRE_AUTH` unset (default) — open. The planner is a demo anyone can evaluate, which is the
 *    product's whole argument; there is nothing private to protect.
 *  - `REQUIRE_AUTH=true` — private. No session means a redirect to `/signin`, evaluated on the server,
 *    so the workspace bundle is never even delivered.
 *
 * Gating a demo by default would cost every visitor a sign-up they did not need; leaving a private
 * deployment open would be a data leak. Hence a flag, documented in the deployment guide.
 */

export const metadata: Metadata = {
  title: 'Planner · Calendra',
  description: 'Your week, planned around your energy, your meetings and your deadlines.',
}

export const dynamic = 'force-dynamic'

export default async function PlannerPage() {
  const { required } = authConfig()

  if (required) {
    const session = await readSession()
    if (!session) redirect('/signin?next=%2Fplanner&error=required')
  }

  return <PlannerWorkspace />
}
