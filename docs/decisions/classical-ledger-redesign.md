# "Classical Ledger" redesign (built 2026-08-07 — awaiting review)

The approved redesign from `design/handoff/` (README = the spec and the single
source of truth for values; `Edura-Redesign.dc.html` = the full design document;
`ledger-hero.js` = a vanilla reference of the hero). Editorial voice: hairline
rules, colour as STROKE never fill, outlined buttons, serif display faces, ONE
gold accent, and Arabic as CO-PRIMARY rather than adapted.

1. **`design/CONSTITUTION.md` is retired as a VISUAL system and kept as a
   FUNCTIONAL one.** All nine invariants survive untouched: `<Num>` vs
   `<ProseCount>` as two components, two-step commit with amount-carrying confirm
   buttons, the seal's exact stamp behaviour, `2px double var(--ink)` totals drawn
   from `--ink` never `--rule`, every intermediate figure with an actor, per-record
   commit state, three densities, four semantic colours, excluded capabilities
   absent rather than disabled.
2. **TOKENS WERE RE-POINTED, NOT RENAMED (binding).** The direction names
   `--radius-sm/md/lg`, but those names are already GENERATED inside `@theme`
   from `--radius-step-*`, and 33 call sites read `rounded-(--radius-step-md)`.
   So the VALUES moved (`--radius-step-sm/md/lg` → 6/10/14px, `--radius-badge` →
   12px) and the names did not. Shadows the same: `--elev-sm/md/lg` hold the new
   values and `--lift`/`--lift-2` alias them, so ~70 `shadow-[var(--lift)]` call
   sites in superadmin keep working. Adding the direction's names at `:root`
   would have SHADOWED Tailwind's own scale.
3. **`--ink-3` is `#6b6867`, NOT the source palette's `#7d7979`**, which fails AA
   at body sizes. This is the one value the direction deliberately corrected, and
   a revert would read as a harmless tidy-up in review — so it is held by a test
   (below), not by a sentence.
4. **Every font role token carries an in-line `var()` fallback.** An undefined
   custom property inside a `font-family` list makes the whole declaration invalid
   at computed-value time — the text loses its family entirely rather than falling
   through to the next name. All five families are therefore loaded in ALL THREE
   apps (www, superadmin, showcase), per-script subsets, because all three import
   the token sheet.
5. **THE MONO TRAP, three times.** IBM Plex Mono ships NO ARABIC GLYPHS, so
   applying it to Arabic silently drops the text into another family with no
   visible error — the trap `<Eyebrow>`'s header has always documented. The
   direction specifies badges, table headers, the receipt's actor line and its
   seal as mono, and every specimen in the design document is Latin. Resolution,
   applied consistently: GEOMETRY is shared by both scripts, FAMILY switches.
   `<StatusBadge script="latin">` is opt-in (defaults to the body face — the safe
   direction); the table header's mono/0.12em treatment is applied per-table via
   className and NOT globally; the hero splits its actor line so the NAME is body
   face and the TIME is mono. Figures are mono, Latin-digit and bidi-isolated
   everywhere, unchanged.
6. **The shadcn `default` button was NOT flipped to solid ink.** The direction
   says primary = solid `--ink` and is the only solid — but `default` is the
   indigo primary on 25+ back-office screens, and the direction ALSO says the ERP
   screens are not yet designed in this language and must not be reskinned ad
   hoc. Flipping it would have done exactly that, invisibly, from one line of a
   cva. The Classical set is ADDITIVE (`ledger` / `gold` / `ledger-ghost` /
   `money`, sizes `ledger` / `ledger-money`) and every marketing surface uses it.
   When the ERP is designed in this language, `default` becomes an alias of
   `ledger` — that is a decision about the whole product, not about a cva.
7. **Focus is a 2px `--indigo` outline at 2px offset, product-wide**, on Button
   and Input, replacing shadcn's 3px translucent ring. An outline is drawn outside
   the border box so it never reflows or clips, and unlike a box-shadow ring it
   survives forced-colors mode rather than being dropped.
8. **The showcase had NO theme mechanism at all** — it never set `data-theme`, so
   the dark token block was dead there. Rather than add a THIRD copy of a file
   `apps/www` and `apps/superadmin` already carried byte-identically, the provider
   moved to `@repo/ui/components/theme-mode-provider` and both portals became
   re-export shims (every import path and behaviour unchanged). The showcase
   inlines the pre-paint bootstrap rather than fetching `/theme-init.js`: a
   separate request can resolve AFTER first paint, which defeats its purpose.
9. **The three.js notebook is GONE**, with its poster pipeline, its posters, the
   `render:poster` script, `three` / `@react-three/fiber` / `@react-three/drei` /
   `@types/three`, and the `.scene-pin` / `.will-reveal` styles that were only
   ever its. It was the only three.js consumer. The hero that replaces it is a
   localized React component on the showcase's EXISTING `loadMotion()` runtime —
   not a second GSAP instance — and its static JSX **is** the final frame, so
   SSR, `prefers-reduced-motion` and hydration all fall out of one code path
   instead of three.

**No database migration, no schema change, no API change.**

Proofs: `apps/erp/tests/unit/design-contrast.test.ts` **27/27** — parses the
token sheet and asserts every text token holds 4.5:1 on ALL THREE grounds
(paper/sheet/field, because meta text sits on all of them), every badge pair,
and the dark-mode "seal is the most legible element in its row" check as an
ORDERING. `apps/showcase/tools/redesign/capture.spec.ts` **8/8** in a real
browser (`bun run --cwd apps/showcase capture:redesign`, dev server on :3006) —
captures AR+EN landing in light+dark, the state sheet and the hero's final
frame, and asserts the seal sits at −6° in RTL, that reduced motion is still
byte-identical after 2s (i.e. no timeline exists), and that the loop stops
advancing off-viewport. Screenshots land in `design/handoff/shots/`.
Regressions green: `bun run check-types` 9/9, `bun run build` 3/3, www unit
**394 pass / 1 skip**, showcase 16/16, and lint error-parity — the 14 www + 2
superadmin errors are all pre-existing (terms/privacy/use-chat/sw.js/`Date.now`)
and none are in a file this change touches. A repo-wide scan confirms no
stylesheet redeclares any of the 171 tokens `globals.css` owns.

> **`bun run build` DOES NOT CATCH CSS SYNTAX ERRORS in the showcase.** It builds
> with `--webpack` while `next dev` uses Turbopack, and during this work a broken
> comment in `globals.css` passed the build and was caught only by the dev
> server. Treat a green build as insufficient evidence for a stylesheet change.

**Dev-only surface:** `/{locale}/design-system` in the showcase is the component
state sheet (every button/input/badge/table/empty state, both scripts, plus the
RTL worst case — an Arabic name, a `TRX-` code and a 7-digit amount in one row).
It `notFound()`s in production, gated the same way the portals gate quick-login.

**Deliberately NOT done, and why:** the ERP screens were not reskinned (they do
change appearance via token propagation, which the scope guard permits); no
pricing section, footer legal line, testimonials, counters or stock photography
were invented; no copy was rewritten — the landing uses `home.hero` and `owners`
verbatim, and the three proof figures were added as new `home.proof` keys taken
from the design document's own AR and EN landings. The footer's missing legal
line (B3) has NO placeholder TODO in the markup on purpose: a visible
placeholder on a public page is worse than its absence.

**Open questions still open:** gold vs amber adjacency once a marketing page
shows a live status badge; the B3 legal line; whether Amiri should serve 13px
Arabic body copy (current spec: Plex Sans Arabic below display sizes); and the
ERP design language — which now carries two concrete sub-questions, whether
`default` should become solid ink (#6) and whether table headers should take the
Latin mono treatment (#5).

### Round 2 — the five role pages (built 2026-08-08 — awaiting review)

Round 1 redesigned the LANDING. The five role pages (owners / teachers /
students / parents / trust) were still in the pre-Classical language, inheriting
only the tokens. The round-2 handoff (`Home / Owners / Teachers / Students /
Parents / Trust / SiteNav / SiteFooter .dc.html`) covers them; `ledger-hero.js`
and `Edura-Redesign.dc.html` in that bundle are BYTE-IDENTICAL to the ones
already in `design/handoff/`, so nothing from round 1 was re-done.

1. **`lib/type.ts` is the one place per-script display type is decided.** The
   pattern was inlined at three call sites and about to reach a dozen. Scales are
   RANKS (`hero`/`pageHero`/`section`/`feature`/`card`/`cta`), never pixels, and
   Arabic is written as a branch with NO `letterSpacing` value — so the "never
   track a connected script" rule has no property to set wrongly.
2. **The doubled eyebrow marker is fixed.** `PageHero` rendered its own 3px
   rounded pill AND an `<Eyebrow>` that draws its own 2×9px rule — two markers,
   one label, on all five pages. The role tone now feeds
   `--eyebrow-marker-color`, so the one marker that belongs to the component
   whose job it is carries the colour. Held by a proof.
3. **`2px double var(--ink)`, not 3px.** `SettlementDiagram` drew the totals rule
   at 3px, which is not constitution #4. It is now `2px`, drawn from `--ink`, and
   a Playwright assertion reads the computed `border-top-*` and compares the
   colour against the resolved `--ink` — a swap to `--rule` (a 16%-alpha mix)
   looks almost right and no screenshot review would catch it.
4. **The settlement card shows the SUBTRACTION, not a branch diagram.** The SVG
   version showed the three shares but not where the money went; the ledger form
   (`price → −platform → −center → ═ teacher`) is constitution #5, and the
   teacher's share is still derived as the REMAINDER exactly as
   `distributeSessionRevenue` does it, so the diagram cannot disagree with the
   engine by a piastre. `ledger-card.tsx` is the shared primitive; the students'
   wallet card is the same object at a smaller size.
5. **Screenshots are PLATED; `BrowserFrame` is retired.** `<Plate>` existed from
   round 1 with ZERO consumers while every page drew traffic-light dots and a
   fake URL bar — a browser inside the reader's browser. `Shot` and `FlowVideo`
   now render through `Plate`. `PhoneFrame` STAYS: a narrow screenshot with no
   frame cannot tell the reader it is a phone rather than a crop.
6. **`SubNav`'s active item is a stroke, not a filled `--indigo-soft` pill** —
   the same gold underline the site header already uses. It stays STICKY, which
   the design document does not draw (a static document has no scroll position);
   that departure is stated in the file rather than taken quietly.
7. **THE TRUST PAGE'S FIGURES WERE ALL STALE, and are now un-driftable.** It
   published 7 protected tables (really 9), 15 isolation policies (59), 36
   tenant-scoped tables (38) and 45 applied migrations (48). Nobody lied — they
   were true when typed. `lib/platform-facts.ts` holds them with
   `tests/unit/platform-facts.test.ts` reading the REAL sources
   (`expected-db-shape.json`, the migrations directory, and the `APPEND_ONLY` map
   in `verify-db.ts`), so the page now fails the build rather than drifting. On
   the one page arguing "the interface tells the truth", a stale number is the
   only thing it cannot afford.
   > **The prose was corrected too (Ali approved, 2026-08-08).** The heading had
   > read "سبع جداول" / "Seven tables" directly above a counter saying 9, and the
   > body ENUMERATED seven by name — it predated the two external-teacher tables.
   > Now: heading "تسع" / "Nine", `home.proof.tables.figure` 7 → 9, and the body
   > names `teacher_system_status_changes` ("سجل تحويل المدرّسين" / "the teacher
   > conversion journal") and `external_teacher_settlements` ("كشوف تسويات
   > المدرّسين الخارجيين" / "external teacher settlement statements").
   > **The body's SPLIT is the part to preserve:** six tables are `INSERT,
   > SELECT` only — neither editable nor erasable — while the other three
   > (invoices, payouts, the blacklist journal) are REVOKEd DELETE but still
   > allow UPDATE. "Nine carry a REVOKE" is true; "nine can never be changed"
   > would not be. `PLATFORM_FACTS.strictlyAppendOnly` (6) exists solely to hold
   > that sentence honest — nothing renders it, and a drift assertion derives it
   > from the grants themselves.
8. **Plain-language glosses are ADDITIVE.** New `*.plain` keys on the seven
   sections carrying a technical term (`REVOKE`, row-level security, triggers,
   append-only). The jargon keeps its place and gains a translation underneath —
   "يعني إيه؟ …" / "In plain terms: …" — set at 12.5px in `--ink-3`. No existing
   string was rewritten. Ali's decision, 2026-08-08: keep the text, add the gloss.
9. **`CapabilityGrid` was missing constitution #9.** The "absent from their
   screen entirely — not locked, not greyed out" line simply was not there, which
   left the page claiming the weaker of the two guarantees. Added.
10. **The home page gained a role index and a closing CTA, and lost nothing.**
    `ShotProof` is NOT in the design document; Ali chose to keep it
    (2026-08-08). Order: hero → features → role index → screenshots → CTA, with
    the index BEFORE the screenshots because a reader who does not yet know
    which role is theirs cannot judge whether a screenshot is relevant.
11. **B3 is a code comment, not a visible chip.** The design draws a
    "[B3 — pending]" placeholder in the footer. Round 1 decided a visible
    placeholder on a public page is worse than its absence, and that stands — the
    TODO sits in `site-footer.tsx` where the developer who can fill it will see
    it. The legal entity line is still missing from the repo.
12. **One correction to the design document:** the parents' condition card uses
    `←` in Arabic, not `→`. The arrow points along the READING axis and §6.4
    flips exactly those; the specimen used `→` in both scripts, which in RTL
    points back at the condition.

`LedgerDiagram` moved OFF the students' wallet section (it showed a Postgres
permission error to explain a student's own balance — right argument, wrong
reader) and stays on Trust, where it is now paired with the new `ReversalCard`:
one shows the UPDATE refused, the other shows what a correction therefore looks
like, with the wrong entry still visible.

**No database migration, no schema change, no API change.** Nothing outside
`apps/showcase` and `design/handoff/shots/` was touched.

Proofs: `tools/redesign/role-pages.spec.ts` — 20 full-page captures (5 pages ×
ar/en × light/dark, in `design/handoff/shots/roles/`) plus **7 assertions** that
a screenshot cannot make: the 2px-double-from-`--ink` rule, plates everywhere
with no browser chrome left, the sub-nav stroke, exactly one eyebrow marker per
page hero, the reversal card keeping the wrong entry, the Trust counters
matching the database, and Arabic figures still LTR-isolated. Round 1's
`capture.spec.ts` **8/8 unchanged**. Showcase unit **21/21** (up from 16, the 5
new ones being the platform-facts drift test), root `check-types` **9/9**,
`bun run build` **3/3**, showcase lint 0 errors (2 pre-existing warnings in
`use-scene.ts`). Verified live in the browser on dev.

> **NOTE for whoever reviews this:** the working tree also carried ~45 changed
> paths from a CONCURRENT workstream (www/superadmin routes, `distribution.ts`,
> ~20 new unit tests) that this change did not touch and did not review. www unit
> reads 489 pass/1 skip against a 394 baseline because of those, not because of
> this.
