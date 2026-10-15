# Calendra — Design Language: **Cut-Paper Diorama**

| Field | Value |
| --- | --- |
| Document | Design system |
| Version | 1.0 |
| Last updated | 2026-10-14 |
| Reference material | Layered papercraft / kirigami dioramas: laminated card stock, visible cut edges, soft depth shadows, muted dyed-paper palette |
| Related | `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `TASK.md`, `MEMORY.md` |

---

## 1. The idea

A paper diorama is a **box of stacked layers**. Each sheet is cut, dyed, and glued a few millimetres
in front of the one behind it. Depth comes from the *shadow between layers*, never from gradients.
The charm comes from imperfection: hand-cut edges, visible fibre, slightly-off registration.

Calendra renders a week as a diorama. Days are sheets. Tasks are cut-out tiles glued onto them.
The user's real meetings are the printed layer everything else must be placed around.

**Style mandate:** texture, depth, and cut-paper materiality — **no people, no characters, no faces.**
Scenery, objects, and abstract landscape forms only (mountains, clouds, sun, trees, water, hills,
tunnels, arches, tables, cups, clocks, books — the *objects* of a working week).

**Test of correctness:** squint at the screen. It should read as *a physical paper object photographed
from straight on*, not as a flat UI with a sepia filter.

## 2. Material model

Five materials. Every surface in the app is exactly one of them.

| Material | Token | Role | Treatment |
| --- | --- | --- | --- |
| **Board** | `paper-cream` | The backdrop / studio wall the diorama sits in | Matte, subtle vertical fibre, soft vignette |
| **Sheet** | `paper-ivory` | Top-layer cards holding content | Brightest surface; drop shadow; cut-edge radius; inner top highlight |
| **Mat** | `paper-sand` | The sheet *behind* a sheet — the depth cue | Offset 3–6 px down, no content, blurred edge |
| **Kraft** | `paper-kraft` | Deep layers, wells, recessed areas, dividers | Darker; often inset-shadowed (a cut *hole*, not a raised sheet) |
| **Ink** | `ink-*` | Type and line work | Warm dark brown, printed-on-paper feel; never pure black |

**Elevation is physical.** A raised element has a visible mat edge peeking out beneath it. A recessed
element has an inset shadow at the top edge. Nothing is elevated by colour alone.

## 3. Palette

All colour is **dyed paper** — desaturated, chalky, always on a cream base. Never saturated UI blue.

### 3.1 Base

| Token | Hex | Use |
| --- | --- | --- |
| `paper-cream` | `#F2EAD9` | App backdrop, board |
| `paper-ivory` | `#FBF7EE` | Sheets, cards, top layer |
| `paper-sand` | `#E8DDC7` | Mats, secondary surfaces, wells |
| `paper-kraft` | `#D6C6A9` | Deep layer, dividers, disabled |
| `ink` | `#3B332A` | Primary text, strong line work |
| `ink-soft` | `#6C6052` | Secondary text, labels |
| `ink-faint` | `#9B8D7A` | Meta, placeholders, grid lines |

### 3.2 Accents (dyed sheets)

Each accent has `DEFAULT / deep / light`. `deep` = text-on-cream contrast, `light` = fill, `DEFAULT` = chip/border.

| Family | DEFAULT | deep | light | Semantic use |
| --- | --- | --- | --- | --- |
| `rose` | `#C0707E` | `#9E4F5D` | `#E6BCC1` | P0 / urgent, deadlines at risk, destructive |
| `terracotta` | `#C67F57` | `#9A5A38` | `#E8C8B2` | Warning, tight capacity, physical tasks |
| `olive` | `#A79B5E` | `#7B7140` | `#D6CEA4` | Health, admin, success/OK state, light work |
| `teal` | `#5C8E90` | `#3D6B6E` | `#B0CCCA` | Focus / deep work, primary action, links |
| `plum` | `#7A6A9E` | `#57497A` | `#C7BADA` | Creative work, study, social |
| `frost` | `#86A7C4` | `#4E6E90` | `#CBDBE9` | Meetings, external commitments, info |

**Energy demand → colour** (used consistently everywhere):

| Energy | Accent |
| --- | --- |
| `deep` | teal |
| `light` | olive |
| `admin` | kraft/olive-deep outline |
| `social` | plum |
| `physical` | terracotta |

**Priority → treatment:** P0 = rose left cut-edge + slight lift · P1 = rose outline · P2/P3 = neutral ink-faint outline.

### 3.3 Contrast

Body copy is `ink` on `paper-ivory`/`paper-cream` (≥ 9:1) or `ink-soft` (≥ 5.4:1). Accent `deep`
values are the only accent shades allowed for text. Never place `ink-faint` body text on `paper-sand`.

## 4. Depth & shadow

The shadow system is the single most important detail. **Shadows are soft, warm, and always tinted
brown — never grey, never black, never large-radius-blur-everything.**

```
--shadow-mat     0 1px 0 rgba(255,255,255,.55), 0 3px 6px -2px rgba(88,68,44,.18)
--shadow-sheet   0 1px 0 rgba(255,255,255,.60), 0 6px 14px -6px rgba(88,68,44,.22),
                 0 18px 34px -18px rgba(88,68,44,.28)
--shadow-lift    0 2px 0 rgba(255,255,255,.50), 0 14px 28px -10px rgba(88,68,44,.30),
                 0 34px 60px -30px rgba(88,68,44,.36)
--shadow-cut     inset 0 2px 4px rgba(88,68,44,.22), inset 0 -1px 0 rgba(255,255,255,.50)
--shadow-press   inset 0 2px 3px rgba(88,68,44,.28), 0 1px 0 rgba(255,255,255,.45)
--shadow-tile    0 1px 0 rgba(255,255,255,.5), 0 4px 8px -3px rgba(88,68,44,.24)
```

**Layer stack (z):**
`0 board (vignette + fibre)` → `1 diorama scenery (SVG, blurred slightly)` → `2 mats` →
`3 sheets` → `4 tiles & chips (hover: level 5 + lift)` → `5 overlay/drag ghost` → `6 modals (lift + mat)`.

Hover raises by ~1px translate + `shadow-lift`; press drops to `shadow-press` with 1px translate **down**.
A physical object is pushed into the board, never scaled like a balloon.

## 5. Shape & cut edges

Nothing is a perfect rectangle. Every surface gets a **cut-edge radius** with mild asymmetry, as if
cut with a blade against a straightedge and glued by hand:

```
--radius-cut:   14px 17px 13px 18px / 16px 13px 18px 14px   (sheets, cards)
--radius-chip:   9px 11px  8px 12px / 10px  9px 12px  8px   (chips, buttons, tiles)
--radius-well:  12px 14px 11px 15px / 13px 11px 15px 12px   (inset areas)
```

- **Cut edge highlight:** 1px inner top highlight (`inset 0 1px 0 rgba(255,255,255,.75)`) simulates light catching the cut edge of the card stock.
- **Deckle accents:** hero scenery and large headers may use a scalloped/irregular silhouette (`CutEdge` component) for a torn-blade look.
- **Borders:** 1px `rgba(120,98,70,.14)` hairline on sheets to define the cut against same-colour neighbours. Never a 2px hard grey border.
- **Tiles** (schedule blocks) are the smallest paper unit: 3px coloured left cut-edge, radius-chip, `shadow-tile`, a 1px darker top edge.

## 6. Texture

Paper is never flat. Three layers of texture, all CSS/SVG, zero image requests:

1. **Fibre** — `feTurbulence baseFrequency="0.9 0.02"` SVG noise at 3–5% opacity, `mix-blend-mode: multiply`. Gives laid-paper directionality (horizontal grain).
2. **Tooth** — fine isotropic noise (`baseFrequency=0.8`, 4 octaves) at 2–3% for the matte bite of card stock.
3. **Board vignette** — a large soft radial darkening at the edges (`radial-gradient`, warm brown at 8–12%) so the diorama feels lit from the top-centre.

Applied via `.paper-grain` (fixed overlay, `pointer-events:none`, z-index 40) plus per-surface `.paper-fibre`.
**Total added opacity must stay under ~12%** — texture you can read is too much.

## 7. Motion

Motion imitates **paper**: light, quick, slightly elastic, no bounce-overshoot beyond ~6%.

| Interaction | Motion |
| --- | --- |
| Sheet enter | `translateY(8px) → 0`, opacity, 320 ms, ease `cubic-bezier(.22,.61,.36,1)` |
| Hover raise | `translateY(-1px)` + shadow swap, 140 ms |
| Press | `translateY(1px)` + `shadow-press`, 90 ms |
| Tile drag | 1.02 scale + `shadow-lift` + slight rotate (−1.2deg) — a sheet being lifted |
| Drop | settle 180 ms with tiny overshoot |
| Layer reveal (diorama) | staggered `translateY` + opacity, 60 ms apart, back-to-front |
| Tab change | cross-fade + 4px slide in the direction of travel, 200 ms |

`prefers-reduced-motion: reduce` → all transforms removed, opacity-only at ≤ 120 ms, staggered reveals
rendered instantly. **Never** animate width/height/top/left; transform and opacity only.

## 8. Typography

| Role | Family | Fallback stack | Size / weight / tracking |
| --- | --- | --- | --- |
| Display | **Fraunces** | `'Iowan Old Style', 'Palatino Linotype', Georgia, ui-serif, serif` | 40–56px / 600 / −0.02em for h1 · 24–30px / 600 for h2 |
| UI / body | **Nunito Sans** | `Nunito Sans, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` | 14–16px / 400–600 |
| Data / time | **Fraunces** tabular-ish for headings, UI font for numerals | — | Times use `font-variant-numeric: tabular-nums` |
| Micro labels | UI font, 11px, `0.08em` uppercase, `ink-faint` | — | Section eyebrows, day labels |

Fonts are loaded via `<link>` in `layout.tsx` (never `next/font/google`, which would fail builds in
restricted networks) and always with a full local fallback so the design survives offline.

**Voice:** warm, plain, specific, never chirpy. "3 tasks don't fit this week" — not "Uh oh! Your week is
super packed!". No exclamation marks in system copy.

### 8b. Texture, and the one place fidelity yields to speed

The paper is built from two SVG-turbulence noise layers (`paper-fibre` across the grain, `paper-tooth`
across the matte) plus a fixed studio grain, all at 3.5–5% opacity. They are **drawn with a normal
blend, not `mix-blend-mode: multiply`** — which is the truer physical model, and the reason it was
written that way first. A blended layer cannot be composited on its own: the browser must blend it
against everything beneath it, so every repaint underneath forces a re-blend of the layer. With the
texture on every chip, every button and a fixed full-viewport overlay, dragging a block meant a
screen-sized composite per frame (the INP report that started this, D-023).

Greyscale noise at 3.5–5% over cream differs by an imperceptible amount between the two blend modes,
so the material survives intact and the frames stay cheap. If you are tempted to put the blend back,
read D-023 first — and re-run `npm run test:perf`.

## 9. Components

Primitives in `src/components/paper/`:

| Component | Anatomy |
| --- | --- |
| `PaperSheet` | Board→mat→sheet stack. Props: `elevation`, `tone`, `cut`. Content sits on `paper-ivory`. |
| `PaperCard` | Sheet + optional eyebrow/title/actions + optional pinned strip. |
| `PaperButton` | 3 variants: `raised` (dyed sheet, cut radius, lift on hover), `press` (inset, for toggles), `flat` (line work only). Sizes sm/md/lg. |
| `PaperChip` | Tiny dyed-paper label. Colour = semantic family. Optional icon. |
| `PaperInput` / `PaperTextarea` | Recessed well (`shadow-cut`), cream fill, ink text, kraft caret. |
| `PaperTabs` | Cut-out tabs; active tab is the *raised* sheet, inactive are recessed kraft. |
| `PaperSheetModal` | Board scrim (cream 55% + blur 2px) + centred `shadow-lift` sheet with mat. |
| `CutEdge` | SVG filter/generator for scalloped or torn silhouettes. |
| `DioramaScene` | Layered SVG scenery. Props: `variant` (`dawn`/`focus`/`dusk`/`week`), `density`. Parallax on scroll at ≤ 6px. |
| `DioramaLayer` | One SVG silhouette layer with its own translateZ-equivalent offset + drop shadow. |
| `Grain` | Fixed fibre/tooth overlay + vignette. |
| `CalendraMark` | The product mark: a bound calendar leaf (header band, two binding rings, month grid, one marked day) in `currentColor`, sized by a single `size` prop. The day grid is drawn as cut tiles, so the glyph belongs to the same material world as the rest of the UI while still reading as *calendar* at 24px. Shipped with `CalendraLogo` (mark + wordmark) for the header, footer and auth panel. |
| `LoadBar` | Paper strip fill showing planned-vs-capacity per day. |

Cadence is *material*, not decoration: a repeating task wears a `↻` chip with its cadence spelled out
(`weekdays`, `Mon, Wed, Fri`, `every 2 weeks, Thu`, `not this week`) using the same dyed-paper chip as
a reason — so a repeat is legible at a glance without a second colour system. A dependent task says
`after: <title>` on the same strip. Export is a plain `flat` button beside the calendar actions, and
is deliberately *not* styled as a primary: taking the week away is not the main event.

### 9.1 Schedule tile anatomy

```
┌──────────────────────────────────────────┐
│▌ Design review            [P0]      ⋯    │  ← ▌3px accent cut-edge (energy colour)
│  09:00 – 10:30 · 90m                      │  ← tabular time
│  ⤷ morning focus peak · protects Thu      │  ← reason chips (max 2 visible, +n)
└──────────────────────────────────────────┘
```

States: `default` · `hover` (lift) · `dragging` (rotate −1.2deg, lift) · `pinned` (kraft pin strip + kraft left edge) · `conflict` (rose dashed cut outline + 2px offset ghost) · `done/none`.

### 9.2 The public site is the same material, quieter

`/`, `/pricing`, `/docs`, `/signin` and `/signup` share `SiteHeader` and `SiteFooter` and are built from
the same primitives as the workspace — one sheet per section, cut edges between them, chips for facts —
but with a strictly reduced palette: no `P0`/conflict colours (those mean something specific inside the
planner and must not leak into marketing), and no diorama scene competing with the hero.

**Copy carries no material vocabulary.** The requested cleanup removed the "paper, not plastic" card and
every other reference to the *material* from user-facing text: the section is now "Four layers, stacked
in this order", the cards have no index numbers, and the hero caption reads "Every layer below is a real
constraint". The layered look stays; the metaphor moves from the surface to the architecture, where it
is true. Internal class names (`paper-fibre`, `paper-tooth`) and the token palette are unchanged — they
are implementation, not copy (RULES L8).

## 10. Layout

- **Board:** max-width 1440px, padding 24–40px, centred diorama stage with visible cream margin.
- **Planner workspace:** 3 columns ≥ 1280px → `[Inbox 300px] [Week grid 1fr] [Report 340px]`. Below 1280px → grid + collapsible rails. Below 900px → single column, tabbed.
- **Week grid:** 7 day columns × hour rows (06:00–23:00 default, clamped to the user's earliest/latest working bound ±1h). 15-minute slot = 14px. Day columns are sheets; the *whole grid* sits on a kraft well so it reads as a cut recess.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Generous — paper objects need air.
- **Containment is a layout requirement, not a nicety.** Nothing may exceed its sheet at 320px. Two
  mechanisms, both global (`globals.css`): `overflow-wrap: break-word` on every text element, so a long
  URL, email or 40-character task title breaks instead of widening its parent; `max-width: 100%` on
  `img/svg/video/canvas/table/pre`. A wide table (the docs environment matrix, `min-w-[720px]`) is
  allowed **only** inside an `overflow-x-auto` wrapper — `tests/responsive.test.ts` enforces that rule
  and asserts overflow was not simply hidden at the root. If a sheet ever scrolls sideways on a phone,
  fix the child, don't clip the parent.
- **Overlap layout:** colliding tiles split column width and get a 2px vertical offset so both cut edges stay visible (a real diorama cue).

## 11. Iconography

Lucide, 16/18/20px, `stroke-width: 1.75`, colour `ink-soft` (never pure accent except in chips).
Icons read as **cut from paper**: no fills, no shadows, rounded line caps. Decorative scenery in
`DioramaScene` is bespoke SVG (cloud, sun, hill, pine, water, arch, table, cup, book, clock) —
**no human figures, no faces, ever.**

## 12. Writing style for UI copy

| Do | Don't |
| --- | --- |
| "9h 30m of work doesn't fit. Here are 3 ways to make it fit." | "Something went wrong 😅" |
| "Placed here because it's your focus peak." | "AI magic ✨" |
| "Tight — 92% of your working time is booked." | "You got this!" |
| "Not connected. Plans still work without it." | "Connect now or lose features!" |

Numbers always specific. Consequences always stated. No hype, no emoji in system copy.

## 13. Design checklist (PR gate)

- [ ] Every surface uses a material token; no bare hex in JSX.
- [ ] Depth comes from mats/shadows, correct shadow token for the elevation.
- [ ] Cut-edge radius applied; asymmetric, never `border-radius: 8px` everywhere.
- [ ] Texture present but ≤ 12% total opacity.
- [ ] Hover/press/drag follow §7; `prefers-reduced-motion` honoured.
- [ ] No human figures or faces anywhere in scenery or icons.
- [ ] Contrast passes on every text/paper pair used.
- [ ] Skeleton (paper cut-out) shown during planning, not a bare spinner.
- [ ] Empty states are diorama scenes with a single clear action.
- [ ] Keyboard-reachable, visible focus, labelled for screen readers.
