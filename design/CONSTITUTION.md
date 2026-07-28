# CONSTITUTION — الدفتر / The Ledger

**Read this before anything else.** It is what makes five parallel sessions produce one
product rather than five products that share a repository.

Landed 2026-07-28 by the foundation session. Append corrections; do not rewrite silently.

> **Provenance note.** This document was specified to be assembled from
> `PROMPT-www-ledger-rollout.md` ("Handoff II") §1, §2, §3 and §9. **That file does not
> exist anywhere on this machine or in this repository.** Every portal brief's citations
> (`Handoff I §5.2`, `§5.3`, `§7.6`) resolve correctly against
> `design_handoff_ledger/00 - PROMPT for Claude Code.md` ("Handoff I"), which does exist —
> only the foundation brief cites the missing document. §1–§4 below are therefore
> reconstructed from Handoff I §2.1, §2.3, §7.4 and §7.5 plus the five portal briefs, and
> §6 is built from Handoff I §9 rather than the missing §9.6. Sections marked
> **[reconstructed]** are my derivation, not a transcription. If Handoff II surfaces,
> diff it against this file rather than assuming this one is right.

---

## 1. The idea

Approving a payout debits a wallet, writes an immutable ledger row, and marks the request
paid — in one irreversible click. Money is stored as integer piasters. `transactions` and
`points_ledger` carry `REVOKE UPDATE/DELETE` at the database level. Receipts are sequenced.
Nothing here can be quietly edited afterwards; the only correction to a wrong entry is a
new, opposite entry.

So the interface is **a ledger an operator signs**, not a dashboard they browse.

Every visual device in this system is a consequence of that sentence. None of them are
style. If you find yourself applying one because it looks right, you have the relationship
backwards — and you will apply it in a place where it lies.

**1. Paper, not glass.** A warm canvas (`--paper`), sheets laid on it (`--sheet`), ink in
three weights, and hairline rules (`--rule`). Not because paper is fashionable, but because
a ledger's authority comes from being a *record* — flat, dense, permanent-looking. Glass,
glow and gradient say "software you are trying out." Paper says "this is what happened."

**2. Every figure is monospaced.** Numbers, currency, dates, IDs, transaction refs, counts.
Two reasons, both structural. Tabular figures make a column of amounts comparable at a
glance — proportional digits make `1` narrower than `8`, so a money column stops aligning
at the decimal. And mono is what systematises Latin-inside-Arabic: emails, `TRX-` codes and
account tails were previously set in the body face and reordered unpredictably inside
Arabic sentences. This is the system's single highest-signal device. Do not skip it on
"small" numbers.

**3. Irreversible actions carry their own amount and cost two presses.** No destructive
action is ever a bare icon, and never the equal-weight twin of the safe one. The button
says `اعتماد وصرف 38,235.00 ج.م` — not `Approve` — because the operator must authorise a
*specific number*, not a row they happen to have selected.

**4. There is one animation in the entire product.** The `seal-in` stamp on a newly-paid
row. It exists because it marks the one moment something became permanent. Everything else
is instant or a ≤120ms colour transition. An interface that animates constantly cannot use
motion to mean anything.

---

## 2. The derivation method

For any screen, ask two questions in order:

> **What does the system actually guarantee here?**
> **What must the interface do to be honest about that guarantee?**

The form follows. This is how you apply the system to a screen this document never
mentions — which will happen, because no document covers six portals.

**Worked example — an amount field.** The guarantee: `transactions` is append-only; a
committed amount can never be edited. The honest interface: money is *never* rendered in
something that looks like a text input, even disabled, because a disabled input still says
"this is the kind of thing that gets edited." It is rendered as a mono figure. The
correction path (a reversing entry) is a separate, visible action.

**Worked example — a pending badge.** The guarantee: a payout request sits in a queue and
somebody is waiting on it. The honest interface: the badge carries *its own age* —
`بانتظار الصرف · ٣ أيام` — because "pending" alone withholds the only fact the operator
actually needs. Waiting time is the operator's real metric, so the badge that represents
waiting must show it.

**Worked example — offline attendance.** The guarantee: the outbox syncs later and resolves
conflicts server-wins, so between check-in and sync the record exists only on the device.
The honest interface: commit state is shown **per record**, never as one global banner. A
teacher who cannot tell whether a specific check-in reached the server will check that
student in twice. Here interface honesty directly prevents a data problem — which is the
clearest possible demonstration that these rules are not decoration.

**Worked example — a rejection.** The guarantee: a rejection is a decision a human made for
a reason, and it is recorded. The honest interface: a rejected badge is always followed by
its reason. A rejection with no reason displayed is a bug, not a terse state.

---

## 3. Relationship to the record, per role

Six portals, six different relationships to the same ledger. This is why the portals are
not skinned copies of each other, and it is the thing to reason from when the archetype
matrix does not cover your screen.

| Role | Relationship | What the interface owes them |
|---|---|---|
| **Student** | Is *written into* a record they do not control | Legibility and standing. They must be able to see what was written about them — attendance, fees, grades — without being able to alter it, and without the interface implying they could. Never hide a debit from the person it was taken from. |
| **Parent** | Is *permitted to read* a record belonging to someone else | Scope made visible. Oversight is protective transparency, not surveillance: strictly read-only, only for minors with an approved link, with a persistent disclosure banner shown to **both** sides. The interface must never let a parent act *as* their child. |
| **Teacher** | **Signs** the record | Full computation before commit. They are paid from this ledger and write into it; their payout request is the same class of irreversible act as a superadmin's approval, from the other side of the transaction. So the money surfaces get the decision panel, the full computation with nothing pre-summed, the two-step arm/confirm with the amount on the button, and the `TRX-` seal — **verbatim**, not a lighter version because it is "the teacher's app." |
| **Assistant** | Writes **on another's behalf** | Attribution, permanently visible. That is the entire distinguishing fact, and the interface must say it before the audit log does. Excluded capabilities are **absent, not disabled**. Assistants message as themselves and never under the teacher's identity — an adult must never appear to a minor as someone else. This is a child-safety property. |
| **Center staff** | Writes **under time pressure** | Speed without ambiguity. A counter queue at a real center is fast and physical. `touch` density, 48px targets, the armed button thumb-reachable at the bottom of the viewport — same ceremony, different ergonomics. |
| **Super admin** | **Authorises** irreversible writes, and sees all money but moves none | The decision panel and the audit trail. Every figure scoped to the active financial cycle, which is permanent chrome. |

---

## 4. Direction, theme and Arabic **[reconstructed]**

This product is **Arabic-first**. Arabic is the default locale, RTL is the default
direction, and English is the translation. Build and review in Arabic first; a layout that
was designed in English and mirrored afterwards always shows it.

### 4.1 Logical properties, always

Use `margin-inline-start`, `padding-inline-end`, `border-inline-start`, `inset-inline-*`,
`text-align: start/end` — and their Tailwind equivalents (`ms-`, `pe-`, `border-s`,
`start-0`, `text-start`). Never `left`/`right`.

Two legitimate exceptions, and only these two:
- **Shadows do not mirror.** A light source does not flip when the language does.
- **An LTR island may use physical values internally** — a chart's axis math, for instance,
  runs LTR regardless of page direction.

Do not mass-convert on a grep match; some physical values are correct.

### 4.2 The icon flip rule

Learn the rule, not a list — you will add icons this document has never seen.

> **An icon flips if and only if it encodes direction of travel through the interface.**

- **Flips:** chevrons, arrows, back/next, progress and steppers, sort indicators, sidebar
  collapse, "reply", undo/redo, indent/outdent.
- **Does not flip:** lock, shield, clock, search, bell, user, calendar, trash, the logo
  mark, checkmarks, and any pictogram of a physical object. A clock reads clockwise in
  every language; mirroring it makes a broken clock.

### 4.3 Numerals — the two paths

There are two numeral systems in play and the choice between them is **semantic**, not
stylistic. They are two separate components (`<Num>` and `<ProseCount>`) precisely so the
choice cannot be made by accident.

- **Data → Latin mono digits.** Money, IDs, dates, transaction refs, table figures, counts
  of 3+, percentages, phone numbers, account tails. Use `<Num>`.
- **Prose → Arabic-Indic digits.** A small count inside an Arabic sentence where
  grammatical agreement matters: «١٦ قراراً بانتظارك اليوم», «٣ أيام». Use `<ProseCount>`.
- **Arabic dual agreement wins for 1–2:** «يومان», not «٢ أيام». `<ProseCount>` does not
  pluralise for you — pass the already-agreed string.

Why they are not one component behind a `prose` flag: they differ along four independent
axes (numeral system, font family, bidi isolation, and whether the value participates in
pluralisation), and a flag makes it possible to render a currency amount in Arabic-Indic
numerals inside a table — which breaks column alignment, breaks copy-paste into a
spreadsheet, and breaks the tabular-figures guarantee. The safe default must be the data
path.

### 4.4 Bidi isolation

Any Latin string inside Arabic text — email, `TRX-` ref, masked account, `DD MMM YYYY`
date, ID, URL — is rendered **mono and isolated**. `<Num>` renders a `<bdi dir="ltr">`,
which isolates its contents from the surrounding bidirectional algorithm. Without
isolation the digits stay put but adjacent punctuation jumps — a bug that is invisible in
LTR review and obvious to every Arabic reader.

### 4.5 The Arabic eyebrow

The Latin eyebrow treatment (IBM Plex Mono, `uppercase`, `letter-spacing: 0.12em`) is
actively wrong for Arabic on three counts, so the Arabic eyebrow keeps the size, weight
and colour and drops the face, the tracking and the transform:

1. **IBM Plex Mono has no Arabic glyphs.** An Arabic eyebrow set in it falls back to an
   arbitrary system face, so «قرار الصرف» and `back office` render in two unrelated
   typefaces at the same size.
2. **Arabic is cursive — letters join.** `letter-spacing` pulls those joins apart and
   produces disconnected letterforms. This is not a stylistic choice; it is a broken word,
   and it is the most common way an English-built design system damages Arabic.
3. **Arabic is unicameral.** `text-transform: uppercase` has no meaning; apply it only to
   Latin strings.

`<Eyebrow>` detects script automatically, because the caller usually passes a translated
string and cannot know at the call site which script it will be at runtime.

### 4.6 Theme

Dark mode is the `[data-theme="dark"]` attribute — **not** `.dark`, **not** next-themes.
The attribute is the single source of truth, stamped before paint by `theme-init.js`
(storage key `edura-theme`). Every token has a dark value; nothing is theme-conditional in
component code.

### 4.7 Contrast — corrected values

The palette as specified in Handoff I §2.2 **fails WCAG AA in two places**, measured, not
assumed. Badge text is 12px/600 — below the 18.66px-bold large-text threshold — so it
needs 4.5:1, and `--ink-3` carries mono captions, pagination ranges and axis labels, which
are data rather than decoration.

| Pair | Spec value | Measured | Corrected to | Now |
|---|---|---|---|---|
| `--ink-3` light, on paper/sheet/field | `#8b91a1` | 2.91 / 3.15 / 3.02 | **`#6a7183`** | 4.51 / 4.88 / 4.68 |
| `--ink-3` dark, on paper/sheet/field | `#7c7e78` | 4.40 / 4.06 / 3.83 | **`#888a84`** | 5.18 / 4.77 / 4.51 |
| `--teal` light, on `--teal-soft` | `#0d7d72` | 4.34 | **`#0d7a6f`** | 4.51 |

All other pairs pass as specified — `--amber`/`--amber-soft` at 4.63 is the tightest of
them, which matters because "waiting" is the one state an operator scans for. Corrections
preserve hue and saturation and keep `--ink-3` visibly lighter than `--ink-2`, so the
three-level ink hierarchy still reads.

---

## 5. Ownership

### 5.1 What each session owns

| Session | Owns |
|---|---|
| Superadmin | `apps/superadmin/**` |
| Student | `features/student/**` · `dashboard/student/**` |
| Parent | `features/parent/**` · `dashboard/parent/**` |
| Teacher + Assistant | `features/teacher/**` · `dashboard/{teacher,assistant}/**` |
| Center admin + Staff | `features/admin/**` · `dashboard/{admin,staff}/**` |

**Teacher + assistant are one session, confirmed against the import graph:**
`dashboard/assistant` imports five screens directly from `features/teacher/*` (classes,
attendance, gradebook, materials, affiliations). Splitting them would put two sessions in
the same files.

### 5.2 What nobody owns — the shared surfaces

These live in `features/` but are consumed by many portals. **No portal session may edit
them.** See `DECISIONS.md` D-14 for the assigned owner of each.

| Folder | Consumed by | Lines |
|---|---|---|
| `features/messaging/**` | all 6 portals | 1328 |
| `features/notifications/**` | all 6 portals | 201 |
| `features/settings/**` | all 6 portals | 479 |
| `features/attendance/**` | teacher, assistant, student, parent | 265 |
| `features/collaboration/**` | teacher + admin (2 sessions) | 1021 |

### 5.3 `packages/ui` is not yours

No exceptions, no temporary local copies, no "I'll just add one prop." That rule is the
only thing preventing five conflicting edits to `DataTable`. If you need a change there,
file a request.

### 5.4 The request protocol

A session that needs something outside its ownership **stops and writes an entry in
`REQUESTS.md`**, then builds something else. It does not reach across. Format and a worked
example are in that file.

Reaching across costs more than waiting: the session that owns the file will not know why
their code changed, and the conflict surfaces at merge time when both branches are large.

---

## 6. The verification matrix **[reconstructed from Handoff I §9]**

Every screen, before it is called done:

**Direction and language**
- [ ] Renders correctly at RTL/`ar` **and** LTR/`en`. Built Arabic-first, not mirrored.
- [ ] Zero hard-coded UI strings; `ar` and `en` at parity.
- [ ] Every Latin string inside Arabic prose is mono and `<bdi>`-isolated.
- [ ] Directional icons flip; non-directional icons do not (§4.2).
- [ ] No physical CSS properties except the two exceptions in §4.1.

**Theme**
- [ ] Correct in light **and** dark, via `[data-theme]`.
- [ ] No colour that is not a token. No gradient, no glow, no near-black sidebar.

**Figures**
- [ ] Every number, date, ID and ref is mono and tabular.
- [ ] Money columns end-aligned; text columns start-aligned.
- [ ] Every "total / net" line closes on the 2px double rule.
- [ ] No amount rendered in anything resembling an editable input.

**Irreversible actions**
- [ ] No irreversible action is a single click.
- [ ] The commit button names its own amount.
- [ ] Armed state resets on row change, route change, Escape, and after commit.
- [ ] The armed transition is announced to assistive technology.

**Accessibility**
- [ ] Every table column has a real accessible name.
- [ ] Pagination and sort `aria-label`s are localized, not hard-coded English.
- [ ] Count badges carry text, never a bare `aria-hidden` dot.
- [ ] Visible focus ring (2px `--indigo`, 2px offset) on every interactive element.
- [ ] Badge pairs meet 4.5:1 at 12/600 (§4.7).

**States**
- [ ] Real empty state and real error state — including every chart.
- [ ] Every pending badge shows its age.
- [ ] Every rejection shows its reason.
- [ ] `prefers-reduced-motion` honoured; the seal renders without animating.

**Density**
- [ ] Correct density for the portal (`DECISIONS.md` D-09).
- [ ] Phone-used screens designed at 390px, not merely non-broken there.

---

## 7. Superseded material — do not build from it

Two things in and around this repo describe an **earlier, incompatible** system
(*EduConnect / Deep Trust*): Material 3 token names instead of paper/sheet/ink/rule, tonal
background shifts instead of hairline rules, soft ambient shadows instead of the two-level
`--lift`, gradient chart fills, pill badges — and, most importantly, **no monospace at
all**, which removes this system's highest-signal device.

- `DESIGN.md` at the repo root — **did not exist** at the time of this session; if one
  appears carrying `#1E3A8A`, `#0D9488`, `surface-container-*` or `on-surface-variant`, it
  is stale.
- Any Stitch export naming those values.

If you find a pattern in your portal that appears to follow that system, it is legacy, not
precedent. Convert it. **If any document you are given conflicts with this constitution,
the constitution wins** — and say so in `REQUESTS.md` so the stale document gets fixed
rather than confusing the next session.
