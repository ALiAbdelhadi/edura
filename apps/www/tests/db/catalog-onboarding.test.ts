// =============================================================================
// Education catalog + onboarding acceptance tests (PRD §10) — runs against the
// live Neon DB like the other tests/db scripts:
//   pnpm --filter edura test:db                  # all suites, guarded
//   pnpm --filter edura test:db:only catalog-onboarding
//   NEVER --env-file=.env.local — that is the DEV database, and it skips the guard.
//
// Covers:
//   * bacc grade 1 asks for no track; grade 2 offers exactly 4 tracks
//   * azhari students see shariah subjects on top of stage subjects
//   * student completion validation (missing/foreign track, chain mismatch)
//   * teacher completion (multi-grade, offered-subject rule, replace-save)
//   * center completion (stage coverage replace-save)
//   * admin adds a system + subject with zero code changes → instantly visible
//   * course search scoped to the student's grade/track
// =============================================================================
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { prisma, withPlatformContext } from "@repo/database";
import type { SessionUser } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors/classes";
import {
  completeStudentOnboarding,
  completeTeacherOnboarding,
  completeCenterOnboarding,
  getOnboardingState,
} from "@/lib/services/catalog/onboarding";
import { getCatalogTree, getSubjectsForSelection, getSubjectsForGradeLevels } from "@/lib/services/catalog/catalog-read";
import { createSystem, createStage, createGradeLevel, createSubject, createOffering } from "@repo/server-core/services/catalog/catalog-admin";
import { searchCourses } from "@/lib/services/discovery/discovery";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const adminPool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

async function expectValidationError(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} — expected ValidationError but call RESOLVED`);
  } catch (e) {
    assert(e instanceof ValidationError, `${label} (got ${(e as Error)?.constructor?.name})`);
  }
}

const SUFFIX = `cat-${Date.now().toString(36)}`;

async function main() {
  const ids = {
    users: [] as string[],
    centers: [] as string[],
    courses: [] as string[],
    systems: [] as string[],
    stages: [] as string[],
    grades: [] as string[],
    subjects: [] as string[],
  };

  try {
    // ---- fixtures ----------------------------------------------------------
    const fx = await withPlatformContext(async (tx) => {
      const student = await tx.user.create({
        data: { email: `student-${SUFFIX}@test.eg`, name: "Test Student", role: "student", passwordHash: "x" },
      });
      await tx.studentProfile.create({
        data: { userId: student.id, fullName: student.name, familyLinkCode: SUFFIX.toUpperCase() },
      });
      const teacher = await tx.user.create({
        data: { email: `teacher-${SUFFIX}@test.eg`, name: "Test Teacher", role: "teacher", passwordHash: "x" },
      });
      await tx.teacherProfile.create({ data: { userId: teacher.id } });
      const center = await tx.center.create({
        data: { name: `Test Center ${SUFFIX}`, shortId: SUFFIX.toUpperCase().slice(0, 12), status: "active" },
      });
      const centerAdmin = await tx.user.create({
        data: { email: `admin-${SUFFIX}@test.eg`, name: "Test Admin", role: "center_admin", passwordHash: "x" },
      });
      await tx.centerAdminProfile.create({ data: { userId: centerAdmin.id, centerId: center.id } });

      const byCode = async (model: "gradeLevel" | "track" | "subject" | "stage" | "educationSystem", code: string) => {
        const row = await (tx as never as Record<string, { findUnique: (a: object) => Promise<{ id: string } | null> }>)[
          model
        ].findUnique({ where: { code } });
        if (!row) throw new Error(`fixture missing: ${model} ${code}`);
        return row.id;
      };

      return {
        student,
        teacher,
        center,
        centerAdmin,
        generalId: await byCode("educationSystem", "general"),
        generalSecondaryId: await byCode("stage", "general-secondary"),
        g3Id: await byCode("gradeLevel", "general-secondary-3"),
        g1PrimaryId: await byCode("gradeLevel", "general-primary-1"),
        bacc1Id: await byCode("gradeLevel", "bacc-secondary-1"),
        bacc2Id: await byCode("gradeLevel", "bacc-secondary-2"),
        baccId: await byCode("educationSystem", "bacc"),
        baccStageId: await byCode("stage", "bacc-secondary"),
        azhari2Id: await byCode("gradeLevel", "azhari-secondary-2"),
        sciMathId: await byCode("track", "general-sci-math"),
        baccMedicineId: await byCode("track", "bacc-medicine"),
        azhariSciId: await byCode("track", "azhari-scientific"),
        frenchId: await byCode("subject", "lang2-french"),
        mathId: await byCode("subject", "math"),
        physicsId: await byCode("subject", "physics"),
        vocationalId: await byCode("subject", "vocational"),
        primaryStageId: await byCode("stage", "general-primary"),
      };
    });
    ids.users.push(fx.student.id, fx.teacher.id, fx.centerAdmin.id);
    ids.centers.push(fx.center.id);

    const studentUser: SessionUser = { id: fx.student.id, role: "student", locale: "ar" };
    const teacherUser: SessionUser = { id: fx.teacher.id, role: "teacher", locale: "ar" };
    const centerUser: SessionUser = { id: fx.centerAdmin.id, role: "center_admin", centerId: fx.center.id, locale: "ar" };

    // ---- 1. catalog shape ACs ----------------------------------------------
    console.log("\n1) Catalog shape (بكالوريا track rules)");
    const tree = await getCatalogTree();
    const bacc = tree.find((s) => s.code === "bacc")!;
    const baccGrades = bacc.stages[0]!.gradeLevels;
    assert(baccGrades.find((g) => g.code === "bacc-secondary-1")!.trackOptions.length === 0,
      "bacc grade 1 (تمهيدي مشترك) has NO track options");
    assert(baccGrades.find((g) => g.code === "bacc-secondary-2")!.trackOptions.length === 4,
      "bacc grade 2 offers exactly the 4 مسارات");

    console.log("\n2) Azhari sees shariah + stage subjects");
    const azhariSubjects = await getSubjectsForSelection(fx.azhari2Id, fx.azhariSciId);
    const shariahCount = azhariSubjects.filter((s) => s.isAzhari).length;
    assert(shariahCount === 15, `all 15 shariah subjects offered (got ${shariahCount})`);
    assert(azhariSubjects.some((s) => !s.isAzhari), "…on top of regular stage subjects");

    // ---- 3. student completion ---------------------------------------------
    console.log("\n3) Student completion validation");
    await expectValidationError(
      () => completeStudentOnboarding(studentUser, {
        educationSystemId: fx.generalId, stageId: fx.generalSecondaryId, gradeLevelId: fx.g3Id,
      }),
      "تالتة ثانوي without a track is rejected",
    );
    await expectValidationError(
      () => completeStudentOnboarding(studentUser, {
        educationSystemId: fx.baccId, stageId: fx.baccStageId, gradeLevelId: fx.bacc1Id, trackId: fx.baccMedicineId,
      }),
      "بكالوريا أولى with a track is rejected (grade has no tracks)",
    );
    await expectValidationError(
      () => completeStudentOnboarding(studentUser, {
        educationSystemId: fx.baccId, stageId: fx.baccStageId, gradeLevelId: fx.g3Id, trackId: fx.sciMathId,
      }),
      "chain mismatch (bacc system + عام grade) is rejected",
    );
    await expectValidationError(
      () => completeStudentOnboarding(studentUser, {
        educationSystemId: fx.generalId, stageId: fx.generalSecondaryId, gradeLevelId: fx.g3Id,
        trackId: fx.baccMedicineId,
      }),
      "foreign track (مسار بكالوريا on تالتة عام) is rejected",
    );
    const done = await completeStudentOnboarding(studentUser, {
      educationSystemId: fx.generalId, stageId: fx.generalSecondaryId, gradeLevelId: fx.g3Id,
      trackId: fx.sciMathId, secondLanguageSubjectId: fx.frenchId,
    });
    assert(done.onboardingCompleted === true, "valid علمي رياضة + فرنسي completes");
    const state = await getOnboardingState(studentUser);
    assert("gradeLevel" in state && (state as { gradeLevel: { nameAr: string } }).gradeLevel?.nameAr === "الصف الثالث الثانوي",
      "profile stores the catalog grade");

    // ---- 4. teacher completion ---------------------------------------------
    console.log("\n4) Teacher completion");
    await expectValidationError(
      () => completeTeacherOnboarding(teacherUser, {
        gradeLevelIds: [fx.g3Id], subjectIds: [fx.vocationalId],
      }),
      "subject not offered in selected grades is rejected (المهارات المهنية في ثانوي)",
    );
    const tDone = await completeTeacherOnboarding(teacherUser, {
      gradeLevelIds: [fx.g3Id, fx.azhari2Id], subjectIds: [fx.mathId, fx.physicsId],
    });
    assert(tDone.gradeLevelIds.length === 2 && tDone.subjectIds.length === 2, "multi-grade multi-subject saved");
    const filtered = await getSubjectsForGradeLevels([fx.g3Id, fx.azhari2Id]);
    assert(filtered.some((s) => s.isAzhari), "teacher subject list includes shariah for azhari grades");
    // replace-save: re-run with one subject
    const tDone2 = await completeTeacherOnboarding(teacherUser, {
      gradeLevelIds: [fx.g3Id], subjectIds: [fx.mathId],
    });
    assert(tDone2.gradeLevelIds.length === 1 && tDone2.subjectIds.length === 1, "re-running the wizard replaces links");

    // ---- 5. center completion ----------------------------------------------
    console.log("\n5) Center completion");
    const cDone = await completeCenterOnboarding(centerUser, {
      governorate: "القاهرة", area: "مدينة نصر", phone: "0221234567",
      stageIds: [fx.generalSecondaryId, fx.primaryStageId],
    });
    assert(cDone.stageIds.length === 2, "center coverage saved (2 stages)");

    // ---- 6. admin adds system + subject with zero code (AC §10) -------------
    console.log("\n6) Admin adds a new system + subject from the panel — zero deploys");
    const sys = await createSystem({ code: `intl-${SUFFIX}`, nameAr: "دولي (اختبار)", sortOrder: 99 });
    ids.systems.push(sys.id);
    const stg = await createStage({ code: `intl-sec-${SUFFIX}`, educationSystemId: sys.id, nameAr: "ثانوي دولي" });
    ids.stages.push(stg.id);
    const grd = await createGradeLevel({ code: `intl-sec-1-${SUFFIX}`, stageId: stg.id, nameAr: "Year 10", level: 1 });
    ids.grades.push(grd.id);
    const subj = await createSubject({ code: `business-${SUFFIX}`, nameAr: "إدارة الأعمال (اختبار)" });
    ids.subjects.push(subj.id);
    await createOffering({ subjectId: subj.id, gradeLevelId: grd.id });

    const tree2 = await getCatalogTree();
    const newSys = tree2.find((s) => s.id === sys.id);
    assert(!!newSys, "new system appears in the wizard tree instantly");
    assert(newSys?.stages[0]?.gradeLevels[0]?.id === grd.id, "…with its stage and grade");
    const newSubjects = await getSubjectsForSelection(grd.id);
    assert(newSubjects.some((s) => s.id === subj.id), "new subject appears for the new grade instantly");

    // ---- 7. course search scoped by student profile -------------------------
    console.log("\n7) Course search scoped to the student's grade/track");
    const mk = (title: string, extra: object) =>
      withPlatformContext((tx) =>
        tx.course.create({
          data: {
            centerId: fx.center.id, teacherId: fx.teacher.id, title, subject: "Math",
            daysOfWeek: [1], startTime: "16:00", endTime: "18:00",
            startDate: new Date("2026-09-01"), price: 10000, maxStudents: 10, ...extra,
          },
        }),
      );
    const cMatch = await mk(`match-${SUFFIX}`, { gradeLevelId: fx.g3Id, trackId: fx.sciMathId });
    const cAll = await mk(`all-tracks-${SUFFIX}`, { gradeLevelId: fx.g3Id, trackId: null });
    const cOther = await mk(`other-grade-${SUFFIX}`, { gradeLevelId: fx.g1PrimaryId });
    ids.courses.push(cMatch.id, cAll.id, cOther.id);

    const scoped = await searchCourses({ q: SUFFIX, limit: "50" }, { gradeLevelId: fx.g3Id, trackId: fx.sciMathId });
    const titles = scoped.courses.map((c: { title: string }) => c.title);
    assert(titles.includes(`match-${SUFFIX}`), "matching grade+track course visible");
    assert(titles.includes(`all-tracks-${SUFFIX}`), "NULL-track course visible (all tracks)");
    assert(!titles.includes(`other-grade-${SUFFIX}`), "other-grade course hidden");
  } finally {
    // ---- cleanup (owner connection: not subject to RLS) ----------------------
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [ids.courses]);
      await c.query(`DELETE FROM subject_offerings WHERE subject_id = ANY($1::uuid[]) OR grade_level_id = ANY($2::uuid[])`, [ids.subjects, ids.grades]);
      await c.query(`DELETE FROM subjects WHERE id = ANY($1::uuid[])`, [ids.subjects]);
      await c.query(`DELETE FROM grade_levels WHERE id = ANY($1::uuid[])`, [ids.grades]);
      await c.query(`DELETE FROM stages WHERE id = ANY($1::uuid[])`, [ids.stages]);
      await c.query(`DELETE FROM education_systems WHERE id = ANY($1::uuid[])`, [ids.systems]);
      await c.query(`DELETE FROM teacher_grade_levels WHERE teacher_id = ANY($1::uuid[])`, [ids.users]);
      await c.query(`DELETE FROM teacher_subjects WHERE teacher_id = ANY($1::uuid[])`, [ids.users]);
      await c.query(`DELETE FROM center_stages WHERE center_id = ANY($1::uuid[])`, [ids.centers]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [ids.users]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [ids.users]);
      await c.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [ids.users]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [ids.users]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [ids.centers]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids.users]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite catalog-onboarding.test.ts" })
  .then(() => main()).catch(async (e) => {
  console.error(e);
  try { await adminPool.end(); } catch { /* already ended */ }
  process.exit(1);
});
