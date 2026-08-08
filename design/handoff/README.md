# Handoff: Edura Redesign — "Classical Ledger" direction

## Overview
A redesign direction for Edura (K-12 centers platform, Egyptian market, Arabic-first). It replaces the retired visual skin while keeping the product's functional invariants. Scope covered by the approved design: brand direction + type pairing, token layer, wordmark, marketing landing hero (AR + EN), an animated GSAP hero object, component states, and a dark-mode spec.

**Target repos:** the `edura` monorepo (`packages/ui`, `apps/www`) and the `showcase` marketing site. The single source of truth for tokens is `packages/ui/src/styles/globals.css` — restyle by editing tokens there, never by redeclaring them in portal files (a unit test enforces this).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy. Recreate them in the target codebase's existing environment (Next.js + Tailwind v4 + shadcn/Radix in `packages/ui`; the showcase uses the same token sheet). `Edura Redesign.dc.html` is the full design document; `ledger-hero.js` is a working reference implementation of the hero animation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and animation timings below are final and should be matched exactly. The landing layout is hifi for the hero and feature row; sections not shown (pricing, footer legal line) were deliberately not designed — see Open Questions.

## The Principle (read first)
The old "Ledger" constitution (`design/CONSTITUTION.md`) is **retired as a visual system but kept as a functional one**. The interface still tells the truth about what the software guarantees. These invariants are NON-NEGOTIABLE and survive the reskin:

1. Every data figure (money, IDs, dates, codes, table numbers) is **IBM Plex Mono, tabular, Latin digits, bidi-isolated** (`<Num>`). Prose counts stay Arabic-Indic in the body face (`<ProseCount>`). Two components, never one with a flag.
2. **Two-step commit** on irreversible money actions only; the confirm button **carries its own amount** ("Confirm payment of 300.00 EGP").
3. **The seal** marks permanence: `rotate(-6deg)`, stamps in at `420ms cubic-bezier(0.16,1,0.3,1)` from `rotate(-14deg) scale(1.3)`. It never mirrors in RTL. Inside the *app* it remains the only animation; the marketing site may use GSAP motion (see Hero Animation).
4. **Double rule on totals**: `border-top: 2px double var(--ink)` — drawn from `--ink`, never `--rule`.
5. Every intermediate figure shown, nothing pre-summed. The actor is never absent (`النظام` for automated writes).
6. Commit state is **per record**, never a global banner.
7. Three densities: `compact` (34px header / 7px cells), `comfortable` (42/13), `touch` (48px min target, 16px min type).
8. Four semantic colors: indigo (interactive/brand-in-app), teal (money/confirmed), amber (waiting), red (irreversible). Never two saturated colors in one row.
9. Excluded capabilities are absent, not disabled. Empty ≠ error ≠ permission-denied.

**What changed:** the visual voice is now editorial ("Classical"): hairline rules, color as stroke never fill, outlined buttons, matted plates, serif display faces, one gold brand accent — and Arabic is co-primary, not adapted.

## Typography (the core decision)
Arabic renders the primary audience; it gets a real display face, not a fallback.

| Role | Latin | Arabic |
|---|---|---|
| Display / headings | Cormorant Garamond, weight 400 (display) – 600 (interface headings max) | **Amiri** 700 (display), line-height ≥1.34 |
| Body / UI text | Lora 400–600 | **IBM Plex Sans Arabic** 400–700 |
| Figures (always) | IBM Plex Mono 400–600, `tabular-nums` | same (Latin digits, isolated) |

- Latin display: `letter-spacing: -0.018em`, line-height 1.04–1.1. NEVER apply letter-spacing to Arabic (connected script).
- Eyebrow/kicker: 2×9px gold rule marker + label. Latin: 10px/600/0.12em uppercase Plex Mono. Arabic: 12px/700, `word-spacing: 0.1em`, Plex Sans Arabic — no case, no tracking, no mono. Keep the existing `<Eyebrow locale>` component; change its marker color to `--gold` on marketing surfaces.
- Bidi rules from the old constitution §6.2–6.4 all still apply (separators rendered by components, money end-aligned both directions, time axes LTR, icons flip only if they point along the reading axis).

## Design Tokens
Update `packages/ui/src/styles/globals.css` `:root` / `[data-theme="dark"]`. Mechanism stays `[data-theme="dark"]`, initial value from `prefers-color-scheme`.

### Light
```
--paper:  #f3f2f2   ground
--sheet:  #faf9f9   cards
--field:  #eae9e9   inputs / muted fills
--ink:    #201f1d   body text        (14.7:1 on paper)
--ink-2:  #605d5d   secondary text
--ink-3:  #6b6867   meta text        (≥4.6:1 on all three grounds — do NOT use Classical's #7d7979, it fails AA)
--rule:   color-mix(in srgb, #201f1d 16%, transparent)
--rule-2: color-mix(in srgb, #201f1d 7%, transparent)   (row dividers)
--gold:      #b68235   brand accent — STROKE ONLY (rules, borders, marks, underlines). Never a fill, never body text
--gold-deep: #7d5411   gold at text sizes (links, outlined-button labels)
--gold-soft: #fff3e4   gold tint (hovers)
--indigo: #1a2f73  --indigo-soft: #eaecf6
--teal:   #0a7a6f  --teal-soft:   #e2f2f0
--amber:  #a35a06  --amber-soft:  #fbf0dd
--red:    #a81d1d  --red-soft:    #fbe9e7
--seal:   #8f3030
```

### Dark
```
--paper: #191817  --sheet: #211f1e  --field: #2a2827
--ink: #f0eeea  --ink-2: #aba7a2  --ink-3: #9c9893  (≥5.1:1)
--rule:   color-mix(in srgb, #f0eeea 20%, transparent)
--rule-2: color-mix(in srgb, #f0eeea 11%, transparent)
--gold: #d9a95e  --gold-deep: #f0c98a  --gold-soft: #332616
--indigo: #93a4e6 / #232840 · --teal: #54c9bb / #12302e · --amber: #e0a44a / #33260f · --red: #ef6a6a / #361b1b
--seal: #e07b7b
```
Rules are **alpha mixes of ink**, not fixed greys — that is what keeps hairlines visible in dark. The four dark-mode checks: hairlines visible on OLED, double rule from `--ink` never `--rule`, semantic *urgency* preserved (not hue values), seal most legible element in its row.

### Radius (deliberately rounder than Classical's baked 4px)
```
--radius-sm: 6px    (small chips, table inner)
--radius-md: 10px   (buttons, inputs, cards default)
--radius-badge: 12px (status badges, seal)
--radius-lg: 14px   (plates, modals, hero sheet)
```

### Spacing & elevation (from Classical, unchanged)
```
space: 4.6 / 9.2 / 13.8 / 18.4 / 27.6 / 36.8 px
--shadow-sm: 0 1px 2px  color-mix(in srgb,#2d2b2b 14%,transparent)
--shadow-md: 0 3px 10px color-mix(in srgb,#2d2b2b 16%,transparent)
--shadow-lg: 0 12px 32px color-mix(in srgb,#2d2b2b 22%,transparent)
```
Elevation is a whisper — no heavy drop shadows.

## Wordmark (resolves ASSETS-TODO B1)
- **Lockup:** a 3px gold vertical rule + the name. Latin: Cormorant Garamond 500, `letter-spacing:-0.012em`. Arabic: Amiri 700 「إدورا」. Rule height ≈ 0.68× cap height, baseline-aligned, 9px gap. Reverse: same, name in `--paper` on `--ink`.
- **App mark:** NOT new — reuse the open-book geometry already in `packages/ui/src/lib/edura-mark.ts` (paths `M100 52 L54 84 L54 150 L100 122 Z`, mirrored right page, spine `M100 52 L100 122`), stroked in `--ink` (spine in `--gold`), viewBox 200, stroke 11/8. The gradient tile in `apps/www/public/edura-mark.svg` is EduConnect-era and is retired — regenerate that SVG from the engraved core.

## Components (all specs at the new radii; states in `Edura Redesign.dc.html`)
- **Buttons** (38px h, 18px pad-x, radius 10): Primary = solid `--ink` on `--paper` text (the ONLY solid button; hover `--ink-2`). Secondary = 1px `--gold` border, text `--gold-deep`, hover bg `--gold-soft`. Ghost = transparent, hover shows border. Disabled 45% opacity. Loading keeps label + 11px spinner. Money-confirm variant: 42px, 1.5px `--red` border, label + mono amount, hover `--red-soft`.
- **Inputs** (40px h, radius 10): bg `--field`, 1px `--rule`; focus `outline: 2px solid var(--indigo); outline-offset: 2px` + border `--indigo`. Error: border `--red`, bg `--red-soft`, message 12px `--red`. Code inputs are mono.
- **Badges** (radius 12, mono 11px/600): `PAID` teal-soft/teal · `QUEUED · 2m` amber (always shows age) · `REVOKED` red · `ENROLLED` indigo · `DRAFT` field/ink-2. 12px/600 is below large-text threshold → pairs must hold **4.5:1**.
- **Tables** (compact): header 34px `--field`, mono 10px/600/0.12em uppercase `--ink-3` labels; cells 7px pad-y, dividers `--rule-2`; row hover `--field`; numeric columns end-aligned both directions; totals row `2px double var(--ink)`.
- **Empty/loading/permission:** empty = dashed `--rule` box + action; loading = skeleton bars of `--field`; permission-denied = filled `--field` box that names the permission ("the rows exist").
- **Nav (marketing):** 60px bar on `--sheet`, hairline bottom, wordmark start, links `--ink-2` (15px body face), primary CTA = solid ink button.
- **Plate (imagery):** 13px `--field` mat + 1px `--rule`, radius 14, `--shadow-md`, inner 1px rule; caption row = mono path left / body note right.

## Hero Animation ("the receipt writes itself") — reference: `ledger-hero.js`
Marketing hero object, both locales. GSAP timeline, `repeat: -1, repeatDelay: 1.6`, default ease `power3.out`:
1. Sheet (430px max, radius 14, `--shadow-lg`) rises: `y:26→0, opacity 0→1`, 0.7s
2. Header (marker + "RECEIPT/إيصال" + mono `TRX-2026-0431`) fades in 0.4s; gold hairline draws `scaleX 0→1` 0.55s (transform-origin = start edge; right in RTL)
3. Three rows stagger in (`y:10→0`, 0.45s, −0.12 overlap): One session **300.00** · Platform −10% **−30.00** · Center −25% **−75.00** — each figure counts up from 0 in mono over 0.55s
4. Double rule: two 1px `--ink` lines draw `scaleX 0→1` 0.4s, 0.28s overlap
5. Total row "Teacher **195.00**" counts up 0.8s (19px mono 600)
6. Actor line fades ("signed · S. Mounir · 14:02" / "باسم · سارة منير · ١٤:٠٢" — mono 10.5px)
7. Seal stamps: `opacity 0, rotate -14°, scale 1.35 → rotate -6°, scale 1`, 0.42s `expo.out`
8. Hold 2.2s → sheet fades up and out 0.5s → loop
- Pointer tilt: `rotationY: ±6°, rotationX: ∓4°`, 0.6s `power2.out`, perspective 950px; returns to 0 on leave.
- `prefers-reduced-motion: reduce` → render the FINAL state statically, no timeline, no tilt.
- Pause the timeline when off-viewport (IntersectionObserver).
- The old three.js notebook (`showcase/src/features/home/notebook/`) is retired; delete the scene and its poster pipeline once this lands.

## Landing Page (showcase)
Hero grid: `repeat(auto-fit, minmax(340px,1fr))`, 56px gap, copy column + animation column. Existing copy from `showcase/src/messages/{ar,en}.json` `home.hero` is kept verbatim. Kicker → H1 (clamp 38–66px Latin / 34–58px Arabic) → subtitle → CTA pair (solid-ink + gold-outline) → hairline → three proof figures (mono 19px + 13px labels: "7 append-only tables / 100% row-level isolation / 0 unattributed writes"). Feature row: three hairline-separated columns (kicker + Cormorant/Amiri 23px heading + body), copy from the existing `owners` message keys. No testimonials, no counters, no stock photography (ASSETS-TODO §2 still governs).

## State Management
Design-doc only: a light/dark toggle. In production: theme via `[data-theme]` (initial from `prefers-color-scheme`, explicit choice persisted — the existing mechanism); locale via next-intl as today; hero animation is self-contained.

## Accessibility
WCAG 2.2 AA verified: body text ≥4.5:1 in both themes (hence the corrected `--ink-3` values), badge pairs ≥4.5:1, focus always `2px --indigo` outline at 2px offset, gold used for text only via `--gold-deep`. Reduced motion fully static. RTL verified against worst-case mixed rows (Arabic names + `TRX-` codes + 7-digit amounts).

## Open Questions (deliberately not decided)
1. **Gold vs amber adjacency** (`#b68235` vs `#a35a06`): fine while gold = marketing chrome and amber = in-app status; decide before any marketing page shows a live status badge.
2. **B3**: legal entity + contact line for the footer — still missing from the repo.
3. Whether Amiri holds up for Arabic *body* copy at 13px `compact` density, or Arabic body stays Plex Sans Arabic everywhere below display sizes (current spec: the latter).
4. ERP app screens (superadmin dashboard, roster table) are NOT yet designed in this language — do not reskin them ad hoc; extend from the tokens + table spec here.

## Files in this bundle
- `Edura Redesign.dc.html` — the full design document (direction, specimen, wordmark, tokens, AR+EN landing, components, dark audit). Open in a browser; the top bar toggles themes.
- `ledger-hero.js` — working reference implementation of the hero animation (web component + GSAP).
- Fonts: Google Fonts — Cormorant Garamond, Lora, Amiri, IBM Plex Sans Arabic, IBM Plex Mono.
- Product screenshots referenced during design came from `showcase/public/shots/` (not bundled; already in the repo).
