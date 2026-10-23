# Calendra immersive standalone site

## Deliverable

`public/calendra.html` is the complete single-file site: production React runtime, UI icons,
CSS Modules output, decorative canvas, inline favicon and application code are bundled inside.
No Babel, React CDN, image service or external script is required at runtime. Google Fonts is an
optional stylesheet request; built-in font fallbacks work offline. No placeholder imagery is needed.

Four hash-routed views: Home, Product, Pricing, Contact. A single file cannot supply four independently
indexable server documents; per-route title/description updates aid navigation but do not replace
server-rendered SEO. Do not represent these as independent SEO landing URLs. If that becomes a
requirement, port the views to Next.js routes and pre-render each page.

The existing Calendra Next.js app and public routes are not replaced. On Vercel visit `/calendra.html`.
CTA/account/legal links point to the existing `/planner`, `/signin` and `/legal` routes on that host.
The GitHub social link is real; the LinkedIn icon is explicitly a share link, not an invented account.
Location illustrations label Hyderabad and do not claim a street address or a walk-in office.
Counters describe product principles, not fabricated customer or performance metrics.

## Rebuild / test

```sh
npm ci
node scripts/build-standalone.mjs
node scripts/check-standalone.mjs
```

Editable source is JSX with CSS Modules in this directory. Rebuild after editing; ship only the HTML
if embedding on another host. Run the HTML via a web server (e.g. `python3 -m http.server 8080
--directory public`). When used away from the Calendra host, update app/legal links for that deployment.

## Forms — required before collecting submissions

Set `FORM_ENDPOINTS.contact` and `FORM_ENDPOINTS.newsletter` in `App.jsx`, then rebuild. They are blank
by default because no delivery service, recipient or newsletter provider was supplied. Blank endpoints
show a genuine submission error; they do not save, transmit or pretend to accept personal information.

Configure same-origin POST handlers or an explicitly CORS-enabled form service. Payloads:
- Contact: `name`, `email`, `message`, `consent`.
- Newsletter: `email`.

Backend requirements: validate/sanitize inputs, reject oversized payloads, rate-limit, apply origin/CSRF
protection as appropriate, keep mail/provider keys server-side, send accepted responses only after
queueing/delivery acceptance, obtain and store appropriate consent, support unsubscribe (preferably
double opt-in), define retention and publish accurate privacy/contact details. HTTP 2xx means accepted;
non-2xx means failure. Client validation is UX, not a security boundary. Never embed secrets in HTML.

## Accessibility and performance

Semantic landmarks, skip link, field labels, associated error messages, focus-on-first-invalid,
native modal keyboard containment, Escape close, focus restoration, FAQ disclosure state, live status,
reduced-motion alternatives, capped canvas DPR/particle count, rAF-throttled scroll and observer cleanup.
Content remains visible if observer support/animation fails. A noscript summary and planner link are
included. Animated visuals are decorative; no animation is required to read content or operate forms.

Smoke tests execute the delivered bundle in jsdom. They are not a browser layout/contrast audit:
complete desktop/mobile keyboard and screen-reader acceptance before claiming WCAG conformance.
