# The screen library

Twenty-one screens of `apps/erp`, beyond the nineteen curated slots the site is
built around. Captured by
``library.spec.ts`` as real
signed-in demo roles, Arabic · light · 1440×900 CSS unless the row says phone,
captured at deviceScaleFactor 3 — so each master is **4320×2700** actual pixels.

**Nothing here is wired into a page.** `src/media/manifest.ts` is the only route
by which an image reaches the site, and no file in this directory appears in it.
That is deliberate: this is a set of choices somebody can make later, not a set
of images that quietly started shipping. To use one, add a slot to the manifest
and point it here.

Selection rule: a shot earns its place only if it proves something the curated
nineteen do not. That is why there is no `/messages`, `/notifications`,
`/settings` or `/notes` — those are the same two components repeated across
eight portals, and photographing each eight times is thirty files that say one
thing. Reasoning in
``INVENTORY.md` §11`.

**3.2 MB across 21 files**, full-resolution masters. That is storage, not
bandwidth: nothing here is in the manifest, so no visitor downloads any of it —
and anything promoted into the manifest is resized per device by `next/image`
rather than served at this size.

---

## Two defects found by capturing, both now fixed

**Fixed 2026-08-18 — `admin-external-teachers-gaps` is now publishable.** It
previously printed its payload verbatim in the «المصدر» column —
`marked: 0 · enrolled: 0`, `status: scheduled · settled: no`, and a raw
`studentId:` UUID beside a child's name — English keys in an entirely Arabic
table. The column now renders sentences («لم يُسجَّل أحد من 3»،
«انتهت ولم تُوزَّع حصيلتها»، «لا حضور مسجَّل») and the id is **dropped rather
than translated**: it identifies the row for the server, and the operator needs
the name. `library.spec.ts` now asserts, over every rendered row rather than
just the ones above the fold, that no payload key and no bare UUID reaches the
screen — so it cannot come back quietly.

**Fixed 2026-08-18 — `admin-audit` reads in Arabic.** Actions and target types
are stored as machine strings and were printed verbatim: `points.adjusted`,
`center.updated`, `pointsledger`. They now render as words («تعديل نقاط»،
«تعديل بيانات السنتر»، «دفتر النقاط»), and the fallback for an action nobody
has translated yet strips the separators rather than showing a dotted
identifier — so a missing key looks like awkward English, not like debug
output. `library.spec.ts` asserts no dotted enum reaches the screen.

**The record ids stay.** Unlike the gaps screen, where the id was noise beside a
child's name, an audit row exists to say which record changed — support reads
those back. They are LTR-isolated so a hex string cannot reorder the Arabic
around it.

---

## The differentiators

Nothing else in the product does these, and none of the curated nineteen shows
them.

| File | Portal · route | What is on screen | What it proves |
|---|---|---|---|
| `admin-external-teachers.webp` | center · `/dashboard/admin/external-teachers` | The off-system teacher records at سنتر النيل التعليمي (`extdemo`) | A center can run teachers who have no account on the platform and still keep them in its books |
| `admin-external-teachers-gaps.webp` | center · `…/external-teachers/gaps` | 17 rows of reconciliation gaps — lessons held with no attendance, groups with no price, students recorded but unpaid — each with teacher, class and status | The manual-entry path is audited rather than trusted |
| `admin-audit.webp` | center · `/dashboard/admin/audit` | «كل عملية حساسة تمت داخل مركزك — من قام بها، وعلى ماذا، ومتى», the immutability banner, and real rows («تعديل نقاط»، «تعديل بيانات السنتر») with actor, record and timestamp | Every back-office write is attributed, and the log says outright it cannot be edited or deleted from any screen |
| `parent-oversight.webp` | parent · `/dashboard/parent/oversight` | Both children as «أقل من 18», and the rule stated in full: «الاطلاع فقط — لا يمكنك الرد، وابنك يعلم أنك تستطيع رؤية هذه المحادثات» | The child-safety model — a parent watches, cannot speak, and the child is told. Counts read 0 conversations; content needs the absent `msgdemo` seed |
| `student-family.webp` | student · `/dashboard/student/family` | Family code `SHOW001` with copy and regenerate, a guardian field accepting a phone **or** an email, and an approved link request from سهير قنديل | A parent can be linked without an email address — the mechanism behind the guardian gate |
| `teacher-team.webp` | teacher · `/dashboard/teacher/team` | The teacher's assistants | Who is allowed to act on this teacher's behalf, which is what makes the on-behalf-of attribution meaningful |

---

## The daily work

| File | Portal · route | What it shows |
|---|---|---|
| `admin-students.webp` | center · `/dashboard/admin/students` | The roster, 12 students |
| `admin-students-detail.webp` | center · `…/students/08b929d8-…` | One student's whole file in one place |
| `admin-teachers.webp` | center · `/dashboard/admin/teachers` | The center's teachers |
| `admin-classes.webp` | center · `/dashboard/admin/classes` | Groups and the teacher on each |
| `admin-expenses.webp` | center · `/dashboard/admin/expenses` | The five seeded costs (rent, utilities, salaries, supplies, marketing) — the other half of net profit |
| `admin-checkin.webp` | center · `/dashboard/admin/checkin` | Check-in by student code, no card needed |
| `teacher-classes.webp` | teacher · `/dashboard/teacher/classes` | The densest list in the product |
| `teacher-grades.webp` | teacher · `/dashboard/teacher/grades` | The mark book |
| `teacher-materials.webp` | teacher · `/dashboard/teacher/materials` | Files issued to a specific group |
| `teacher-door.webp` | teacher · `/dashboard/teacher/door` | The teacher's own door check-in — the fallback when no assistant is on the hall. Reachable only because this teacher is `counter_and_door` |
| `staff-checkin.webp` | staff · `/dashboard/staff/checkin` | The receptionist's counter, shot as the receptionist because that is who works it |

---

## Phone

| File | Portal · route | What it shows |
|---|---|---|
| `student-schedule-phone.webp` | student · `/dashboard/student/schedule` | The week, on the device a student owns |
| `student-grades-phone.webp` | student · `/dashboard/student/grades` | Marks |
| `student-wallet-phone.webp` | student · `/dashboard/student/wallet` | Wallet entries |
| `parent-children-phone.webp` | parent · `/dashboard/parent/children` | The two-child selector at phone width |

---

## Accounts used

All demo, all `is_demo = true`. The capture asserts that **no identifier
belonging to any non-demo account** reaches the DOM. That list is generated from
the database by `build-forbidden.ts` — 97 terms from 39 non-demo accounts, every
email and phone in both the typed `01…` and stored `+201…` form — rather than
hand-typed, which is how it turned out this database carries a second real
person nobody had listed. Every one of the 22 passed.

| Role | Account |
|---|---|
| Center owner | `showcasedemo-marwan@edura.test` |
| Center owner, off-system teachers | `extdemo-mona@edura.test` |
| Teacher (`counter_and_door`) | `showcasedemo-hossam@edura.test` |
| Staff, receptionist | `showcasedemo-laila@edura.test` |
| Parent, two children | `paydemo.sami@edura.demo` |
| Student | `showcasedemo-student-1@edura.test` |

---

## Verification depth, stated plainly

Every file was produced by a capture that asserted its own screen text and, for
list screens, a minimum row count — so none of them is a photograph of a
skeleton or an empty state. Four were then inspected pixel by pixel:
`admin-external-teachers-gaps` (which is how its defect was found),
`admin-audit`, `parent-oversight`, `student-family`. The rest are described from
their route and the assertions the capture enforced, not from a visual read.

## Re-capturing

```
bun run --cwd apps/erp dev                       # :3002, in another terminal
bun --env-file=.env --cwd packages/database prisma/showcase-live-demo-seed.ts
cd apps/erp && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test \
  --config=tools/system-shots/playwright.config.ts -g "library"
tools/system-shots/optimise.sh
```

`teacher-door` depends on a lesson existing today, which the live seed creates
from the clock at seed time — re-run it on the day.
