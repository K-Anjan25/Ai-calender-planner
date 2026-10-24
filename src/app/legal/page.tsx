import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

export const metadata: Metadata = { title: 'Terms & Privacy · Calendra' }

export default function LegalPage() {
  return (
    <main>
      <SiteHeader />
      <article className="mx-auto max-w-[800px] space-y-8 px-4 py-14 sm:px-8">
        <section id="terms" className="scroll-mt-24">
          <h1 className="text-3xl">Terms</h1>
          <p className="mt-4 leading-relaxed text-ink-soft">
            Calendra is provided as-is, without warranty. Review your schedule and its feasibility report
            before relying on it. Estimated effort is not a guarantee. Calendar writes require your explicit
            approval. Paid plans are not currently available.
          </p>
        </section>
        <section id="privacy" className="scroll-mt-24">
          <h2 className="text-2xl">Privacy notice</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-ink-soft">
            <li>Tasks and preferences are saved in this browser, not synced across devices. Clearing browser storage removes locally saved data.</li>
            <li>When a live AI provider is enabled, relevant task text, preferences and calendar context may be sent to that provider. Without a live provider, rule-based planning runs on the server.</li>
            <li>Google sign-in requests identity information. Calendar access is requested separately when you connect it. You can revoke access through your Google Account permissions.</li>
            <li>Sessions use signed cookies. Signing out clears this browser’s session; a copied cookie can remain valid until expiry.</li>
            <li>Google fonts load from Google. Your hosting and AI providers process requests under their own policies. Avoid submitting sensitive information without reviewing those policies.</li>
          </ul>
        </section>
      </article>
      <SiteFooter />
    </main>
  )
}
