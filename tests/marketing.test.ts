import assert from 'node:assert/strict'
import { it } from 'node:test'
import { submitMarketing } from '@/lib/marketing'

let index = 0
function request(payload: unknown, headers: Record<string, string> = {}) {
  return new Request('https://calendra.example/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `test-${index++}`,
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}
const valid = {
  name: 'Test',
  email: 'hello@example.com',
  message: 'A question about my schedule.',
  consent: 'on',
}
it('rejects cross-origin submissions before processing private content', async () => {
  assert.equal(
    (
      await submitMarketing(
        request(valid, { origin: 'https://other.example' }),
        'contact',
      )
    ).status,
    403,
  )
})
it('validates required contact fields and explicit consent on the server', async () => {
  assert.equal(
    (await submitMarketing(request({ ...valid, consent: '' }), 'contact'))
      .status,
    400,
  )
  assert.equal(
    (await submitMarketing(request({ email: 'invalid' }), 'newsletter')).status,
    400,
  )
})
it('does not accept oversized or malformed payloads', async () => {
  assert.equal(
    (
      await submitMarketing(
        request({ ...valid, message: 'a'.repeat(9000) }),
        'contact',
      )
    ).status,
    413,
  )
  const malformed = new Request('https://calendra.example/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `test-${index++}`,
    },
    body: '{broken',
  })
  assert.equal((await submitMarketing(malformed, 'contact')).status, 400)
})
it('never claims acceptance without configured delivery', async () => {
  const old = process.env.CONTACT_WEBHOOK_URL
  delete process.env.CONTACT_WEBHOOK_URL
  try {
    assert.equal((await submitMarketing(request(valid), 'contact')).status, 503)
  } finally {
    if (old !== undefined) process.env.CONTACT_WEBHOOK_URL = old
  }
})
it('reports acceptance only after the configured receiver accepts; keeps credentials server-side', async () => {
  const old = process.env.CONTACT_WEBHOOK_URL,
    token = process.env.MARKETING_WEBHOOK_TOKEN,
    originalFetch = globalThis.fetch
  process.env.CONTACT_WEBHOOK_URL = 'https://receiver.example/forms'
  process.env.MARKETING_WEBHOOK_TOKEN = 'test-private-token'
  try {
    let reject = false
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://receiver.example/forms')
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer test-private-token',
      )
      assert.equal(init?.redirect, 'error')
      assert.equal(JSON.parse(String(init?.body)).kind, 'contact')
      return new Response(null, { status: reject ? 500 : 202 })
    }
    const response = await submitMarketing(request(valid), 'contact')
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { ok: true })
    reject = true
    assert.equal((await submitMarketing(request(valid), 'contact')).status, 502)
  } finally {
    globalThis.fetch = originalFetch
    if (old === undefined) delete process.env.CONTACT_WEBHOOK_URL
    else process.env.CONTACT_WEBHOOK_URL = old
    if (token === undefined) delete process.env.MARKETING_WEBHOOK_TOKEN
    else process.env.MARKETING_WEBHOOK_TOKEN = token
  }
})
