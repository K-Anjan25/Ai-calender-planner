import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { it } from 'node:test';

const theme = readFileSync('src/app/globals.css', 'utf8');
const css = readFileSync('src/components/landing/site.module.css', 'utf8');
const source = readFileSync('src/components/landing/Landing.jsx', 'utf8');
function token(name: string) {
  const color = theme.match(
    new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'),
  )?.[1];
  assert.ok(color);
  return color;
}
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function ratio(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
function bauhaus(name: string) {
  const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  assert.ok(value);
  return value;
}

it('retains the calendar identity within the new scoped Bauhaus design', () => {
  assert.match(
    source,
    /CalendraLogo.*from ['"]@\/components\/paper\/CalendraMark['"]/,
  );
  assert.match(source, /<CalendraLogo size=\{32\}/);
  for (const name of ['paper', 'ink', 'red', 'blue', 'yellow'])
    assert.ok(bauhaus(name));
  assert.match(css, /\.app\s*\{/);
});
it('keeps Bauhaus text and action pairs above AA normal-text contrast', () => {
  for (const [foreground, background] of [
    [bauhaus('ink'), bauhaus('paper')],
    [bauhaus('ink'), bauhaus('yellow')],
    ['#ffffff', bauhaus('red')],
    ['#ffffff', bauhaus('blue')],
    [bauhaus('paper'), bauhaus('blue')],
  ])
    assert.ok(
      ratio(foreground, background) >= 4.5,
      `${foreground} / ${background}`,
    );
});
it('uses the same Bauhaus primary palette throughout the application', () => {
  const allowed = new Set(['F5F2E9', 'F3CD38', '173BB5', 'C73527', '191919']);
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory()
        ? walk(path)
        : /\.(css|jsx|tsx|ts|svg)$/.test(path)
          ? [path]
          : [];
    });
  for (const path of walk('src').filter(
    (path) => path !== 'src/components/landing/site.module.css',
  )) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/#([\da-f]{3,8})\b/gi)) {
      let color = match[1].toUpperCase();
      if (color.length === 3 || color.length === 4)
        color = [...color].map((c) => c + c).join('');
      assert.ok(allowed.has(color.slice(0, 6)), `${path}: ${match[0]}`);
    }
  }
  assert.deepEqual(
    new Set(
      [...theme.matchAll(/--color-[\w-]+:\s*#([\da-f]{6})/gi)].map((m) =>
        m[1].toUpperCase(),
      ),
    ),
    allowed,
  );
});
it('uses real sample times, not decorative section numbers or fabricated adoption metrics', () => {
  assert.ok(!/0[1-9]\s*\/\s*[A-Z]/.test(source));
  assert.ok(source.includes('09:00'));
  assert.ok(source.includes('Sample plan'));
  assert.ok(!source.includes('10,000'));
});
it('uses CSS geometry instead of a hero particle canvas', () => {
  assert.ok(!source.includes('<canvas'));
  assert.match(css, /clip-path:\s*polygon/);
  assert.match(css, /border-radius:\s*50%/);
});
it('keeps material scenery out of the rebuilt landing and existing planner', () => {
  for (const file of [
    'src/app/layout.tsx',
    'src/app/planner/workspace.tsx',
    'src/components/landing/Landing.jsx',
  ]) {
    const text = readFileSync(file, 'utf8');
    for (const name of ['DioramaScene', '<Grain', '<CutEdge'])
      assert.ok(!text.includes(name));
  }
  assert.ok(!css.includes('fractalNoise'));
});
it('keeps shared planner badge tones at AA contrast', () => {
  const controls = readFileSync(
    'src/components/paper/PaperControls.tsx',
    'utf8',
  )
    .split('const CHIP_TONE:')[1]
    .split('export function')[0];
  const pairs = [...controls.matchAll(/bg-([\w-]+) text-([\w-]+)/g)];
  assert.equal(pairs.length, 8);
  for (const [, background, foreground] of pairs)
    assert.ok(ratio(token(foreground), token(background)) >= 4.5);
});
it('uses ink on yellow and white on primary red actions', () => {
  assert.match(
    css,
    /\.yellow\s*\{[^}]*background:\s*var\(--yellow\)[^}]*color:\s*var\(--ink\)/s,
  );
  assert.match(css, /\.button\s*\{[^}]*background:\s*var\(--red\)/s);
  assert.ok(ratio(bauhaus('ink'), bauhaus('yellow')) >= 7);
});
it('keeps AAA ink contrast on Bauhaus planner surfaces', () => {
  for (const surface of ['#F5F2E9', '#F3CD38'])
    assert.ok(ratio(token('ink'), surface) >= 7);
});
