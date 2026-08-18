# DESIGN BRIEF & BUILD PROMPT — Edura SaaS Marketing Website (2026)

> Paste everything below the horizontal rule into Claude Design.
> §9 is already filled in. Nothing is left to supply.

---

## 0. YOUR ROLE

You are a **Creative Director + Senior Product Designer + Frontend Systems Architect** working on a single deliverable: the public marketing website for **Edura**, a B2B SaaS platform. This is not a template job. Treat it the way a top-tier independent studio (Basement, Locomotive, Studio Freight, Rally, Instrument) treats a flagship SaaS launch site in 2026: an **art-directed editorial product site**, not a component-library landing page.

**This is a ground-up redesign.** There is no prior visual language to honor, no existing brand kit, no legacy tokens, no design system to extend. Every visual decision — concept, palette, typography, surface, motion — is yours to make and defend. Do not ask what came before; there is deliberately nothing to inherit.

Three rules override everything else:

1. **Do not invent facts.** No fake customer logos, no fabricated "10,000+ centers", no invented testimonials, no made-up uptime numbers, no fake awards. Where a number is needed and none is supplied, use a *structural* proof (something verifiable about how the system works) or leave a clearly-marked `[[ ]]` placeholder. This product's entire positioning is honesty about money — a fabricated stat on the homepage destroys it.
2. **Arabic is the primary language, not a translation.** See §6. If a decision looks great in English and breaks in Arabic RTL, the Arabic version wins.
3. **One concept, carried all the way through.** A stack of 2026 trends is not a design. See §2.1.

---

## 1. THE PRODUCT — WHAT EDURA ACTUALLY IS

**Edura** is the operating system for **private teaching centers and independent tutors in Egypt** (K–12 "سناتر" and private lessons — a large, almost entirely cash-and-paper market).

**The core insight to design around:** this industry runs on cash in a drawer, attendance in a notebook, and a WhatsApp group. Money moves between three parties — the platform, the center (which owns the hall), and the teacher (who owns the students) — and today nobody can prove who is owed what. **Edura is a double-entry, append-only system of record with a front desk attached.** Every pound that moves has an actor, a timestamp, and a row that can never be edited or deleted — only corrected by a visible reversal.

### Four audiences, one platform

| Role | What they get |
|---|---|
| **Center owners** | The front-desk counter board, halls & schedules, staff accounts with permission tiers, revenue/expense/net reports, CSV + print export, a weekly digest email, teacher settlement statements |
| **Teachers** | Their groups, attendance, grades, their own wallet and what they're owed, assistants who act on their behalf with full audit attribution, collaboration requests with centers (subject, year, hall, schedule, revenue split) |
| **Students** | Their subjects (auto-assigned from their academic year + track), schedule, wallet, a printable **student ID card with a signed QR code**, attendance history |
| **Guardians / parents** | Read-only oversight of their child's messages with adults, ability to pay for a specific lesson or month from their own wallet, attendance notifications |

### Concrete capabilities worth showing (all real, all built)

- **The counter board** — the receptionist's home screen: the teacher currently teaching is already selected, today's lessons with live head counts, two tabs (*checked in* / *everyone*), student search, card scan, walk-in registration, cash collection, and check-in — all on one screen.
- **Student ID card + signed QR** — every student carries an 8-character code (`G7K3M2QF`) with a **check character**, so one mistyped digit at the counter can never resolve to a different child. The QR is a signed URL, revocable, and carries no personal data. The card prints as a PDF or shares as a PNG on WhatsApp.
- **Two-mode attendance** — counter check-in only, or counter + a second check-in at the classroom door.
- **Revenue settlement** — when a lesson is completed, the platform's cut, the center's hall share and the teacher's remainder are computed and written to three wallets in one transaction. The button shows the exact arithmetic *before* you press it.
- **Payments** — online card + mobile wallet, or cash at the counter with a printed receipt. Both write the same rows.
- **Walk-in registration** — a student registers at the front desk and receives their student ID plus a one-time secure link (email/WhatsApp) to finish onboarding.
- **Bulk import** — a center uploads the spreadsheet it already runs on and gets a roster, with a dry run first.
- **Child safety** — minors are the default. A student with no verified guardian channel has adult-facing messaging locked. Guardians get read-only visibility. Both parties see a persistent disclosure banner.
- **Row-level isolation** — a center can only ever see its own rows, enforced in the database itself, not in application code.

### The tone of the brand

Serious, quiet, exact. This is money software for people who have been burned by money software. Confidence is expressed through restraint and precision — never through exclamation marks or "revolutionary". Closer to Mercury / Ramp / Linear / Monzo than to a purple-gradient startup landing page.

**But do not copy those references.** They are a *register*, not a look. Your job is to find a visual language that is unmistakably Edura's — Egyptian, Arabic-first, financial, and not derivative of Silicon Valley fintech.

---

## 2. ART DIRECTION — YOU DECIDE, THEN YOU COMMIT

### 2.1 The concept comes first

**Before any pixels: propose 3 genuinely distinct art directions.** Each one gets:

- A one-paragraph concept — what the site *is*, metaphorically, and why that fits a product about provable money
- A palette (with hex values and the reasoning)
- A type pairing, named, for both Arabic and Latin
- **The one signature move** that makes this direction unmistakable and the others impossible
- A wordmark proposal (see §9.1)

They must be genuinely different — different concepts, not three palettes on one layout. Seed territories, if useful (pick from these or invent better):

- **The document** — the page behaves like a set financial record. Hairline rules, a visible baseline grid, totals drawn as rules, every claim carrying an actor and a timestamp.
- **The counter** — the physical front desk as the organizing metaphor. Tactile, warm, object-like; interface fragments sit on a surface rather than floating in space.
- **The proof** — near-brutalist clarity. Raw structure, exposed grid, high-contrast type, no ornament at all; the argument *is* the design.
- **Egyptian modern** — a contemporary reading of Arabic geometry and print tradition without pastiche, kitsch, or pharaonic cliché.
- **The instrument** — precision-tool language. Dense, technical, monospaced meta, calibration marks; the site feels engineered rather than marketed.

**Do not start building until one is chosen.** Then carry it into every section, every state, every page. A section that abandons the concept is a bug.

### 2.2 Color

The palette is your decision. What is not negotiable:

- **Restraint.** A disciplined palette — one dominant, one ground, a hierarchy of muted tones, and **at most two accents**. If you find yourself needing a fourth hue, the layout is doing too little work.
- **Contrast is a hard gate.** Every text token clears **4.5:1** against *every* background it can land on, in both themes. If a value fails, correct the value — never shrink the text or drop the token.
- **Dark mode is a designed artifact, not an inversion.** Design both fully. Grounds shift in temperature, accents shift in luminance.
- Semantic color (success / warning / danger / info) is a small, fixed set, defined once and used consistently.
- Whatever expressive device you choose — stroke-only color, a single saturated accent, duotone, a restricted ink set — **state the rule and never break it.** A palette without a rule reads as noise.

### 2.3 Typography — the single biggest lever

- **The pairing must be a decision you can defend.** Latin and Arabic, both chosen deliberately, both with genuine editorial quality. Do not default to Inter, and do not use one family for everything.
- **Extreme scale contrast.** Hero display at 72–120px fluid; body at 16–17px; meta at 12.5px. Nothing sitting in between doing nothing.
- **Optical detail:** negative tracking at display sizes, tabular figures on every number, `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs, hanging punctuation where supported.
- **Kinetic typography, used once.** One moment where type itself performs — per-glyph reveal, a number counting into place, a variable-font weight axis shifting on scroll. **Once.** A second instance makes both cheap.
- **Line length capped at 68–72 characters.** Never let a paragraph run the full width of a 1440px viewport.

> ⚠️ **THE ARABIC MONOSPACE TRAP — read this twice.** Most monospace faces ship **zero Arabic glyphs**. Applying a mono family to Arabic text silently drops it into a fallback with no error — it just looks wrong and nobody knows why. The rule: **geometry is shared between scripts, family switches.** Keep the mono size/tracking/case treatment for Latin; for Arabic use the body face at the same optical size. Numbers stay mono and LTR-isolated in both scripts.

> ⚠️ **Font tokens need an inline fallback.** An undefined custom property inside a `font-family` list invalidates the *entire declaration* at computed-value time — the text loses its family completely rather than falling through to the next name. Always `var(--font-display, "Actual Name", serif)`.

### 2.4 Layout

- **A real grid, visibly honored.** 12 columns, generous gutters, an asymmetric rhythm — do not center everything. Break the grid deliberately once or twice, so the grid reads as a decision rather than a default.
- **Massive vertical spacing.** 140–200px between sections on desktop. Whitespace *is* the premium signal; cramped is the tell of a template.
- **Kill the card-in-card-in-card.** Maximum one level of containment. Prefer rule- or space-separated regions over stacked shadowed boxes.
- **Bento grids are allowed but flattened** — no rounded-24px shadowed tiles. Cells of varying span, separated by rules or negative space.

### 2.5 Surface & texture

Pick **one** surface treatment and commit — grain, halftone, print registration, subtle noise, letterpress depression, plain flat matte. Not several.

- Whatever you choose must be GPU-cheap and must never sit over text at a level that costs legibility.
- **No glassmorphism. No neumorphism. No drop shadows over 8px blur.** Depth comes from overlap, scale and edges — not from blur.
- If you use **WebGL/Three.js at all, use it exactly once**, in the hero, and it must degrade to a static frame *identical to its final rest state* under `prefers-reduced-motion` and on the server render. If it can't degrade cleanly, don't use it.

### 2.6 Imagery

- **The product is the hero image.** Use real, plausible interface fragments — the counter board with Arabic names, a settlement receipt, a student card, a transaction row — presented in whatever framing device your chosen direction calls for.
- **No fake browser chrome.** No traffic-light dots, no fake URL bar. A browser drawn inside the reader's browser is the oldest tell in SaaS design. A phone frame is allowed *only* where a narrow crop would otherwise be unreadable as a phone.
- **No stock photography of smiling people at laptops.** If human presence is needed, use a single, restrained, art-directed photograph — or nothing.

### 2.7 The anti-list (instant rejection)

Purple→blue gradients · glowing orbs and blurred blobs · glassmorphic navbars · "✨ AI-powered" badges · generic 3D isometric illustrations · Inter for everything · rounded-2xl cards with `shadow-lg` · testimonial sliders with invented quotes · a logo cloud of companies who aren't customers · emoji as section icons · "Trusted by thousands" · centered-everything single-column stacking · marquees of feature names · a chatbot bubble.

---

## 3. PAGE ARCHITECTURE

A **multi-page site**, not a single scroll. Every page uses the same header/footer shell.

### `/` — Home
1. **Header** — logo, 5 nav items, language toggle (ع / EN), theme toggle, `Sign in`, one primary CTA. Sticky, but it *thins* on scroll rather than turning into a glass pill.
2. **Hero** — the single strongest moment on the site. Display headline (Arabic-first), one-sentence subhead, two CTAs, and a **living proof object**: the money path animating itself once — cash collected → attendance marked → three wallets credited → receipt issued. It runs once on load, then rests. **Its rest state is the SSR/static state.**
3. **The three-figure proof strip** — three *structural* numbers with meta labels. Verifiable facts about how the system works, not marketing metrics.
4. **The problem, stated plainly** — one editorial paragraph at large size about cash drawers, notebooks and WhatsApp groups. The emotional anchor. Give it room; don't decorate it.
5. **How it works** — a 4-step sequence: *register → check in → collect → settle*. Scroll-driven, with a progress indicator and a real interface fragment per step.
6. **Capability grid** — 6–8 capabilities from §1, each with a title, one sentence, and a drawn micro-diagram (not an icon font).
7. **Role index** — four entries (Center owners / Teachers / Students / Guardians), each linking to its page. Place this **before** the screenshots: a reader who doesn't yet know which role is theirs can't judge whether a screenshot is relevant.
8. **Trust section** — a compact preview of the isolation / append-only argument, linking to `/trust`.
9. **Pricing teaser** — how the platform charges, in one honest sentence, linking to `/pricing`.
10. **Closing CTA** — full-bleed, high-contrast, one action.
11. **Footer** — 4 columns, language + theme, a restrained signature. See §9.3 for what the footer must *not* contain.

### `/owners`, `/teachers`, `/students`, `/parents`
Four role pages sharing one template: a page hero with a role-distinguishing device (**exactly one** marker per hero — not a colored pill *and* an eyebrow rule), a sticky sub-nav whose active state is consistent with your concept, 3–5 capability sections with real interface fragments, one signature diagram unique to that role (owners → the settlement subtraction; teachers → the wallet; students → the ID card; guardians → the oversight channel), and a role-specific CTA.

### `/trust`
The credibility page. A correction shown as a reversal with the wrong entry still visible; the isolation model; the child-safety model; the append-only argument; data rights. **Every technical term gets a plain-language gloss underneath** — *"In plain terms: …"* — smaller, muted. Keep the jargon; add the translation.

### `/pricing` — "إزاي بنحاسب" / "How we charge"
Honest, structural, no "Contact sales" wall. **This page already exists in the product and its numbers are computed, not typed** — every rate is read from the live platform configuration and every worked example is produced by the same pure functions the settlement engine uses, so the page can never show a split the engine wouldn't actually produce. Design it to preserve that: the rates and the worked examples are *data*, not copy. Do not hardcode a percentage into a headline.

The full model to design around is in §9.2.

### Also design
`/security`, `/changelog`, `/contact`, a 404, and the **empty / error / loading states** for anything interactive.

---

## 4. MOTION & MICRO-INTERACTIONS

Motion is the difference between "nice" and "expensive" — but only when it is **causal**. Every animation answers *what changed and why*. Decorative motion is worse than none.

### 4.1 The system
- **Durations:** micro 120–180ms · standard 240–320ms · scene 500–700ms. Nothing over 900ms.
- **Easing:** one custom cubic-bezier with a fast out and a soft settle (`cubic-bezier(.2,.8,.2,1)`) as the default; springs only where something is dragged or thrown.
- **Stagger:** 40–60ms between siblings, never more than 6 in a chain.
- **Scroll-driven animation via native CSS** (`animation-timeline: view()` / `scroll()`) wherever possible, with a JS fallback. Don't load a heavy animation library to do what four lines of CSS now do.
- **View Transitions API** for page navigation — header and footer persist, the body cross-fades, the hero title morphs.
- **`prefers-reduced-motion` is not an afterthought.** Under it, every timeline resolves instantly to its final frame — the static markup *is* the final frame. No timeline may exist without a rest state.
- **Budget:** animate only `transform` and `opacity`. Nothing that triggers layout. Steady 60fps on a **mid-range Android** — this market is mobile-heavy and not on flagship phones. Marketing-site JS under 150KB gzipped.

### 4.2 The micro-interaction catalogue (build these)
1. **Magnetic-lite CTA** — the label shifts 2–3px toward the cursor with a spring; the border reveals on hover. Disabled on touch.
2. **Link underline that draws from the reading edge** — left-to-right in English, **right-to-left in Arabic**. This one detail signals the site was designed for Arabic, not translated into it.
3. **Number roll-up** — figures count into place once on first viewport entry, with tabular figures so nothing shifts width mid-count.
4. **The commit gesture** — when a money action or a section "closes", it lands with a small overshoot and a physical settle. In RTL, any rotation mirrors. Whatever form this takes in your concept, it must feel like something *happened*, not like something faded.
5. **Divider reveal** — section separators draw from 0 to 100% as they enter, ~400ms, from the reading edge.
6. **Interface-fragment parallax** — screenshots translate at ~0.94× scroll speed. Subtle enough to feel, never enough to notice.
7. **Cursor-aware ambient light** — a soft highlight tracks the pointer across the hero surface at low opacity. Pointer-fine only.
8. **Live counter tick** — the counter-board fragment's head count increments once while in view, with its row flashing an accent edge. Sells "this is live software" in half a second.
9. **Tab morph** — the sub-nav indicator slides between items via a shared layout transition, never fade-out/fade-in.
10. **Input focus** — a **2px accent outline at 2px offset**, product-wide, never a translucent 3px ring. An outline draws outside the border box: it never reflows, never clips, and survives forced-colors mode.
11. **Copy-to-clipboard on codes** — student code / receipt number copies on click, 900ms checkmark swap, `aria-live` announcement.
12. **Theme toggle cross-fade** — via View Transitions, radiating from the toggle's own coordinates, 320ms.
13. **Scroll progress** — a 1px line under the header fills with reading progress. No percentage number.
14. **Form validation** — inline, on blur, never on keystroke; the message pushes content with a height transition rather than overlaying it.
15. **Focus-visible everywhere** — full keyboard traversal of the whole site with a consistent visible focus treatment. Tab through it yourself before calling it done.

---

## 5. ACCESSIBILITY (hard requirements, not aspirations)

- WCAG 2.2 AA minimum. 4.5:1 on all body text in **both** themes.
- Semantic landmarks, one `h1` per page, a correct heading ladder, a skip-to-content link.
- Every interactive element keyboard-reachable and operable, with a visible focus state.
- All motion suppressible via `prefers-reduced-motion`.
- Real `alt` text on interface fragments describing *what the screen shows*, not "screenshot".
- Touch targets ≥ 44×44px.
- Respects `prefers-contrast: more` and forced-colors mode.

---

## 6. BILINGUAL & RTL — ARABIC IS CO-PRIMARY

- **Design the Arabic version first**, then the English. Not the reverse.
- Full RTL: `dir="rtl"` mirrors layout, iconography, arrows, progress direction, sub-nav order, and the reading-edge of every animation.
- **Arrows point along the reading axis.** In Arabic, "next" is `←`. A `→` in an RTL sentence points backward at what was already read.
- **Never letter-space Arabic.** It is a connected script; tracking breaks the joins. Write the Arabic type branch with **no letter-spacing property at all**, so it cannot be set wrongly.
- **Numbers, codes and currency stay LTR** and bidi-isolated (`<bdi>` / `unicode-bidi: isolate`) inside Arabic sentences — otherwise `1,250 ج.م` renders scrambled.
- Use Western Arabic numerals (0–9) — what this market reads on receipts.
- Choose Arabic display and body faces with genuine editorial quality; load per-script subsets.
- **Test the worst-case row explicitly:** a long Arabic student name, a Latin reference code (`TRX-…`), and a 7-digit amount, in one table row, in RTL. Arabic runs both longer and shorter than English depending on phrasing — both directions break layouts.

---

## 7. TECHNICAL DELIVERABLE

- **Next.js (App Router) + TypeScript + Tailwind v4**, with CSS custom properties as the token layer. Server-render everything; ship minimum client JS.
- **Design tokens first.** Define color / type scale / spacing / radius / elevation / motion as named tokens in one stylesheet, then build only from tokens. No raw hex or arbitrary pixel values in component code. **Name the tokens by role, not by value** (`--ink-2`, not `--gray-600`) so the palette can move without a rename.
- Self-host all fonts (`woff2`, per-script subsets, `font-display: swap`, preload the display face only).
- Images as `AVIF`/`WebP`, correctly sized, `priority` only on the hero.
- Fully responsive: **360 / 768 / 1024 / 1440 / 1920**. Design the 360px view deliberately — it's the majority view for this audience.
- Complete metadata: per-page `<title>` + description, Open Graph + Twitter cards, `hreflang` for `ar` and `en`, JSON-LD `SoftwareApplication` + `Organization`, `sitemap.xml`, `robots.txt`.
- Targets: Lighthouse ≥ 95 across the board; LCP < 2.0s and CLS < 0.05 on throttled 4G, mid-tier Android.
- **No horizontal scroll at any viewport, in either direction.** Wide content (tables, diagrams, code) scrolls inside its own container.

---

## 8. HOW TO WORK

1. **Propose 3 distinct art directions** per §2.1 — concept, palette, type pairing, signature move, wordmark. **Stop and wait for a choice.** Do not build.
2. Build the **token layer + shell** (header, footer, grid, type scale) and show it in **both scripts and both themes**.
3. Build the **hero**, in full, with its motion — and show its reduced-motion rest state.
4. Then the remaining home sections.
5. Then one role page as the template, then the other three plus `/trust`.
6. Then pricing, 404, and the empty/error/loading states.

At every stage, show **Arabic RTL beside English LTR**.

**Before declaring anything finished, self-audit against this list and report the result honestly:**
- [ ] Zero fabricated facts, logos, quotes or metrics anywhere on the page
- [ ] The site has **one identifiable concept**, visible in every section — not a stack of trends
- [ ] Contrast checked on every text token, in both themes, on every background it can land on
- [ ] Full keyboard traversal; visible focus everywhere
- [ ] Every animation has a rest state, and reduced-motion lands on it instantly
- [ ] Arabic tested with real long strings; **no letter-spacing on Arabic**; numbers LTR-isolated; arrows follow the reading axis
- [ ] **No monospace family applied to Arabic text** anywhere
- [ ] Every font token carries an inline `var()` fallback
- [ ] No horizontal overflow at 360px, in either direction
- [ ] Nothing from the §2.7 anti-list is present
- [ ] Tokens named by role, not by value
- [ ] **No legal-entity text of any kind in the footer** (§9.3)

---

## 9. SUPPLIED FACTS

### 9.1 Logo
**Design a new wordmark and mark from scratch.** There is no existing brand asset to inherit. Propose the wordmark alongside the three art directions in §2.1, so the mark and the type system are decided together rather than one being bolted onto the other. It must work in Arabic and Latin, at 21px in a footer and at hero scale, in both themes, and in a single ink.

### 9.2 The pricing model — real, and this is the whole of it

**Edura only earns when money actually moves.** There is no monthly platform subscription, no setup fee, no per-seat charge, and no minimum. A center that takes no payments pays nothing. Every charge below is taken at the moment of settlement, out of the transaction itself.

There are **three settlement shapes**, because there are three ways a lesson can be sold:

| # | Situation | What the platform takes | When |
|---|---|---|---|
| **A** | **Independent teacher, no center** — a student subscribes directly to a teacher | **15% commission** on the subscription | The moment the student pays |
| **B** | **Center course in a priced hall** — the center provides the hall to the teacher | A **three-way percentage split** (platform / teacher / center), configured per center or per hall by the operator | When the lesson is completed |
| **C** | **Center course with no hall pricing** | A flat **2 EGP from the teacher + 2 EGP from the center, per attending student** | When the lesson is completed |

**Design implications — read these, they change the page:**

- **Shape B has no fixed public number**, because the split is operator configuration, not a published rate. Do not invent one and do not write "starting from X%". Design the section so it explains the *mechanism* and shows a worked example driven by whatever the live configuration says.
- **These figures are defaults, not constants.** They are read at request time from platform configuration and are editable in the back office. Design every rate on the page as a **data slot**, never as baked-in copy — otherwise the marketing page and the ledger drift the first time a rate changes, which is the exact failure this product exists to prevent.
- **Show the arithmetic, not the rate.** The strongest thing this page can do is a worked example: a 60 EGP lesson, 20 students who attended, and the resulting three numbers — what the teacher gets, what the center gets, what the platform gets — laid out as a visible subtraction, with the teacher's share derived as the *remainder*. That is exactly how the engine computes it, and a reader who follows the subtraction has understood the business model completely.
- **Illustration inputs must be labelled as illustration.** In the existing page three numbers are chosen for the example (a 500 EGP monthly subscription, a 60 EGP lesson, 20 attending students) and they are the *only* invented figures on it. Keep that discipline and keep the label.
- **The honest headline is a sentence, not a number:** *"We take a share of what you collect — nothing else."* Lead with that, then prove it with the table and the worked example.

### 9.3 Legal entity line in the footer — DECIDED: there is none. Omit it entirely.

There is no registered entity yet. **The footer ships with no legal line at all.** This is a settled decision, not a gap to fill — do not ask for one, do not work around it, do not flag it as missing in the design.

Specifically:

- **No placeholder of any kind.** Not `[Company Name]`, not "© 2026 Edura LLC", not greyed-out sample text, not a lorem line, not a "pending" chip rendered on the page. A visible placeholder on a public page is worse than its absence.
- **Do not invent a company name, commercial registration number, tax ID, or address.** On a site whose entire argument is that its records can be trusted, a fabricated legal record is the single worst thing that could appear on it.
- **Design the footer so a line can arrive later without a redesign.** Account for the slot structurally — correct spacing, correct type role, correct position — just unoccupied. The footer must look *finished* as it stands, not like something is missing.
- Mark the insertion point with a **code comment**, so the developer who can eventually fill it will find it. Never a visible marker.

A plain `© 2026 Edura` copyright line is fine — that is not a legal-entity claim.

### 9.4 Real numbers permitted on the site
**None from marketing.** Use structural proofs only — verifiable facts about how the system is built (e.g. how many tables are append-only, that row isolation is enforced in the database itself, that no write is unattributed). No customer counts, no revenue processed, no uptime percentage, no growth figures.
