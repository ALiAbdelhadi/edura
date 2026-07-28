# Design system — الدفتر / The Ledger

> **2026-07-27 — the EduConnect / "Deep Trust" design system is SUPERSEDED.**
> If you are holding an older copy of this file, an older Stitch export, or any document
> using Material 3 token names (`surface-container-*`, `on-surface-variant`), the palette
> `#1E3A8A` / `#0D9488`, tonal background shifts instead of hairline rules, soft ambient
> shadows, gradient chart fills, or pill badges — **it does not describe this product.**
> None of those devices survive in the Ledger system. Discard it and read this instead.

The authoritative specification is **[`design/CONSTITUTION.md`](design/CONSTITUTION.md)**.
This file exists so that anyone who opens the repo root — or any tool that reads
`DESIGN.md` by convention, such as the Stitch MCP — lands on the current system rather than
the retired one. It is a pointer and a summary, **not a second source of truth.** Where the
two differ, `design/CONSTITUTION.md` wins.

## The three documents

| File | What it is |
|---|---|
| [`design/CONSTITUTION.md`](design/CONSTITUTION.md) | The system. Read before writing any UI. |
| [`design/DECISIONS.md`](design/DECISIONS.md) | Settled questions — do not re-litigate. Append-only. |
| [`design/REQUESTS.md`](design/REQUESTS.md) | How to ask for something you do not own. |

## The idea, in one line

**The interface's form is derived from what the system actually guarantees.**

The database is append-only — `transactions` and `points_ledger` carry `REVOKE
UPDATE/DELETE`, money is integer piasters, receipts are sequenced, every write is
attributed. *Therefore* the interface must not look editable, must show the whole
computation before the commit, must make the moment of permanence felt, and must name the
actor.

Paper, monospace, hairline rules, double-rule totals, the seal and the two-step commit are
**consequences of that**, not the system itself. Each becomes a lie wherever its reason does
not hold — which is why `CONSTITUTION.md §2` teaches a derivation method rather than a
catalogue of components.

## The vocabulary, so a stale document is recognisable on sight

| | Ledger (current) | EduConnect (superseded) |
|---|---|---|
| Surfaces | `--paper` · `--sheet` · `--field` | `surface-container-*` |
| Text | `--ink` · `--ink-2` · `--ink-3` | `on-surface-variant` |
| Separation | 1px hairline `--rule` | tonal background shifts |
| Elevation | two levels, `--lift` / `--lift-2` | soft ambient shadows |
| Colour | **four** — `--indigo` brand · `--teal` money/confirmed · `--amber` waiting · `--red` irreversible | `#1E3A8A` / `#0D9488` + a 7-hue chart palette |
| Figures | IBM Plex Mono, tabular, via `<Num>` | no monospace at all |
| Badges | square-ish, 5px radius | pills |
| Charts | series from the token layer, flat fills | gradient fills |
| Motion | **one** animation in the product — the seal | transitions throughout |

Corrected contrast values (the original handoff's fail WCAG AA — do not "restore" them):
`--ink-3` = `#707686` light / `#888a84` dark · `--teal` = `#0a7a6f` light. Badge pairs are
held to 4.5:1 because 12/600 sits below the large-text threshold. See `CONSTITUTION.md §6.6`.

## Arabic is the primary language

Not a translation target. The eyebrow, the numeral paths and the bidi rules are all
specified in `CONSTITUTION.md §6`, and they are the part most often got wrong:

- The eyebrow's **marker rule** is the shared invariant; case, tracking and mono are
  Latin-only, because Arabic has no case, breaks on letter-spacing, and has no Plex Mono
  glyphs.
- `<Num>` (data — Latin, mono, tabular, isolated) and `<ProseCount>` (prose — Arabic-Indic,
  body face, dual agreement) are **two components**, never one with a flag.
- Separators are rendered by the component, never typed into copy — `·`, `-`, `:` and `()`
  are bidi-neutral and migrate to the wrong side of a Latin code inside an RTL run.

## For Stitch and other design tools

Generate against the tokens in `packages/ui/src/styles/globals.css` layer 1 (the ledger
palette). Layer 2 is a documented **migration shim** of legacy aliases that is being deleted
portal by portal — never generate new work against a layer-2 name. Anything a design
proposes that requires a fifth colour, a second font, or a second animation means the
derivation is wrong; go back to the guarantee.
