import type { Metadata } from 'next'
import { ArrowRight, Check, Minus, Sparkles } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { PaperChip, PaperLink } from '@/components/paper/PaperControls'
import { PaperSheet } from '@/components/paper/PaperSheet'
import { billingConfigured } from '@/lib/billing'

/**
 * Pricing (PRD §12).
 *
 * Three tiers, priced against what the product actually costs to run — a model call per reasoning
 * step and a Google API call per sync. The free tier is the whole planner, because the planner is the
 * product; what you pay for is volume and team features.
 *
 * Paid plans are not available until Razorpay checkout and verified entitlements are implemented.
 */

export const metadata: Metadata = {
  title: 'Pricing · Calendra',
  description: 'Calendra pricing: the full planner free, forever. Pay for volume and team features.',
}

type Tier = {
  id: string
  name: string
  price: string
  cadence: string
  tagline: string
  cta: { label: string; href: string }
  featured?: boolean
  features: { label: string; included: boolean }[]
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'The whole planner. Honesty is not a paid feature.',
    cta: { label: 'Start free', href: '/signup' },
    features: [
      { label: 'Unlimited tasks, deadlines and preferences', included: true },
      { label: 'The deterministic engine, every block explained', included: true },
      { label: 'Free-text intake and the planning agent', included: true },
      { label: 'Drag to adjust, pinned across rebuilds', included: true },
      { label: '.ics export — no account needed', included: true },
      { label: 'Google Calendar: import meetings + write back', included: true },
      { label: 'One week at a time', included: true },
      { label: 'Multi-week horizon and rolling replan', included: false },
      { label: 'Team availability and shared plans', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$8',
    cadence: 'per month',
    tagline: 'For people whose week is a real constraint, not a to-do list.',
    cta: { label: 'Join the waitlist', href: '/signup?plan=pro' },
    featured: true,
    features: [
      { label: 'Everything in Free', included: true },
      { label: 'Multi-week horizon with rolling replan', included: true },
      { label: 'Unlimited plans and saved weeks', included: true },
      { label: 'Deadline risk forecast across weeks', included: true },
      { label: 'Custom energy curves and focus windows', included: true },
      { label: '"What changed since yesterday" diff view', included: true },
      { label: 'Priority model access (no shared queue)', included: true },
      { label: 'Team availability and shared plans', included: false },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$14',
    cadence: 'per seat / month',
    tagline: 'Stop double-booking the same four people.',
    cta: { label: 'Talk to us', href: '/signup?plan=team' },
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Team availability across members', included: true },
      { label: 'Shared plans and capacity reports', included: true },
      { label: 'Meeting-cost accounting (hours × people)', included: true },
      { label: 'SSO and directory sync', included: true },
      { label: 'Self-hosting with your own model keys', included: true },
      { label: 'Audit log of every scheduled change', included: true },
      { label: 'Support SLA', included: true },
    ],
  },
]

const FAQ = [
  {
    q: 'Why is the planner free?',
    a: 'The planner runs on your machine or ours with no model required — with no API key it uses the deterministic reasoner, and the scheduling is byte-identical. What costs money is model volume and multi-user coordination. Charging for the honest report would mean charging for the part we care most about being universal.',
  },
  {
    q: 'What happens to my data?',
    a: 'Tasks and preferences live in your browser. A plan is computed server-side and not persisted unless you write it to your calendar. Google tokens live in an httpOnly cookie, never in localStorage and never in a client payload. There is no analytics and no third-party script.',
  },
  {
    q: 'Do I need to connect Google Calendar?',
    a: 'No. The planner works without it, and you can export any week as an .ics file for Apple Calendar, Outlook or Fastmail. Connecting adds two things: your real meetings become immovable context, and approved blocks are written back idempotently.',
  },
  {
    q: 'Can I self-host it?',
    a: 'Yes — it is MIT licensed and runs with zero configuration. Set your own model keys and Google credentials to switch on the live paths; you manage those integrations in your hosting environment.',
  },
]

export default function PricingPage() {
  const billing = billingConfigured()

  return (
    <main className="relative overflow-x-clip">
      <SiteHeader />

      <section className="mx-auto max-w-[1240px] px-4 pt-10 pb-4 sm:px-8">
        <div className="max-w-[64ch]">
          <PaperChip tone="teal" icon={<Sparkles size={11} aria-hidden="true" />} className="mb-4">
            Pricing
          </PaperChip>
          <h1 className="text-balance text-[34px] leading-[1.08] sm:text-[46px]">
            Pay for volume. Never for the truth.
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
            Every tier gets the real engine and the real report — the verdict that says a week does not fit is not a
            premium feature. Paid tiers add horizon, history and other people.
          </p>
        </div>

        {!billing.configured ? (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-cut-sm)] border border-dashed border-[color:rgba(120,98,70,0.3)] bg-paper-ivory/70 px-4 py-3">
            <PaperChip tone="kraft">Billing not connected</PaperChip>
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-soft">
              Paid plans are not available yet. Razorpay checkout with UPI is planned, but payment verification
              and account upgrades are not implemented. Adding API keys alone will not enable purchases.
              You can use the free planner now.
            </p>
          </div>
        ) : null}

        <div className="mt-8 grid items-start gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <PaperSheet
              key={tier.id}
              mat={tier.featured}
              className={tier.featured ? 'relative p-6 ring-1 ring-[color:rgba(58,110,101,0.35)]' : 'relative p-6'}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[19px] leading-none">{tier.name}</h2>
                  <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">{tier.tagline}</p>
                </div>
                {tier.featured ? <PaperChip tone="teal">Most useful</PaperChip> : null}
              </div>

              <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-[family-name:var(--font-display)] text-[34px] leading-none font-semibold">
                  {tier.price}
                </span>
                <span className="text-[12.5px] text-ink-faint">{tier.cadence}</span>
              </p>

              <div className="mt-5">
                {/* The CTA of a paid tier without billing is a waitlist, and says so. */}
                {tier.id !== 'free' && !billing.configured ? (
                  <PaperLink href={tier.cta.href} variant="flat" className="w-full">
                    {tier.cta.label}
                  </PaperLink>
                ) : (
                  <PaperLink href={tier.cta.href} tone={tier.featured ? 'teal' : 'ivory'} className="w-full">
                    {tier.cta.label}
                    <ArrowRight size={14} aria-hidden="true" />
                  </PaperLink>
                )}
              </div>

              <ul className="mt-6 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2.5">
                    <span
                      className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-cut-xs)] ${
                        feature.included ? 'bg-teal-light text-teal-deep' : 'bg-paper-sand text-ink-faint'
                      }`}
                    >
                      {feature.included ? (
                        <Check size={10} strokeWidth={3} aria-hidden="true" />
                      ) : (
                        <Minus size={10} strokeWidth={3} aria-hidden="true" />
                      )}
                    </span>
                    <span className={`min-w-0 text-[12.5px] leading-snug ${feature.included ? 'text-ink-soft' : 'text-ink-faint'}`}>
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>
            </PaperSheet>
          ))}
        </div>

        <p className="mt-6 max-w-[70ch] text-[12px] leading-relaxed text-ink-faint">
          Prices in USD, excluding tax. A seat is a person who can be planned around; read-only viewers are free. Cancel
          any time — an unsubscribed account keeps the free tier and every plan it has already exported.
        </p>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-14 sm:px-8">
        <h2 className="text-[26px] leading-tight sm:text-[32px]">Questions people actually ask</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {FAQ.map((item) => (
            <PaperSheet key={item.q} className="p-5">
              <h3 className="text-[15px] leading-tight">{item.q}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{item.a}</p>
            </PaperSheet>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-8">
        <PaperSheet mat className="p-8 text-center sm:p-10">
          <h2 className="text-[26px] leading-tight sm:text-[32px]">Try the whole thing first.</h2>
          <p className="mx-auto mt-3 max-w-[58ch] text-[14.5px] leading-relaxed text-ink-soft">
            No card, no key, no calendar connection required. Open the planner and it will plan a realistic week — and tell
            you the truth about an impossible one.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PaperLink href="/planner" tone="teal" size="lg">
              Open the planner
              <ArrowRight size={15} aria-hidden="true" />
            </PaperLink>
            <PaperLink href="/signup" variant="flat" size="lg">
              Create an account
            </PaperLink>
          </div>
        </PaperSheet>
      </section>

      <SiteFooter />
    </main>
  )
}
