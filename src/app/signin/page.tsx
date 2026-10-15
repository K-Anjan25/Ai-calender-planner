import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthPanel } from '@/components/site/AuthPanel'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { readSession, safeNext } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Sign in · Calendra',
  description: 'Sign in to Calendra to keep your tasks, preferences and plans across devices.',
}

/** `searchParams` is a promise in Next 15; the panel takes plain values so it stays a client island. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const session = await readSession()
  const next = safeNext(typeof params.next === 'string' ? params.next : null)
  // Only bounce to the planner when the session *is* the thing being asked for; a user who clicked
  // "Sign in" from the header should still see the account they are signed in as.
  if (session && params.redirect === '1') redirect(next)

  const error = typeof params.error === 'string' ? params.error : undefined

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-clip">
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1240px] flex-1 px-4 sm:px-8">
        <AuthPanel mode="signin" error={error} next={next} />
      </div>
      <SiteFooter />
    </main>
  )
}
