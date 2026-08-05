# Pre-launch walkthrough: ولي الأمر + السنتر

**Date:** 2026-08-04
**Scope:** the parent portal and the center portal in `apps/www`, walked end to end
against the **dev** database.
**Status:** §0 and §1–§6 are **fixed and merged**. §7 and §8 are open, and both
are open on purpose — see each.

> **A note on how these were fixed.** §1 onwards were fixed under a constraint:
> parallel sessions were reviewing the center, superadmin and teacher portals
> against this same repository, so nothing shared with those surfaces was
> touched. That is why §7 is still open despite being the smallest item here.

**Method.** Both roles were driven through the real UI in a browser against a real
dev server, signed in as real demo accounts. Every finding below was re-checked
against the source or against the database before being written down; the two
that are statements about behaviour under load (§2, §3) are recorded with the
observation that produced them.

> **Limitation, stated plainly.** The session that produced this walkthrough was
> long enough to be summarised part-way through, and the verbatim console text
> from the earlier center-side steps did not survive that. Rather than reproduce
> findings from memory, everything below was re-derived from the code and the
> database on 2026-08-04. A finding that could not be re-grounded that way is
> not in this document.

---

## 0. Fixed and merged already — the grading scale

Raised by Ali during the walkthrough: `/dashboard/parent/progress` reported
**«المعدل التراكمي العام 2.7»** and **«أفضل مادة B-»**. Neither means anything to
an Egyptian family.

The cause was wider than the screen. A percentage → US-letter → 4.0-GPA chain
existed in **four copies** (student screen, parent screen, student dashboard
route, teacher gradebook) and they had already drifted: the parent's copy
floored at `"D"` and had no failing band, so a child at 12% and a child at 61%
read the same letter.

Replaced by one dependency-free ladder, `@repo/database/grading-scale`:
ممتاز ≥ 85 · جيد جدًا ≥ 75 · جيد ≥ 65 · مقبول ≥ 50 · ضعيف < 50, pass at 50.
The band is derived from `score`/`maxScore` and never stored. Labels live in
`messages/{ar,en}` under `gradeBands.*`.

The same change unified how a subject percentage is computed — المجموع ÷ المجموع
الكلي everywhere — which closed a live discrepancy: the dashboard route averaged
per-assessment percentages while the parent screen summed marks, so **the same
child in the same subject read 75% to herself and 82% to her parent.**

Merged to main as `2d2ec33`.

---

## 1. The counter lookup returns children's names and phone numbers from other centers

**Severity: highest in this report.** Cross-tenant exposure of minors' contact
details.

> **FIXED — 2026-08-04.** See "How it was fixed" at the end of this section. The
> description below is kept in the past tense as the record of what was found.

- **Screen:** center counter check-in search box.
- **Step:** a receptionist types any name fragment.
- **Expected:** results scoped to this center's students, plus a student
  resolvable by their printed code (the walk-in case the feature exists for).
- **Actual:** the search runs platform-wide **by name and by phone**, and returns
  the phone number of every match regardless of whether that child has any
  relationship to this center.

`packages/server-core/src/services/attendance/checkin.ts:38` runs under
`platformDb` — RLS bypassed — and ORs five predicates:

```ts
OR: [
  ...(code ? [{ studentCode: code }] : []),
  { phone:    { contains: query } },
  { fullName: { contains: query, mode: "insensitive" } },
  { user: { name:  { contains: query, mode: "insensitive" } } },
  { user: { phone: { contains: query } } },
],
```

and every row is returned with `phone` filled in:

```ts
phone: p.user?.phone ?? p.phone,
onOurRoster: mine.some((r) => r.centerId === centerId),
otherCenters: mine.filter((r) => r.centerId !== centerId).map(...)
```

`onOurRoster: false` labels the row but does not withhold anything. The route is
`centerStaff(..., { allow: RECEPTION })`, so this is the *least* privileged center
role.

**Why the platform-wide read is not itself the bug.** Resolving a student who
belongs to another center is exactly what a walk-in needs, and `otherCenters`
shows the design intends it. The problem is that the **code** path — which is
specific, unguessable and check-summed — is ORed together with **name** and
**phone** substring matches, which are neither. One typed Arabic first name
returns a list of children across every center on the platform with their
numbers attached.

### How it was fixed

The project already held the right answer twenty lines away. The sibling lookup
`lookupStudentForManualEntry` — the dedup check run before a manual student
registration — documents exactly this policy and implements it:

> "The disclosure is tiered inside the service: a student already on this
> center's roster comes back in full … and one who exists elsewhere comes back
> MASKED with no id — enough for a human to say 'yes, that's him', not enough to
> build a directory out of."

The counter search now obeys the same rule, from the same code rather than a
second copy of it. `maskName` / `maskPhone` moved to
`packages/server-core/src/services/students/disclosure.ts`; both lookups import
them.

**Reach is split by what the query proves.** A student code whose check
character agrees, or a phone number given in full (≥ 8 digits, no letters), is
something the person at the desk supplied — those still reach the whole
platform, because a walk-in carrying another center's card has to resolve.
A name, or a short run of digits, proves nothing and now searches **this
center's roster only**.

**Disclosure is then tiered.** Our own student comes back in full. A student
reached by identifier but not held by this center comes back with a masked name
and a last-4 phone; `studentId` is still returned, because unlike the
manual-entry lookup this one must be able to check them in. Their `studentCode`
is echoed only when it is the code that was searched with — reached by phone
instead, the code would be new information about a child this center does not
have.

**Writing the proof found a second hole in the original masking.** `maskName`
returned a single-token name *unmasked* (`if (parts.length === 1) return
parts[0]`), so every mononym — and every `full_name` a receptionist typed as one
word, which is common — came back in the clear from the path whose whole job is
to prevent that. It affected `lookupStudentForManualEntry` too, and had been
live there since that feature shipped. Single tokens now mask to `أ.`.

Proof: `apps/www/tests/db/student-id-card.test.ts` §5b — free text finds a
roster student and **nobody** off it; a 5-digit fragment resolves nobody; a
valid code still reaches a student at another center but reads masked; a full
phone reaches them with the code withheld. Suite **52/52**; the sibling suite
`external-teachers.test.ts` **102/102**.

**Left as it was, deliberately:** `otherCenters` still returns the *names* of
the other centers a student attends. That is deliberate and user-facing — the
check-in screen shows a `crossCenterNote` warning built from it — and it is a
far smaller disclosure than a phone number.

**Not addressed here:** the endpoint is a `GET` with the query in the URL, so
names and phone numbers reach server logs and browser history. The sibling
endpoint is a `POST` for exactly that reason ("the identifiers are personal data
and must not end up in a URL, a server log or a browser history"). Making the
counter search POST is a client-and-route change beyond this fix, and is the
obvious follow-on.

---

## 2. A single slow request leaves the parent's money screen saying they have no children

> **FIXED — 2026-08-04.** The child list is fetched with
> `networkMode: "always"`, so a failed attempt retries and, if it keeps
> failing, lands in `isError` instead of pausing. The provider now reports
> `isLoading` from `isPending` (a paused query is pending but NOT loading —
> that gap is the whole bug) and exposes a `failed` flag, and the pay screen
> prints «تعذّر تحميل بيانات أبنائك» for it rather than «لا يوجد أبناء
> مرتبطون». Proven in the browser: with the page signalled offline the list
> refetched and **succeeded** where it used to park at
> `fetchStatus:"paused"`.

- **Screen:** `/dashboard/parent/pay` («ادفع لدرس»).
- **Step:** any request times out once (see §3), then navigate to the pay screen.
- **Expected:** the child selector resolves and the subject list renders.
- **Actual:** «لا يوجد أبناء مرتبطون بحسابك حتى الآن» — for a parent who has an
  approved child that the Children screen and the dashboard both display. It does
  not recover on navigation. Only a **hard reload** clears it.

Observed for `showcasedemo-emad@edura.test`, who has one approved child
(مريم الطوخي). `GET /api/v1/me/children` returned `200` with that child in the
body — confirmed in the network panel — while the React Query cache held:

```
["data","default","me-children","list",…]
status: "pending"   fetchStatus: "paused"   fetchFailureCount: 1
```

`ChildSelectorProvider` reads `result?.data ?? []`, so a paused query is
indistinguishable from a parent with no children, and
`parent-pay-screen.tsx` renders `parentPay.noLinkedChildren` on `!childId`.

**Why this matters more than a stale spinner.** The screen does not say "could
not load". It states, as fact, that the parent has no linked children — on the
screen where they pay for one. `navigator.onLine` was `true` throughout.

Same shape as the note already in `student-dashboard.tsx` ("a PAUSED retry leaves
isLoading false while no data has arrived") — the paid-for fix there was to key
the skeleton on the payload. The child selector has no equivalent guard, and
cannot distinguish the two states at all while it collapses them into `[]`.

---

## 3. The client gives up at 10s while the server is still working — and an intent is already created

- **Screen:** parent wallet → «شحن الرصيد».
- **Step:** first top-up after a cold start.
- **Expected:** the top-up proceeds, or fails cleanly with nothing written.
- **Actual:** a toast in **English** on an Arabic screen —
  `Request timed out: POST http://localhost:3053/api/v1/payments/parent-wallet-topup/initiate`
  — while the server log shows the same request completing:
  `POST /api/v1/payments/parent-wallet-topup/initiate 200 in 10.2s`.

`apps/www/src/lib/api/client.ts` sets `timeout: 10000, retry: 0`. The request
finished at 10.2s, so ky aborted a call the server had honoured: a
`payment_intents` row existed for a top-up the parent was told had failed.
Retrying created a second intent; the first stayed pending forever.

Three separate things here, in increasing order of seriousness:

1. **The message is untranslated** and leaks a localhost URL to the user.
2. **A timed-out `initiate` orphans a `payment_intents` row.** Harmless in mock
   mode. Against a real gateway, "the client stopped listening" and "the payment
   did not happen" are different facts, and this collapses them.
3. **It is what triggers §2** — the failure does not stay local to the screen
   that caused it.

The 10.2s itself is a dev-server first-compile artefact and not a production
figure. The behaviour when a request *does* exceed the timeout is not.

---

## 4. A non-approved child's ID card renders a blank page

> **FIXED — 2026-08-04.** `return null` is replaced by an explicit refusal.
> Measuring it first showed the cause was deeper than a missing branch: the
> 403 was being treated as a transport failure — retried, then PAUSED, with
> **no error ever set** — so the screen could not have told the parent why
> even if it had somewhere to print it. That query now runs
> `networkMode: "always"` and does not retry a 4xx, because nothing about a
> refusal changes by asking again. The screen reads «مش هتقدر تشوف البطاقة
> دي. الربط بينك وبين الطالب لسه مش معتمد.»

- **Screen:** `/dashboard/parent/children/<id>/id`.
- **Step:** open the card for a child whose link is `pending`.
- **Expected:** an explicit refusal.
- **Actual:** the chrome renders and the content area is **empty**. No message,
  no error, no console output.

**The gate itself is correct and was verified:**

```
GET /api/v1/me/student-card?studentId=8f24daf7-… → 403
{"error":{"code":"forbidden","message":"Not an approved child of this parent"}}
```

The screen simply has nowhere to put that:

```ts
// apps/www/src/features/student/student-id-screen.tsx
if (q.isLoading) return <PageSpinner />;
if (!payload?.card) return null;
```

Nothing is leaked; the parent is just left looking at a blank rectangle and
cannot tell it apart from a bug.

**Verified working alongside it:** the same route for the **approved** child
renders fully — card, QR, guilloché, `GEC6-PVD2`, print route and PNG export.

---

## 5. The parent-pay screen reads `_id` on a payload that has `id`

> **FIXED — 2026-08-04.** `childKey` is now exported from the child selector
> and used here, so the two cannot disagree about identity again. The hint
> reads «مواد شعبة مريم الطوخي.» and the confirmation dialog names the child.

- **Screen:** `/dashboard/parent/pay`.
- **Actual on screen:** the hint reads **«مواد شعبة .»** — the child's name is
  missing and the sentence ends on a bare full stop. The same value is used in the
  payment confirmation dialog.

```ts
// apps/www/src/features/parent/parent-pay-screen.tsx:298
const childName = children.find((c: any) => c._id === childId)?.name ?? "";
```

`/api/v1/me/children` returns `{ id, name, email, phone }` — there is no `_id`, so
the lookup never matches and `childName` is always `""`.

This is the **same bug the child selector already documents as fixed**:

> `components/ui/child-selector.tsx` — "This used to read `c._id`, which is always
> undefined on that payload… The bug was invisible for as long as no demo parent
> had an approved link."

It was fixed in the selector and left in place here. A parent confirming a
payment is shown a dialog that does not name the child being paid for.

---

## 6. Parent screens address the student in the second person

> **FIXED — 2026-08-04.** `StudentIdScreen` takes an explicit
> `audience: "student" | "parent"`; the parent route passes `"parent"` and gets
> «بطاقة الابن» / «بطاقة ابنك على المنصة — بيسجّل بيها حضوره…». The linking
> screen's link label uses the same `parentTitle` key.

- `parent-linking-screen.tsx:278` labels the child's card link with
  `t("studentIdCard.title")` → **«بطاقتي»** ("my card"), in the row for someone
  else's card.
- The card screen keeps the student's own heading and subtitle for the parent:
  **«بطاقتك الشخصية على المنصة — بيها بتسجّل حضورك في الحصة أو عند مكتب السنتر.»**

Reusing the student screen for the parent is a deliberate and good decision (one
screen, one authorization path, documented in the route file). The copy was not
adjusted with it.

---

## 7. The search box shows two clear buttons

> **NOT FIXED — deliberately.** `SearchInput` is shared with seven
> `apps/superadmin` screens and with `filter-bar`, and the superadmin portal
> is under review in a parallel session. Changing it would alter a surface
> someone else is walking through right now. It is one component and one
> commit whenever that review is done.

`SearchInput` renders its own clear affordance while the underlying element is
`type="search"`, which the browser also decorates. On the pay screen's subject
search both appear side by side (`× ×`). Cosmetic, one component, every screen
that uses it.

---

## 8. Demo/environment problems — not product defects, but they blocked the walkthrough

Recorded because the review brief named these accounts, and because they will
mislead the next person who uses them.

1. **`admin@nile-academy.eg` administers a center with almost nothing in it** —
   1 student, 1 room, 1 course, no sessions today. Counter check-in with cash
   could not be exercised on it at all; `showcasedemo-marwan@edura.test`
   (`SHOWCASE01`: 12 students, 3 rooms, 4 courses) was used instead.

2. **`extdemo-rania@edura.test` is a receptionist at a different center** than the
   owner account the brief pairs her with — `EXTDEMO0001`, not `NILE`. Comparing
   "what the receptionist sees" against "what the owner sees" compares two
   different centers.

3. **Two demo centers carry the identical Arabic name**, which is what makes (2)
   hard to notice:

   | name | short_id |
   |---|---|
   | سنتر النيل التعليمي | `SHOWCASE01` |
   | سنتر النيل التعليمي | `EXTDEMO0001` |
   | Nile Educational Academy | `NILE` |

4. **Two tables disagree about who owns `NILE`.** `center_admin_profiles` maps
   `admin@nile-academy.eg` → `NILE`, while `centers.owner_user_id` for that row is
   **NULL**. `SHOWCASE01` has both and they agree. `owner_user_id` is currently
   read by nothing outside the superadmin allowlist comment, so nothing breaks
   today — but there are two expressions of center ownership and one of them is
   already wrong.

---

## Verified working

Recorded so this document is not read as a defect inventory.

**Parent.** Sign-in; children list with link states (approved / pending) and the
correct actions per state; the approved child's ID card end to end (card, QR,
engraving, print route, PNG export); wallet top-up through the mock gateway
(1,000 EGP, ledger row, balance) ; paying for an approved child's lesson from the
parent wallet, producing `RCP-SHOWCASE01-2026-00001` with the ledger direction
still `student → center` as the money design requires; fees and receipts in
Arabic; progress and attendance.

**Center.** Counter check-in plus cash in one step, producing an attendance record
at `counter_only` and `RCP-SHOWCASE01-2026-00002`.

**The printed student code behaves exactly as specified.**
`resolveStudentCode` (`packages/database/src/queries/student-code.ts:143-167`)
strips `-`, space, `_` and the RTL/LTR marks, maps confusables, and then admits
the code **only if its check character agrees**:

- `A1Y0-0HDG` (grouped, as printed) → resolves.
- `A1Y00HDG` (ungrouped) → resolves, same student.
- a code with one character wrong → contributes **nothing** to the query, so the
  counter answers "not found" rather than silently resolving a different child.

That last property is the point of the check character, and it holds at the one
place it has to.

---

## The root cause behind §2 and §4, and what is still open

Both were the same mechanism, found by measuring rather than by reading: React
Query's default `networkMode: "online"` **pauses** a query whose attempt failed
until it believes the browser is back online, and a paused query reports
`isLoading: false` with no data and no error. Two different screens therefore
turned a transport failure and a 403 refusal into confident false statements —
"you have no children", and a blank rectangle.

Each was fixed on its own query. **The default is still app-wide**, so any other
screen that reads `isLoading` and then treats an empty result as fact has the
same latent bug. Setting the policy once on the QueryClient — never pause, never
retry a 4xx — is the real fix and was deliberately not attempted here: that file
is shared with every role, including the three under review in parallel
sessions.

---

## Not verified

- **The receptionist-vs-owner permission comparison** was not completed as a
  like-for-like test, because of §8.2 — the two accounts belong to different
  centers.
- **Anything requiring a live payment gateway.** `PAYMENTS_MODE=mock` throughout.

---

## Data written during the review

All of it was removed afterwards, at Ali's instruction, on 2026-08-04: 3
`transactions`, 2 `payments`, 2 `payment_intents`, 2 `subscriptions`, 2
`parent_wallet_ledger`, 2 `points_ledger`, 1 `attendance_records`, 5
`notifications` and 4 `audit_logs`, plus the parent wallet balance, the center
receipt counter and the two ref-number sequences reset to their prior values.
Dev now holds **zero rows across all nine money tables**.

Three `permission.granted` audit rows fall inside the same window but belong to
another session — they reference centers that do not exist — and were left
untouched.
