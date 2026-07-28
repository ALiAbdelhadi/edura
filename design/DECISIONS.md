# DECISIONS — الدفتر / The Ledger

Every decision already settled, so no session re-litigates one. **Append-only**, in the
spirit of the system it documents. Each entry: the decision, the reasoning, the date.

If the answer is here, use it. Do not re-derive it.

---

## D-01 — Re-point the legacy token vocabulary; do not rename it
**2026-07-28.** The Ledger names (`--paper`, `--sheet`, `--ink*`, `--rule*`, `--indigo`,
`--teal`, `--amber`, `--red`) are canonical. The old "Deep Trust" names (`--background`,
`--card`, `--border`, `--primary`, `--muted-foreground`, `--sidebar*`, `--shadow-*`) survive
as **aliases pointing at Ledger values**, in a clearly marked shim block.

*Why:* those names have ~143 call sites across both apps. Renaming would touch files owned
by five parallel sessions simultaneously. Aliasing changes every pixel without changing a
single call site. **New code uses Ledger names only**; each portal deletes its aliases as it
converts, and the shim shrinks to nothing. Exit path is written into the shim comment.

## D-02 — `--radius-xl` is pinned to 12px, not `--radius + 4px`
**2026-07-28.** `--radius` is `0.75rem` (12px), so `rounded-lg` = 12px cards and
`rounded-sm` = 8px controls, per Handoff I §2.4. `--radius-xl` is deliberately pinned to
12px rather than 16px.

*Why:* roughly 40 existing kit call sites are written as `rounded-xl` for cards. Pinning
lands them all on the correct 12px card radius with zero edits. Same principle as D-01.

## D-03 — Corrected contrast values (measured, not assumed)
**2026-07-28.** Three values from Handoff I §2.2 fail WCAG AA at 12px/600 and are corrected:

| Token | Spec | Measured | Corrected | Now |
|---|---|---|---|---|
| `--ink-3` light | `#8b91a1` | 2.91 / 3.15 / 3.02 | **`#6a7183`** | 4.51 / 4.88 / 4.68 |
| `--ink-3` dark | `#7c7e78` | 4.40 / 4.06 / 3.83 | **`#888a84`** | 5.18 / 4.77 / 4.51 |
| `--teal` light | `#0d7d72` | 4.34 on `--teal-soft` | **`#0d7a6f`** | 4.51 |

*Why:* `--ink-3` carries mono captions, pagination ranges and axis labels — data, not
decoration — so the 4.5:1 threshold applies. Corrections preserve hue and saturation and
keep `--ink-3` visibly lighter than `--ink-2`. All other pairs pass; `--amber`/`--amber-soft`
at 4.63 is the tightest, which matters because "waiting" is the state operators scan for.

## D-04 — `<Num>` and `<ProseCount>` are two components, not one with a flag
**2026-07-28.** `<Num>` = the data path (Latin mono digits, tabular, `<bdi dir="ltr">`).
`<ProseCount>` = the prose path (Arabic-Indic digits, body face, not isolated).

*Why merging is unsafe:* they differ along four independent axes — numeral system, font
family, bidi isolation, and whether the value participates in pluralisation — and the choice
is semantic ("datum or prose?"), not stylistic. A `prose` flag makes it possible to render a
currency amount in Arabic-Indic numerals inside a table, breaking column alignment,
copy-paste into a spreadsheet, and the tabular-figures guarantee. The safe default must be
the data path, and a flag that must never be passed on money is better expressed as a
separate import.

## D-05 — The Arabic eyebrow drops face, tracking and transform
**2026-07-28.** Latin eyebrow: IBM Plex Mono, `uppercase`, `letter-spacing: 0.12em`. Arabic
eyebrow: body face, no tracking, no transform — same size, weight and colour.

*Why:* Plex Mono has no Arabic glyphs (the two scripts would render in unrelated
typefaces); Arabic is cursive and `letter-spacing` breaks the joins, producing broken words
rather than a style; Arabic is unicameral so `uppercase` is meaningless. `<Eyebrow>` detects
script automatically because callers pass translated strings and cannot know the script at
the call site.

## D-06 — Font variables live on `<html>`, not `<body>`
**2026-07-28.** next/font variable classes go on the `<html>` element in both apps.

*Why:* the token layer declares `--font-mono: var(--font-plex-mono), …` at `:root`, and a
`var()` chain resolves against the element it is declared on. With the faces scoped to
`<body>`, that chain collapsed to empty and every `.num` silently fell back to the sans
face — mono figures stopped being mono with no error anywhere. Caught by probing computed
styles in the browser; it does not show up in typecheck or build.

## D-07 — Fonts are declared at `:root` *and* re-exported through `@theme inline`
**2026-07-28.** `--font-sans` / `--font-mono` are declared in the `:root` block and
referenced from `@theme inline`.

*Why:* `@theme inline` deliberately does not emit a custom property — it substitutes values
into the utilities it generates. So `font-mono` (the class) worked while
`font-family: var(--font-mono)` (raw CSS, e.g. the `num` utility) resolved to nothing.
Declaring at `:root` gives both forms. This is how every colour token in the file already
works.

## D-08 — Gradients and glows are re-pointed to flat values, not deleted
**2026-07-28.** `gradient-primary`, `gradient-primary-wash`, `shadow-glow` and
`card-interactive` survive as deprecated utilities rendering flat Ledger values.

*Why:* Handoff I §7.2 says delete them, but they have 7 call sites across folders owned by
five different portal sessions. Deleting breaks five branches at once. Re-pointing meets the
visual requirement (no gradient or glow ships) with zero call-site edits. Portal sessions
delete their call sites as they convert; then the utilities come out.

## D-09 — Density per portal
**2026-07-28.**

| Portal | Density | Why |
|---|---|---|
| Superadmin, teacher, assistant, center admin | `compact` | Operators scanning many rows |
| Student, parent | `comfortable` | Read-oriented, lower frequency |
| Center staff (check-in) | `touch` | 48px targets, 16px min type, 12px min gap; nothing actionable at 12px |

`DataTable` defaults to `compact`. `touch` is a prop, never a fork — the counter queue is
the same ceremony with different ergonomics.

## D-10 — Money alignment and column order in RTL
**2026-07-28.** Numeric columns are **end-aligned**, text columns **start-aligned**, in both
directions — `end` in RTL is the left edge and that is correct, because the alignment
follows the reading direction, not the screen. Column *order* mirrors with direction like
any other content; the money column does not get pinned to a physical side.

*Why:* a money column exists to be compared down its length. Alignment to the reading-end
plus tabular figures is what makes that scan work, and both flip together.

## D-11 — Time direction in charts
**2026-07-28.** Chart wrappers render inside `dir="ltr"` while the card around them stays
RTL. Time therefore runs left-to-right even in Arabic.

*Why:* recharts' axis math assumes LTR, and an Arabic reader reads a chart's time axis the
same way as any other reader — charts are diagrams, not prose. The LTR island is one of the
two legitimate exceptions to the logical-properties rule (CONSTITUTION §4.1).

## D-12 — The seal rotates the same way in both directions
**2026-07-28.** The `TRX-` seal is `rotate(-6deg)`, `dir="ltr"`, in RTL and LTR alike.

*Why:* it is a stamp — a physical object pressed onto paper, not a piece of text flow. A
stamp does not mirror when the language changes, for the same reason a shadow does not.

## D-13 — The icon flip rule
**2026-07-28.** An icon flips **if and only if it encodes direction of travel through the
interface.** Flips: chevrons, arrows, back/next, progress, steppers, sort indicators,
sidebar collapse, reply, undo/redo, indent. Does not flip: lock, shield, clock, search,
bell, user, calendar, trash, logo mark, checkmarks, any pictogram of a physical object.

*Why:* stated as a rule rather than a list because every portal session will add icons this
document has never seen. A clock reads clockwise in every language; mirroring it makes a
broken clock.

---

## D-14 — Ownership of the shared feature folders
**2026-07-28.** Five folders under `features/` are consumed by multiple portals. **No portal
session may edit them.** Verified against the import graph, not assumed:

| Folder | Consumers | Owner | Rationale |
|---|---|---|---|
| `features/messaging/**` | all 6 | **Sixth session, after the five land** | 1328 lines, child-safety logic, realtime transport. Too large and too safety-critical to convert mid-flight. |
| `features/notifications/**` | all 6 | **Superadmin session** | 201 lines, low variance; superadmin defines the notification pattern anyway. |
| `features/settings/**` | all 6 | **Sixth session, after the five land** | 479 lines across 3 files, six-way shared. The portal briefs' "post it if you are first" would produce a six-way conflict in one file. |
| `features/attendance/**` | teacher, assistant, student, parent | **Teacher + assistant session** | They hold the largest implementation and own the attendance archetype (D-15). |
| `features/collaboration/**` | teacher, admin | **Teacher + assistant session** | 1021 lines, **zero test coverage** — so surface-only changes, and one session touching it rather than two. Center-staff rebases onto the result. |

*Why this matters:* the portal briefs name only `features/messaging` as shared and guess
that "notifications are similar." `features/settings` is equally shared and was not named
at all, and two archetypes a session is told to *define* live in folders it does not own.
Without this table the failure is silent — four sessions redesign the same chat screen four
different ways and it only surfaces at merge.

---

## D-15 — The cross-portal archetype matrix (**THIS COPY IS THE AUTHORITY**)
**2026-07-28.** The copies in the portal briefs are convenience. Where they differ from this
table, **this table wins** — the brief assignments were made from a description of the
codebase; these were verified against it.

| Archetype | Renders in | Defined by | Verified? |
|---|---|---|---|
| **Balance + transaction history** | student, teacher | **Teacher** | ✅ shared substrate of both wallets |
| **Wallet — pay-in** (top-up, refund) | student only | **Student** | ⚠️ **corrected** — see below |
| **Wallet — pay-out** (payout request, withdraw) | teacher only | **Teacher** | ✅ |
| **Attendance — both modes, offline sync, commit state** | teacher, assistant, student, parent, admin, staff | **Teacher** | ✅ largest impl (494 vs 456 lines) |
| **Gradebook** | teacher, assistant | **Teacher** | ✅ densest surface outside superadmin |
| **Delegation strip** | assistant only | **Teacher + assistant** | ✅ nothing else delegates |
| **Two-step commit on a money action** | all money portals | **Superadmin** (Handoff I §5.3) | ✅ |
| **Portal dashboard** | all 6 | **Superadmin** (اليوم) | ✅ |
| **Decision panel** | superadmin, teacher, admin | **Superadmin** (Handoff I §5.2) | ✅ |
| **Notifications** | all 6 | **Superadmin** | ✅ |
| **Messaging** | all 6 | **Sixth session** (D-14) | ✅ |
| **Profile / settings** | all 6 | **Sixth session** (D-14) | ⚠️ **corrected** — was "post it if you are first" |
| **Center finance** (fees, expenses, reports) | admin only | **Center admin + staff** | ✅ |

### ⚠️ The wallet is TWO archetypes, not one
The briefs treat "wallet + transaction history" as a single archetype owned by teacher,
"also in student, center." Measured against the code, that is wrong in three ways:

1. **There is no center wallet.** No `wallet` route exists under `dashboard/admin` or
   `dashboard/staff`. The center has `admin-fees-screen` (806 lines),
   `admin-expenses-screen` (464) and `center-staff-finance-screen` — a different surface
   with different semantics. "Also in center" should not have been on the wallet row.
2. **Student and teacher wallets are different shapes.** Student's is money-**in**
   (`topUp`, `refund`, balance, history). Teacher's is money-**out** (`payout`, `withdraw`,
   transactions, balance). They share only a balance figure and a transaction list.
3. **The stated reason for teacher ownership is a backend property.** "Ledger-derived
   balance, H1 row lock, H2 conditional decrement plus the DB CHECK" describes the shared
   money engine, not the completeness of the screen. By size the student's is larger
   (264 vs 236 lines).

*Resolution:* split the archetype. Teacher defines the **balance + transaction history**
substrate that both share, and the **pay-out** flow. Student defines **pay-in**. Forcing
student to follow a payout-shaped wallet would impose the wrong shape on the wrong
direction of money.

---

## D-16 — Ant Design is already gone; the remaining artefacts are dead CSS
**2026-07-28.** No `antd` / `@ant-design` / `@refinedev/antd` dependency, no import, and no
`.ant-*` class usage exists anywhere in the repo. The audit's "two design systems coexist"
finding and Handoff I §7.1 ("remove Ant Design from apps/superadmin") were **already
satisfied** before this session.

What remained were `.ant-typography` / `.ant-card-head-title` / `.ant-statistic-*` blocks
and an `.anticon` RTL flip in each app's own `globals.css` — styling components that no
longer render — plus the Plus Jakarta Sans face they depended on and a dead `.display`
class. All removed. Note the audit places these blocks in `packages/ui/src/styles/globals.css`;
they were actually in the two per-app stylesheets.

---

## D-17 — The header's scope and search slots are props, not hardcoded chrome
**2026-07-28.** `DashboardShell` takes optional `scope` and `search`. Neither is filled by
default, and §3.2's financial cycle and command search are **not rendered**.

*Why:* both describe capabilities the system does not have. `periodStart`/`periodEnd` are
per-invoice and per-payout, chosen when a batch is generated — there is no global financial
cycle, no "current cycle", and no closed-ledger flag. No command palette is mounted in
either app, and superadmin has no search endpoint (www's `/api/v1/search/*` are
domain-browse endpoints for students). Rendering either would state a scope the system does
not enforce, or offer a search that searches nothing — the same defect as a nav entry with
no destination. **A portal fills a slot when it has real backing; it never fills one to
avoid an empty space.**

## D-18 — The bottom nav takes hrefs, not a second item list
**2026-07-28.** `DashboardShell` accepts `bottomNavHrefs?: string[]`; the shell resolves
them against `navItems` and renders `BottomNav`.

*Why:* a second hand-maintained list drifts. As a VIEW of `navItems`, the phone nav
inherits the sidebar's labels, icons, translations and unread counts automatically, and a
renamed destination cannot appear two different ways. `BottomNav` also gained `showMore`,
because the component only sees its own list and cannot infer that the caller withheld nine
other destinations — without it, a portal surfacing 4 of 13 rendered no "more" entry and
the rest were reachable only via the sidebar toggle. "More" opens the existing mobile
sidebar sheet rather than a second menu.

Wired for student, parent and staff. Teacher and assistant are desktop-first — their one
phone surface (door check-in) is a task screen, not a browse surface.

## Open items inherited by later sessions

- **O-1 — Handoff II is missing.** `PROMPT-www-ledger-rollout.md` does not exist. CONSTITUTION
  §1–§4 and §6 are reconstructed; see the provenance note there.
- **O-2 — `DESIGN.md` does not exist at the repo root.** Both the foundation brief and every
  portal brief instruct that it be rewritten from the Ledger spec and treated as stale. There
  is nothing to rewrite. If a copy appears, it is stale by definition.
- **O-3 — CSP is still Report-Only.** Flipping to enforce needs a nonce-based `script-src`;
  tracked in the security backlog, not here.
