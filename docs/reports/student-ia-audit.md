# Student Portal — Information Architecture Audit

**Phase 1 (audit only). No code changed. Nothing implemented until approved.**

Scope: `apps/erp/src/app/[locale]/dashboard/student/**` and every feature it
renders (`apps/erp/src/features/student/**` plus the shared screens the student
routes mount: attendance, notifications, settings, messaging).

Date: 2026-08-20 · Reviewed against the repo as of `9e8ce65`.

---

## 0. Design Brief

Written before any proposal, per the design-master pipeline. The repo's own
design system outranks every skill, so most fields are **inherited, not
re-derived**.

```md
# Design Brief
Deliverable   : product UI — IA restructure of one portal (8 role portals exist)
Brand owner   : none (internal product)
Direction     : INHERITED — "Classical Ledger" (docs/decisions/classical-ledger-redesign.md).
                No new aesthetic direction is opened by an IA pass.
Risk taken    : one nav slot on the phone bar moves from Subjects (revenue) to
                the ID card (daily physical use). Argued in §4.3.
Palette       : INHERITED — --ink / --ink-2 / --ink-3 / --sheet / --rule /
                --indigo / --teal / --amber / --red, defined in
                apps/erp/src/components/ledger/ledger.module.css. Re-pointed,
                never renamed (binding invariant).
Type          : INHERITED — ledger body face + `ledgerMono` for every figure via
                <Num>. Arabic + Latin coverage already solved.
Tokens        : apps/erp/src/components/ledger/ + @repo/ui tokens. No new tokens.
Motion        : INHERITED — none beyond hover/focus transitions already present.
Stack         : Next.js 16 App Router, refine data hooks, @repo/ui, next-intl.
Constraints   : RTL/Arabic-first; dark mode; 375px first; reads existing
                endpoints ONLY; no money/subscription/attendance logic touched;
                emulator must keep mirroring the portal.
Out of scope  : any API change, any schema change, any new endpoint, any of the
                four Descoped systems, pay-later/debt, desktop-first layouts.
```

**Phase plan:** Phase 1 = this audit (done). Phase 2 = implementation, only
after approval, in the order given in §7.

---

## 1. Page inventory (what exists today)

Fifteen routes. Two are not pages: `courses` is a redirect, `loading` is a
skeleton.

| # | Route | Component | Lines |
|---|---|---|---|
| P1 | `/dashboard/student` | `student-dashboard.tsx` | 287 |
| P2 | `/dashboard/student/schedule` | `schedule-screen.tsx` | 363 |
| P3 | `/dashboard/student/subjects` | `student-subjects-screen.tsx` | 513 |
| P4 | `/dashboard/student/attendance` | `features/attendance/attendance-screen.tsx` (shared, 4 portals) | 127 |
| P5 | `/dashboard/student/grades` | `grades-screen.tsx` | 199 |
| P6 | `/dashboard/student/materials` | `student-materials-screen.tsx` | 153 |
| P7 | `/dashboard/student/reviews` | `student-reviews-screen.tsx` | 435 |
| P8 | `/dashboard/student/wallet` | `student-wallet-screen.tsx` + `student-receipts-section.tsx` | 378 + 101 |
| P9 | `/dashboard/student/messages` | `features/messaging/chat-screen.tsx` (shared) | 1105 |
| P10 | `/dashboard/student/notifications` | `features/notifications/notifications-screen.tsx` (shared) | 201 |
| P11 | `/dashboard/student/id` | `student-id-screen.tsx` | 315 |
| P12 | `/dashboard/student/family` | `student-family-code-screen.tsx` | 372 |
| P13 | `/dashboard/student/practice` | `emulator/student-emulator.tsx` | — |
| P14 | `/dashboard/student/settings` | `features/settings/settings-screen.tsx` (shared, all roles) | 344 |
| P15 | `/dashboard/student/courses` | redirect → `/subjects` | 9 |

**Chrome** (`portal-chrome.tsx`): sidebar of 14 destinations in 5 groups
(`—`, `@learn`, `@money`, `@comms`, `@account`); phone bottom bar with
`maxVisible={5}` → **4 destinations + "more"**, currently
Home · Schedule · Subjects · Wallet.

---

## 2. The audit table — every section on every page

Verdicts: **KEEP · MOVE · MERGE · REDESIGN · REMOVE · CREATE**.

### P1 — Home `/dashboard/student`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Home | `PageTitle` "اللي جاي" + subtitle | Names the page | It is the page's thesis | **KEEP** |
| Home | `GuardianContactNotice` | Minor with no guardian email: explains that adult messaging is LOCKED, fixes it inline | Child-safety gate; it must be seen | **MOVE** — below the hero, not above it. It is an alert, not the answer to "عندي حصة النهاردة؟". Still above the fold on 375px. |
| Home | `GuardianVerificationNotice` | Guardian email present but unproven; sends the verification mail | Complement of the above, mutually exclusive | **MOVE** — same band as above |
| Home | `PracticeInvite` | Offers the emulator, only while the account is empty | Fills a dashboard that would be three empty states | **KEEP** — the show/hide rule is correct and self-clearing |
| Home | `GuidedTour` | 15-card first-run tour | Once per account, skippable | **KEEP** — anchors need updating (§6.2) |
| Home | **"Up next" sheet** | Next session: subject tile + `startTime` + date, or "no upcoming" | THE primary question | **REDESIGN** — it answers *when*, never *where* or *with whom*. It reads `dashboards/student`, whose `todaySchedule` ships `room: ""` and `teacher: ""` — two structurally blank fields. It also cannot say "you have two more today". Details in §3.1. |
| Home | Record card — Attendance rate | `attendanceRate` %, links to `/attendance` | Traceable figure | **REDESIGN** (layout only) — three `sm:grid-cols-3` cards stack full-width on a phone, so ~360px of vertical space carries three numbers and pushes everything below the fold. Compact 3-across strip. |
| Home | Record card — Average grade | `averagePercent` + band, links to `/grades` | Traceable figure | **REDESIGN** — same layout note, *and* an average is not the question. A student asks "جبت كام في الامتحان؟" — the newest single mark. See CREATE below. |
| Home | Record card — Wallet balance | `me/wallet` balance, links to `/wallet` | Money is top-5 | **KEEP** (in the compact strip) |
| Home | — | — | — | **CREATE — "اشتراكك"**: an alert strip when a subscription is expiring or expired. Question #3 ("اشتراكي خلص ولا لسه؟") **is unanswerable anywhere in the product today**. §3.2. |
| Home | — | — | — | **CREATE — "آخر درجة"**: the newest graded entry (subject, mark, تقدير, date). Question #2. Derivable from the existing `grades` resource. §3.3. |
| Home | — | — | — | **CREATE — quick actions**: two tiles, `بطاقتي` and `اشترك في مادة`. Compensates the bottom-bar slot Subjects gives up (§4.3) and puts the counter card one tap from home. |

### P2 — Schedule `/dashboard/student/schedule`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Schedule | `PageTitle` | Names the page | — | **KEEP** |
| Schedule | Day picker (7 chips, Sun→Sat) | Filters the session list by weekday | Week is the student's axis | **REDESIGN** — the chips carry **no dates**, and the filter is `dayNames[new Date(s.date).getDay()] === selectedDayName`, i.e. it matches **every session ever held on that weekday**. "الثلاثاء" therefore lists a lesson from three weeks ago beside next Tuesday's. Must become a dated 7-day strip (today highlighted, next/previous week). On 375px seven chips also wrap onto two rows. |
| Schedule | Day sessions table (Start / Course / Room / Status) | The day's lessons | The core of the page | **REDESIGN** — a 4-column table at 375px. Each row already stacks start+end, course+teacher, so it is a card pretending to be a table. Make it a list of session rows: time block, subject, teacher, room, status chip. |
| Schedule | Session detail `Dialog` | Date, time, course (+link), subject, teacher, room, status | Detail without leaving the page | **KEEP** — but the row it opens from should show enough that most students never need it |
| Schedule | Totals sheet (total / completed / upcoming / cancelled) | Four counters over ALL sessions | — | **REMOVE** — no student asks "how many sessions exist in total". "Completed" duplicates what `/attendance` owns, and "cancelled" is a notification, not a statistic. Nothing is lost: attendance keeps the counts that matter. |
| Schedule | "Enrolled courses" sheet (course + weekday pattern) | The courses the student is in | — | **MERGE** into Subjects → "موادي" tab. That tab is the container for "what am I studying"; a second, thinner copy on Schedule is the duplication the portal-dedup pass already removed twice. |

### P3 — Subjects `/dashboard/student/subjects`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Subjects | `PageTitle` + track hint | Names the page | — | **KEEP** |
| Subjects | Tabs موادي / كل المواد | Track subjects by default, full catalog on demand | The core domain rule (CLAUDE.md) | **KEEP** |
| Subjects | `SearchInput` (browse-all only) | Client-side filter over subject names | Catalog is 45 subjects | **KEEP** |
| Subjects | Subject accordion rows | Expand a subject → its courses | Two-level catalog | **REDESIGN** — a row gives **no indication that the student is already enrolled or subscribed**, so the "موادي" tab looks identical whether you pay for a subject or not. Add a state chip on the row: `مشترك` / `بيخلص بعد ٥ أيام` / `الاشتراك خلص`. Reads `me/subscriptions` (exists). |
| Subjects | Course row (title, teacher, days+time, center, seats) | The thing you buy | — | **KEEP** — well built; prices already isolated through `<Num>` |
| Subjects | Plan actions (اشتراك شهري / اختر حصة + احجز) | Checkout | The one spend surface | **KEEP** — no logic touched. On 375px the per-session `Select` + button sit side by side and crowd; stack them. **REDESIGN (layout only).** |
| Subjects | Legacy "اطلب الانضمام" branch | For courses with no plan configured | Back-compat | **KEEP** |
| Subjects | Mock-checkout row | Dev-only settle/decline, driven by the gateway response | Cannot appear against a real gateway | **KEEP** |
| Subjects | "غير مصنّفة" archive row | Uncatalogued courses, browse-all only | — | **KEEP** |
| Subjects | Empty states | Names the next step | — | **KEEP** |

### P4 — Attendance `/dashboard/student/attendance`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Attendance | *(no page title at all)* | — | — | **CREATE** — `page.tsx` renders `<AttendanceScreen />` bare. It is the only student page in the portal with no heading; on a phone you land on three numbers with no idea what page you are on. Add the title in the student route, not in the shared screen (parent/teacher mount it inside their own headings). |
| Attendance | 3 metrics (حاضر / متأخر / غايب) with "من أصل N" | Answers question #4 | The denominator is the point | **KEEP** |
| Attendance | 28-day heatmap + 4-swatch legend | Pattern over a month | — | **MOVE** — below the new list, and collapsed behind "شوف الشهر كله" on phones. A 28-cell grid is a *pattern* tool; a teenager asking "حضرت كام؟" wants the last few lessons by name. |
| Attendance | — | — | — | **CREATE — "آخر الحصص"**: the last ~10 records as date + subject + status chip. `me/attendance` returns `{date, status, courseId}`; the course name comes from the `enrollments` resource the portal already reads (same client-side join `student-materials-screen` uses). No endpoint change. |

### P5 — Grades `/dashboard/student/grades`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Grades | `PageTitle` + subtitle | — | — | **KEEP** |
| Grades | Stat card "المواد" (count of subjects) | Counts courses with grades | — | **REMOVE** — the number of subjects is on the screen directly below it, as rows. It is the page counting itself. |
| Grades | Stat card "الدرجات المرصودة" (entry count) | Counts graded entries | Lineage | **MERGE** into the table — the per-row entry count already carries this, and the row is where it means something. |
| Grades | Stat card "أعلى درجة" | Best subject % + name | Genuine | **KEEP** |
| Grades | Grades table (subject / entries / score / تقدير) | Per-subject totals | The record | **REDESIGN** — (a) 4 columns at 375px; make each subject a row that expands. (b) **A student cannot see any individual exam.** The screen only ever shows المجموع ÷ المجموع الكلي per subject, so question #2 — "جبت كام في امتحان الكيميا الأسبوع اللي فات؟" — has no answer. The `grades` resource already returns each grade's `name`, `date`, `maxScore` and the student's own `scores`; expanding a subject to list its entries needs **no endpoint work**. |
| Grades | — | — | — | **CREATE — "آخر درجة"** at the top: newest entry by `date`, with subject, mark and تقدير. Same figure the Home hero shows, and this is the page that owns it. |

### P6 — Materials `/dashboard/student/materials`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Materials | `PageTitle` + subtitle | — | — | **KEEP** |
| Materials | Material cards (title, course, type chip, size · date, تحميل) | Downloads | Secondary but real need | **KEEP** — already a reading surface rather than a table; `md:grid-cols-2` degrades correctly to one column |

### P7 — Reviews `/dashboard/student/reviews`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Reviews | `PageTitle` + subtitle | — | — | **KEEP** |
| Reviews | "مدرسين مستنيين تقييمك" list | Eligible teachers + write button | The one surface where the student writes | **KEEP** |
| Reviews | "تقييماتي" table (teacher / rating / comment / date / edit) | Their own reviews, editable | Agency | **REDESIGN** — 5 columns at 375px for what is a short list; make it rows. |
| Reviews | Review dialog (stars + comment) | Create/edit | — | **KEEP** |
| Reviews | *(whole page)* | — | — | **KEEP, stays in "more"** — a real capability, but not a daily question. Do not promote. |

### P8 — Wallet `/dashboard/student/wallet`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Wallet | `PageTitle` + شحن action | — | — | **KEEP** |
| Wallet | Balance sheet + lineage line + cache/ledger mismatch warning | The balance, traced to the entry that produced it | Money must be traceable | **KEEP** — do not touch. The mismatch warning is a correctness guarantee, not decoration. |
| Wallet | History table (date / type / ref / amount / balance) + closing total + "capped" note | The derivation of the balance | Every row must sum to the closing figure | **KEEP** logic, **REDESIGN** layout — 5 columns, up to 100 rows, and the ref column already hides below `sm`. On a phone it should be rows, not a table, and windowed to ~15 with "شوف الكل". |
| Wallet | `StudentReceiptsSection` (date / receipt no / amount / download) | The student's own receipts | Question #5 | **MOVE up** — it currently sits **beneath** a table that can be 100 rows long, i.e. after ~4,000px of scroll on a phone. Receipts are what a parent asks the student for. Put the page on two tabs — `الحركات` / `الإيصالات` — or place receipts directly under the balance. |
| Wallet | Top-up dialog (amount, card-only hint, cash hint, mock branch) | Adds money | — | **KEEP** — `step="0.01"` and the amount-carrying button are both already correct |

### P9 — Messages `/dashboard/student/messages`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Messages | `ChatScreen` (shared, 1105 lines) | Relationship-scoped chat + parent oversight + guardian gate | Governed by docs/decisions/messaging.md | **KEEP** — out of scope for an IA pass. One note only: no unread count reaches the nav (see §5.3). |

### P10 — Notifications `/dashboard/student/notifications`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Notifications | `PageHeader` + "علّم الكل كمقروء" | — | — | **KEEP** |
| Notifications | Notification cards (type badge, title, body, timeAgo, deep link) | System events | Distinct from chat | **KEEP** — do **not** merge with Messages. One is a conversation, the other is the product talking; merging them would break the deep-link map shared with web push. |

### P11 — Student ID `/dashboard/student/id`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Card | `PageTitle` (eyebrow / title / subtitle, audience-aware) | — | Shared with the parent view | **KEEP** |
| Card | "Not ready" blocking sheet + onboarding CTA | Names why no card exists | Refusals must explain themselves | **KEEP** |
| Card | **"وريني البطاقة" button (on-demand fetch)** | Card is not built until pressed | Cost control | **REDESIGN** — the repo's own invariant reads: *"ON-DEMAND READS — a DEFAULT, not a law. A screen must not spend a query on something the reader has not asked to see; but **the primary thing a page exists for still loads with the page**"* (docs/decisions/student-card-qr.md). The card **is** this page. At a center counter with a queue behind you, page → tap → spinner → QR is a tap and a wait too many. Load it with the page here; keep the on-demand button on Settings, where the card is not the point. |
| Card | Card render + كوبي الكود / حفظ-مشاركة PNG / طباعة | Takes the card off the screen | WhatsApp is the real distribution channel | **KEEP** |
| Card | `counterHint` line (formatted code) | What to say at the counter | — | **KEEP** — and raise it: the **code read aloud** is the fallback when the QR will not scan. |
| Card | `GuardianContactNotice` (second instance) | Same banner as Home | — | **MERGE** — the guardian email is already a row in the completeness checklist directly below, with its own inline fix. Two controls for one field, 200px apart. Keep the checklist row, drop the banner here. |
| Card | Completeness checklist (missing items + fix links) | What is blocking the card | Every row is actionable or absent | **KEEP** |

### P12 — Family `/dashboard/student/family`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Family | `PageTitle` + subtitle | — | — | **REDESIGN (wording)** — "العائلة" reads like a family hub; the page is *linking a parent to my account*. Label it "ولي أمري" in the nav and the title. |
| Family | Code sheet (code, نسخ, share hint, تغيير الكود + hint) | The family code | How a parent gains read access | **KEEP** |
| Family | "اربط ولي أمر" form (email or phone) | Student-initiated invite | — | **KEEP** |
| Family | Link requests table (parent / status / initiated by / date / approve-reject) | Grant or refuse standing access to a minor's record | Consequential | **REDESIGN (layout only)** — 5 columns at 375px for a list that is usually 0–2 rows. Rows, not a table. The approve/reject weighting is already right; keep it exactly. |

### P13 — Practice `/dashboard/student/practice`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Practice | Emulator: 4 fake screens (dashboard, subjects, wallet, card), 4 missions, ~22 steps, write-free | Rehearsal for a first-time student | Deliberately in the real menu, not a help page | **KEEP** — and it must be updated to mirror the new home (§6.1). Its own nav (home / card / subjects / wallet) is *already* closer to the bar this audit proposes than the real bar is. |

### P14 — Settings `/dashboard/student/settings`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Settings | `PageHeader` | — | — | **KEEP** |
| Settings | `StudentIdSettingsCard` | Renders the card again, on demand | "The ID shows up on their account page" | **REMOVE** — third surface for one artifact (`/id`, Settings, emulator). With the card page loading its card on arrival and a `بطاقتي` tile on Home, this is a duplicate. Replace with a one-line link. |
| Settings | `OnboardingProfileCard` | System / grade / track / second language + way back into the wizard | The only route back into the wizard | **KEEP** |
| Settings | Profile section (role, status, name, phone, language, save) | Account basics | — | **KEEP** |
| Settings | `PushNotificationsCard` | Enable/disable web push | The lesson-reminder channel | **KEEP** — and it deserves a nudge from Home for a student with no subscription, since reminders are what make the portal useful on a phone. Nudge only, no new mechanism. |
| Settings | `EmailCard` | Change the login email | Often typed by a receptionist | **KEEP** |
| Settings | `GuardianContactCard` | Guardian email/phone, always editable | Child-safety | **KEEP** |
| Settings | `PasswordCard` | Change password | Every role's right | **KEEP** |
| Settings | `SessionsCard` | Devices & sessions | — | **KEEP** |
| Settings | `DataRightsCard` | Law 151/2020 export + erasure | A right, not a feature | **KEEP** |

### P15 — `/dashboard/student/courses`

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Courses | Server redirect → `/subjects` | Keeps old links alive | Absorbed page | **KEEP** |

### Chrome

| Page | Section | What it does | Why is it HERE? | Verdict |
|---|---|---|---|---|
| Chrome | Sidebar, 14 items / 5 groups | Desktop navigation | Grouped by the four questions | **KEEP** structure, **REDESIGN** membership — one new destination (§3.2), one rename ("Family" → ولي أمري) |
| Chrome | Bottom bar, 4 + more | The **only** navigation on a phone | `maxVisible={5}` | **REDESIGN** — see §4.3 |
| Chrome | "more" sheet | The remaining 10 destinations, in sidebar order | Sheet must not be a second IA | **KEEP** — the rule is right; only membership changes |

---

## 3. The four things this portal cannot answer today

### 3.1 "فين الحصة ومع مين؟" — the hero has no place and no teacher

`GET /api/v1/dashboards/student` builds `todaySchedule` as:

```ts
todaySchedule: todaySessions.map((s) => ({
  id: s.id, time: s.startTime, subject: courseNameMap.get(s.courseId) ?? "",
  room: "",      // structurally always blank
  teacher: "",   // structurally always blank
}))
```

The Home hero therefore prints subject + time and stops. For a student who
physically walks to a building, *where* and *with whom* are half the question.

**Fix without touching any endpoint:** the hero reads the `sessions` resource
instead — the same one `schedule-screen.tsx` already reads, which returns
`courseName`, `teacherName`, `roomName`, `date`, `startTime`, `endTime`,
`status`. The `dashboards/student` payload stays for the record figures.

Two known-dead fields stay dead and unread: `unreadMessages: 0`,
`assignmentsDue` / `dueSoon` / `assignmentsTrend`. Removing them from the
contract is an API change — **flagged, not done** (§5.1).

### 3.2 "اشتراكي خلص ولا لسه؟" — nothing in the product answers this

`GET /api/v1/me/subscriptions` exists, is student- and parent-scoped, and
returns every subscription with `status`, `plan`, `periodStart`, `periodEnd`
and the joined `course`. **It has zero consumers in the UI** — verified by
search across `apps/erp/src`; the only `me/` hit outside the API folder is
`me/subjects` in the collaboration panel.

So a student cannot see, anywhere:
- whether they are currently subscribed to a group,
- when a monthly subscription ends,
- that a per-session pass covers only one dated lesson.

This is question #3 on the daily list and it is a **churn mechanism**: the
improvement report already records that monthly plans expire silently with no
renewal path and no pre-expiry notification. The UI cannot fix the missing
reminder job, but it can stop the expiry being invisible while the student is
in the app.

**CREATE, in two places, both reading `me/subscriptions` only:**
1. Home alert strip when any active subscription has `periodEnd` within 7 days,
   or when one has already expired. Links to renewal (the existing Subjects
   checkout — no new money path).
2. A page, `/dashboard/student/subscriptions` — "اشتراكاتي": active first
   (course, plan, ends-on / session date, status chip), then past.

### 3.3 "جبت كام في الامتحان؟" — only averages exist

Home shows `averagePercent`. `/grades` shows per-subject totals. **No screen
shows an individual exam.** The `grades` resource already returns each grade's
`name`, `date`, `maxScore` and the student's own `scores` — the data is on the
client and is being aggregated away.

**CREATE:** newest-grade card (Home + `/grades`), and expandable per-subject
rows listing the individual entries.

### 3.4 "حضرت الحصص دي ولا لأ؟" — a heatmap, not a list

`/attendance` gives three counters and a 28-day heatmap. It never names a
lesson. `me/attendance` returns `{date, status, courseId}` per record and the
portal already holds `enrollments` (with `courseName`), so a named recent list
is a client-side join — no endpoint change.

---

## 4. The proposed structure

### 4.1 Page map — mobile top-to-bottom at 375px

**`/dashboard/student` — الرئيسية**
1. **HERO — "اللي جاي"**: subject · day + 12-hour time with the period in words · **القاعة** · **المدرس** · **السنتر**; status line (لسه فاضل / دلوقتي / خلصت). If more lessons today, one line: "وكمان حصتين النهاردة" → `/schedule`. Empty state names the next step (اشترك في مادة).
2. **Alerts band** (each conditional, none permanent): expiring/expired subscription → renew; `GuardianContactNotice`; `GuardianVerificationNotice`.
3. **"آخر درجة"**: subject, mark, تقدير, date → `/grades`.
4. **Record strip** — three compact figures in ONE row: حضورك · متوسطك · محفظتك, each opening its page.
5. **Quick actions** — two tiles: `بطاقتي` · `اشترك في مادة`.
6. `PracticeInvite` (empty accounts only).

Order rationale: the hero is questions #1; the alert band is #3; the grade card
is #2; the strip carries #4 and #5. The guardian notices move from position 1
to position 2 — still above the fold, no longer standing between a student and
"do I have a lesson today".

**`/dashboard/student/schedule` — مواعيدي**
1. Title. 2. Dated 7-day strip (today first, next/previous week). 3. That day's sessions as rows (time · subject · teacher · room · status), tap → detail sheet. *(Totals removed; enrolled courses merged into Subjects.)*

**`/dashboard/student/subjects` — موادي**
1. Title + track hint. 2. Tabs موادي / كل المواد. 3. Search (browse-all). 4. Subject rows **with subscription state chips**. 5. Expanded course rows + plans (stacked on phone). 6. غير مصنّفة (browse-all).

**`/dashboard/student/subscriptions` — اشتراكاتي** *(new)*
1. Title. 2. Active: course, plan, ends-on / session date, status chip. 3. Past.

**`/dashboard/student/wallet` — محفظتي**
1. Title + شحن. 2. Balance + lineage + mismatch warning. 3. Tabs: `الإيصالات` / `الحركات` — receipts first. 4. Ledger rows, windowed, with the closing total.

**`/dashboard/student/attendance` — حضوري**
1. **Title (new)**. 2. Three metrics. 3. "آخر الحصص" named list. 4. Heatmap, collapsed on phone.

**`/dashboard/student/grades` — درجاتي**
1. Title. 2. آخر درجة + أعلى درجة (two cards, not three). 3. Subject rows, expandable to individual entries.

**`/dashboard/student/id` — بطاقتي** — card loads with the page; code + counter line raised; actions; checklist (guardian banner merged in).

**`/dashboard/student/family` — ولي أمري** — code · invite · requests as rows.

**Unchanged in structure:** materials, reviews, messages, notifications, practice, settings (minus the duplicate ID card).

### 4.2 Sidebar (desktop) — 15 destinations, 5 groups

```
—        الرئيسية
@learn   موادي · مواعيدي · حضوري · درجاتي · الملازم · التقييمات
@money   اشتراكاتي · محفظتي            ← the group stops being one item
@comms   الرسايل · التنبيهات
@account بطاقتي · ولي أمري · تدريب · الإعدادات
```

Changes: `اشتراكاتي` added above `محفظتي`; `العائلة` → `ولي أمري`. Group order
and the `@money`-keeps-its-heading rule (sidebar-ia.md #4) are untouched.

### 4.3 Bottom nav — which 4 get a thumb

**Proposed:** `الرئيسية · مواعيدي · بطاقتي · محفظتي · المزيد`

**What changes:** Subjects gives up its slot to the ID card.

**Why.** The bar's own rule is "what a student opens *between classes*". On a
per-week basis:
- **بطاقتي** is used at the counter at **every** physical lesson — several times
  a week, always under time pressure with a queue behind them, and it is the
  student's half of the check-in the whole product is built around. It is
  currently in the "more" sheet: two taps and a scroll.
- **موادي** is where a student *subscribes*, which is monthly at most. Its
  discovery value is real but its frequency is not daily.

**The trade, stated plainly:** Subjects is the revenue surface, and demoting it
lowers its ambient discoverability. Mitigations, both in the proposal: a
permanent `اشترك في مادة` tile on Home (position 5, always visible), and Subjects
stays **first** in the `@learn` sidebar group and first in the "more" sheet.

**Alternative, if you would rather not trade:** `maxVisible` is hardcoded `5` in
`packages/ui/src/components/app-shell.tsx` and shared by all eight portals.
Making it a prop and passing `6` for the student would give five destinations
plus "more" (~62px per item at 375px — tight but legible). That is a change to
shared chrome affecting every portal, so it is **flagged as a decision for you**,
not assumed.

The "more" sheet keeps sidebar order minus the four placed, unchanged as a rule.

### 4.4 Voice

Casual Egyptian, respectful — parents read these screens too.

| Instead of | Use |
|---|---|
| الجدول الدراسي | مواعيدي |
| سجل الحضور | حضوري |
| المحفظة الإلكترونية | محفظتي |
| بطاقة الطالب | بطاقتي |
| العائلة | ولي أمري |
| لا توجد حصص قادمة | مفيش حصص جاية دلوقتي |
| اشتراكك على وشك الانتهاء | اشتراكك في الكيميا بيخلص بعد ٣ أيام |
| الرصيد الحالي | فلوسك دلوقتي |

No slang that dates, no emoji in labels, no second person plural. Every string
goes through the **existing** next-intl namespaces — new keys under
`studentDashboard.*`, `studentSubjects.*`, `studentClass.*`, plus one new
`studentSubscriptions.*` block inside `src/messages/{ar,en}/student.json`. No
new namespace file. Several keys the redesign needs **already exist and are
currently unused**: `studentDashboard.room`, `.teacher`, `.today`, `.thisWeek`,
`.noClassesToday`, `.todaySchedule`.

---

## 5. Data each CREATE reads — existing endpoints only

| # | New section | Reads | New endpoint? |
|---|---|---|---|
| C1 | Hero with room + teacher | `sessions` (`useList`, `studentId=me`) — returns `courseName`, `teacherName`, `roomName`, `date`, `startTime`, `endTime`, `status` | **No** |
| C2 | "وكمان N حصص النهاردة" | same `sessions` list, filtered to today | **No** |
| C3 | Subscription alert (Home) | `me/subscriptions` — `status`, `plan`, `periodEnd`, `course` | **No** (exists, unconsumed) |
| C4 | `/subscriptions` page | `me/subscriptions` | **No** |
| C5 | Subscription state chips on subject rows | `me/subscriptions` + `enrollments` | **No** |
| C6 | "آخر درجة" (Home + Grades) | `grades` — each row carries `name`, `date`, `maxScore`, `courseName`, `subject`, own `scores` | **No** |
| C7 | Per-subject grade entries | same `grades` payload, currently aggregated away | **No** |
| C8 | "آخر الحصص" attendance list | `me/attendance` (`date`, `status`, `courseId`) joined client-side with `enrollments` (`courseName`) | **No** |
| C9 | Attendance page title | none | **No** |
| C10 | Home quick-action tiles | none | **No** |

### 5.1 Flagged — needs API work, deliberately NOT in this proposal

1. **`dashboards/student` ships fabricated fields.** `unreadMessages` is a
   hardcoded `0`; `assignmentsDue` / `dueSoon` / `assignmentsTrend` are derived
   from scoreless grade rows and there is no Assignment model. Nothing renders
   them; they should come out of the contract. Already recorded as
   "KNOWN, STILL OPEN" in `portal-chrome.tsx` and `student-dashboard.tsx`.
2. **`todaySchedule.room` / `.teacher` are `""` by construction.** The redesign
   routes around this by reading `sessions`; the payload is still lying to any
   future consumer.
3. **`me/attendance` returns no course name** — only `courseId`. The client join
   works, but a server-side name would be cleaner and would let the parent and
   teacher views reuse it.
4. **No unread counts anywhere.** Neither messages nor notifications expose a
   count, so the bottom bar cannot carry a badge. On a phone-first portal that
   is the main reason a student would open Messages at all.
5. **No pre-expiry notification type** for subscriptions (improvement report
   §1.4). The UI alert in C3 is a mitigation, not a substitute.

None of these block Phase 2.

---

## 6. What else must move in step

### 6.1 Emulator — `features/student/emulator/**` (must keep mirroring)

The emulator is a write-free copy of the portal and is the first thing a lost
student sees. It has 4 screens (`dashboard`, `subjects`, `wallet`, `card`), a
4-item nav (`nav-home`, `nav-card`, `nav-subjects`, `nav-wallet`) and 4 missions
/ ~22 steps in `script.ts`.

Needed if the home changes:
- `screens.tsx` → `EmuDashboard` must gain the hero's new shape (place +
  teacher), the subscription alert and the newest-grade card, and expose
  spotlight ids for them. Today it exposes `up-next` and `record` only, and
  `script.ts` step `record` targets the three-card row this audit compacts.
- `script.ts` mission `readBoard` — the `upNext` and `record` steps' copy
  describes fields that change; a new step for the subscription alert is worth
  adding since it is the question the emulator's audience asks first.
- `student-emulator.tsx` nav — its four tabs are *already* Home / Card /
  Subjects / Wallet. Under the proposed bar it becomes Home / Schedule / Card /
  Wallet, so either the emu nav gains Schedule or the mismatch gets a written
  reason. **Flag: the emulator has never had a Schedule screen** — building one
  is optional and can be deferred; if deferred, the emu nav should keep its four
  and the difference should be noted in the file, not left silent.
- `world.ts` — needs a subscription with a `periodEnd` and a newest grade so the
  new sections have something to show.

### 6.2 Guided tour — `features/student/tour/steps.ts` (15 cards)

Anchors resolve `nav-x` (desktop) → `bar-x` (phone slot) → `bar-more`. Changing
the bar changes which `bar-*` anchors exist.

| Step | Anchor today | Action |
|---|---|---|
| `upNext` | `student-upnext` | Copy update — the card now names place and teacher |
| `schedule` | `at("schedule")` | unchanged (keeps its bar slot) |
| `subscribe` | `at("subjects")` | **now falls back to `bar-more` on phones** — copy must say "من المزيد" (the engine already tells the reader when it falls back) |
| `payWallet`, `receipts` | `at("wallet")` | `receipts` copy changes — receipts move above the ledger |
| `card` | `at("id")` | **now a bar slot** — copy improves: one tap |
| `attendance`, `grades` | `at(...)` | copy updates for the new page shapes |
| `messages`, `unlockMessaging`, `pushNotifications`, `family` | — | `family` label → ولي أمري |
| `practice` | `at("practice")` | unchanged |
| — | — | **NEW step** for `اشتراكاتي` — it is a new destination answering a top-5 question, and the tour is where a first-time student learns it exists |

### 6.3 Help articles — `apps/erp/src/content/help/{ar,en}/` (both locales)

| Article | Why |
|---|---|
| `student-home-and-schedule.mdx` | Home hero, the alert band, the day strip, the removed totals |
| `student-grades.mdx` | New cards + per-entry expansion |
| `student-attendance.mdx` | New title, the recent list, heatmap demoted |
| `student-wallet.mdx` | Receipts/ledger tab order |
| `student-receipts.mdx` | Receipts are no longer at the bottom of the wallet |
| `student-subjects-and-subscribe.mdx` | Subscription chips; Subjects moves to "more" on phones |
| `student-id-card.mdx` | The card loads with the page; no "show card" press |
| `student-family.mdx` | Renamed to ولي أمري |
| `student-first-steps.mdx`, `student-how-to.mdx`, `student-troubleshooting.mdx` | All three narrate the bottom bar and the nav by name |
| `student-glossary.mdx` | Add اشتراك / بيخلص / تجديد |
| **NEW `student-subscriptions.mdx`** | The new page, both locales |

Unaffected: `student-messages`, `student-notifications`, `student-materials`,
`student-reviews`, `student-settings-security`, `student-onboarding-track`,
`student-claim-invite`.

### 6.4 Screenshots

`apps/erp/public/help/student-tour-{ar,en}.png` are deleted in the current
working tree; `tools/help-shots/student-tour.spec.ts` regenerates them. They
must be re-shot after Phase 2 or the help page ships pictures of a portal that
no longer exists.

---

## 7. Proposed Phase 2 order (for approval)

Each step is independently shippable and reversible.

1. **Home hero** — read `sessions`, add place/teacher/status, "more today" line, compact record strip, quick actions. *(largest single win, one file)*
2. **Attendance** — page title, recent-lessons list, heatmap demoted.
3. **Grades** — newest-grade card, drop two counters, expandable entries.
4. **Subscriptions** — the new page + the Home alert + subject-row chips.
5. **Wallet** — receipts above the ledger, phone rows, windowing.
6. **Schedule** — dated week strip, session rows, remove totals, merge enrolled-courses into Subjects.
7. **Card** — load with the page, merge the duplicate guardian banner.
8. **Chrome** — bar order, `اشتراكاتي` in the sidebar, ولي أمري rename.
9. **Row-not-table** passes on reviews and family.
10. **Emulator + tour + help + screenshots** — last, because they mirror 1–9.

## 8. What I did NOT touch, and will not

- Money, subscription, attendance, checkout, wallet and settlement **logic** —
  read-only throughout. No service, no route, no schema.
- The wallet's balance/ledger mismatch warning and the closing-total rule.
- The child-safety gate, the default-minor rule, the guardian lock.
- `chat-screen.tsx` and the messaging authorization model.
- The Classical Ledger token names (re-pointed, never renamed).
- Any of the four Descoped systems, and pay-later/debt.
- Adding any endpoint. Every CREATE reads something that already exists.

---

**Phase 1 ends here. No component code will be written until this audit is
approved.**
