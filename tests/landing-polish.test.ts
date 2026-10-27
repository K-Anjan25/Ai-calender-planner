import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
const source = readFileSync('src/components/landing/Landing.jsx', 'utf8');
const css = readFileSync('src/components/landing/site.module.css', 'utf8');

it('provides clear desktop navigation and an accessible mobile dialog', () => {
  assert.match(source, /className=\{s\.desktopNav\}/);
  assert.match(source, /aria-controls="navigation-dialog"/);
  assert.match(source, /showModal\(\)/);
  assert.match(source, /toggle.current\?\.focus\(\)/);
});
it('fits the five-day hero calendar without horizontal scrolling', () => {
  assert.match(
    css,
    /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(css, /\.hero\s*\{[^}]*grid-template-columns:/s);
  assert.ok(!css.includes('min-width: 602px'));
  assert.match(source, /This is a sample, not your live plan/);
});
it('keeps actions in normal flow instead of overlapping content', () => {
  assert.ok(!source.includes('stickyCTA'));
  assert.match(css, /\.closing\s*\{/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
it('preserves visible form boxes and validation/loading/failure recovery', () => {
  assert.match(css, /border:\s*1px solid var\(--ink\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(source, /aria-busy=\{busy\}/);
  assert.match(source, /if \(!response.ok\) throw/);
  assert.match(source, /aria-invalid=\{!!errors.email\}/);
});
it('keeps FAQ questions keyboard-operable with associated answer panels', () => {
  assert.match(source, /aria-expanded=\{open === index\}/);
  assert.match(source, /aria-controls=\{`faq-answer-\$\{index\}`\}/);
  assert.match(source, /hidden=\{open !== index\}/);
  assert.match(css, /min-height:\s*66px/);
});
it('anchors a bounded sticky header and respects reduced motion for in-page navigation', () => {
  assert.match(css, /\.header\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.headerInner\s*\{[^}]*width:\s*min\(/s);
  assert.match(source, /onClickCapture=\{followAnchor\}/);
  assert.match(source, /target.scrollIntoView/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});
it('keeps payment and AI claims honest', () => {
  assert.match(source, /Enquiry only. No checkout or payment./);
  assert.match(source, /Live language-model features depend on the provider/);
  assert.match(source, /does not currently sync your tasks across devices/);
  assert.match(source, /select.value = name.toLowerCase\(\)/);
});
it('preserves the compact real footer map with attribution and a direct link', () => {
  assert.match(source, /title="Map of Hyderabad in the footer"/);
  assert.match(source, /output=embed/);
  assert.match(source, /aria-label="Open Hyderabad location map \(new tab\)"/);
  assert.match(css, /\.tinyMap\s*\{[^}]*height:\s*110px/s);
  assert.match(css, /\.tinyMap iframe\s*\{[^}]*height:\s*100%/s);
});
it('uses same-origin contact and newsletter routes and a skip link', () => {
  assert.match(source, /contact:\s*['"]\/api\/contact['"]/);
  assert.match(source, /newsletter:\s*['"]\/api\/newsletter['"]/);
  assert.match(source, /href="#main-content"/);
  assert.match(source, /aria-live="polite"/);
});
