import assert from 'node:assert/strict'
import { it } from 'node:test'
import { billingConfig } from '@/lib/billing'

it('never advertises checkout before a payment integration exists', () => {
  const config = billingConfig()
  assert.equal(config.configured, false)
  assert.equal(config.provider, null)
  assert.deepEqual(config.missing, ['RAZORPAY_INTEGRATION'])
  assert.deepEqual(config.prices, { pro: null, team: null })
})
