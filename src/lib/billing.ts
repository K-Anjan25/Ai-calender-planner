/**
 * Billing is not implemented. Never infer checkout readiness from API key presence.
 * Intended provider: Razorpay, including UPI where enabled for the merchant account.
 */
export type BillingConfig = {
  configured: boolean
  provider: 'razorpay' | null
  missing: string[]
  prices: Record<'pro' | 'team', string | null>
}

export function billingConfig(): BillingConfig {
  return {
    configured: false,
    provider: null,
    missing: ['RAZORPAY_INTEGRATION'],
    prices: { pro: null, team: null },
  }
}

export function billingConfigured(): BillingConfig {
  return billingConfig()
}
