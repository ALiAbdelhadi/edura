# الدفتر / The Ledger — Constitution

**Read this before writing a line of UI.** It is the first document every portal session
opens. It assumes no prior conversation.

> **STATUS (2026-08-11): this document is FUNCTIONAL, not visual.**
> The Ledger *visual* system it was written alongside is retired. Its palette, type
> pairing, surface treatment and ornament no longer describe this product — the marketing
> site is being redesigned from scratch, and the portals will follow. What survives, and
> what this file is kept for, is the set of **behavioural invariants** governing how money
> is shown and committed: the quoted figure equalling the ledger's (§1), the two-step
> commit with an amount-carrying confirm button (§2), per-record commit state, every
> intermediate figure naming its actor, and excluded capabilities being absent rather than
> disabled. Those hold under any skin, and five files in the money path cite them.
>
> Read every colour, font and pixel value below as **historical**. Read every rule about
> what the interface must *tell the reader* as **in force**.
>
> The companion documents (`DECISIONS.md`, `REQUESTS.md`, `HANDOFF.md` and the three
> `DECISIONS-proposed-*.md`) were deleted on 2026-08-11 along with the visual system;
> they recorded the coordination protocol for a five-session parallel build that has since
> finished. Links to them below are dead and are left in place rather than rewritten,
> because editing them away would misrepresent what this document said at the time.
> They are recoverable from git history if a decision ever needs to be looked up.

---

## 1. The idea

> The interface's form is derived from what the system actually guarantees.

The database is append-only. `transactions` and `points_ledger` carry
`REVOKE UPDATE/DELETE`. Money is integer piasters. Receipts are sequenced. Every write
is attributed. *Therefore* the interface must not look editable, must show the whole
computation before the commit, must make the moment of permanence felt, and must name
the actor.

Paper, monospace, hairline rules, double-rule totals, the seal, the two-step commit —
these are **consequences**. They are not the system. The system is: **the interface
tells the truth about what the software guarantees.**

That distinction is what makes the idea generative. Each surface rests on a different
guarantee, so the same principle produces different forms. When you hit a screen this
document does not mention, you are not stuck — you derive it (§2).

### The devices, and why each exists

Carry the reason, not the rule. Every one of these becomes a **lie** where its reason
does not hold.

**Monospace for every figure.** Not typographic taste. It separates *what the system
computed* from *what a human wrote*. A figure in a proportional face reads as prose and
invites doubt about whether it is authoritative. Because the ledger is append-only, a
user cannot correct a figure afterwards — so they must be able to trust it beforehand.
It also fixes Latin-inside-Arabic, which is why it earns its place in an Arabic-first
product specifically. → `<Num>`

**The two-step commit.** It makes irreversibility *felt at the moment it occurs*.
Applying it to a reversible action is dishonest — it claims permanence where there is
none, and every time it is spent on something recoverable it is worth less where
permanence is real. This is a stronger reason than "it prevents mistakes."
→ `<TwoStepCommit>`

**The button carries its own amount.** The operator authorises a specific number, not a
category of action. A button reading "Approve" asks for consent to something unnamed.

**Every intermediate figure shown, nothing pre-summed.** A total the user cannot derive
is a total they must trust blindly. Append-only means they cannot correct it afterwards,
so they must be able to check it beforehand.

**The double rule on totals.** A borrowed accounting convention that says *this line is a
conclusion, not another row*. It belongs anywhere a number is a sum the user is expected
to act on — and nowhere else. → `.rule-total`, `<MoneyTotalCell>`

**The seal, and the single-animation budget.** One animation in the entire product, spent
on the one moment something became permanent. Motion is a scarce signal here; spending it
on transitions is spending it on nothing. → `.seal-in`

**Paper, not glass.** A record is consulted and signed. A dashboard is browsed. The
austerity is a claim about what kind of object this is.

**The actor is never absent.** `النظام` for automated writes rather than a blank. An
unattributed action in an audited system is a gap the interface should not create.

---

## 2. The derivation method

For every screen you touch, answer two questions and write the answer down:

> **What does the system actually guarantee here?**
> **What would the interface have to do to be honest about it?**

One line per screen is enough, but it must be there. Worked examples:

**Student wallet.** The balance is derived from an append-only ledger with a
database-level non-negative floor. It is not a stored number — it is a consequence of
history. An honest interface shows it as derived: every figure traceable to the entries
that produced it. A bare balance with no lineage is the same lie as an editable-looking
amount field.

**The guardian messaging gate.** A minor with no guardian email on file has an *empty
contact list*, with no explanation on that screen. The system's truth is: *this is
switched off because a protection is active, and one specific thing switches it on.* An
empty list says "you have no one," which is false and reads as a broken app. The honest
form states the reason, names the remedy, and carries the field that applies it. It
should read as protective, not as an error.

**Offline attendance.** The outbox syncs later; conflicts resolve server-wins. The truth
for any single record is: *this may not have reached the server yet.* A receptionist who
cannot tell will check the student in twice. So commit state belongs **per record**, not
in a global banner — the interface's honesty here directly prevents a data problem.
→ `<CommitState>`

**Parent oversight.** Strictly read-only, minors only, approved links only, adult threads
only, disclosed to both sides. That is not a set of restrictions to work around — **it is
the feature.** Present the limits as the product and make read-only *look* read-only. No
affordance may imply a write the API will refuse.

**Blacklist cascade.** Every withdrawal is journalled so a restore can replay it. The
truth: *this action has consequences you cannot see from here, and they are recorded so
they can be undone.* Show the cascade before the commit. It is the most consequential
non-money action in the product and deserves the decision-panel treatment.

**Walk-in registration.** An account exists with no credential; the claim link is
single-use; the family may have no email at all. The copyable fallback is what a
phone-only family walks out with. Design it to be legible **when read aloud across a
counter** — that is what the guarantee actually requires.

### When the system lacks a pattern

Derive it rather than inventing a style. State: what the system guarantees on that
surface, what the interface must do to be honest about it, which existing primitive it
extends, and which nav group it belongs to. **If the answer requires a new colour, a
second font, or a second animation, the derivation is wrong** — go back to the guarantee.

The value of this system is that it is small enough to hold in one head. Adding to it
costs more than it looks.

---

## 3. Relationship to the record, per role

The back-office thesis — *an operator signing a record* — does not transfer to four of
the six portals. Its foundation does.

A student does not sign the ledger. They are **written into one they do not control**:
attendance recorded by someone else, grades entered by someone else, payments permanent,
messaging gated by a rule they did not set. So the honest interface for a student answers
a different question: **what has been written about me, and what can I actually change?**

| Portal | Relationship to the record | What the interface owes them |
|---|---|---|
| Student | written into it | see what's recorded; know what you can change |
| Parent | permitted to read it | the limits, stated as the feature |
| Teacher | writes into it, and is paid from it | signer, exactly as in the back office |
| Assistant | writes on another's behalf | whose behalf, permanently visible |
| Center admin | operates the record | signer, plus the consequences before the commit |
| Center staff | writes at speed under pressure | did it commit — answerable in one glance |

Concretely, for the written-into portals:

- **Show the record, with lineage.** Attendance, payment and grade history as *entries*,
  not summaries.
- **Be explicit about agency.** Where a student can act (pay, enrol, add a guardian
  email, message a teacher) the affordance is present and direct. Where they cannot
  (correct a grade, undo a payment, alter attendance) there is no affordance, and where
  it matters, a plain statement of who can.
- **Never imply an action that will be refused.** This portal's users are mostly minors;
  an interface that dangles a control and then denies it teaches them the system is
  arbitrary.

---

## 4. The four adaptations

Each is derived, not a preference. If you find yourself adding a fifth, justify it from
§1 or do not add it.

**Density.** `compact` serves an operator scanning 166 rows. It does not serve a student
on a 390px screen, and it actively fails a receptionist tapping one-handed with a queue
in front of them.

| Density | Portals | Spec |
|---|---|---|
| `compact` | superadmin · teacher · center admin · assistant | 34px header, 7px cells |
| `comfortable` | student · parent | 42px header, 13px cells |
| `touch` | center staff check-in | **48px min target, 16px min type, 12px min gap, nothing actionable at 12px** |

**Ceremony.** Two-step commit is for irreversible writes only. Marking a lesson complete,
sending a message, saving a profile — one press. The reason is not friction management;
it is that claiming permanence where there is none is a lie.

**Warmth.** The back office is deliberately austere because a record should be. Student
and parent surfaces carry identical tokens but may use `--indigo-soft`, `--teal-soft` and
the initials-tile pattern more generously for orientation and identity. **The permitted
range is fills and tiles — never a new hue, never a gradient, never a second font.**

**Chrome.** A sidebar is desktop furniture. Student, parent and staff on phones get
bottom navigation: same three-group logic, collapsed to 4–5 destinations, active state as
the indigo bar rotated above the item. → `<BottomNav>`, already wired into
`DashboardShell` via the `bottomNav` prop.

---

## 5. The counter — the surface furthest from a ledger

`center_staff` check-in deserves separate treatment because it is where the ledger
metaphor is weakest and the underlying principle strongest.

A receptionist is standing, one-handed, with a parent and a queue waiting. **Deliberation
is the wrong virtue here; certainty is the right one.** The honest interface answers one
question instantly: *did this commit, or is it queued?*

- The student code input is the first focusable element, numeric keyboard, with the last
  five check-ins beneath it for immediate correction.
- Every state visible without scrolling: found · not found · needs payment · already
  checked in · queued offline.
- `counterCheckin` returns a structured `needs_payment` error carrying `pricePerSession`
  and `courseTitle`, so check-in chains directly into payment. The API already models the
  Egyptian center pattern correctly — design it as **one continuous flow**, not two
  screens with a modal between them.
- The cash step is a money action, so it keeps mono figures, the double-rule total and
  the two-step commit — but the armed state sits at the bottom of the viewport, reachable
  by thumb (`<TwoStepCommit density="touch">`). The ceremony is preserved; its ergonomics
  are not.

---

## 6. Direction, theme, and the Arabic script

All of this is **settled**. Do not re-derive it; apply it.

### 6.1 The eyebrow — the Arabic form

The eyebrow is the system's primary hierarchy marker: every section label, nav group
label and table header.

The Latin form is `10px / 600 / 0.12em uppercase` in IBM Plex Mono. **Arabic can carry
none of its three properties:** it has no case (uppercase is inert), it is a connected
script (letter-spacing breaks the joins), and IBM Plex Mono ships no Arabic glyphs (the
text silently falls back and the mono guarantee is lost with no visible error). Applied
verbatim, the eyebrow degrades to plain small text in the product's *primary* language
while rendering fully in the secondary one.

**Resolution — the marker is the shared invariant.** A 2×9px rule at the start edge, in
both scripts. Case, tracking and mono become the Latin-only variant; weight, size and
word-spacing are the Arabic one.

```
--eyebrow-marker-w: 2px   --eyebrow-marker-h: 9px   --eyebrow-marker-gap: 7px
Latin   10px / 600 / 0.12em uppercase / IBM Plex Mono
Arabic  12px / 700 / word-spacing 0.1em / IBM Plex Sans Arabic — no case, no tracking, no mono
```

12px, not 10: 10px Latin caps have a ~7px cap band and Arabic needs more size to match
optically. 11 reads under-weight; 13 out-ranks the items below it; 600 collides with the
body-emphasis weight. `word-spacing` is the honest substitute for tracking — it widens
the space character only and never touches the joins.

**Use `<Eyebrow locale={locale}>`.** Script is chosen by locale, never by a caller flag.
Pass `script="latin"` only for genuinely Latin strings inside an Arabic page
(`back office`, `SLA 48h`, `TRX-`, `⌘K`, `DD MMM YYYY`) — the reason for the Latin form
is the *script*, not the language setting.

### 6.2 Bidi — the separator problem

`·`, `-`, `—`, `:` and `()` are **bidi-neutral**. Between an LTR run and an RTL run their
placement is resolved by the paragraph direction, not by authorial intent — so
`PAY-2026-0431 · مدرّس فيزياء` does **not** render as written inside an RTL page, and the
separator migrates to the wrong side of the code.

**Rules:**
1. Each run gets its own isolated element with explicit direction. `<Num>` isolates its
   own content — that is a large part of why it exists.
2. **The separator is rendered by the component, never typed into the copy.**
   `<StatusBadge age>` and `<IdentityCell>` both do this already.
3. **Never fix a bidi break by reordering the source string.** The next translation
   reintroduces it.

Verify against the real seeded data, which is the worst case by design: Arabic names
beside `ovsdemo-*@edura.test`, `TRX-` refs, 7-digit amounts and `DD MMM YYYY` dates in one
row.

### 6.3 Numerals — two paths, never one with a flag

| | `<Num>` — **data** | `<ProseCount>` — **prose** |
|---|---|---|
| digits | Latin | Arabic-Indic |
| face | IBM Plex Mono | IBM Plex Sans Arabic |
| `tabular-nums` | yes | no |
| direction | isolated | flows with the sentence |
| use | money, IDs, dates, codes, table figures, counts ≥3 | small inline counts in prose where agreement matters |

They are **separate components** because merging them behind a boolean is unsafe: Plex
Mono has no Arabic-Indic glyphs, so `font-mono` on `٣` falls back silently and
`tabular-nums` stops applying. A flag lets a caller reach that state by accident; two
components cannot.

Arabic marks **three** grammatical numbers — singular, DUAL, plural — and the plural
switches again above ten. `يومان`, never `٢ أيام`. `<ProseCount forms={…}>` handles it.

### 6.4 Direction decisions — made once, held everywhere

- **Money alignment.** Numeric columns are **end-aligned**, in both directions. In RTL
  `end` is the left edge, so every amount aligns left while its Arabic label aligns
  right. Deliberate: a column of figures is only scannable when digits line up on the
  side magnitude grows toward, and that side does not change with the script.
- **Column order in RTL.** Identity first at the **start** edge; the decisive net figure
  at the **end** edge. Do not flip a table wholesale — that puts the conclusion where the
  eye enters rather than where it lands.
- **Time in charts.** The time axis **follows the chart**, not the page: time runs left
  to right in both locales. A time series is read as a shape, and mirroring it inverts
  the meaning of "rising". Enforced by the LTR island in `<ChartFrame>`. Categorical axes
  are unaffected.
- **The seal's rotation.** `rotate(-6deg)` **does not mirror** in RTL. It is a physical
  metaphor — a stamp pressed slightly askew — and a stamp does not mirror when you turn
  the page around.
- **Icons.** See `<DirectionalIcon>`. **The rule: an icon flips if it points along the
  reading axis; it does not flip if it depicts an object.** Chevrons, arrows, back/next,
  progress, steppers, sort carets and the sidebar collapse flip. Lock, shield, clock,
  calendar, search, bell, wallet and the logo mark do not. A clock does not flip — time
  is not read along the text axis.
- **Shadows.** `--lift` is directional light and **does not mirror**.

### 6.5 Dark mode is not a token swap

The system's stated identity is *paper, not glass* — a claim that this object is a
record. Dark mode is inherently glass. The position: **dark mode is the same record under
different light, not a different product.**

Four things break when tokens are merely swapped, all load-bearing:

- **Hairlines.** `--rule` at 1px is the structural element and the hardest thing to keep
  visible. Verify at typical brightness on a real screen, including OLED, and including
  table row dividers at `--rule-2` where contrast is lowest by design.
- **The double rule on totals.** 2px double resolves to two hairlines with a gap — the
  most likely element to disappear entirely, and it carries the meaning *this is a
  conclusion*. `.rule-total` draws from `--ink`, not `--rule`, for exactly this reason.
- **Semantic weight.** Teal, amber and red must carry the same *urgency*, not the same
  hue value, against a dark field. Red still reads as the only irreversible thing; amber
  still reads as waiting rather than warning; no row carries two saturated colours.
- **The seal.** Its border, `--seal`, and its animation all re-checked against `--sheet`.
  It marks permanence; it must remain the most legible thing in its row.

Mechanism stays `[data-theme="dark"]` — **not `.dark`, not next-themes.** Honour
`prefers-color-scheme` for the initial value; the explicit choice persists over it.

### 6.6 Contrast — corrected values

These differ from the original handoff because the handoff's values fail WCAG AA. Do not
"restore" them.

| Token | Handoff | **Corrected** | Why |
|---|---|---|---|
| `--ink-3` light | `#8b91a1` | **`#707686`** | 2.91–3.15:1 on the three surfaces |
| `--ink-3` dark | `#7c7e78` | **`#888a84`** | 3.83–4.40:1 |
| `--teal` light | `#0d7d72` | **`#0a7a6f`** | 4.34:1 on `--teal-soft` |

A 12/600 badge sits below the 18.66px large-text threshold, so **4.5:1 applies to badge
pairs.** Verified passing after correction: amber 4.63 / teal 4.52 / red 6.27 / indigo
10.50 / neutral 5.17 (light); all ≥5.2 (dark). `--ink-2` passes on all three surfaces in
both themes.

---

## 7. Ownership

### The worktree plan — what each session owns

Five sessions, five worktrees. Verified against the import graph 2026-07-27, not assumed.

| Session | Owns |
|---|---|
| Superadmin | `apps/superadmin/**` |
| Student | `features/student/**` · `dashboard/student/**` |
| Parent | `features/parent/**` · `dashboard/parent/**` |
| **Teacher + Assistant** | `features/teacher/**` · `dashboard/{teacher,assistant}/**` |
| **Center admin + Staff** | `features/admin/**` · `dashboard/{admin,staff}/**` |

The last two are **one session each, not two**, and that is a measured result rather than a
convenience:

- `dashboard/assistant/**` imports **five** screens from `features/teacher/**` —
  affiliations, attendance, classes, gradebook, materials. The assistant portal is largely
  the teacher's screens under a delegation strip.
- `dashboard/staff/**` imports **seven** from `features/admin/**` — checkin, rooms,
  students, student-detail, staff-finance, portal-home, reports.

Split either pair across worktrees and both sessions edit the same files.

### Shared feature directories — the recommendation per folder

The brief's three options were: convert here in the foundation session · assign to one
portal session with the others building against it · defer to a sixth session. One
recommendation each, with the reason. **These are recommendations, not settled decisions —
the operator picks before the five sessions start.**

| Directory | Portals | Recommendation | Why |
|---|---|---|---|
| `features/notifications/**` | all six | **convert here** | It is a *single* screen rendered by six portals. Cheapest to do once, now, and it unblocks all five. |
| `features/settings/**` | all six | **convert here** | Same shape: one screen plus two cards. The briefs currently tell four sessions they "may be first" on it, which is a race on shared code. |
| `features/messaging/**` | all six | **defer to a sixth session** | The largest shared surface, and its semantics — the guardian gate, oversight disclosure, blocks, minors — belong to no single portal's guarantee. The parent's disclosure pattern appears on the student's side too, so it cross-cuts two sessions by construction. |
| `features/attendance/**` | teacher · student · parent · assistant | **assign to Teacher + Assistant** | That session owns the marking and door surfaces and holds the deepest attendance semantics. The other three consume the read-only view unchanged. |
| `features/team-notes/**` | admin · teacher · staff · assistant | **assign to Center admin + Staff** | Four of its seven import sites are admin-side, and the board is a center operations tool. |
| `features/onboarding/**` | admin · student · teacher | **assign to Student** | The student wizard (academic year + track) is the most complete of the three, and the student brief already claims the onboarding archetype. |
| `features/collaboration/**` | admin · teacher | **assign to Center admin + Staff** | Symmetric feature, but the center holds the room and schedule inventory that acceptance writes against. |

Treat every one of them like `packages/ui`: if you do not own it, raise a request.

### Nobody touches these without a request

- **`packages/ui/**`** — the entire shared layer. If you need a change, write a
  `REQUESTS.md` entry. Do not fork a component into your portal.
- **`apps/www/src/components/refine/dashboard-shell.tsx`** — shared by **all six** www
  portals. Your `layout.tsx` declares `navGroups` / `bottomNav`; the shell renders them.
- **`apps/www/src/messages/{ar,en}.json`** — app-wide chrome (`nav`, `navGroup`,
  `actions`, `auth`, `common`, `roles`, `status`, `theme`). Two sessions editing this
  collide.
- **`apps/www/src/messages/{ar,en}/shared.json`** — used by six feature areas.
- **`packages/database/**`, `packages/server-core/**`** — schema and services. A design
  pass does not change them. A design that genuinely requires a schema change stops and
  proposes a plan first.

### Shared feature directories — coordination points

These are imported by **more than one portal**, so they are not owned by a portal
session:

| Directory | Imported by |
|---|---|
| `features/messaging/` | all six |
| `features/notifications/` | all six |
| `features/settings/` | all six |
| `features/attendance/` | teacher · student · parent · assistant |
| `features/team-notes/` | admin · teacher · staff · assistant |
| `features/onboarding/` | admin · teacher · student |

Treat them like `packages/ui`: raise a request rather than editing across sessions.

### The security boundary — untouchable

The security fixes, the money engine, the auth/session model, RLS/data-isolation, and the
assistant delegation boundary are **untouchable**. A design change must never weaken
them; UI changes stay on the presentation layer. In particular:

- Never render an amount as an editable input. Amounts are append-only.
- Excluded capabilities are **absent, not disabled**. A disabled control teaches that the
  capability exists and is being withheld.
- Assistants message **as themselves**, never impersonating — an adult must never appear
  to a minor under another identity.

---

## 8. The verification matrix

Two directions × two themes. **Every screen, every state.** Density and breakpoint
multiply it further, so verify direction and theme on *all* screens and states, and
density and breakpoint on a representative set per portal.

Every screen needs a real **empty · loading · error · offline · permission-denied**
state. None a bare text line. Each verified in dark. Note that *empty*, *error* and
*permission-denied* are three different truths — `<EmptyState tone>` distinguishes them,
because telling a user "no results" when they simply lack permission is a lie about the
data.

State-specific checks that fail in only one cell of the matrix, and are therefore the
ones usually missed:

- Long Arabic names in `compact` density, truncating mid-word or breaking a column
- A 7-digit amount plus `ج.م` in the narrowest money column, RTL
- Empty and error states in dark — usually designed light-only and inherited
- The armed commit button in dark, where `--red` on `--sheet` must still read as escalation
- Toasts, popovers and dialogs, which use `--lift-2` and are commonly missed in the dark pass
- Focus rings on both canvases: `2px --indigo` at `2px` offset, on `--paper` and `--sheet`,
  both themes (`.focus-ledger`)
- **Charts in RTL and dark together** — axis labels sit in an LTR island inside an RTL
  card on a dark field. The single most fragile combination in the product.

### Done means

- Every data figure is Latin mono and tabular; every prose count is Arabic-Indic in the
  body face with correct agreement; the two are visibly distinct.
- Every money figure carries currency and direction, and aligns identically in both
  directions.
- No bidi break anywhere: no separator on the wrong side of a code, no reordered string
  used as a fix.
- No irreversible money action is one press anywhere, and each names its amount.
- Every table column has an accessible name; every pending badge shows its age; every
  rejection shows its reason.
- `ar` and `en` at string parity; no hard-coded copy; no tracking on Arabic.
- `touch` verified on a real phone, one-handed, by someone who has not used the app.
- **No screen implies a capability the system does not have.** This is the test the whole
  document exists to enforce. Check it last and check it deliberately.
