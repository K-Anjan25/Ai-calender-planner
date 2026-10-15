import { readEnv } from '@/lib/google/scopes'

/**
 * Billing capability probe (PRD §12).
 *
 * The app does not ship a payment integration, and it does not pretend to. What it ships is the
 * *switch*: when `STRIPE_SECRET_KEY` and the price ids are present, the pricing page renders
 * checkout intents; when they are absent it renders a waitlist and says why.
 *
 * That ordering is deliberate. A checkout button that silently does nothing is worse than an honest
 * waitlist, because the user cannot tell a broken integration from a declined card.
 */

export type BillingConfig = {
  configured: boolean
  provider: 'stripe' | null
  missing: string[]
  prices: Record<'pro' | 'team', string | null>
}

export function billingConfig(): BillingConfig {
  const secret = readEnv('STRIPE_SECRET_KEY')
  const pricePro = readEnv('STRIPE_PRICE_PRO') ?? null
  const priceTeam = readEnv('STRIPE_PRICE_TEAM') ?? null
  const missing: string[] = []
  if (!secret) missing.push('STRIPE_SECRET_KEY')
  if (!pricePro) missing.push('STRIPE_PRICE_PRO')
  if (!priceTeam) missing.push('STRIPE_PRICE_TEAM')

  return {
    configured: Boolean(secret && pricePro && priceTeam),
    provider: secret ? 'stripe' : null,
    missing,
    prices: { pro: pricePro, team: priceTeam },
  }
}

export function billingConfigured(): BillingConfig {
  return billingConfig()
}
