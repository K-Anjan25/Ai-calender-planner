import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Recursively collect files under `root` whose path passes `keep`.
 *
 * Used by the tests that assert something about *every* source file (the responsive audit). The
 * alternative — `git ls-files` — is unreliable in this environment: a snapshot can restore a stale
 * index and the command then reports files that no longer exist, or omits files that do. Walking the
 * tree reads what is actually on disk.
 */
export function walkSource(root: string, keep: (path: string) => boolean = () => true): string[] {
  const found: string[] = []

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (keep(full)) found.push(full)
    }
  }

  visit(root)
  return found.sort()
}
