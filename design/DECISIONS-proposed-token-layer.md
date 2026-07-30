# PROPOSED — Ledger token layer (Step 1), as landed

**Status:** proposal, awaiting merge into `design/DECISIONS.md`
**Built by:** Parent portal session, at the operator's direction
**Date:** 2026-07-28

Step 1 was recorded as complete in two briefs and two memory entries. It was not in the
repository — `packages/ui/src/styles/globals.css` still carried the EduConnect / "Deep Trust"
palette, and there was no `--paper`, no mono face, no `<Num>`, on **any** of the six branches.
This is that layer, built from `00 - PROMPT for Claude Code.md` §2 and the token blocks in
`01 - TARGET DESIGN.dc.html`.

---

## 1. Two spec values were corrected — they failed contrast as written

Badge pairs carry meaning at 12/600, which is below the large-text threshold, so they need
**4.5:1**, not 3:1. Three of the spec's published values did not reach it. Corrections are the
minimum lightness nudge that clears the bar, preserving hue and saturation.

| Token | Spec value | Landed | Why |
|---|---|---|---|
| `--ink-3` light | `#8b91a1` | **`#6a7183`** | 2.91:1 on `--paper` — failed even the 3:1 large-text bar. Carries mono captions at 10–11px. |
| `--ink-3` dark | `#7c7e78` | **`#888a84`** | 3.83:1 on `--field`. |
| `--teal` light | `#0d7d72` | **`#0d7a6f`** | 4.34:1 on `--teal-soft`. `--seal` tracks it. |

**Verified matrix — 28 pairs, both themes, all ≥4.5:1:**

| Pair | Light | Dark |
|---|---|---|
| `--amber` on `--amber-soft` | 4.63 | 6.72 |
| `--teal` on `--teal-soft` | 4.51 | 7.02 |
| `--red` on `--red-soft` | 6.27 | 5.22 |
| `--indigo` on `--indigo-soft` | 10.50 | 6.00 |
| `--ink` on paper / sheet / field | 14.70 / 15.90 / 15.23 | 14.98 / 13.81 / 13.05 |
| `--ink-2` on paper / sheet / field | 5.65 / 6.11 / 5.85 | 7.19 / 6.62 / 6.26 |
| `--ink-3` on paper / sheet / field | 4.51 / 4.88 / 4.68 | 5.18 / 4.77 / 4.51 |
| `--indigo-ink` on `--indigo` | 12.37 | 7.54 |

**Known cost, flagged not hidden:** darkening light `--ink-3` to 4.51 puts it near `--ink-2`
(5.65) on `--paper`. The three-step ink hierarchy is compressed in light theme. Accessibility
won over hierarchy because `--ink-3` carries real content (mono captions, meta, placeholders),
not decoration. If foundation wants the separation back, the honest fix is to **lighten
`--ink-2`**, not to re-fail `--ink-3`.

---

## 2. Re-point, don't rename — and the exit path

Ledger tokens are the real declarations. Every legacy "Deep Trust" name is an **alias onto
one of them**, in a single block marked as a migration shim, with the full mapping in a
comment. One value, two names, for as long as the migration lasts.

- `--background`→`--paper` · `--foreground`→`--ink` · `--card`/`--popover`→`--sheet`
- `--primary`→`--indigo` · `--secondary`/`--accent`→`--indigo-soft` · `--muted`→`--field`
- `--border`/`--input`→`--rule` · `--destructive`→`--red` · `--success`→`--teal` ·
  `--warning`→`--amber`
- `--shadow-xs|sm`→`--lift` · `--shadow-md|lg`→`--lift-2`
- `--sidebar*`→ sheet / ink / rule / indigo

**Exit path:** new code uses ledger names only. Each portal drops its aliases as it converts;
the shim shrinks to nothing and is deleted. **Nothing new may be added to the shim block.**

### What was deleted as a *system*, while its names survive

The separate near-black sidebar scale, the gradient system and the glow are gone. But
`--primary-glow`, `.gradient-primary`, `.shadow-glow` and `.card-interactive` still have call
sites, so the **names** remain, emptied of the effect: the gradient utility paints flat
`--indigo`, the glow paints `--lift`, the hover-lift becomes a 120ms `--rule-2` background.
Deleting the names outright would have broken ~10 files across portals nobody has converted
yet. Compiled-CSS check confirms **zero `linear-gradient(` remain in the output**.

---

## 3. Radius — explicit, not derived

The shadcn calc chain (`r-4 / r-2 / r / r+4`) cannot produce "cards 12px **and** buttons 8px"
from one root value. The scale is therefore set explicitly, chosen so existing class usage
lands on the spec without touching a single component:

`--radius-sm` 6px (chips) · `--radius-md` **8px** (Button, Input — both `rounded-md`) ·
`--radius-lg` 10px · `--radius-xl` **12px** (Card — `rounded-xl`, was 18px).

**Open, for foundation:** `badge.tsx` hardcodes `rounded-full`. The spec calls for 8px badges
and explicitly rejects "50px pill badges". That is a component edit, not a token edit, so it
was left alone — it belongs to the `StatusBadge` promotion in Part C.

---

## 4. Typography

IBM Plex Mono is wired in **both** apps (`--font-plex-mono`) and exposed as `--font-mono`.
Plus Jakarta Sans is retired: removed from both layouts, and `.display` re-pointed to
`inherit` in both app stylesheets rather than deleted, because it still has three call sites
in `components/kit/auth-shell.tsx`.

Utilities added at the CSS layer:

- **`.num`** — `--font-mono` + `tabular-nums` + `tnum/lnum`. §2.3 sanctions either this or a
  `<Num>` component; the utility is the CSS half and does not pre-empt the component.
- **`.eyebrow`** — mono, 10px/600, `0.12em`. **Deliberately no `text-transform: uppercase`.**
  Arabic has no case, and a CSS utility cannot tell which script it is being applied to. The
  uppercase belongs on the Latin path inside `<Eyebrow>`, which knows.
- **`.rule-total`** — `border-top: 2px double var(--ink)`, the accountant's rule for every
  «الإجمالي» / net line.
- **`.row-selected`** — `inset 3px 0 0` + `--indigo-soft`. A logical inset shadow, so it
  survives RTL without a mirrored rule.

---

## 5. Motion — one animation

`seal-in` only: 420ms `cubic-bezier(.16,1,.3,1)`, `rotate(-14deg) scale(1.3)` →
`rotate(-6deg) scale(1)`. Under `prefers-reduced-motion` the seal **still renders, without
animating** — it carries state, not delight, so suppressing the animation must not suppress
the mark.

---

## 6. Chart series — an in-system default, foundation to ratify

`--series-1..5` derived from ledger hues; `--chart-1..5` alias onto them so the existing
recharts wrappers keep working. **`--red` is deliberately excluded**: it means irreversible or
blocking, and spending it on a decorative series would cost the meaning. Series 5 is a tint of
indigo rather than a new hue.

Light: `#1a2f73` `#0d7a6f` `#a35a06` `#5b6273` `#4a5da3`
Dark: `#93a4e6` `#54c9bb` `#e0a44a` `#a3a49c` `#6478c4`

The ~16 hardcoded hexes in `lib/analytics/transforms.ts`, grades, admin-reports and
parent-progress are **not yet re-pointed** — that is foundation Part A item 3, and doing it
from a portal session would touch four portals' files.

---

## 7. Verification

- `bun run build` — **2/2 apps green**.
- `bun run check-types` — **6/6 green**.
- Compiled CSS carries `--paper`, `--sheet`, `--ink-3`, `--rule`, `--indigo`, `--teal`,
  `--seal`, `--lift`, `--series-1`, `--font-plex-mono`, `seal-in`; **zero `linear-gradient(`**.
- Contrast matrix above, computed from the shipped file, 28 pairs, no failures.
- Zero dangling `--font-plus-jakarta-sans` or `.ant-*` references remain.

**Not verified: anything visual.** There is no `.env` anywhere in this repo, so the dev server
and database cannot start. Every claim above is static analysis and build output. Someone with
a working environment must still look at the two hi-fi screens side by side with the app.

Ant Design was confirmed **fully absent** (not a dependency, zero imports), so its override
blocks in both app stylesheets were dead code and were removed.
