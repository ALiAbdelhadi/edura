# The screen inventory

Every route in `apps/erp`, every tab inside those routes, and the state each
screen is actually in against today's dev database. Produced by
`probe.spec.ts`, which signs in as each role and reads the DOM — a file listing
of `src/app/**/page.tsx` gives the routes and stops there, because **tabs are
in-page state, not routes.**

Raw data: [`probe.json`](./probe.json). Re-probe with

```
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config=tools/system-shots/playwright.config.ts
```

against an already-running dev server on :3002. The run merges into
`probe.json` rather than overwriting it, so probing one portal does not empty
the rest.

**Nothing here has been captured yet.** This is the list Ali picks from.

---

## How to read the columns

| Column | Meaning |
|---|---|
| **rows** | `<tr>` / `[role=row]` count under `<main>` |
| **EMPTY** | the screen rendered its own empty state |
| **403** | an XHR under the page was refused — usually a permission tier working correctly, noted where it is |
| **Shoot** | `19` = one of ASSETS.md's curated slots · `lib` = candidate for the Phase-3 library · `no` = not worth a marketing image |

> ## ⚠️ THE `rows` COLUMN IS NOT A VERDICT ON WHETHER A SCREEN IS POPULATED
>
> It counts table rows. `/dashboard/admin/rooms` reported `rows=0` while showing
> three fully-detailed hall cards, and `/dashboard/admin/schedule` reported
> `rows=0` while showing six lessons laid across a week grid with hall names and
> a "لا تعارضات" banner. A `cards` counter was no better — the schedule grid is
> neither.
>
> **Three slots were wrongly called BLOCKED on that basis and are not.** The
> probe is reliable for TABS, HTTP health, 403s and 429s — all of which are
> DOM-or-network facts. "Is this worth photographing" needed eyes, and every
> row below marked `19` has since been looked at.

Locale is **Arabic, light, desktop 1440×900** everywhere unless the row says
otherwise. That is ASSETS.md's rule, not a preference.

---

## The accounts this inventory was probed with

All demo, all `is_demo = true`, password `Passw0rd!`.

| Role | Account | Center | Notes |
|---|---|---|---|
| Center owner | `admin@nile-academy.eg` | Nile Educational Academy (`NILE`) | thin fixture — 2 students |
| Center owner | `showcasedemo-marwan@edura.test` | سنتر النيل التعليمي (`SHOWCASE01`) | **the rich one** — 12 students, 4 priced courses, 35 completed lessons |
| Center owner | `extdemo-mona@edura.test` | سنتر النيل التعليمي (`EXTDEMO0001`) | the only center with off-system teachers |
| Teacher | `hossam.aziz@nile-academy.eg` | NILE | `counter_only` |
| Teacher | `showcasedemo-hossam@edura.test` | SHOWCASE01 | **`counter_and_door`** — the only mode with a door screen |
| Parent | `mona.hassan@email.eg` | — | 2 children |
| Student | `lina.hassan@student.nile-academy.eg` | NILE | |
| Assistant | `showcasedemo-nour@edura.test` | assists showcasedemo-hossam | |
| Staff — manager | `showcasedemo-tarek@edura.test` | SHOWCASE01 | reaches every staff screen |
| Staff — receptionist | `showcasedemo-laila@edura.test` | SHOWCASE01 | reaches four fewer, on purpose |
| Staff — accountant | `showcasedemo-salma@edura.test` | SHOWCASE01 | not probed yet |

**Never sign in as `tarekaboelnasr999@gmail.com`.** It is the real
super_admin account on this database and it is a real person's address.

---

## 1. Center portal — `/ar/dashboard/admin`

Role `center_admin`. This is the **CENTER** portal, not the superadmin app.

Rows are from `admin@nile-academy.eg` unless marked ⭐, which is the
showcase center and always the better fixture.

| Route | Tabs | rows | State | Shoot |
|---|---|---|---|---|
| `/dashboard/admin` | — | 0 | ⭐ **READY** — 11 700.00 ج.م revenue · 6 behind on payment · 21 students / 3 teachers / 4 classes · 70% attendance · 1 lesson today | **19** `role-center` |
| `/dashboard/admin/counter` | **`سجّلوا الحضور` / `لم يسجّلوا`** (`role="tab"`) | 0 / ⭐6 unchecked | Needs `seed:counter-demo` re-run — its times are computed at seed time | **19** `counter-board` (clip) + `center-counter` |
| `/dashboard/admin/checkin` | — | 0 | Counter check-in by student code | lib |
| `/dashboard/admin/students` | — | 2 / ⭐12 | Roster. **Shoot ⭐** | lib |
| `/dashboard/admin/students/[studentId]` | — | 5 | `…/students/08b929d8-c147-569d-a426-7640dcb0c611` (⭐) | lib |
| `/dashboard/admin/teachers` | — | 2 | | lib |
| `/dashboard/admin/classes` | — | 3 | | lib |
| `/dashboard/admin/enrollment-requests` | — | 0 | **EMPTY everywhere** | no — needs seeding |
| `/dashboard/admin/schedule` | — | 0 | ⭐ **READY** — 6 lessons across the week, each with time, subject, teacher and hall, plus a "لا تعارضات" banner. The `rows=0` was my counter, not the screen | **19** `center-ops` |
| `/dashboard/admin/rooms` | — | 0 | ⭐ **READY** — 3 halls with capacity, price, facilities, and the **`لكل طالب حاضر`** per-student-rate badge ASSETS.md asks for | `center-ops` fallback |
| `/dashboard/admin/external-teachers` | — | 1 / 2 | Populated only as `extdemo-mona@edura.test` | lib |
| `/dashboard/admin/external-teachers/[teacherId]` | — | — | not probed; ids exist under extdemo | lib |
| `/dashboard/admin/external-teachers/gaps` | — | **17** | Strong screen. `extdemo-mona` only | lib |
| `/dashboard/admin/fees` | — | 2 | | lib |
| `/dashboard/admin/expenses` | — | 1 | | lib |
| `/dashboard/admin/reports` | — | 0 | ⭐ **READY** — 11 700.00 ج.م revenue · 8 755.00 ج.م expenses · net profit · 88% attendance · revenue-by-class chart | **19** `center-money` |
| `/dashboard/admin/staff` | — | 0 | Genuinely empty — the three sub-roles are not listed | superseded: `center-team` now shoots `/dashboard/staff/reports`, §6 |
| `/dashboard/admin/notes` | — | 0 | EMPTY | no — needs `seed:teamnotes-demo` (absent) |
| `/dashboard/admin/audit` | — | 0 | | lib (weaker than `staff` for `center-team`) |
| `/dashboard/admin/messages` | — | 0 | EMPTY | no — needs a messaging seed (absent) |
| `/dashboard/admin/notifications` | — | 0 | | no |
| `/dashboard/admin/settings` | — | 0 | | no |
| `/dashboard/admin/tour` | — | — | first-run tour; gated on `user_prefs.tour_completed` | lib, optional |

---

## 2. Teacher portal — `/ar/dashboard/teacher`

| Route | Tabs | rows | State | Shoot |
|---|---|---|---|---|
| `/dashboard/teacher` | — | 1 | EMPTY-ish | no |
| `/dashboard/teacher/attendance` | — | **10** | The register. The close-lesson preview is a dialog, not on the page | **19** `role-teacher`, `teacher-teaching`, `settlement-confirm` |
| `/dashboard/teacher/door` | — | 0 | EMPTY for `hossam.aziz` — he is `counter_only`. Use `showcasedemo-hossam` | lib |
| `/dashboard/teacher/classes` | — | **44** | Densest list in the product | lib |
| `/dashboard/teacher/centers` | — | 1 | ⭐ **READY** as `showcasedemo-hossam` — an incoming request from سنتر الأفق التعليمي carrying subject, year, hall, days, time and expected students, with قبول / رفض | **19** `teacher-manage` |
| `/dashboard/teacher/grades` | — | 2 | | lib |
| `/dashboard/teacher/materials` | — | 2 | | lib |
| `/dashboard/teacher/reviews` | — | 1 | | lib |
| `/dashboard/teacher/team` | — | 0 | assistants list | lib |
| `/dashboard/teacher/notes` | — | 0 | | no |
| `/dashboard/teacher/wallet` | — | 0 | ⭐ **READY** as `showcasedemo-hossam` — 2 366 ج.م balance, available-to-withdraw, and a ledger of `commission` entries | **19** `teacher-wallet` |
| `/dashboard/teacher/messages` | — | 0 | EMPTY | no |
| `/dashboard/teacher/notifications` | — | 0 | | no |
| `/dashboard/teacher/settings` | — | 0 | attendance-mode setting lives here | lib |

---

## 3. Parent portal — `/ar/dashboard/parent`

`mona.hassan@email.eg`, 2 children — the child selector has real work to do.

| Route | Tabs | rows | State | Shoot |
|---|---|---|---|---|
| `/dashboard/parent` | — | 0 | | no |
| `/dashboard/parent/children` | **`عبر رمز العائلة` / `عبر البريد الإلكتروني أو الهاتف`** | 2 | Two children listed | **19** `parent-children` candidate |
| `/dashboard/parent/children/[studentId]/id` | — | 0 | The child's ID card, parent-side | lib |
| `/dashboard/parent/attendance` | — | 0 | EMPTY | `parent-children` alt — needs attendance for these children |
| `/dashboard/parent/progress` | — | 1 | EMPTY | alt |
| `/dashboard/parent/pay` | **`مواد الابن` / `كل المواد`** | 0 | EMPTY, and the probe was **429-throttled** here | **19** `role-parent`, `parent-pay` (**phone**) — recheck |
| `/dashboard/parent/fees` | — | 1 | EMPTY, 429 | no |
| `/dashboard/parent/wallet` | — | 0 | EMPTY, 429. `seed:parentpay-demo` IS present under `paydemo.*@edura.demo` — **probe the wrong parent** | recheck |
| `/dashboard/parent/oversight` | — | 0 | | lib |
| `/dashboard/parent/messages` · `/notifications` · `/settings` | — | 0 | | no |

> The parent rows marked 429 are **not trustworthy**. The login rate limiter
> throttled the sweep and a throttled screen renders its empty state, which
> looks exactly like a screen with no data. Re-probe the parent portal alone,
> and probe `paydemo.mona@edura.demo` too — that is the account the
> parent-pay demo seed built.

---

## 4. Student portal — `/ar/dashboard/student`

| Route | Tabs | rows | State | Shoot |
|---|---|---|---|---|
| `/dashboard/student` | — | 0 | | no |
| `/dashboard/student/subjects` | **`موادي` / `تصفح الكل`** | 0 | The track-vs-browse-all split, which is the domain rule | **19** `role-student`, `student-learn` (**phone**) |
| `/dashboard/student/courses` | **`موادي` / `تصفح الكل`** | 0 | **Renders the same heading and the same tabs as `/subjects`** — see §9 | no (duplicate) |
| `/dashboard/student/schedule` | — | 4 | | **19** `role-student` right half |
| `/dashboard/student/attendance` | — | 0 | | lib |
| `/dashboard/student/grades` | — | **6** | | lib |
| `/dashboard/student/materials` | — | 0 | | no |
| `/dashboard/student/practice` | — | 0 | EMPTY | no |
| `/dashboard/student/reviews` | — | 1 | EMPTY | no |
| `/dashboard/student/id` | — | 0 | The card. Code + QR render | **19** `student-card` (**phone**) |
| `/dashboard/student/wallet` | — | 4 | Has entries | lib (ASSETS.md deliberately leaves `student.money` unillustrated) |
| `/dashboard/student/family` | — | 1 | family code | lib |
| `/dashboard/student/messages` · `/notifications` · `/settings` | — | 0 | | no |

---

## 5. Assistant portal — `/ar/dashboard/assistant`

Probed as `showcasedemo-nour@edura.test`, who assists a `counter_and_door`
teacher — `sara.fawzy@nile-academy.eg` cannot reach the door screen at all
because her teacher is `counter_only`.

| Route | Tabs | rows | State | Shoot |
|---|---|---|---|---|
| `/dashboard/assistant` | — | 0 | EMPTY | no |
| `/dashboard/assistant/attendance` | — | 6 | **The on-behalf-of attribution must be visible** — that is the whole point of the shot | **19** `role-assistant` |
| `/dashboard/assistant/door` | — | 0 | ⭐ **READY** — the live lesson, 5 counter-passed students with names + codes + `تأكيد`, a code field and card-scan, under the on-behalf-of banner. The XHR 403 is `GET /api/v1/teacher/attendance-mode` refusing assistants — see §9 — and it does NOT stop the screen rendering | **19** `assistant-door` (**phone**) |
| `/dashboard/assistant/classes` | — | **16** | | lib |
| `/dashboard/assistant/collaborations` | — | 1 | EMPTY | no |
| `/dashboard/assistant/grades` | — | 8 | | lib |
| `/dashboard/assistant/materials` | — | 4 | | lib |
| `/dashboard/assistant/notes` | — | 0 | | no |
| `/dashboard/assistant/messages` · `/notifications` | — | 0 | EMPTY | no |
| `/dashboard/assistant/settings` | — | 0 | XHR 403 | no |

---

## 6. Center staff portal — `/ar/dashboard/staff`

Two rows per screen, because **the sub-role is the interesting part.**

| Route | Tabs | manager | receptionist | Shoot |
|---|---|---|---|---|
| `/dashboard/staff` | **`سجّلوا الحضور` / `لم يسجّلوا`** | 0 (6 unchecked) | same | lib |
| `/dashboard/staff/checkin` | — | 0 | 0 | lib |
| `/dashboard/staff/students` | — | 12 | 12, **403** | lib |
| `/dashboard/staff/rooms` | — | **403** | **403** | no |
| `/dashboard/staff/collaborations` | — | 0 EMPTY | — | no |
| `/dashboard/staff/finance` | — | **403** | **403** | no |
| `/dashboard/staff/reports` | — | **4** | **0 + 403** | **the permission-tier shot** — see below |
| `/dashboard/staff/notes` · `/messages` · `/notifications` · `/settings` | — | 0 | — | no |

> **`/dashboard/staff/reports` side by side is the strongest candidate for
> `center-team`** — the manager sees four rows, the receptionist sees a
> refusal, from the same URL. ASSETS.md asks `center-team` to show "the three
> sub-roles side by side… the permission tiers are the point", and
> `/dashboard/admin/staff` currently renders zero rows. This is the same claim,
> with evidence.
>
> Note the manager is also 403 on `rooms` and `finance`. Worth confirming that
> is intended rather than a fixture gap before it is photographed.

---

## 7. Public routes — no session

| Route | State | Shoot |
|---|---|---|
| `/`, `/login` | Login page. **Carries dev quick-login tiles** (`NODE_ENV !== production`) | no — the tiles must never ship in an image |
| `/register`, `/onboarding` | | lib |
| `/pricing`, `/faq`, `/help`, `/help/[slug]`, `/contact`, `/changelog`, `/privacy`, `/terms` | Marketing/legal — **`apps/www` is the public site**, these are the in-app copies | no |
| `/forgot-password`, `/reset-password`, `/two-factor` | `reset-password` renders "رابط إعادة التعيين غير صالح" without a token | no |
| `/claim`, `/invite/accept`, `/guardian/verify` | All render their invalid-link state without a token | no — would need minted tokens |
| `/centers/[id]` | 4 rows for the showcase center | lib |
| `/courses/[id]` | EMPTY | no |
| `/c/[payload]` | The card QR scan target. **Needs a signed payload** — do not fabricate one | lib, if a demo card is minted |
| `/receipts/[paymentId]`, `/reports/print`, `/student-id/print` | Print routes | lib |
| `/ui-preview`, `/receipt-preview`, `/[id]`, `/[...rest]` | Internal/dev | no |

---

## 8. The six blockers — all cleared (2026-08-16)

Three were real and were fixed by seeding; three were **my measurement error**
and were never blocked at all.

| Slot | Verdict | Now |
|---|---|---|
| `teacher-wallet` | real | 2 366 ج.م and a full ledger — `settled-lessons-demo-seed` |
| `center-money`, `role-center` | real | 11 700 ج.م revenue, 8 755 ج.م expenses — `showcase-payments-demo-seed` + `showcase-live-demo-seed` |
| `assistant-door` | real | 5 counter-passed students, codes, confirm buttons — `showcase-live-demo-seed` |
| `teacher-manage` | real | a pending collaboration request on the SAME teacher as the other teacher plates |
| `center-ops` | **wrong** | 3 halls with capacity/price/rate badges, and a 6-lesson week grid across halls. Always worked |
| `center-team` | **wrong-ish** | `/dashboard/admin/staff` really is empty, but the substitute is better — ASSETS.md updated |

### 8.1 Settlement — done

The showcase center had 35 completed sessions, 274 present attendance records,
and **zero transactions**: its seed set `sessions.status = 'completed'` directly
instead of running the settlement engine, so no lesson ever distributed.

[`settled-lessons-demo-seed.ts`](../../../../packages/database/prisma/settled-lessons-demo-seed.ts)
POSTs each undistributed lesson to the app's own
`POST /api/v1/sessions/:id/complete` and lets `completeSession` →
`distributeSessionRevenue` do the work. No INSERT into `transactions`,
`wallets` or `payments` — the **NO SECOND MONEY ENGINE** invariant honoured by
not having a second engine in the file at all.

**35/35 settled, 0 failed** → 408 transactions, center wallet 2 853.00 ج.م,
teacher wallets 3 801.20 ج.م, at 46.88–87.50 ج.م per student per lesson.

### 8.2 Revenue — done, and it needed a SECOND money path

Settling lessons did not move revenue, and that is correct product behaviour
rather than a bug: `getNetProfitReport` and the center home derive revenue from
**`payment` rows**, not settlement transactions. Revenue is what students paid;
a settlement is where that money went.

[`showcase-payments-demo-seed.ts`](../../../../packages/database/prisma/showcase-payments-demo-seed.ts)
charges each enrolment through `POST /api/v1/center/subscriptions` — the
counter's own cash route, `createWalkInSubscription` → `settleSubscriptionMoney`
— again with no direct money write.

**15 charged, 0 failed** → 11 700.00 ج.م collected. **Six enrolments are left
unpaid deliberately**, so "طلاب متأخرون عن السداد" still reads 6. A center
where everyone has paid has nothing in the arrears counter, and that counter is
half of what the center home exists to show.

### 8.3 The live fixture — done

[`showcase-live-demo-seed.ts`](../../../../packages/database/prisma/showcase-live-demo-seed.ts),
idempotent, with a working `--purge` (it owns no money rows):

- **a lesson running right now** for the `counter_and_door` teacher, times
  computed from the Cairo clock at seed time;
- **5 counter-passed students** (`counter_only`, `counterAt`/`counterBy` set,
  `doorAt` NULL) — the exact state the door screen exists to resolve, and not
  `present`, so it stays clear of the distribution engine;
- **a pending collaboration request**, center-initiated from سنتر الأفق
  التعليمي to the same showcase teacher already being photographed, so the
  `teacher-manage` plate shows the same desk as `role-teacher` and
  `teacher-wallet`;
- **5 expenses** (8 755.00 ج.م) via the owner-only `POST /api/v1/expenses`, so
  net profit is not a 100% margin against zero costs.

### 8.4 `counter-board` — works, but the seed is time-sensitive

`seed:counter-demo` computes its lesson times from the Cairo clock **at seed
time**. It was last run on 2026-08-10 and its "lesson running now" now reads
00:00–00:42. **Re-run it on the day of the shoot**, along with
`showcase-live-demo-seed`.

## 9. Five things found on the way that are not mine to fix

**Ranked. The first two are defects, not cosmetics.**

1. **`GET /api/v1/sessions?to=YYYY-MM-DD` silently drops that day's lessons if
   they are stored at noon.** The filter builds `lte: new Date(to)`, and
   `new Date("2026-08-16")` is **midnight**, so a session at `T12:00:00Z` on the
   `to` date is greater than `lte` and disappears from its own day. The showcase
   seed stores sessions at noon; `counter-demo-seed` stores them at midnight,
   which is the only reason the counter board works and the door screen did not.
   Two conventions in the fixtures, one of which the API cannot see.
   `showcase-live-demo-seed` follows the midnight convention deliberately.

2. **`GET /api/v1/teacher/attendance-mode` returns 403 to an assistant.**
   CLAUDE.md decision #9 says delegation covers everything the teacher can do
   *including the attendance-mode setting*, so this looks like a real hole in
   the delegation grant. It does not block the door screen from rendering, but
   the screen cannot read the mode it exists to serve.

3. **The collaboration-request status renders as the raw English enum
   `pending`** in the middle of an otherwise fully Arabic table.

4. **`/dashboard/student/courses` and `/dashboard/student/subjects` render the
   same heading (`المواد الدراسية`) and the same two tabs.** One of them is
   probably dead. Not touching it — flagging it.
5. **The API rate limiter throttles a signed-in sweep**, not just login. Eight
   parent-portal screens 429'd on the first pass. Harmless here (the probe now
   paces itself), but a real user clicking quickly through their own portal
   would hit the same wall.

---

## 10. Seed status on this database

| Seed | Present | Prefix |
|---|---|---|
| base | ✅ | `@nile-academy.eg` |
| preview | ✅ | `preview.*` |
| showcase-demo | ✅ | `showcasedemo-*` |
| counter-demo | ✅ | `counterdemo-*` — **re-run before shooting** |
| studentid-demo | ✅ | `iddemo-*` |
| extteachers-demo | ✅ | `extdemo-*` |
| bulkimport-demo | ✅ | `bimpdemo-*` |
| reportexport-demo | ✅ | `rexpdemo-*` |
| weeklydigest-demo | ✅ | `wdigdemo-*` |
| guardianver-demo | ✅ | `gverdemo-*` |
| parentpay-demo | ✅ | `paydemo.*@edura.demo` |
| **settled-lessons** | ✅ new | no accounts — settles existing lessons |
| **showcase-payments** | ✅ new | no accounts — charges existing enrolments |
| **showcase-live** | ✅ new | no accounts — lesson/request/expenses |
| **oversight-demo** | ❌ | `ovsdemo-*` |
| **messaging-demo** | ❌ | `msgdemo-*` — would populate every `/messages` screen |
| **roomrate-demo** | ❌ | `roomratedemo-*` — **not needed**, the showcase center already has halls and rates |
| **teamnotes-demo** | ❌ | `teamnotesdemo-*` — would populate every `/notes` screen |

**Shoot-day order** (both are clock-dependent):

```
bun run --filter @repo/database seed:counter-demo
bun --env-file=.env prisma/showcase-live-demo-seed.ts
```

---

## 11. Phase 3 — the extras worth shooting

The library is not "every screen". A shot earns a place only if it proves a
capability none of the curated nineteen already prove. That rules out most of
the 119 routes: eight `/messages`, eight `/notifications`, eight `/settings`
and six `/notes` screens are the same two components repeated per portal, and
photographing them eight times each is 30 files that say one thing.

**Selected — 22 shots, Arabic light desktop unless noted.**

### The differentiators (shoot first — nothing else in the product does these)
| Shot | Route | Account | What it proves |
|---|---|---|---|
| `admin-extteachers-gaps` | `/dashboard/admin/external-teachers/gaps` | extdemo-mona | 17 rows of off-system reconciliation — a center running teachers who are not on the platform, still counted |
| `admin-extteachers-list` | `/dashboard/admin/external-teachers` | extdemo-mona | the same teachers as records |
| `parent-oversight` | `/dashboard/parent/oversight` | mona.hassan | the child-safety gate — nothing else on the market shows this |
| `student-family` | `/dashboard/student/family` | lina.hassan | the family code that links a parent without an email |
| `admin-audit` | `/dashboard/admin/audit` | showcase | every back-office write attributed |
| `teacher-team` | `/dashboard/teacher/team` | showcase-hossam | assistants, and who acts on whose behalf |

### The daily work
| Shot | Route | Account | What it proves |
|---|---|---|---|
| `admin-checkin` | `/dashboard/admin/checkin` | showcase | check-in by student code, no card needed |
| `admin-students` | `/dashboard/admin/students` | showcase | the roster, 12 rows |
| `admin-student-detail` | `/dashboard/admin/students/08b929d8…` | showcase | one student's whole file |
| `admin-fees` | `/dashboard/admin/fees` | showcase | who owes what |
| `admin-expenses` | `/dashboard/admin/expenses` | showcase | the cost side of net profit |
| `admin-classes` | `/dashboard/admin/classes` | showcase | groups and their teachers |
| `teacher-classes` | `/dashboard/teacher/classes` | showcase-hossam | 44 rows — the densest list in the product |
| `teacher-grades` | `/dashboard/teacher/grades` | showcase-hossam | the mark book |
| `teacher-materials` | `/dashboard/teacher/materials` | showcase-hossam | files to a specific group |
| `teacher-door` | `/dashboard/teacher/door` | showcase-hossam | the teacher's own fallback for the door |
| `staff-checkin` | `/dashboard/staff/checkin` | showcase-laila | the receptionist's counter |
| `assistant-attendance` | `/dashboard/assistant/attendance` | showcase-nour | on-behalf-of attribution over a register |

### The student and parent phone
| Shot | Route | Account | Notes |
|---|---|---|---|
| `student-schedule` **phone** | `/dashboard/student/schedule` | lina.hassan | 4 lessons |
| `student-grades` **phone** | `/dashboard/student/grades` | lina.hassan | 6 rows |
| `student-wallet` **phone** | `/dashboard/student/wallet` | lina.hassan | 4 entries |
| `parent-children` **phone** | `/dashboard/parent/children` | mona.hassan | the two-child selector |

### Deliberately NOT shot
- **All `/messages`, `/notifications`, `/settings`, `/notes`** — one component
  per portal, repeated. If messaging is ever wanted, seed `msgdemo-*` and take
  **one** shot, not eight.
- **`/login` and `/register`** — the login page carries dev quick-login tiles.
- **`/pricing`, `/faq`, `/help`, `/privacy`, `/terms`, `/changelog`** — the
  in-app copies of pages `apps/www` IS.
- **`/claim`, `/invite/accept`, `/guardian/verify`, `/reset-password`** — all
  render an invalid-link state without a minted token; a screenshot of "هذا
  الرابط لم يعد صالحًا" advertises a dead end.
- **`/dashboard/*/tour`, `/ui-preview`, `/receipt-preview`, `/[id]`,
  `/[...rest]`** — internal.
- **`/dashboard/admin/enrollment-requests`** — genuinely empty everywhere.
- **`/dashboard/student/practice`, `/reviews`, `/materials`** — empty for the
  demo student.
