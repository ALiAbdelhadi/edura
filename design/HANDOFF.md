# Foundation session — handoff

Branch `claude/portal-teacher-assistant-30d42a`, from `1528c1e`. 2026-07-28.

> **Read this first: Part C has now landed — the five portal sessions can start.**
> The shared component layer is promoted into `packages/ui` with re-export shims, so no
> existing call site changed. Part D is partially done (nav grouping, count badge,
> localized labels, the payouts/payments rename); the §3.2 header and wiring the bottom
> nav into the three phone portals remain. See §6.

---

## 1. What landed

### Step 1 — the Ledger token layer ✅
`packages/ui/src/styles/globals.css` rewritten. Ledger tokens canonical
(`--paper`/`--sheet`/`--field`/`--ink*`/`--rule*`/`--indigo*`/`--teal`/`--amber`/`--red`/
`--seal`), two-level `--lift`, radii 12/8, `[data-theme="dark"]` preserved.

The legacy "Deep Trust" vocabulary survives as a **marked alias block**, not a second
palette — ~143 call sites across five sessions' folders made renaming reckless (D-01).
Verified in-browser: `--background`→`#14161c`, `--card`→`#1b1e26`, `--primary`→`#93a4e6`,
`--sidebar`→`#1b1e26` (the near-black slab is dead), `--shadow-lg`→`--lift-2`.

Per-app stylesheets cleaned: the `.ant-*` blocks, `.display`, Plus Jakarta Sans,
`.shadow-card`/`.shadow-ring` and the hardcoded scrollbar/selection hexes are gone.

### Step 0 — `<Num>`, `<ProseCount>`, `<Eyebrow>` ✅
`packages/ui/src/components/num.tsx` and `eyebrow.tsx`. IBM Plex Mono wired in both apps.
Two numeral paths kept as two components (D-04); the Arabic eyebrow drops face, tracking
and transform (D-05). Verified: `.num` and `font-mono` both resolve to
`"IBM Plex Mono", … ` with `tabular-nums`.

### Part A ✅ (with two deviations, §3)
- **A.1** teacher `assignments` route + nav entry removed. Student's deliberately kept — §3.
- **A.2** contrast sweep run as a real matrix. **Three values in Handoff I §2.2 fail WCAG AA**
  and are corrected (D-03): `--ink-3` light `#8b91a1`→`#6a7183`, `--ink-3` dark
  `#7c7e78`→`#888a84`, `--teal` light `#0d7d72`→`#0d7a6f`.
- **A.3** charts moved onto the token layer. New shared bridge
  `packages/ui/src/lib/chart-tokens.ts`; the 7-hue palette in `lib/analytics/transforms.ts`
  and its duplicate in `features/student/grades-screen.tsx` are gone. Gridlines `2 4`
  `--rule`, axis labels mono 10 `--ink-3`, gradient area fills removed — all four chart
  wrappers across both apps.
- **A.4** the legacy token layer is marked as a migration shim with its exit path.
- **A.5** ⚠️ **not possible** — `DESIGN.md` does not exist at the repo root. Nothing to
  rewrite or mark stale. No file anywhere carries `#1E3A8A`, `#0D9488`,
  `surface-container-` or `on-surface-variant`.
- **A.6** ✅ **every nav entry in both apps resolves to a real route.** The
  «الذكاء الاصطناعي» / «المساعدة المالية» / «إدارة الصلاحيات» entries the brief warns
  about **exist only in a design export, not in code** — nothing to remove. No chatbot
  surface is wired.

### Part B ✅ — confirm, not convert
The app is genuinely logical-properties-clean. Across both apps and `packages/ui`:
`ml-`/`mr-`/`pl-`/`pr-`/`border-l`/`border-r`/`text-left` = **0**; `left-` = 1;
`text-right` = 10; raw physical CSS = 1. The icon flip rule is recorded as a rule, not a
list (D-13). No mass conversion performed or needed.

### Part C ✅ — the shared component layer
Promoted into `packages/ui`, each with a re-export shim left in both apps' `kit/` folders
so **no call site changed**:

`MetricCard` (was `StatCard`) · `StatusBadge` · `DataTable` · `PageHeader` · `EmptyState` ·
`DescriptionList` · `Combobox` · `Spinner` · `PasswordInput` · `ConfirmDialog`.

Plus the four new primitives: **`CommitButton`** (the two-step commit),
**`CommitStateIndicator`** (per-record outbox state), **`DelegationStrip`**,
**`ConnectionBanner`**, and **`BottomNav`**.

Three design decisions worth knowing before you build against them:

- **`DataTable` takes its strings as props**, not from a translation hook. That keeps
  `packages/ui` framework-agnostic and is the fix for the audit's finding that pagination
  and sort `aria-label`s shipped as hardcoded English. Each app's shim injects next-intl.
  Also gained: three densities (`compact` default / `comfortable` / `touch`),
  `stickyFirstColumn` for the gradebook, row selection driving a decision panel, row
  links, per-row disabled states, and a real accessible name on every column.
- **`MetricCard` accepts `filled`/`accent`/`trend`/`trendValue` and ignores them.**
  Handoff I §7.2 says delete the gradient variant; deleting the props would break 8 call
  sites across folders owned by other sessions. They are documented as deprecated no-ops
  and come out as each portal converts.
- **`CommitButton` disarms on `resetKey` change, Escape, unmount and commit**, and
  announces the armed transition via `role="status"` + `aria-pressed`. Without that a
  screen-reader user presses twice having been told nothing changed — the exact failure
  the two-step exists to prevent.

### Part D — partial
- ✅ The 9 untranslated nav labels are fixed; `ar`/`en` at parity across `nav`,
  `navGroup` and `actions` in both apps.
- ✅ The duplicate is killed: `nav.payouts` → «مستحقات وصرف», `nav.payments` →
  «مدفوعات الطلاب». Both previously rendered «المدفوعات».
- ✅ **Grouped nav.** `NavItem` gained an optional `group`; the shell renders labelled
  sections with a mono `<Eyebrow>` header. Superadmin's 16 flat items are now three
  groups (الإشراف / الأموال / التواصل والرقابة) — the audit's headline nav finding.
  Backwards-compatible: a layout passing no groups renders flat exactly as before, so the
  seven other layouts are untouched and each session adds its groups when it converts.
- ✅ **Count badge** is now amber-on-amber-soft, mono, with an accessible name —
  replacing the bare `aria-hidden` red dot.
- ✅ **Header rebuilt** to §3.2: 60px, `--sheet`, bottom rule, 24px inline padding. The
  backdrop blur is gone — a translucent bar over a paper canvas reads as glass, the one
  material this system is defined against. The notification bell is **out of the header**;
  it lives in the nav group with a counted, named badge.
- ✅ **Bottom nav wired** into student, parent and staff. It takes *hrefs*, not a second
  item list, so it is a VIEW of `navItems` and cannot drift out of sync with the sidebar.
  "More" opens the existing mobile sidebar sheet rather than a second menu. Verified at
  375px in RTL: four destinations + المزيد, the active indigo bar rotated above the item,
  and the sheet opening from the correct side with all 13 destinations.

**Two pieces of §3.2 are deliberately NOT rendered**, because they describe capabilities
the system does not have:

- **The financial cycle.** `periodStart`/`periodEnd` exist only per-invoice and
  per-payout, chosen by whoever generates a batch. There is no global cycle entity, no
  "current cycle", and no closed-ledger flag. Hardcoding `01 — 15 JUL 2026` would state a
  scope the system does not enforce. The slot is built (`scope` prop); wiring it needs a
  schema decision, which per CLAUDE.md requires an approved plan first.
- **The command search + `⌘K` chip.** No command palette is mounted in either app, and
  superadmin has no search endpoint at all (www's `/api/v1/search/*` are domain-browse
  endpoints for students, not back-office command search). A search box that searches
  nothing is the same class of lie as a nav entry with no destination. The slot is built
  (`search` prop).

Both are slots waiting for real backing, not omissions — which is the constitution's own
rule applied to the constitution's own spec.

### Part E ✅ — the coordination layer
`design/CONSTITUTION.md`, `design/DECISIONS.md`, `design/REQUESTS.md`.

---

## 2. Verification

| Check | Result |
|---|---|
| `pnpm check-types` | **6/6 pass** |
| `pnpm build` (both apps) | **2/2 compiled** |
| Token resolution (computed styles, live) | all Ledger + shim tokens correct, both themes |
| Mono pipeline | `.num` and `font-mono` → IBM Plex Mono + `tabular-nums` |
| Contrast matrix | 30 pairs measured; 3 failures found and corrected |
| Nav routes | every entry in both apps resolves |
| i18n parity | `ar`/`en` equal, both apps |
| Visual | login + center dashboard, light and dark, RTL |

**Environment note:** this worktree had no `node_modules` and no `.env`. I ran
`pnpm install` and symlinked `packages/database/.env*` + each app's `.env.local` from
`/Users/ali/edura`. The symlinks are gitignored and local-only.

---

## 3. Deviations — where I did not follow the brief, and why

**A.1 — the student assignments screen was NOT removed.** The brief states nav entries and
routes are already gone and only a stale student stat card remains. In fact both portals
had live routes, and they are different cases:

- Teacher's was a 3-line file rendering `TeacherGradebookScreen` — a duplicate destination
  for `/teacher/grades`, explicitly named for removal in the teacher brief. **Removed.**
- Student's is a real 149-line feature (`features/student/assignments-screen.tsx`) with its
  own data, stat cards, table and chart, reached from a live nav entry.

The brief's own reasoning for removing the student dashboard card was *"removing the
destination while leaving the claim made it worse — a consistent lie became a broken one."*
For students the destination exists and works, so the card is a **true claim**, not a lie,
and removing it would delete a working feature rather than finish a cleanup. Per A.6's
instruction to bring the list before removing anything beyond assignments, **this is that
list — it needs your decision.**

**Correction to my earlier report.** I told you the nav-label count was "off by more than
double" (22 in teacher+assistant alone). That was wrong. `dashboard-shell.tsx` translates
via a label→key lookup, so of 89 label strings only the ones missing from the map fall
through — **exactly 9**, matching the brief's figure and list precisely.

---

## 4. Worktree plan — verified against the import graph

**Teacher + assistant are correctly one session.** `dashboard/assistant` imports five
screens directly from `features/teacher/*`.

**The shared-folder set is wider than the briefs state**, and needs owners (D-14):

| Folder | Consumers | Named in briefs? | Assigned owner |
|---|---|---|---|
| `features/messaging/**` | all 6 | yes | sixth session, after the five |
| `features/notifications/**` | all 6 | "similar" | superadmin session |
| `features/settings/**` | all 6 | **no** | sixth session, after the five |
| `features/attendance/**` | 4 | **no** | teacher+assistant |
| `features/collaboration/**` | 2 sessions | **no** | teacher+assistant |

`features/settings` is the dangerous one: six-way shared, and the briefs say
"post it if you are first," which invites a six-way conflict in one 296-line file.

**The archetype matrix is corrected and published in `DECISIONS.md` D-15 as the single
authority.** The substantive correction: **the wallet is two archetypes, not one.** Student's
is money-*in* (`topUp`, `refund`); teacher's is money-*out* (`payout`, `withdraw`); they
share only a balance and a transaction list; and **no center wallet route exists at all**,
so "also in center" was wrong. The stated reason for teacher ownership ("ledger-derived
balance, H1 row lock, H2 CHECK") describes the shared money engine, not screen completeness
— and student's screen is in fact larger (264 vs 236 lines).

**i18n boundary:** message files are **not** split per portal. Each app has one
`src/messages/{ar,en}.json` with a shared `nav` namespace. That is a real coordination
point — any session adding a nav entry edits a file all five touch. Recorded in
`CONSTITUTION.md` §5.

---

## 5. Still missing from the component layer

Two items from the Part C list were **not** built, and both belong to whoever picks this up:

- **Row identity cell** — 30px initials tile + name + mono second line (email/code),
  `dir="ltr"` when Latin. Used in every table.
- **Money cell** — mono, end-aligned, leading `−` in `--red` for outflow, `+` in `--teal`
  for platform income, the decisive net figure 14/600 `--ink`.

Both are small and well-specified in Handoff I §4. They are listed here rather than
silently omitted because "every table uses them" makes their absence easy to miss.

## 6. What is safe to build in parallel now

**The five portal sessions can start.** The token layer, the numeral/eyebrow primitives,
the chart bridge, the promoted component layer and the three coordination files are all
landed and verified. Build screens against `@repo/ui` imports directly, not the app `kit/`
shims — the shims exist for the un-converted call sites, not for new code.

**Two caveats.** The row-identity and money cells (§5) do not exist yet, so a session
reaching a table with either should file a `REQUESTS.md` entry rather than invent one —
they appear in every portal. And the §3.2 header is unbuilt, so do not design around
financial-cycle chrome yet.

**Not verified visually:** the grouped superadmin sidebar. That app has no demo logins and
needs real `super_admin` credentials, which I did not have and did not guess at. The
grouping code path is exercised by `apps/www` (which renders through the identical
`navGroups` logic and was confirmed in-browser), and both apps typecheck and build — but
someone with credentials should eyeball the three groups before the superadmin session
starts.
