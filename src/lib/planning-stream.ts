import type { AgentStep } from '@/lib/types'

/** Real completed tool steps, not simulated progress. JSON remains the default for API clients. */
export function planningResponse(request: Request, run: (onStep?: (step: AgentStep) => void) => Promise<Response>): Promise<Response> | Response {
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return run()
  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: unknown) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)) }
      void run(step => emit({ type: 'trace', step })).then(async response => {
        emit({ type: 'result', payload: await response.json() })
      }).catch(() => {
        emit({ type: 'result', payload: { ok: false, error: { code: 'PLAN_FAILED', message: 'Planning failed. Your previous draft is unchanged.' } } })
      }).finally(() => { if (!closed) { closed = true; controller.close() } })
    },
    cancel() { closed = true },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } })
}
