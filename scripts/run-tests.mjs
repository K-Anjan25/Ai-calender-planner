/**
 * Test runner.
 *
 * `node --test` needs a JSX transform for the components under test, but the app's tsconfig must keep
 * Next's `jsx: preserve` (SWC compiles the app, not esbuild). The transform that tsx applies when it
 * loads a *component* file is chosen from that file's nearest tsconfig — which is the app's — so the
 * override has to be applied for every module, and the only reliable way to do that is the
 * `TSX_TSCONFIG_PATH` environment variable.
 *
 * Setting it here, in one cross-platform place, keeps `npm test` identical on every OS instead of
 * relying on `VAR=value` shell syntax.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requested = process.argv.slice(2)

const files =
  requested.length > 0
    ? requested
    : readdirSync(join(root, 'tests'))
        .filter((name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx'))
        .sort()
        .map((name) => join('tests', name))

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.tests.json' },
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`test runner killed by ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 0)
})
