# Showcase — Feature Matrix (Phase 0 audit)

**Status:** Phase 0 deliverable. Awaiting Ali's approval before any page is built.
**Date:** 2026-08-02 · **Branch:** `claude/showcase-gsap-threejs-194653` (worktree)
**Method:** graphify AST graph over the whole repo (1,302 code files → 6,010 nodes /
18,154 edges / 213 communities, `graphify-out/`) + a manual route-tree, service-layer,
schema, and i18n-dictionary crawl. Every row below cites a file that exists today.

> **Rule this document enforces:** nothing on the showcase site may be claimed unless a
> file in this repo implements it. No invented numbers, no invented testimonials, no
> "coming soon" dressed as shipped. Where a feature is real but *partly* mocked
> (Paymob, WhatsApp), the row says so and the site copy must not overstate it.

---

## 0. What the audit found before anything else — four things that need your ruling

These change what gets built, so they come first.

### 0.1 The design system forbids what this brief asks for

`design/CONSTITUTION.md` §1 is explicit:

> **The seal, and the single-animation budget.** One animation in the entire product,
> spent on the one moment something became permanent. Motion is a scarce signal here;
> spending it on transitions is spending it on nothing.

and §2:

> If the answer requires a new colour, a second font, or a second animation, the
> derivation is wrong — go back to the guarantee.

A GSAP + Three.js scroll-scrubbed showcase is, read literally, a direct violation. I am
not going to quietly override a binding document, and I am not going to hand the problem
back either. Here is the resolution I recommend, derived the way §2 asks:

**The showcase is not a ledger. It is an *argument about* a ledger.** Its guarantee is
not "this record is permanent" — it is **"everything shown here is real; you are looking
at the actual product."** An honest interface for *that* guarantee is one that
*demonstrates* rather than asserts: real screenshots, real recorded flows, and the
settlement arithmetic drawn step by step instead of stated as a total.

That derivation gives a motion budget with a spine, not a free pass:

| Allowed, because it demonstrates | Forbidden, because it decorates |
|---|---|
| A diagram that **draws its own computation** (settlement split, ledger append) | Parallax on decorative shapes |
| A **counter that counts** because the figure is derived from entries | Fade/slide on every section as it enters |
| A **pin** that holds one screen while its parts are named | Text sliding in from the side for rhythm |
| The 3D notebook, **once**, as the site's single spend of spectacle | A second 3D scene anywhere else |
| The real product **seal**, quoted exactly as `.seal-in` plays it | Any new easing/duration vocabulary |

Everything else stays the Ledger system unchanged: `--paper`/`--sheet`/`--ink`/`--rule`,
the four colours, IBM Plex Mono for every figure, hairlines, no gradients, no second font,
`<Eyebrow>` with the marker rule, `<Num>` vs `<ProseCount>`.

**Decision needed:** approve this derivation (and I will append it to
`design/DECISIONS.md` as the showcase's scope carve-out), or tell me to hold the
single-animation budget literally — in which case the brief's Phases 3–4 need rewriting
and I should stop now rather than build something that gets rejected on sight.

### 0.2 A landing page already exists

`apps/www/src/features/landing/landing-screen.tsx` (375 lines) is already live at
`/[locale]`, with its own copy namespace `apps/www/src/messages/{ar,en}/landing.json`
(sections: `hero` · `roles` · `how` · `money` · `safety` · `cta` · `footer`). It already
uses `<Eyebrow>`, `<Num>`, `<LedgerButton>`.

So `apps/showcase` is not filling a hole — it is a **deeper second surface**. Three ways
to relate them, and this is the same decision as the deployment question in Phase 6:

| Option | Shape | Cost |
|---|---|---|
| **A — Separate subdomain** (recommended) | `features.edura.eg` = showcase; www landing stays the short conversion page | Two surfaces to keep true; cleanest perf story (3D never ships to www) |
| **B — Replace** | showcase becomes the marketing site; www `/` redirects to it | www's landing work is discarded; login/signup domain split gets awkward |
| **C — Path on main domain** | `edura.eg/features/*` via rewrite | One domain, but couples two apps' deploys and drags the 3D chunk's risk next to the login page |

I recommend **A**, and I'd keep the existing landing page untouched (the Stitch rule in
`CLAUDE.md` — additive only, never silently delete existing work — points the same way).

### 0.3 There is no translation-parity test to copy

The brief says "translation-parity tests like the existing apps." There isn't one —
`apps/www/tests/unit/` has 16 files and none check `ar`/`en` key parity. (`CONSTITUTION.md`
§8 *requires* parity under "Done means"; it just was never automated.) I'll write one
fresh for `apps/showcase` and it can be lifted into www later.

### 0.4 Branch

You asked for `feat/showcase`; this worktree is on `claude/showcase-gsap-threejs-194653`.
Per `CLAUDE.md` I don't run git commands — tell me if you want the branch renamed and
I'll leave it to you, or I'll just build on the current one.

---

## 1. Role map — the repo has eight roles, the brief names five

| Brief's role | Actual role(s) in code | Where it lives |
|---|---|---|
| Center owner | `center_admin` **+** `center_staff` (3 preset sub-roles: receptionist, manager, center_accountant) | `dashboard/admin/**`, `dashboard/staff/**` |
| Teacher | `teacher` **+** `assistant` | `dashboard/teacher/**`, `dashboard/assistant/**` |
| Student | `student` | `dashboard/student/**` |
| Guardian | `parent` | `dashboard/parent/**` |
| Admin | `super_admin` **+** `accountant` (separate app) | `apps/superadmin/**` |

**Proposal:** five public role pages. `center_staff` folds into `/owners` (it *is* the
counter — the highest-drama scene on that page), `assistant` folds into `/teachers`
(`CONSTITUTION.md` §7 records that the assistant portal is largely the teacher's screens
under a delegation strip). `super_admin` gets no public page — it is internal — but the
*audit log* it produces is a `/trust` claim.

---

## 2. Feature matrix

Legend for **Proof medium**: `SHOT` screenshot cluster · `VID` recorded Playwright flow ·
`SVG` original animated diagram · `3D` the hero scene · `NUM` animated counter/derived
figure.

### 2.1 Center owner + staff → `/owners`

| # | Feature | Evidence | Benefit (ar) | Benefit (en) | Proof |
|---|---|---|---|---|---|
| O1 | Counter check-in by student code / phone / name, with the last check-ins listed for instant correction | `services/attendance/checkin.ts` `lookupStudents()`; `dashboard/{admin,staff}/checkin` | تشيك-إن من الكاونتر بكود الطالب في ثانية، والقائمة قدامك تصحّح أي غلطة فورًا | Front-desk check-in by student code in one tap, with the last entries in view to correct a mistake instantly | VID |
| O2 | Check-in chains straight into cash payment when the student isn't covered (`needs_payment` carries `pricePerSession` + `courseTitle`) | `checkin.ts`; `CONSTITUTION.md` §5 | الطالب مش دافع؟ الدفع بيتم في نفس الشاشة، مش شاشة تانية | Unpaid student? The cash step happens in the same flow, not a second screen | VID |
| O3 | Two attendance modes per teacher: counter-only, or counter **+** a second door check-in at the hall | `checkin.ts` header comment; `dashboard/{teacher,assistant}/door` | كل مدرّس يختار: تشيك-إن الكاونتر بس، ولا تشيك-إن تاني على باب القاعة | Each teacher picks: counter check-in only, or a second check-in at the classroom door | SVG |
| O4 | `counter_only` is a distinct status that does **not** count as present | `checkin.ts` stage→status derivation | اللي دخل الكاونتر وما دخلش القاعة بيبان لوحده — مش محسوب حاضر | A student who passed the counter but never entered the hall shows separately — not counted present | SVG |
| O5 | Automatic per-session revenue split on completion, exactly once (`distributedAt` claim) | `services/finance/distribution.ts` | التسوية بتحصل لوحدها لما الحصة تخلص — مرة واحدة، مستحيل تتكرر | Settlement runs itself when the lesson completes — exactly once, structurally | SVG + NUM |
| O6 | Three settlement branches, one ledger: room %-split · per-attending-student rate · no-room flat fees | `distribution.ts` comment block; `finance/fees.ts` | تلات طرق حساب مختلفة، بتنزل كلها في نفس الدفتر بنفس القيود | Three different pricing rules, all writing the same ledger entries | SVG |
| O7 | Center sets its **own** hall's per-student rate, capped by the platform's published ceiling | `services/rooms/room-rate.ts` `assertWithinCeiling` | القاعة قاعتك، فالسعر سعرك — في حدود السقف المعلن | Your hall, your rate — bounded by the platform's published ceiling | SHOT |
| O8 | The teacher **sees** that rate before booking (hall card + at method choice) | `GET /api/v1/centers/[id]/rooms`; `resolveMethod2RatesForRooms` | المدرّس شايف سعر القاعة قبل ما يحجز — مفيش مفاجآت وقت التسوية | The teacher sees the hall's rate before booking — no surprise at settlement | SHOT |
| O9 | Rate is **snapshotted at course creation** — changing a hall never re-prices a running course | `room-rate.ts`; `distribution.ts` ("never re-rated") | تغيّر سعر القاعة؟ الكورسات الشغالة بتفضل بسعرها | Change a hall's price? Courses already running keep the price they started on | SVG |
| O10 | Cash **and** Paymob both land in one ledger (cash mirrored to `transactions` in the same DB transaction) | `CLAUDE.md` Step 4; `services/payments/payments.ts` | كاش وأونلاين في دفتر واحد — مش دفترين | Cash and online in one book, not two | SHOT |
| O11 | Center wallet with a DB-level non-negative floor + conditional decrement (H2) | migration `centers_wallet_balance_nonneg`; `finance/center-wallet.ts` | المحفظة ما تنزلش تحت الصفر — ممنوع على مستوى قاعدة البيانات نفسها | The wallet cannot go negative — refused by the database itself | SVG |
| O12 | Payout request → approve → settle, with `SELECT … FOR UPDATE` against double-withdrawal (H1) | `finance/center-wallet.ts`; `dashboard/staff/finance` | سحب الأرباح بخطوات واضحة، ومفيش سحب مرتين | Withdrawals in clear steps, and no double-withdrawal race | SHOT |
| O13 | Rooms/halls with profile, photos, price, pricing method | `services/rooms/**`; `dashboard/{admin,staff}/rooms` | قاعاتك بصورها وأسعارها وطريقة تسعيرها | Your halls with their photos, prices, and pricing method | SHOT |
| O14 | Staff accounts with 3 preset sub-roles and default-closed exclusions | `CenterStaff` model; `dashboard/admin/staff` | حسابات للطاقم بصلاحيات محددة سلفًا — الممنوع غايب مش مقفول | Staff accounts with preset permissions — what they can't do is absent, not greyed out | SHOT |
| O15 | Every staff write carries on-behalf-of audit attribution | `authz` center-actor; `AuditLog` model | كل عملية بيعملها الموظف مسجّلة باسمه ونيابة عن مين | Every staff action records who did it and on whose behalf | SVG |
| O16 | Collaboration requests replace booking + affiliation invites: subject, grade, track, hall, days, times, proposed center share | `CollaborationRequest` model; `services/collaboration` | اتفاق واضح مع المدرّس قبل ما يبدأ: المادة والقاعة والمواعيد والنسبة | A clear agreement with the teacher up front: subject, hall, schedule, share | SHOT |
| O17 | Acceptance creates course + schedule in **one** transaction, with conflict detection | `services/collaboration`; `session-generator`, `conflict-detector` | الموافقة بتعمل الكورس والجدول مرة واحدة، وبتكشف تعارض القاعات | Accepting creates the course and its schedule at once, and catches room clashes | SVG |
| O18 | Expenses ledger | `services/expenses`; `dashboard/admin/expenses`; `Expense` model | مصروفات السنتر جوّه نفس النظام | Center expenses inside the same system | SHOT |
| O19 | Reports + center statement | `services/reports`; `dashboard/{admin,staff}/reports` | تقارير وكشف حساب من نفس القيود — مش أرقام تانية | Reports and statements derived from the same entries — not a second set of numbers | SHOT + NUM |
| O20 | Enrollment requests queue | `EnrollmentRequest`; `dashboard/admin/enrollment-requests` | طلبات الالتحاق في طابور واحد تقبل أو ترفض منه | Enrollment requests in one queue to accept or decline | SHOT |
| O21 | Team notes board (owner + staff), status/pin/read-receipts | `TeamNote`, `TeamNoteRead`; `dashboard/{admin,staff}/notes` | لوحة مهام للفريق: مين قرأ ومين خلّص | A team to-do board: who read it, who finished it | SHOT |
| O22 | 3-level blacklist with a journalled, replayable cascade | `services/blacklist`; `BlacklistCascadeAction` (DELETE revoked) | حظر بمستويات، وكل نتيجة مسجّلة عشان الرجوع يبقى ممكن | Blacklisting at three levels, with every consequence journalled so it can be undone | SVG |
| O23 | Walk-in registration: creates the account + a single-use claim link, phone-only families get a copyable link | `services/walk-in`; `services/invites/invite-token.ts` | تسجّل الطالب على الكاونتر وتديله لينك مرة واحدة يكمّل بيه | Register a student at the counter and hand them a one-time link to finish | VID |

### 2.2 Teacher + assistant → `/teachers`

| # | Feature | Evidence | Benefit (ar) | Benefit (en) | Proof |
|---|---|---|---|---|---|
| T1 | Attendance marking screen | `features/attendance/**`; `dashboard/teacher/attendance` | تحضير الحصة من الموبايل في دقيقة | Take the register from your phone in a minute | VID |
| T2 | **Offline** attendance outbox — marks queue locally and sync later, server-wins on conflict, per-record commit state | `lib/pwa/attendance-outbox.ts`, `use-attendance-sync.ts`, `services/attendance/sync.ts`; `CONSTITUTION.md` §2 | النت قطع؟ التحضير بيتسجّل عندك وبيتبعت لوحده لما يرجع | Internet dropped? The register saves locally and syncs itself when it's back | VID + SVG |
| T3 | Door check-in at the hall entrance (teacher or assistant), strictly requires counter first | `checkin.ts`; `dashboard/{teacher,assistant}/door` | تشيك-إن تاني على باب القاعة — لازم يكون عدّى الكاونتر الأول | A second check-in at the hall door — only after the counter | SVG |
| T4 | Classes / groups management | `dashboard/{teacher,assistant}/classes`; `Course`, `Session` | مجموعاتك ومواعيدها في مكان واحد | Your groups and their schedules in one place | SHOT |
| T5 | Gradebook | `Grade`, `GradeScore`; `dashboard/{teacher,assistant}/grades` | درجات بتوصل لولي الأمر والطالب أول ما تترصد | Grades that reach the student and guardian the moment you enter them | SHOT |
| T6 | Materials upload (PDF magic-byte checked) | `dashboard/{teacher,assistant}/materials`; `m6-materials-magic-bytes.test.ts` | مواد للطلاب، والملف بيتفحص فعلًا مش بس بامتداده | Materials for students, with files checked by content, not just extension | SHOT |
| T7 | Teacher wallet credited per completed session | `finance/distribution.ts`; `dashboard/teacher/wallet` | محفظتك بتتحدّث مع كل حصة تكتمل | Your wallet updates with every lesson that completes | NUM + SVG |
| T8 | Teacher-direct courses (no center): nullable `Course.centerId`, settled at payment time, platform commission only | `distribution.ts` teacher-direct guard; `services/subscriptions` | بتدرّس لوحدك؟ من غير سنتر، والفلوس بتتسوّى وقت الدفع | Teaching on your own? No center needed, and money settles at payment time | SVG |
| T9 | Double-pay guard: a teacher-direct course is skipped at session settlement | `distribution.ts` (`teacher_direct_settled_at_payment`) | مستحيل تتدفع مرتين على نفس الحصة | Structurally impossible to be paid twice for the same lesson | SVG |
| T10 | Collaboration requests with centers, either side initiating | `CollaborationRequest.initiator`; `dashboard/teacher/centers` | اطلب من السنتر أو استنى السنتر يطلب منك — بنفس الشروط الواضحة | Approach a center or be approached — same clear terms either way | SHOT |
| T11 | Hall rate visible **before** accepting | `resolveMethod2RatesForRooms`; collaboration panel | شايف سعر القاعة قبل الموافقة | You see the hall's rate before you agree | SHOT |
| T12 | Assistant accounts — full delegation except wallet/payouts/financial settings and managing other assistants | `TeacherAssistant`; `authz/acting-teacher.ts` | مساعد يعمل كل حاجة إلا فلوسك | An assistant who can do everything except touch your money | SVG |
| T13 | Assistant serves exactly one teacher (partial unique on live links) | `TeacherAssistant` partial unique | المساعد لمدرّس واحد بس — مقفولة على مستوى الداتابيز | An assistant belongs to exactly one teacher — enforced in the database | SVG |
| T14 | Assistants act **as themselves**, never impersonating | `CONSTITUTION.md` §7; messaging decision #4 | المساعد بيتكلم باسمه هو — عمره ما يظهر كإنه المدرّس | Assistants speak as themselves — never wearing the teacher's identity | SVG |
| T15 | Teacher team notes board with assistants | `TeamNote` (teacher scope); `dashboard/teacher/team`, `/notes` | لوحة مهام بينك وبين مساعدينك | A task board between you and your assistants | SHOT |
| T16 | Reviews received from students | `Review`; `dashboard/teacher/reviews` | تقييمات طلابك | Reviews from your students | SHOT |

### 2.3 Student → `/students`

| # | Feature | Evidence | Benefit (ar) | Benefit (en) | Proof |
|---|---|---|---|---|---|
| S1 | Onboarding: academic year + detailed track (شعبة) → subjects auto-assigned | `features/onboarding/**`; `services/catalog`; `GradeLevelTrack`, `SubjectOffering` | تختار سنتك وشعبتك، والمواد بتتحدد لوحدها | Pick your year and track — your subjects are assigned automatically | VID |
| S2 | Subjects page defaults to *your* track, with a separate browse-all mode | `dashboard/student/subjects`; `messages/*/student.json` `studentSubjects` | موادك إنت الأول، والبحث في كل المواد لما تحتاج | Your subjects first, with a full catalog search when you need it | SHOT |
| S3 | Real Egyptian education catalog: systems → stages → grade levels → tracks → subjects → offerings | `EducationSystem`, `Stage`, `GradeLevel`, `Track`, `Subject`, `SubjectOffering`; 45 catalog subjects seeded in production | الكتالوج المصري الحقيقي — مش قوايم مكتوبة بالإيد | The real Egyptian catalog — not hand-typed lists | SVG |
| S4 | Two payment plans per course: monthly (manual renewal) or per-session pass | `Subscription.plan`, `SubscriptionPlan`; `pricePerMonth`/`pricePerSession` | ادفع بالشهر أو بالحصة — إنت اللي تختار | Pay by the month or by the lesson — your choice | SHOT |
| S5 | Subscription **wraps** enrollment — coverage and roster are separate things | `Subscription.enrollmentId`; `services/subscriptions/coverage.ts` | الاشتراك هو تغطية الدفع، والقيد هو مكانك في المجموعة — حاجتين مختلفتين | Your subscription is payment coverage; enrollment is your place in the group | SVG |
| S6 | Student wallet: top-up online or cash, pay from balance all-or-nothing | `services/wallet/wallet.ts`, `cash-topup.ts`; `dashboard/student/wallet` | محفظة تشحنها وتدفع منها | A wallet you top up and pay from | SHOT + NUM |
| S7 | Balance is **derived from an append-only ledger**, not a stored number | `WalletLedger` in `IMMUTABLE_MODELS`; `CONSTITUTION.md` §2 | رصيدك ناتج عن كل القيود — تقدر تتبعه قيد قيد | Your balance is the sum of entries — traceable one by one | SVG + NUM |
| S8 | Attendance history as entries | `dashboard/student/attendance`; `AttendanceRecord` | حضورك مسجّل حصة حصة | Your attendance, lesson by lesson | SHOT |
| S9 | Grades, materials, schedule | `dashboard/student/{grades,materials,schedule}` | درجاتك وموادك وجدولك | Grades, materials, schedule | SHOT |
| S10 | Points engine — real seeded rules: attendance 10 · online payment 20 · first booking 50 · lesson booking 5 · rating 15 · streak 25 | `seed.ts` `POINTS_RULES`; `services/points/points.ts`; `PointsLedger` (UPDATE/DELETE revoked) | نقاط على الحضور والالتزام، وسجلها ما يتغيّرش | Points for attending and keeping up — and the record can't be edited | NUM |
| S11 | Reviews of teachers | `Review`; `dashboard/student/reviews` | قيّم مدرّسك | Rate your teacher | SHOT |
| S12 | Family linking by code | `ParentStudentLink`; `dashboard/student/family` | اربط حسابك بولي أمرك بكود | Link your account to your guardian with a code | SHOT |
| S13 | Messaging students↔teachers directly (assistant-first is UI ordering only, not a rule) | `queries/chat-scope.ts` EDGES; messaging decision #2 | كلّم مدرّسك مباشرة | Message your teacher directly | SHOT |
| S14 | Installable PWA with offline reads and push notifications | `app/sw.ts`; `@serwist/next`; `WebPushSubscription` | التطبيق بيتثبّت على الموبايل وبيشتغل من غير نت | Installs on your phone and works offline | VID |

### 2.4 Guardian → `/parents`

| # | Feature | Evidence | Benefit (ar) | Benefit (en) | Proof |
|---|---|---|---|---|---|
| P1 | **Default-minor.** A student is an adult only if `dateOfBirth` AND `dateOfBirthVerifiedAt` AND age ≥ 18. Missing or unverified = minor, oversight active | `queries/chat-minors.ts` `isMinor()` | القاصر هو الافتراضي — البيانات الناقصة معناها حماية شغّالة، مش حماية مقفولة | Minor is the default — missing data means protection **on**, never off | 3D/SVG shield |
| P2 | **Guardian channel gate.** A minor with no guardian email has adult-facing messaging locked (teacher, assistant, center_admin, center_staff) | `queries/chat-guardian.ts` | لو مفيش إيميل لولي الأمر، محادثات الكبار بتفضل مقفولة | With no guardian email on file, adult conversations stay closed | SVG |
| P3 | The lock is **narrow**: the child still attends, pays, reads materials, sees grades — and can always message their own parent | `chat-guardian.ts` (`parent` is not in `ADULT_ROLES`) | القفل على محادثات الكبار بس — الطفل يفضل يوصل لولي أمره دايمًا | Only adult chats are locked — the child can always reach their guardian | SVG |
| P4 | The account is **never suspended** by this rule; the deadline escalates (reminders → non-dismissable banner → the center is told) but never punishes | `chat-guardian.ts`; `guardian_contact_due_at`; cron `guardian-contact-reminders` | المهلة بتصعّد التنبيه — عمرها ما توقف الحساب | The deadline escalates the reminder — it never suspends the account | SVG |
| P5 | Parent oversight is **strictly read-only**: no write path in UI or API, never touches unread counters or read receipts | `queries/chat-oversight.ts`; messaging decision #6 | إشراف للقراءة فقط — ما بيغيّرش حتى علامة "مقروء" | Read-only oversight — it doesn't even change a read receipt | SVG |
| P6 | Oversight is bounded: **minor** children, **approved** links, **adult** threads only, with a disclosure banner shown to **both** sides | messaging decision #6; `CONSTITUTION.md` §2 ("the limits *are* the feature") | الحدود دي هي الميزة نفسها — والطرفين شايفين إن في إشراف | The limits are the feature — and both sides see that oversight exists | SVG |
| P7 | A parent pays for a specific lesson or month for their own approved child | `services/wallet/parent-wallet.ts` `assertApprovedChild`; `dashboard/parent/pay` | ادفع حصة ابنك أو شهره من فلوسك | Pay for your child's lesson or month from your own money | VID |
| P8 | Parent wallet, mirroring the student wallet's invariants (append-only ledger, DB `CHECK >= 0`, conditional decrement) | `ParentWalletLedger`; `parent_profiles_wallet_balance_nonneg` | محفظة لولي الأمر بنفس ضمانات محفظة الطالب | A guardian wallet with the same guarantees as the student's | SHOT |
| P9 | **Who paid never changes where the money goes** — the ledger still moves student → center/teacher; the payer is recorded on `payments.payer_user_id` | `parent-wallet.ts`; parent-pay decision #2 | مين دفع بيتسجّل، بس اتجاه الفلوس ما بيتغيّرش | Who paid is recorded — the direction of the money never changes | SVG |
| P10 | Neither wallet reaches across: a parent cannot spend the child's balance, and vice versa | parent-pay decision #3 (both directions proven) | ولي الأمر ما بيصرفش من محفظة ابنه — ولا العكس | A guardian can't spend their child's balance, and the reverse holds too | SVG |
| P11 | Attendance / progress / fees per child | `dashboard/parent/{attendance,progress,fees,children}` | حضور ودرجات ومصاريف كل ابن | Attendance, progress and fees per child | SHOT |
| P12 | Notifications: absence marked, grade entered, payment recorded, and more | `NotificationType` enum; `services/notifications/notify.ts` `CHANNEL_MATRIX` | إشعار فوري بالغياب والدرجة والدفع | Instant notice on an absence, a grade, a payment | SHOT |

### 2.5 Trust → `/trust`

| # | Claim | Evidence | Proof |
|---|---|---|---|
| R1 | **The ledger cannot be edited or deleted.** `REVOKE UPDATE, DELETE` on `transactions`, `points_ledger`, `audit_logs`, `session_settlements`; `REVOKE DELETE` on `invoices`, `payouts`, `blacklist_cascade_actions` | 7 REVOKE statements across `packages/database/prisma/migrations/**` | SVG |
| R2 | **Not even the super admin is exempt.** Both apps connect as the same `edura_app` role; `platformDb()` only sets an RLS bypass GUC, which table GRANTs don't read | `db/scope.ts`; center-oversight decision #4 | SVG |
| R3 | **Center data isolation is enforced in the database**, not in application code — 15 row-level-security policies | `grep "CREATE POLICY"` → 15 across migrations | SVG |
| R4 | **Money is integer piasters**, never floats | `Subscription.price: Int`; `fees.ts` | NUM |
| R5 | **Every write is attributed**, including automated ones (`النظام`) | `AuditLog`; `CONSTITUTION.md` §1 | SHOT |
| R6 | **Sessions revoke hard.** A DB trigger deletes a user's `auth_sessions` in the same statement as any deactivating write — it holds even for SQL that never touches Prisma | `users_revoke_sessions` trigger, migration `20260801170000_better_auth` | SVG |
| R7 | **2FA (TOTP + backup codes) is required** for back-office roles, optional and guided for center owners | `TwoFactor`; superadmin `two-factor-setup` layout gate | SHOT |
| R8 | Passwords: the admin never sees or sets one — reset is a link | admin-users decision #2 (`password_hash` unchanged, proven) | SVG |
| R9 | **One suspension mechanism.** better-auth's `banned` columns are deliberately never used; `users.status` is the single path | admin-users decision #1 | SVG |
| R10 | Login is rate-limited with a constant-time dummy-hash compare (no email enumeration) | C2 + H5; `lib/auth/auth.ts` before-hook | SVG |
| R11 | Security headers on both apps (HSTS, nosniff, Referrer-Policy, X-Frame-Options) | H4 | — |
| R12 | Soft-delete for destructive operations; superadmin writes are audited in the same transaction as the write | `DeletionRequest`; center-control audit rows | SVG |
| R13 | Refunds can't double-refund — partial unique index `transactions_one_refund_per_payment` | H3 migration | SVG |
| R14 | Privacy & terms pages exist and are the source for these claims | `app/[locale]/{privacy,terms}`; `features/legal/**` | SHOT |

### 2.6 Cross-cutting (used across pages, not a page of its own)

| # | Feature | Evidence |
|---|---|---|
| X1 | Bilingual ar/en, Arabic-RTL first (`defaultLocale: "ar"`, `localePrefix: "always"`) | `apps/www/src/i18n/routing.ts` |
| X2 | Dark mode via `[data-theme="dark"]` | `CONSTITUTION.md` §6.5 |
| X3 | Realtime chat over Socket.IO (`apps/realtime`) | `apps/realtime/src/server.ts` |
| X4 | Push notifications (VAPID web-push + FCM) | `WebPushSubscription`, `UserDeviceToken`, `services/{webpush,fcm}` |
| X5 | Cloudinary media with deterministic public IDs and magic-byte checks | `server-core/media/**` |
| X6 | 43 migrations, all applied to production; `verify-db` 25/25 | `packages/database/prisma/migrations/` |

---

## 3. Things that exist but must NOT be claimed as shipped

Stating these here so no scene accidentally sells them.

| Thing | Reality | Site treatment |
|---|---|---|
| **Paymob** | Gateway abstraction + working **mock** driver. The real paymob driver is an **empty stub** with TODOs; `PAYMENTS_MODE=mock` is the default and keys don't exist yet | Say "online card + mobile wallet payments **built on Paymob**" only if you confirm the account is coming. Safest: describe **cash + wallet + online** as the model, and don't show a Paymob logo or a card iframe screenshot |
| **WhatsApp** | Meta Cloud API behind an abstraction, running in **mock** mode; no verified business number | Do not claim WhatsApp delivery. Email is the primary invite channel and is real (`INVITE_CHANNELS` defaults to `email`) |
| **Chatbot tables** | `ChatbotConfig`/`ChatbotFaq`/`ChatbotConversation` exist in the schema but are **inert** — no logic wired, and AI assistants are permanently descoped | Never mentioned. Not a feature |
| **Scholarships / bookstore / video lessons** | Permanently descoped 2026-07-21; never built | Never mentioned |
| **Debt / pay-later** | Deferred; no feature, no table, no UI | Never mentioned |
| **Pricing / commission rates** | `commission_settings` rows are configured per platform/center/room. There is **no public price list** in the repo | `/pricing` must explain the **model** (how a lesson's money is split, who sets what, what the ceiling means) and **not invent a percentage**. Any actual number has to come from you |
| **Customer testimonials, logos, student counts** | None exist. Production has 2 staff accounts and 0 centers | Absent from the site entirely. `ASSETS-TODO.md` will list them as human-provided-or-omitted |

---

## 3b. Post-merge delta (re-verified against `main`, 2026-08-02)

Three workstreams merged after this matrix was first written. Verified by
reading `main` directly (`git show main:…`), not assumed. **Everything below is
new evidence and changes what the showcase must link to rather than build.**

### The public marketing surface already exists in `apps/www`

`MARKETING_LINKS` in `apps/www/src/features/marketing/nav.ts` is the single
table driving www's header, footer and `app/sitemap.ts`. The showcase links
into it and duplicates none of it:

| Route | What it is |
|---|---|
| `/pricing` | «إزاي بنحاسب» — every figure computed at request time from the live `commission_settings` global row |
| `/help`, `/help/[slug]` | 11 MDX articles per locale, prerendered |
| `/faq` | native `<details>`, so answers exist without JS |
| `/changelog` | real ship dates |
| `/contact` | rate-limited public form → `contact_submissions` |
| `/terms`, `/privacy` | already existed |

> **No status page exists.** The brief asked for one; `main` has only
> `apps/www/src/app/api/health/route.ts`, a JSON endpoint. The showcase links
> the pages that exist and does not invent a status page. Building one is a
> separate decision.

### New `/trust` evidence — the strongest material on the site

| # | Claim | Evidence in `main` |
|---|---|---|
| R15 | **Analytics never sees a name, an email, or anything a human typed** — IDs only | `packages/observability/src/index.ts`: "IDs only — never a name, email, phone" |
| R16 | **Minors are never identified to any analytics vendor at all** | `isMinorRole` in `packages/observability/src/identity.ts` |
| R17 | **Session replay, recording and autocapture are off** | ops layer commit `51a9321` |
| R18 | `beforeSend` deletes cookies, headers and bodies and redacts single-use tokens | `redact.ts` (`redactDeep`, `redactUrl`, `DENY_URLS`) |
| R19 | **Feature flags are DEFAULT-CLOSED** — a key with no row reads as off, and a failing read returns the fallback rather than "enabled"; "never set" is a distinct state from "off" | maturity commit `900c666` |
| R20 | The contact inbox is **read-only by construction** — no create function exists; the only update touches triage columns | maturity commit `900c666` |
| R21 | Center audit viewer takes its scope **from the session**, so there is no `centerId` parameter to tamper with, and NULL-center platform rows cannot leak through an equality filter | `dashboard/admin/audit` |
| R22 | **Arabic receipts** render through the browser's own print engine because `pdf-lib` does no Arabic shaping or bidi | `/receipts/[paymentId]` |
| R23 | `sendResetPassword` is deliberately **not** wired to better-auth: its writer does not bump `users.token_version`, so wiring it would create a second way to set a password that leaves sessions alive — silently undoing L1 | ops commit `51a9321` |

### Corrections to earlier rows

- **§3 "Pricing / commission rates — no public price list"** is now WRONG. `/pricing`
  publishes live rates derived by the settlement engine's own pure functions.
  Ali's decision (2026-08-02): the showcase **mirrors those live figures** rather
  than restating or inventing them — implemented by calling the same
  `getPricingExamples()`, moved to `@repo/server-core` with a re-export shim in
  www so there is one implementation and two renderers.
- **`coursesCount`** (§2b of ASSETS-TODO) is **fixed in `main`** — `listRosterStudents`
  now does an `enrollment.groupBy` and returns a real count. The affected
  screenshots must be re-captured, not the bug re-fixed.
- New packages to be aware of: `packages/notifications` (one owner for
  transactional email, react-email ar/en) and `packages/observability`.

---

## 4. Proposed site map

```
/                 الرئيسية      3D notebook hero → 5 pinned scenes → role cards → CTA
/owners           صاحب السنتر   the money story + the counter
/teachers         المدرّس        attendance, offline, wallet, assistants
/students         الطالب         track → subjects → plan → pay → points
/parents          ولي الأمر      minor-safety first, then oversight & notifications
/trust            الثقة والأمان   immutability, isolation, audit, sessions
/pricing          إزاي بنحاسب    the settlement model, no invented numbers
```

Both locales: `/ar/*` (default) and `/en/*`. Nav + footer link to the main app's
`/login` and `/register`.

---

## 5. Scroll storyboard

Notation per scene: **PIN** = ScrollTrigger pin · **SCRUB** = progress tied to scroll ·
**PLAY** = fires once on enter. Every scene has a reduced-motion variant (final state,
opacity only) and an RTL mirror where the x-axis is involved.

### 5.1 `/` — Home

| # | Scene | Motion | Visual | Copy (ar) |
|---|---|---|---|---|
| H0 | **The notebook** | PIN + SCRUB, 3D | A stylized الدفتر in paper/indigo/teal, closed. Scroll opens it; five tabbed pages flip, one per role; the camera settles on the spread | «سنترك ومدرّسينك وطلابك — في دفتر واحد» |
| H1 | **One lesson, end to end** | PIN + SCRUB | Horizontal filmstrip (RTL-mirrored): حجز → تشيك-إن → الحصة → التسوية. Each stage lights as it passes | «حصة واحدة، من الحجز للتسوية» |
| H2 | **The split draws itself** | PIN + SCRUB, `SVG` DrawSVG | The settlement diagram from `distribution.ts`: lesson price splits into teacher / center / platform. Figures in `<Num>` count as their branch draws. Toggle between the three branches (room % · per-student · no-room) | «التسوية بتحصل لوحدها — وإنت شايف الحساب كله» |
| H3 | **The entry that can't be edited** | PIN + PLAY | A ledger row is written, then the **real** `.seal-in` seal presses on it at `rotate(-6deg)` (does not mirror in RTL). Beneath: `REVOKE UPDATE, DELETE ON transactions` | «القيد اتكتب. مفيش تعديل، ومفيش مسح» |
| H4 | **The shield** | PIN + SCRUB | Minor-safety: a student silhouette, adult contacts greying out as the guardian-email condition fails, one field lighting them back up. Parent link stays lit throughout | «القاصر هو الافتراضي» |
| H5 | **Role cards** | PLAY (Flip) | Five cards; hover/tap expands to that role's three headline features, then links to the page | — |
| H6 | **CTA** | PLAY | Hairline-framed panel → `/register` on the main app | «ابدأ مجانًا» |

### 5.2 `/owners` — صاحب السنتر

| # | Scene | Motion | Visual |
|---|---|---|---|
| O-hero | SplitText **by word** (Arabic-safe) headline + a still of the center dashboard in an SVG browser frame | PLAY | SHOT |
| O-1 | **The counter** — the recorded flow: code typed → student found → `needs_payment` → cash → checked in, in one screen | PIN, video scrubs with scroll | VID |
| O-2 | **Cash and card, one book** — two inputs converging into a single ledger column | PIN + SCRUB | SVG |
| O-3 | **The settlement diagram**, the owner's cut foregrounded; the three pricing branches as tabs | PIN + SCRUB | SVG + NUM |
| O-4 | **Your hall, your rate — up to the ceiling** — a slider that stops at the published cap, with the teacher's view shown simultaneously | PIN, interactive | SHOT |
| O-5 | **Rooms, staff, expenses, reports** — screenshot cluster in device frames, Flip between them | PLAY | SHOT |
| O-6 | **Every action has a name on it** — an audit row assembles: actor · on-behalf-of · target · before/after · time | PIN + SCRUB | SVG |
| O-CTA | | PLAY | |

### 5.3 `/teachers` — المدرّس

| # | Scene | Motion | Visual |
|---|---|---|---|
| T-hero | Headline + phone frame showing the attendance screen | PLAY | SHOT |
| T-1 | **Take the register** — recorded flow, leads the page as briefed | PIN, video | VID |
| T-2 | **The net drops** — offline: the connection cuts, marks queue with per-record commit state, net returns, outbox drains. This is the page's signature scene | PIN + SCRUB | VID + SVG |
| T-3 | **Door check-in** — two-stage diagram; the counter-only student stays visibly *not present* | PIN + SCRUB | SVG |
| T-4 | **Paid per lesson** — wallet counter increments as sessions complete; "exactly once" stamped by the `distributedAt` claim | PIN + SCRUB | NUM + SVG |
| T-5 | **An assistant who can't touch your money** — capability grid; the money column is **absent**, not greyed (per §7: excluded capabilities are absent) | PIN + PLAY | SVG |
| T-6 | Classes, grades, materials, reviews cluster | PLAY | SHOT |
| T-CTA | | PLAY | |

### 5.4 `/students` — الطالب

| # | Scene | Motion | Visual |
|---|---|---|---|
| S-hero | Headline + phone frame | PLAY | SHOT |
| S-1 | **Pick your track, get your subjects** — catalog tree animates from system → stage → grade → track, then subjects populate | PIN + SCRUB | SVG + VID |
| S-2 | **Monthly or per-lesson** — two plan cards; picking one runs the checkout flow video | PIN | VID |
| S-3 | **Your balance is a sum, not a number** — ledger entries stack and the total derives itself with the double rule | PIN + SCRUB | NUM + SVG |
| S-4 | **Points** — the six real seeded rules as a counter board | PLAY | NUM |
| S-5 | **Works with no signal** — PWA install + offline read | PLAY | VID |
| S-CTA | | PLAY | |

### 5.5 `/parents` — ولي الأمر

Leads with safety, per the brief.

| # | Scene | Motion | Visual |
|---|---|---|---|
| P-hero | **The shield** — the site's second-most-expensive scene. Not 3D; an SVG shield drawn by DrawSVG while the default-minor condition is stated as one positive line | PIN + SCRUB | SVG |
| P-1 | **What the lock actually locks** — a contact list where adult rows dim and the parent row stays lit; the account, classes, wallet all stay lit. States plainly: never suspends | PIN + SCRUB | SVG |
| P-2 | **The deadline escalates, it never punishes** — a timeline: reminders → banner → the center is told. The account never darkens | PIN + SCRUB | SVG |
| P-3 | **Read-only means read-only** — the oversight screen with every write affordance visibly absent; the disclosure banner shown on both sides | PIN | SHOT + SVG |
| P-4 | **Pay for your child's lesson** — recorded flow | PIN, video | VID |
| P-5 | **Who paid doesn't change where it goes** — the ledger arrow stays student → center; the payer name attaches to the side | PIN + SCRUB | SVG |
| P-6 | Attendance, progress, notifications cluster | PLAY | SHOT |
| P-CTA | | PLAY | |

### 5.6 `/trust` — الثقة والأمان

| # | Scene | Motion | Visual |
|---|---|---|---|
| R-hero | «الواجهة بتقول الحقيقة عن اللي النظام بيضمنه» — the constitution's own thesis | PLAY | — |
| R-1 | **Append-only** — rows accumulate; an edit attempt returns `permission denied`; the 7 REVOKE statements listed | PIN + SCRUB | SVG |
| R-2 | **Isolation** — two centers side by side; a query from one reaches for the other's row and is refused by RLS, not by an `if` | PIN + SCRUB | SVG |
| R-3 | **The audit trail** — rows assemble, and the trail itself is shown to be un-editable | PIN + SCRUB | SVG |
| R-4 | **Sessions revoke hard** — a deactivating write and the session dying in the same statement | PIN + SCRUB | SVG |
| R-5 | **2FA** | PLAY | SHOT |
| R-6 | Links to the real `/privacy` and `/terms` | — | — |

### 5.7 `/pricing` — إزاي بنحاسب

One scrubbed calculator: pick a branch (room % · per-attending-student · teacher-direct),
watch the split derive with `<Num>` figures and the double-rule total. **Rates are inputs
you can move, not claims** — the page states that the actual rate is set per agreement, so
no number is invented.

---

## 6. Recommended stack (decisions I need to make, with reasons)

| Choice | Recommendation | Why |
|---|---|---|
| Smooth scroll | **Lenis**, not ScrollSmoother | ~3KB vs ~15KB; no wrapper/content markup requirement fighting the App Router layout; `position: sticky` keeps working (ScrollSmoother's transform container breaks it, and several scenes above want sticky sub-nav); ScrollTrigger integration is one `lenis.on('scroll', ScrollTrigger.update)` line. We lose ScrollSmoother's `data-speed` effects, which this storyboard doesn't use |
| GSAP plugins | ScrollTrigger, SplitText, DrawSVG, Flip. **MorphSVG only if a scene genuinely morphs** — currently none does, so I'd drop it rather than ship an unused plugin | All free since GSAP 3.13 |
| SplitText + Arabic | **Words/lines only for `ar`**, chars permitted for `en` | Char-splitting wraps each glyph and breaks the cursive joins and ligatures. Enforced by a helper that reads the locale, not by remembering |
| 3D | React Three Fiber v9 + drei, **no postprocessing** | R3F v9 supports React 19.2. Postprocessing would blow the ~300KB gzip budget on its own |
| 3D fallback | Static poster render on mobile **and** reduced-motion | Per brief |
| i18n | next-intl, mirroring `apps/www/src/i18n/{routing,request}.ts` exactly | Same solution, same `ar` default, same `localePrefix: "always"` |
| Tokens | Import `@repo/ui/styles/globals.css`; add **no** new colours, fonts, or shadows | `CONSTITUTION.md` §2 |

---

## 7. Open questions for you

1. **The motion carve-out (§0.1)** — approve the derivation, or hold the single-animation
   budget literally? Everything downstream depends on this.
2. **Deployment / relationship to the existing landing page (§0.2)** — A (subdomain,
   recommended), B (replace), or C (path)?
3. **Paymob and WhatsApp copy (§3)** — how do you want them described, given both run in
   mock mode today? My default is to describe cash + wallet + online generically and name
   neither vendor.
4. **`/pricing`** — confirm it explains the model with no rate. If you want real numbers
   published, they have to come from you.
5. **Branch (§0.4)** — rename to `feat/showcase`, or build on the current branch?
6. **Seeded demo center for Phase 2** — I'll write a new `is_demo` seed with fictional
   Arabic names. Confirm it runs against **dev only** (`bun run db:guard dev`) and that
   the money-ledger rule applies: the seed writes no `transactions`, `payments`, or wallet
   rows, so any figure in a screenshot comes from a flow I run manually in the preview.
