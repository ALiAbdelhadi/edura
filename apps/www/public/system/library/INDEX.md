# The screen library

Twenty-two screens of `apps/erp`, beyond the nineteen curated slots the site is
built around. Captured by
[`library.spec.ts`](../../../../erp/tools/system-shots/library.spec.ts) as real
signed-in demo roles, Arabic · light · 1440×900 unless the row says phone.

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
[`INVENTORY.md` §11](../../../../erp/tools/system-shots/INVENTORY.md).

**694 KB across 22 files.** Largest is 75 KB, against the 180 KB per-file
budget.

---

## Read this before publishing any of these

Two files carry visible product defects. They are kept because the defect is
worth knowing about, not because they are ready.

| File | Problem |
|---|---|
| `admin-external-teachers-gaps.webp` | **DO NOT PUBLISH.** The «المصدر» column renders raw debug output — `marked: 0 · enrolled: 0`, `status: scheduled · settled: no`, and `studentId: c8204eb0-…-59a215da7a9a · studentName: يوسف أحمد`. Untranslated English key/value pairs and a raw UUID beside a name. The data is demo, so nothing real leaks, but it is developer output on a user-facing screen. |
| `admin-audit.webp` | Publishable, with a caveat: event names render as raw enums (`points.adjusted`, `center.updated`) in an otherwise Arabic screen. On an audit log that reads as deliberate; judge it against the page it would sit on. |

---

## The differentiators

Nothing else in the product does these, and none of the curated nineteen shows
them.

| File | Portal · route | What is on screen | What it proves |
|---|---|---|---|
| `admin-external-teachers.webp` | center · `/dashboard/admin/external-teachers` | The off-system teacher records at سنتر النيل التعليمي (`extdemo`) | A center can run teachers who have no account on the platform and still keep them in its books |
| `admin-external-teachers-gaps.webp` | center · `…/external-teachers/gaps` | 17 rows of reconciliation gaps — lessons held with no attendance, groups with no price, students recorded but unpaid — each with teacher, class and status | The manual-entry path is audited rather than trusted. **Defect above** |
| `admin-audit.webp` | center · `/dashboard/admin/audit` | «كل عملية حساسة تمت داخل مركزك — من قام بها، وعلى ماذا، ومتى», the immutability banner, and real rows (`points.adjusted`, `center.updated`) with actor and timestamp | Every back-office write is attributed, and the log says outright it cannot be edited or deleted from any screen |
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
| `admin-fees.webp` | center · `/dashboard/admin/fees` | Who owes what |
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

All demo, all `is_demo = true`. The capture asserts that no known-real
identifier reaches the DOM — `tarekaboelnasr999`, `tarekaccountant`,
`accountant@edura.eg`, `ghost-user-9x` — and every one of the 22 passed.

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
