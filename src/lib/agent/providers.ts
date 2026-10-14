/**
 * Provider resolution (`ARCHITECTURE.md` §6.2, §10).
 *
 * This module never throws and never requires a key (RULES.md L5). Missing configuration resolves to
 * the local reasoner, which is a complete implementation of the agent contract — not a stub (D-004).
 */

export type LiveProviderName = 'openai' | 'anthropic' | 'google'

export type ResolvedProvider =
  | { kind: 'live'; name: LiveProviderName; model: string }
  | { kind: 'local'; name: 'local'; model: ''; reason: string }

const DEFAULT_MODELS: Record<LiveProviderName, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash',
}

const ENV_KEYS: Record<LiveProviderName, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

function isLiveProviderName(value: string | undefined): value is LiveProviderName {
  return value === 'openai' || value === 'anthropic' || value === 'google'
}

export function configuredProviders(): LiveProviderName[] {
  return (Object.keys(ENV_KEYS) as LiveProviderName[]).filter((name) =>
    (ENV_KEYS[name] ?? []).some((key) => readEnv(key) !== undefined),
  )
}

/**
 * Resolution order: explicit request → `LLM_PROVIDER` → first configured provider → local.
 * `DEMO_MODE=1` forces the local reasoner even when keys exist (useful for deterministic demos).
 */
export function resolveProvider(requested?: string): ResolvedProvider {
  const demoForced = readEnv('DEMO_MODE') === '1' || readEnv('DEMO_MODE') === 'true'
  const explicit = requested ?? readEnv('LLM_PROVIDER')
  const candidate = isLiveProviderName(explicit) ? explicit : undefined

  if (demoForced) {
    return { kind: 'local', name: 'local', model: '', reason: 'DEMO_MODE is on' }
  }

  if (candidate) {
    const key = (ENV_KEYS[candidate] ?? []).find((name) => readEnv(name) !== undefined)
    if (!key) {
      return {
        kind: 'local',
        name: 'local',
        model: '',
        reason: `${candidate} was requested but no API key is set`,
      }
    }
    return { kind: 'live', name: candidate, model: readEnv('LLM_MODEL') ?? DEFAULT_MODELS[candidate] }
  }

  const available = configuredProviders()[0]
  if (available) {
    return { kind: 'live', name: available, model: readEnv('LLM_MODEL') ?? DEFAULT_MODELS[available] }
  }

  return { kind: 'local', name: 'local', model: '', reason: 'No API key configured' }
}

/** For /api/health. Names and booleans only — never key material (RULES.md §9). */
export function providerSummary() {
  const resolved = resolveProvider()
  return {
    mode: resolved.kind === 'live' ? ('agent' as const) : ('local' as const),
    provider: resolved.kind === 'live' ? resolved.name : 'local',
    model: resolved.model,
    configured: configuredProviders(),
    reason: resolved.kind === 'local' ? resolved.reason : undefined,
  }
}
