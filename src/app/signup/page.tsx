import type { Metadata } from 'next'
import { AuthPanel } from '@/components/site/AuthPanel'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { safeNext } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Create an account · Calendra',
  description: 'Create a Calendra account — the full planner is free, and no card is required.',
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = safeNext(typeof params.next === 'string' ? params.next : null)
  const plan = typeof params.plan === 'string' ? params.plan : undefined
  const error = typeof params.error === 'string' ? params.error : undefined

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-clip">
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1240px] flex-1 px-4 sm:px-8">
        <AuthPanel mode="signup" error={error} next={next} plan={plan} />
      </div>
      <SiteFooter />
    </main>
  )
}
