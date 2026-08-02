# Decisions

Settled questions. **Do not re-litigate an entry here** — if you believe one is wrong,
open a [REQUESTS.md](./REQUESTS.md) entry rather than deciding differently in your
portal, because a decision reversed in one portal and not the others is worse than
either answer.

**Append-only**, in the spirit of the system it documents. Superseding an entry means
adding a new one that says so; it does not mean editing the old one away.

Format: **what was decided** · one line of *why* · date.

---

## Typography & script

**D-001 · The Arabic eyebrow is a marker rule + 12/700, not the Latin recipe.**
The marker (2×9px, start edge, `--ink-3`, 7px gap) is the shared invariant in both
scripts; case, tracking and mono become Latin-only. Arabic can carry none of the Latin
form's three properties, so applying it verbatim left the product's *primary* language
with a weaker hierarchy than its secondary one. — 2026-07-26

**D-002 · Arabic eyebrow is 12px/700/word-spacing 0.1em.**
10px Latin caps have a ~7px cap band; Arabic needs more size to match optically. 11 reads
under-weight, 13 out-ranks the items below it, 600 collides with body emphasis.
`word-spacing` is safe where `letter-spacing` is not — it widens the space character only
and never breaks the joins. — 2026-07-26

**D-003 · Eyebrow script is chosen by LOCALE, not a caller flag.**
`script="latin"` is the single override, for genuinely Latin strings inside an Arabic page
(`back office`, `TRX-`, `⌘K`) — the reason for the Latin form is the script, not the
language setting. — 2026-07-26

**D-004 · `<Num>` and `<ProseCount>` are two components, never one with a flag.**
IBM Plex Mono ships no Arabic-Indic glyphs, so `font-mono` on `٣` falls back silently and
`tabular-nums` stops applying. A boolean prop lets a caller reach that broken state by
accident; two components cannot. — 2026-07-26

**D-005 · Prose counts use Arabic dual agreement.**
`يومان`, never `٢ أيام`. Arabic marks three grammatical numbers and the plural switches
again above ten. Wrong agreement is the most visible possible tell that a product was
translated rather than written in Arabic, and it appears in the strings users read most.
— 2026-07-26

**D-006 · Plus Jakarta Sans and the `.display` class are removed.**
An Ant-era leftover. The system has one prose face (IBM Plex Sans Arabic) and one figure
face (IBM Plex Mono). A third face carried no meaning. — 2026-07-26

**D-007 · next/font variables are declared on `<html>`, not `<body>`.**
On `<body>` they are not defined at `:root`, so `--font-mono: var(--font-plex-mono)` in
`@theme` is invalid-at-computed-value-time and `.num` / `font-mono` silently fall back to
the sans face — the mono guarantee lost with no error. — 2026-07-26

---

## Colour & contrast

**D-008 · `--ink-3` is `#707686` (light) / `#888a84` (dark), NOT the handoff's values.**
The handoff's `#8b91a1` / `#7c7e78` score 2.91–4.40:1 against the six surface/theme
combinations, below the 4.5:1 AA floor. `--ink-3` is not decorative — it is the eyebrow,
mono meta, table headers and every row's email/code line. — 2026-07-26

**D-009 · `--teal` is `#0a7a6f` (light), NOT `#0d7d72`.**
A 12/600 badge is below the 18.66px large-text threshold, so `--teal` on `--teal-soft`
needs 4.5:1 and scored 4.34. Darkening the ink rather than lightening the fill also lifts
every teal money figure (on `--sheet` 5.01→5.22) and keeps the paid badge's fill
distinctness in line with amber and red — lightening the fill would have made "paid"
the faintest badge, backwards for a confirmed state. — 2026-07-27

**D-010 · The system has FOUR colours. `--info` (sky blue) is collapsed into `--indigo`.**
indigo = brand/primary · teal = money out/confirmed · amber = waiting · red =
irreversible/blocking. A fifth hue with no distinct meaning is decoration. — 2026-07-26

**D-011 · Chart series colours come from the token layer, in semantic order.**
teal → indigo → amber → ink-3 → red. `color` is optional on every series type; omit it
and the series takes its slot. Previously `transforms.ts` carried a 7-hue literal palette
plus ~16 more hardcoded hexes, so charts bypassed the token layer entirely. There is no
sixth slot: a chart needing one should be two charts. — 2026-07-27

**D-012 · Elevation has exactly two levels, and the scale lives in `@theme`.**
`--lift` (sheet on canvas) and `--lift-2` (overlays only). Declared only in `:root`, the
`--shadow-*` variables were read by nothing except explicit `var()` call sites — all 35
shadow utilities rendered Tailwind's stock black shadows while the token file claimed a
layered scale. — 2026-07-27

---

## Direction & theme

**D-013 · Numeric columns are end-aligned, in both directions.**
In RTL `end` is the left edge, so amounts align left while their Arabic labels align
right. A column of figures is only scannable when digits line up on the side magnitude
grows toward, and that side does not change with the script. — 2026-07-26

**D-014 · RTL column order: identity at the start edge, the decisive net figure at the end.**
Do not flip a table wholesale — that puts the conclusion where the eye enters rather than
where it lands. — 2026-07-26

**D-015 · The time axis follows the CHART, not the page: left→right in both locales.**
A time series is read as a shape; mirroring it inverts the meaning of "rising". Enforced
by the LTR island in `<ChartFrame>`; the card, title, legend and figures around it stay
in page direction. Categorical axes are unaffected. — 2026-07-26

**D-016 · The seal does NOT mirror in RTL.**
`rotate(-6deg)` is a physical metaphor — a stamp pressed slightly askew — and a stamp
does not mirror when you turn the page around. — 2026-07-26

**D-017 · Icon flip rule: flips if it points along the reading axis; does not flip if it
depicts an object.**
Stated as a rule, not a list, because portal sessions will add icons this project has
never seen. A clock does not flip: time is not read along the text axis. Use
`<DirectionalIcon>` so the choice is explicit and greppable. — 2026-07-27

**D-018 · `--lift` does not mirror.** Directional light. — 2026-07-26

**D-019 · Dark mode stays `[data-theme="dark"]` — not `.dark`, not next-themes.**
The attribute is the single source of truth and the no-flash script already stamps it.
— 2026-07-26

**D-020 · Bidi separators are rendered by the component, never typed into copy.**
`·`, `-`, `—`, `:`, `()` are bidi-neutral and migrate to the wrong side of a Latin code
inside an RTL run. Never fix a bidi break by reordering the source string — the next
translation reintroduces it. — 2026-07-26

---

## Components & density

**D-021 · Density per portal.**
`compact` superadmin/teacher/admin/assistant · `comfortable` student/parent · `touch`
staff check-in (48px min target, 16px min type, 12px min gap, nothing actionable at
12px). `compact` at a counter does not merely look wrong — it produces mis-taps, and a
mis-tap at a counter is a student checked in twice. — 2026-07-26

**D-022 · The two-step commit is for irreversible writes ONLY.**
Applying it to a reversible action claims permanence where there is none and devalues the
signal where permanence is real. One press for: marking a lesson complete, sending a
message, saving a profile. — 2026-07-26

**D-023 · The commit button carries its own amount, and arming resets on row change,
route change, Escape, and after commit.**
An operator authorises a specific number, not a category of action. A button left armed
from a previous row is a trap. The armed transition is announced via `aria-live` — a red
fill communicates nothing to a screen reader. — 2026-07-26

**D-024 · `touch` anchors the armed button to the bottom of the viewport — a prop, not a fork.**
Same ceremony, different ergonomics. `<TwoStepCommit density="touch">`. — 2026-07-26

**D-025 · `MetricCard` has no gradient, no `filled` variant, no trend-arrow trio.**
Row 3 is *the reason this number matters* (`أقدم طلب: ٣ أيام — أ. شريف الجندي`), never a
percentage delta with no referent. Cards are links: each is the door to its queue. —
2026-07-26

**D-026 · Pending badges carry their age; rejected badges carry their reason.**
Waiting is the operator's real metric — "12 pending" is a number, "oldest is 3 days" is a
decision. A rejection with no reason cannot be explained to a parent at a counter. —
2026-07-26

**D-027 · Sub-role and permission differences are ABSENCE, not disablement.**
A disabled control teaches that the capability exists and is being withheld. Applies to
`center_accountant` (no messaging surface — that tier appears on no edge, by design), to
assistant exclusions (wallet, payouts, financial settings, managing other assistants),
and to staff nav groups, which are omitted when empty rather than rendered. — 2026-07-27

**D-028 · The notification count badge is amber with its number as TEXT.**
It was red — reserved for irreversible or blocking — and previously an `aria-hidden` dot
with no screen-reader equivalent at all. A count is waiting, not an error. — 2026-07-27

---

## Scope & product

**D-029 · Assignments are REMOVED, not restyled.**
There is no `Assignment`, `Submission`, `Homework` or `Quiz` model. The teacher route
rendered the gradebook; the student route reskinned grade records and invented a
`graded|pending` status from whether a score existed. Removed: both nav entries, both
routes, the orphaned screen, and — in a second pass — the dashboard's "Assignments Due"
card, the `dueSoon` list (a grade's date relabelled a due date), `overallCompletion`, the
trend chart, and `getStudentAssignmentsTrend` in the shared kernel. Removing the
destination while leaving the claim turned a consistent lie into a broken one. —
2026-07-27

**D-030 · Parents CAN pay. The parent portal is not oversight-only.**
Approved 2026-07-27. All three payment entry points were `requireRole("student")`; the
portal gains a fee list with a pay action, checkout, payment history and a wallet. This is
money work and needs its own approved plan before any API/schema change — the design may
proceed on the assumption, the backend may not. — 2026-07-27

---

## Migration

**D-031 · Re-point the legacy tokens, do not rename them.**
143 call sites on the semantic colours and 58 on the sidebar group meant renaming would
have broken both apps' chrome in one commit. Layer 2 of `globals.css` is a documented
**migration shim**: every name is a `var()` alias into the ledger palette. New code uses
ledger names only; each portal deletes the aliases its screens used as it converts; when
the block is empty, delete the block. — 2026-07-26

**D-032 · `StatCard` survives as a legacy shim beside `MetricCard`.**
25 call sites pass `filled` / `trend` / `unit` / `accent` — props the Ledger system
deliberately removed. A promotion that forces a call site to change is a promotion done
wrong, so both exist until the last StatCard is converted, then the shim is deleted. —
2026-07-27

**D-033 · Promoted components that carry COPY get an i18n-injecting shim, not a bare
re-export.**
`packages/ui` has no i18n runtime. `DataTable`, `ConfirmDialog` and `HeatmapCalendar`
take their chrome strings as props; the app-side shim supplies them from next-intl. This
is what finally localised the pagination `aria-label`s, which shipped English regardless
of locale. — 2026-07-27

**D-034 · `nav.payouts` → «مستحقات وصرف», `nav.payments` → «مدفوعات الطلاب».**
Also resolved: `registrations`/`enrollmentRequests` collided in superadmin Arabic, and
`registrations`/`enrollments` collided in www Arabic. Both apps are now at zero
untranslated nav labels and zero duplicate Arabic labels. — 2026-07-27

**D-035 · `apps/www` nav is grouped, and `navGroups`/`navItems` are both accepted.**
Sixteen flat items is a list, not a structure — it is why two money screens could share a
label without anyone noticing. Both props are accepted so portal sessions convert one
layout at a time without touching each other. — 2026-07-27

---

## Cross-portal archetypes

**D-036 · The matrix below is the single authority. The copies in the portal briefs are
convenience, and where they disagree with this table, this table wins.**
The brief copies were written from a description of the codebase rather than from the
codebase, and four of their rows are wrong in ways that would only surface at merge — the
failure mode being three sessions each building a wallet, all three passing review in
isolation. Verified against the route tree and import graph 2026-07-27. — 2026-07-27

| Archetype | Renders in (verified) | Implementation today | **Defines** | Everyone else |
|---|---|---|---|---|
| **Top-up wallet** — balance, top-up, history, refund | student · parent | two separate screens (264 / 273 lines), no shared code | **Student** | Parent follows and adds only the `pay` action |
| **Earnings & payout** — balance, payout requests, withdraw | teacher | `teacher-wallet-screen` (236 lines) | **Teacher** | nobody in www — center payouts live in `apps/superadmin/features/payouts` |
| **Attendance — read-only view** | student · parent · assistant · teacher | **ONE shared** `features/attendance/attendance-screen.tsx` | owner of `features/attendance` (§7) | consume unchanged — do not re-derive |
| **Attendance — marking** | teacher · assistant | `teacher-attendance-screen` | **Teacher** | assistant renders the same file |
| **Counter / door check-in + commit state** | admin · staff (counter) · teacher · assistant (door) | `admin-checkin-screen`, `door-checkin-screen` | **Center admin + Staff** (counter) · **Teacher** (door) | `<CommitState>` treatment identical in both |
| **Notifications** | all six www + superadmin | **ONE shared** `features/notifications/notifications-screen.tsx` | **Superadmin** defines the pattern | applied ONCE to the shared www screen by its §7 owner |
| **Profile / settings** | all six www | **ONE shared** `features/settings/settings-screen.tsx` | **Superadmin** defines the pattern | applied ONCE by its §7 owner — **not** "whoever gets there first" |
| **Messaging** | all six www | `features/messaging/**` | sixth session (§7) | parent's oversight disclosure appears on the student's side too |
| **Dashboard home** | all six | six separate `page.tsx` | **Superadmin** (اليوم) | follow |
| **Decision panel + two-step commit** | all money portals | `packages/ui` `TwoStepCommit` | **Superadmin** | follow |
| **List + filter row + detail panel** | superadmin · center · teacher | — | **Superadmin** | follow |
| **Gradebook** | teacher · assistant | `teacher-gradebook-screen` | **Teacher** | — |
| **`touch` density** · **counter→payment flow** · **cascade preview** | staff | — | **Center admin + Staff** | — |
| **Audit log** | superadmin | — | **Superadmin** | — |

**D-037 · "Wallet" is TWO archetypes, not one, and the briefs merge them.**
The student/parent screens carry top-up · refund · `balanceAfter` · pay. The teacher screen
carries payout requests · withdraw, and has **no top-up and no refund**. Three briefs
currently say "follow Teacher" for the wallet; that points two sessions at a screen missing
both actions they need. The teacher brief's claim that its wallet is "the most complete"
describes the *backend* guarantees (H1 row lock, H2 conditional decrement, the DB CHECK),
which are payout mechanics — not the screen. — 2026-07-27

**D-038 · The parent wallet exists and was in nobody's matrix.**
`dashboard/parent/wallet` + `parent-wallet-screen.tsx` (273 lines — the largest of the
three) appear in no portal brief's archetype table. The parent session would have found an
unowned wallet screen mid-flight. Corrected in D-036: parent follows Student. — 2026-07-27

**D-039 · There is NO center wallet, and two briefs point at one.**
The student and teacher briefs both list "center" as a wallet portal. `dashboard/admin` has
`fees`, `expenses` and `reports` and no wallet or payout screen; the staff brief's "Wallet +
payout request → follow Teacher" row names a surface that does not exist in `apps/www` at
all. — 2026-07-27

**D-040 · A shared screen gets ONE named owner, never "post it if you are first".**
Notifications, settings and the attendance view are each a **single file** rendered by all
six portals. The briefs currently tell four sessions they "may be first" on files none of
them owns — which is a race on shared code, and the exact thing REQUESTS.md exists to
prevent. Superadmin defines the *pattern*; the §7 owner applies it once. — 2026-07-27

---

## Archetypes defined by the superadmin session

*Posted as the two reference screens were built (اليوم, مستحقات وصرف). Sessions that
follow build against these rather than inventing a second version.*

**D-036 · A screen may not render a figure that has no table behind it. Where the spec
asks for one, derive the nearest REAL guarantee and say so in the file.**
Handoff §5.1 specified a «فروق في مطابقة الكاش» (cash-reconciliation) metric card, and
§5.3 a bank-transfer-fee line plus a «بيانات التحويل» block with a masked account. None
of the three exist: 70 models in `schema.prisma`, no reconciliation concept, no transfer
fee, no bank/IBAN/account column anywhere. The prototype was drawn with plausible fake
data; the schema is the truth. This is the constitution's last and most emphatic test
(§8, "no screen implies a capability the system does not have") and it outranks a hi-fi
mock. **Do not build a surface because the design shows it — check the schema first.**
The replacement is derived, not dropped: `settlePayout` settles via an H2 conditional
decrement, so a payout whose beneficiary wallet cannot cover the net genuinely cannot be
disbursed. That is real, checkable before the commit, and carries the same «يوقف الصرف»
meaning. — 2026-07-27

**D-037 · The decision-queue dashboard: decisions first, each card a door, each card
carrying the reason it matters.**
`اليوم` anatomy, in order: (1) an `h1` that is the *count of open decisions*, not a page
name, with the count as `<ProseCount>` so Arabic agreement is right; (2) metric cards
ordered by URGENCY, not by category, each an `href` to its queue, each with row 3 = the
one fact that makes the number actionable (`أقدم طلب: ٣ أيام — {name}`), never a
percentage delta; (3) a `1.55fr/1fr` split — the period ledger beside what is currently
held; (4) a window onto the audit log, because every screen's actions land there. A card
whose count is 0 is OMITTED, not rendered empty — absence, not disablement (D-027). When
all counts are 0 the whole card row is replaced by `<EmptyState tone="empty">`, which is
a different truth from `tone="error"` and must not be collapsed with it. — 2026-07-27

**D-038 · List + filter row + detail panel: the panel is where the action lives, and
rows carry NO action buttons.**
`مستحقات وصرف` anatomy: filter pills each carrying their own count *queried from the
database, not counted from the loaded page* (a pill that agrees with the screen and
disagrees with the table is a quiet lie); a `396px` panel with `border-inline-start`;
`onRowClick` opens it, checkbox selection drives a running «مجموع المحدد» total. The
screen this replaced put a filled Approve and a filled destructive Reject in every row —
twenty saturated buttons at ten rows, with reject at equal weight to approve. Destructive
actions in the panel are BORDERED, never filled, and a rejection requires its reason
before it can be submitted (D-026). The panel must not outlive its subject: when a filter
change removes the open row, the panel closes. — 2026-07-27

**D-039 · The decision panel shows the whole computation, and the commit states its own
amount.**
Every intermediate figure is printed above the double rule — gross, then commission, then
the net — because append-only means the operator cannot correct the figure afterwards, so
they must be able to derive it beforehand. Two advisories are REQUIRED and they are
different things: a *clearance* line (teal when clear, red when the write will fail) and a
*permanence* line (what the ledger will accept and that the only correction is a new
reversing entry). Clearance is computed from the same comparison the service will make, so
"this will fail" is said before the press rather than discovered after it. `<TwoStepCommit
labels.action>` takes a `ReactNode`, so the amount goes IN the button via `<Num.Money>` —
`اعتماد وصرف 38,235.00 ج.م`, never "Approve". Pass `resetKey={row.id}`; the component
already handles Escape, commit and route change. — 2026-07-27

**D-040 · Arabic-only plural forms (`_two`, `_few`) are reached through `asKey`.**
`Messages` is typed from the ENGLISH dictionary, so the dual and small-plural forms —
which English does not have and `pluralForm` ignores outside `ar` — are legitimately
absent from the type. Guard them with `t.has(asKey(...))`. This is not a parity failure:
every string a user reads exists in both locales, and the extra Arabic entries are
grammatical forms, not untranslated copy. — 2026-07-27

**D-041 · Permission-denied is a THIRD state, and it never offers Retry.**
`empty` · `error` · `denied` are three different truths and `<EmptyState tone>`
distinguishes all three. Split the 403 out of the generic error branch —
`(query.error as {statusCode?: number})?.statusCode === 403` — and render it with NO
retry affordance, because retrying cannot change a permission. Offering the button is
the same lie as a disabled control: it teaches that the capability is one click away
(D-027). Every list and detail screen in the back office now does this; the other
portals should too, since a student hitting another student's record is the commonest
403 in the product. — 2026-07-27

**D-042 · Relative time is PROSE, not data — `<ProseCount>` with agreement, never an
interpolated figure.**
`منذ 3 يوم` was shipping: `formatNumber` (Latin digits, via `ar-EG-u-nu-latn`)
interpolated into a single fixed noun. Both halves are wrong — prose takes
Arabic-Indic digits, and Arabic marks a dual, so it is `منذ يومين`, never `منذ ٢ يوم`.
Relative timestamps appear in notifications, chat, attendance and every "last seen"
line in all six portals, so this is the single most-read string in the product. Use
`<ProseCount forms={…}>` with `_one/_two/_few/_many`. Absolute timestamps stay
`<Num.Date>` — they are data. — 2026-07-27

**D-043 · An editable amount input is legitimate ONLY for policy bounds, never for a
ledger amount.**
The constitution forbids rendering an amount as an editable input because amounts are
append-only. The wallet min/max top-up and the commission rate are NOT amounts — they
are configuration that governs future writes and changes nothing already recorded, so
an input is honest there and the save is ONE press (D-022). The test is whether the
number is a row in the ledger or a rule about rows yet to be written. Figures
*reporting* current policy stay `<Num>`. — 2026-07-27

---

## The showcase site (`apps/showcase`)

**D-044 · The showcase is exempt from the single-animation budget, because it rests on a
different guarantee.**
`CONSTITUTION.md` §1 spends the product's one animation on the seal, and §2 says a
derivation needing a second animation is wrong. The showcase is not a ledger — it is an
*argument about* one, and its guarantee is not "this record is permanent" but **"everything
shown here is real; you are looking at the actual product."** An honest interface for that
guarantee *demonstrates* rather than asserts. So motion is permitted exactly where it
carries the demonstration — a diagram that draws its own computation, a counter that counts
because the figure is derived from entries, a pin that holds one screen while its parts are
named — and forbidden where it decorates: no parallax, no enter-transitions for rhythm, no
second 3D scene. The product itself is unchanged; this exemption does not travel back into
any portal. — 2026-08-02

**D-045 · The showcase keeps the Ledger token layer with no additions.**
The carve-out in D-044 is a *motion* exemption and nothing else. `--paper`/`--sheet`/
`--ink`/`--rule`, the four colours, IBM Plex Mono for every figure, hairlines, `<Eyebrow>`'s
marker rule and the `<Num>`/`<ProseCount>` split all apply unchanged, and the site imports
them from `@repo/ui` rather than restating them. A marketing surface that invents a fifth
colour or a second font stops looking like the product it is selling, which defeats the
guarantee D-044 rests on. — 2026-08-02

**D-046 · `SplitText` splits Arabic by word or line, never by character.**
Char-splitting wraps each glyph in its own element, which breaks the cursive joins and
ligatures that Arabic shaping depends on — the headline renders as disconnected letterforms
in the product's *primary* language while animating correctly in its secondary one. The
split granularity is chosen from the locale by a helper, not left to each caller to
remember. Latin headlines may still split by character. — 2026-08-02

**D-047 · Lenis, not ScrollSmoother.**
ScrollSmoother transforms a wrapper element, which disables `position: sticky` inside it —
and the showcase's sticky sub-nav and several pinned scenes depend on sticky. Lenis is
~3KB against ~15KB, needs no wrapper/content markup fighting the App Router layout, and
integrates with ScrollTrigger in one line (`lenis.on('scroll', ScrollTrigger.update)`). We
forgo ScrollSmoother's `data-speed` effects, which are parallax — forbidden by D-044
anyway. — 2026-08-02
