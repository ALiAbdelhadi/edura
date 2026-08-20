# Cleanup notes — student portal IA pass

What the restructure orphaned, what was deleted, and what was found dead and
deliberately left. Companion to [STUDENT_IA_AUDIT.md](STUDENT_IA_AUDIT.md).

Baseline for every "before" claim below: **`9e8ce65`**, the commit this pass
started from.

---

## 1. How "orphaned" was decided

Three matchers were tried, and the first two were wrong in opposite directions.
The method matters more than the list, because whoever runs this next will hit
the same two traps.

**Trap 1 — a loose matcher under-reports.** Searching for the bare leaf as a
substring counts `.startTime` as a use of `studentClass.start`, and
`Object.entries` as a use of `studentClass.entries`. That pass found 28 dead
keys; the real number was higher.

**Trap 2 — an exact matcher over-reports.** Requiring the full dotted path
`"studentIdCard.title"` marks almost the whole catalogue dead, because
`useTranslations("studentIdCard")` then calls `t("title")` — the full path never
appears anywhere. That pass claimed 330 dead keys out of 527.

**What actually works** — a key is live if ANY of these hold:

1. **Any SUFFIX of its path appears quoted.** `studentEmulator.screens.myTab` is
   reached as `t("screens.myTab")` under `useTranslations("studentEmulator")`,
   so the matcher has to try `"studentEmulator.screens.myTab"`, `"screens.myTab"`
   and `"myTab"`. This is what both earlier passes missed.
2. **Its namespace is completed at RUNTIME.** `t(\`studentWallet.type_${e.type}\`)`
   means no literal `type_topup` exists anywhere, and those four keys are very
   much alive. The prefixes in this repo were enumerated by grepping for
   `` t(`…${ `` and `` asKey(`…${ ``: `studentWallet.type_`,
   `studentMaterials.types.`, `gradeBands.`, `status.`, `nav.`, `roles.`,
   `checklist.`, `screens.*_`, `missions.`, `steps.`, and the parent/teacher/
   center equivalents.
3. It is referenced from `.mdx` help content, which is scanned alongside source.

**And the decisive step: run that matcher at BOTH commits.** A key counts as
orphaned by this work only if it was used at `9e8ce65` and is unused now.
Comparing like with like cancels whatever bias the matcher still has — which is
how the false positives above were caught rather than acted on.

---

## 2. Deleted

### 2.1 Translation keys — 11 keys, removed from BOTH `ar` and `en`

All eleven were verified three ways: unused now, used at `9e8ce65`, and a direct
repo-wide grep (including `.mdx`, `.md` and the seeds) returning no consumer.

| Key | Orphaned by | Was |
|---|---|---|
| `studentClass.daySun` … `daySat` (7) | Step 6 — schedule | The `dayKeys` array behind the old weekday picker. The dated week strip formats its own labels through `formatDate(weekday: "short")`, so the catalogue no longer needs seven hand-written day names that could drift from the calendar beside them. |
| `studentClass.upcoming` | Step 6 — schedule | A cell in the four-counter totals sheet that was removed. |
| `studentClass.enrolledCourses` | Step 6 — schedule | Heading of the enrolled-course sheet that was removed. |
| `studentClass.noEnrolledCourses` | Step 6 — schedule | Its empty state. |
| `studentClass.noSessionsOn` | Step 6 — schedule | The old empty state, which appended a weekday name to a fragment ("لا توجد حصص يوم" + الثلاثاء). Replaced by `noSessionsThatDay`, a complete sentence — a fragment plus a variable does not survive translation into a language that inflects differently. |

`studentClass.enrolledCourses` needed a second look: a repo grep hits
`preview-seed.ts`, but those are a local JavaScript variable of the same name,
not a translation key.

### 2.2 Code

| Removed | File | Why |
|---|---|---|
| `dayNames` + `dayKeys` arrays | `schedule-screen.tsx` | The weekday-name matching they served is the bug the rewrite fixed. |
| `type Enrollment` + the `enrollments` `useList` | `schedule-screen.tsx` | Fed only the enrolled-course sheet that was removed. One fewer request per visit. |
| The totals sheet and the enrolled-course sheet | `schedule-screen.tsx` | 214 lines net. |
| The `courses` `useList` (`pageSize: 100`) | `grades-screen.tsx` | Built a course-name map that `GET /grades` already provides, enriched per row for this reader. One fewer request per visit. |
| The two counter cards + the local aggregation | `grades-screen.tsx` | 131 lines net; the aggregation moved into `features/student/grades.ts` where the home card shares it. |
| The "show card" button branch + the `IdCard` icon import | `student-id-screen.tsx` | The card now loads with the page. |
| `Num` import | 5 center-portal screens | Became unused when their dates moved to `DateText`. |
| `studentId` prop | `student-recent-attendance.tsx` | See below — this one is worth reading. |

**The `studentId` prop is the only deletion that was not merely tidiness.** It
was added speculatively so a parent could later read a child's recent lessons,
and nothing ever passed it. But the course names in that list come from the
CALLER's own `enrollments`, and a parent's enrollments are not their child's — so
the prop offered a parent view that would have returned the right dates against
the wrong subjects. It was removed and the reason recorded in the file, so the
next person does not re-add it.

---

## 3. Found orphaned and deliberately LEFT

### 3.1 Already dead before this pass — 32 keys

Dead at `9e8ce65` and dead now, so nothing here was caused by the IA work. They
are the residue of three earlier removals: the assignments screen (there is no
`Assignment` model), the standalone Browse Courses page absorbed into Subjects,
and the 2026-08-10 portal de-duplication.

```
studentBrowse.allSubjects, hideFilters, moreFilters, noCourses,
  noDescription, priceRange, seatsFilled
studentClass.assignment, assignmentsSubtitle, averagePercent, dueVsCompleted,
  filterAll, noAssignments, noSubjectTrend, noWeeklyTrend, overallGpa,
  subjectComparison, totalEntries, weekShort
studentDashboard.allGrades, gradeTrend, noClassesToday, noGradeTrend,
  noPerformanceData, scheduleEyebrow, subjectPerformance, thisWeek,
  viewAttendance, yourRecord
studentFamilyCode.invalidEmail
studentIdCard.pendingBody
studentMaterials.uploaded
studentReviews.eligibleTeachers
```

**Why left:** this pass's remit was the student IA, and the cleanup rule is about
not leaving one's own removals half-done. Deleting another workstream's residue
in the same commit would hide this pass's actual footprint inside a much larger
diff, and `studentBrowse.*` in particular is a coherent set that a future browse
surface would want back. They are listed here so the decision is a decision
rather than an oversight — a follow-up commit can take the whole block at once.

### 3.2 Belongs to work in flight — 3 keys

`studentClass.presentDays`, `lateExcused`, `absentDays`.

These went from used to unused **during this audit**: a parallel session replaced
the three attendance `Metric` cards with a `DonutChart` in
`features/attendance/attendance-screen.tsx`. They are not this pass's orphans,
and that file is being edited right now — the donut may yet want the same three
labels for its legend. Deleting them would be deleting under someone's hands.

### 3.3 Live despite looking dead — do not delete

`studentWallet.type_topup`, `type_payment`, `type_refund`, `type_adjustment`.

Built as `t(\`studentWallet.type_${e.type}\`)`, so no literal ever appears. An
earlier version of this audit listed all four as dead. They are rendered on
every wallet row.

---

## 4. What was NOT orphaned, and why that is worth stating

Two things the audit expected to find dead and did not:

- **`studentIdCard.showCard` / `showHint`.** The card page no longer has a "show
  card" button, but `student-id-settings-card.tsx` still does, and should: on the
  account screen the card is a section rather than the reason anyone opened the
  page. The keys have a live consumer.
- **The guardian-email checklist row.** The audit proposed merging the guardian
  notice into the checklist as a duplicate. It is not one:
  `student-card.ts` sets `guardianEmail.fixHref: null` *because* the notice is
  that row's fix. Removing it would have left a checklist item with no way to act
  on it. Nothing was deleted, and the audit's verdict was withdrawn.

---

## 5. Verification after cleanup

- `bun run check-types` — clean for every file this pass owns.
- `bun run test:unit` — **81 files, 1284 passing**, 1 skipped.
- `tests/unit/i18n-parity.test.ts` — 61 passing, so `ar` and `en` were kept in
  step through all eleven deletions.
- `bunx eslint src/features/student src/features/attendance` — 0 errors.
- The before/after key diff re-run after the deletions: **0 keys regressed by
  this work**.

One typecheck error stands in `features/attendance/settle-lesson-card.tsx`
(`Cannot find name 'TotalLine'`). It is in the parallel session's in-flight edit,
not in this pass's files.
