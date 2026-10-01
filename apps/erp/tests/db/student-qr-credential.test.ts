import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { finalizeStudentCode } from "@repo/database/student-code-issue";
import { buildStudentCode } from "@repo/database/student-code";
import { BusinessRuleError, ForbiddenError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/erp-auth/session";
import {
  buildProfileChecklist,
  buildStudentCard,
  reissueStudentCard,
  revokeStudentCard,
} from "@repo/server-core/services/students/student-card";
import { resolveStudentScan } from "@repo/server-core/services/students/student-scan";
import {
  buildStudentQrPayload,
  parseStudentQr,
} from "@repo/server-core/services/students/student-qr";
import { lookupStudents } from "@repo/server-core/services/attendance/checkin";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

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
async function expectError(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
  label: string,
) {
  try {
    await fn();
    assert(false, `${label} — expected ${cls.name} but call RESOLVED`);
  } catch (e) {
    assert(
      e instanceof cls,
      `${label} -> ${cls.name}${e instanceof cls ? "" : ` (got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message})`}`,
    );
  }
}

const su = (u: { id: string; role: string; centerId?: string }): SessionUser =>
  ({
    id: u.id,
    role: u.role,
    centerId: u.centerId,
    locale: "ar",
    name: "test",
    email: null,
  }) as unknown as SessionUser;

async function main() {
  process.env.STUDENT_QR_SECRET = "db-suite-student-qr-secret";
  process.env.APP_BASE_URL = "https://edura.test";

  const tag = "sqr-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Student QR credential DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string) =>
      tx.user.create({
        data: {
          name: `${tag} ${key}`,
          role: role as never,
          email: `${tag}-${key}@x.io`,
          phone: `0100${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`,
          status: "active",
        },
      });

    const student = await mkUser("Kareem Fathy", "student");
    const superAdmin = await mkUser("root", "super_admin");
    const teacher = await mkUser("teacher", "teacher");
    const outsider = await mkUser("outsider", "parent");

    const system = await tx.educationSystem.findFirst({
      where: { code: "general" },
      select: { id: true, codeLetter: true },
    });
    if (!system?.codeLetter) throw new Error("catalog: 'general' has no code_letter");
    const stage = await tx.stage.findFirst({
      where: { educationSystemId: system.id },
      select: { id: true },
    });
    const grade = await tx.gradeLevel.findFirst({
      where: { stageId: stage?.id },
      select: { id: true },
    });

    await tx.studentProfile.create({
      data: {
        userId: student.id,
        fullName: `${tag} Kareem Fathy`,
        familyLinkCode: `${tag}k`.slice(0, 20),
        educationSystemId: system.id,
        stageId: stage?.id,
        gradeLevelId: grade?.id,
        onboardingCompleted: true,
      },
    });

    const ours = await tx.center.create({
      data: { name: `${tag}-ours`, shortId: `${tag}o`.slice(0, 20), receiptSeq: 0 },
    });
    const theirs = await tx.center.create({
      data: { name: `${tag}-theirs`, shortId: `${tag}t`.slice(0, 20), receiptSeq: 0 },
    });
    await tx.centerStudentRoster.create({
      data: { centerId: ours.id, studentId: student.id },
    });

    const staff = await mkUser("staff", "center_staff");
    const otherStaff = await mkUser("otherstaff", "center_staff");

    const otherTeacher = await mkUser("otherteacher", "teacher");
    const assistant = await mkUser("assistant", "assistant");
    const exAssistant = await mkUser("exassistant", "assistant");
    const loneAssistant = await mkUser("loneassistant", "assistant");

    const mkCourse = (teacherId: string, key: string) =>
      tx.course.create({
        data: {
          centerId: ours.id,
          teacherId,
          title: `${tag}-${key}`,
          subject: "math",
          daysOfWeek: [1],
          startTime: "16:00",
          endTime: "18:00",
          startDate: new Date(),
          price: 0,
          pricePerSession: 5000,
          maxStudents: 30,
        },
      });

    const course = await mkCourse(teacher.id, "course");
    const otherCourse = await mkCourse(otherTeacher.id, "othercourse");
    await tx.enrollment.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        centerId: ours.id,
        enrolledBy: teacher.id,
        status: "active",
      },
    });

    await tx.teacherAssistant.create({
      data: { teacherId: teacher.id, assistantId: assistant.id },
    });
    await tx.teacherAssistant.create({
      data: {
        teacherId: teacher.id,
        assistantId: exAssistant.id,
        removedAt: new Date(),
      },
    });

    return {
      student, superAdmin, teacher, outsider, staff, otherStaff, ours, theirs,
      otherTeacher, assistant, exAssistant, loneAssistant, course, otherCourse,
    };
  });

  const U = [
    fx.student, fx.superAdmin, fx.teacher, fx.outsider, fx.staff, fx.otherStaff,
    fx.otherTeacher, fx.assistant, fx.exAssistant, fx.loneAssistant,
  ].map((u) => u.id);

  const rootUser = su({ id: fx.superAdmin.id, role: "super_admin" });
  const studentUser = su({ id: fx.student.id, role: "student" });
  const ourStaff = su({ id: fx.staff.id, role: "center_staff", centerId: fx.ours.id });
  const theirStaff = su({ id: fx.otherStaff.id, role: "center_staff", centerId: fx.theirs.id });
  const theirTeacher = su({ id: fx.teacher.id, role: "teacher" });
  const strangerTeacher = su({ id: fx.otherTeacher.id, role: "teacher" });
  const theirAssistant = su({ id: fx.assistant.id, role: "assistant" });
  const removedAssistant = su({ id: fx.exAssistant.id, role: "assistant" });
  const unlinkedAssistant = su({ id: fx.loneAssistant.id, role: "assistant" });

  const auditRows = (action: string) =>
    admin
      .query<{ n: string }>(
        `SELECT count(*) n FROM audit_logs WHERE action = $1 AND target_id = $2`,
        [action, fx.student.id],
      )
      .then((r) => Number(r.rows[0]!.n));

  try {
    await withPlatformContext((tx) => finalizeStudentCode(tx, fx.student.id));

    console.log("\n-- the back office may look, and the look is recorded --");

    const before = await auditRows("student.card_viewed");
    const asRoot = await buildStudentCard(fx.student.id, rootUser);
    assert(asRoot.studentId === fx.student.id, "a super admin sees a student's card");
    assert(
      (await auditRows("student.card_viewed")) === before + 1,
      "…and the read wrote exactly one student.card_viewed row",
    );

    const CODE = asRoot.studentCode;
    const V1_URL = asRoot.qr.url;
    assert(asRoot.qr.version === 1, "a card starts at issue 1");
    assert(asRoot.qr.revokedAt === null, "…and is not revoked");
    assert(
      parseStudentQr(V1_URL)?.signatureValid === true,
      "the card's URL carries a signature this server accepts",
    );
    assert(V1_URL.includes(CODE), "the code is inside the URL — the wedge-scanner path survives");
    assert(
      !V1_URL.includes(fx.student.name.split(" ")[1] ?? "@@") &&
        !V1_URL.includes(fx.student.phone ?? "@@"),
      "the URL carries no name and no phone",
    );

    await expectError(
      () => buildStudentCard(fx.student.id, su({ id: fx.teacher.id, role: "teacher" })),
      ForbiddenError,
      "a teacher is still refused",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, ourStaff),
      ForbiddenError,
      "the center that HOLDS the student is still refused the card itself",
    );

    for (const [label, caller] of [
      ["a student on their own card", studentUser],
      ["center staff", ourStaff],
    ] as const) {
      await expectError(
        () => reissueStudentCard(fx.student.id, caller, "trying"),
        ForbiddenError,
        `${label} cannot reissue`,
      );
      await expectError(
        () => revokeStudentCard(fx.student.id, caller, "trying"),
        ForbiddenError,
        `${label} cannot revoke`,
      );
    }
    await expectError(
      () => reissueStudentCard(fx.student.id, rootUser, "  "),
      BusinessRuleError,
      "a blank reason is refused — the audit row is the only durable explanation",
    );

    console.log("\n-- an incomplete record has no card --");

    const selfIncomplete = await buildProfileChecklist(fx.student.id, studentUser);
    assert(
      selfIncomplete.cardAvailable === false,
      "the checklist reports the card is not available yet",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, studentUser),
      BusinessRuleError,
      "…and the student is REFUSED a card, on the server, not merely in the UI",
    );
    assert(
      (await buildStudentCard(fx.student.id, rootUser)).studentId === fx.student.id,
      "a super admin is EXEMPT — the back office must be able to look at the records that are not in order",
    );

    await withPlatformContext((tx) =>
      tx.studentProfile.update({
        where: { userId: fx.student.id },
        data: { phone: "01000000009", guardianEmail: `${tag}-guardian@x.io` },
      }),
    );
    const nowComplete = await buildProfileChecklist(fx.student.id, studentUser);
    assert(nowComplete.cardAvailable === true, "completing the record opens the gate");
    assert(
      nowComplete.completed === nowComplete.total,
      "…and the checklist agrees with itself (completed === total)",
    );
    assert(
      (await buildStudentCard(fx.student.id, studentUser)).studentCode === CODE,
      "…and the student can now build their own card",
    );

    await withPlatformContext((tx) =>
      tx.studentProfile.update({
        where: { userId: fx.student.id },
        data: { guardianEmail: null },
      }),
    );
    const reBroken = await buildProfileChecklist(fx.student.id, studentUser);
    let refused = false;
    try {
      await buildStudentCard(fx.student.id, studentUser);
    } catch {
      refused = true;
    }
    assert(
      reBroken.cardAvailable === !refused,
      "cardAvailable and the server's refusal are the SAME answer, every time",
    );
    await withPlatformContext((tx) =>
      tx.studentProfile.update({
        where: { userId: fx.student.id },
        data: { guardianEmail: `${tag}-guardian@x.io` },
      }),
    );

    console.log("\n-- a lost card, and the card that replaces it --");

    const revoked = await revokeStudentCard(fx.student.id, rootUser, "الطالب فقد البطاقة");
    assert(revoked.revokedAt !== null, "revoking stops the card");
    assert(revoked.version === 1, "…without burning an issue number");
    assert((await auditRows("student.card_revoked")) === 1, "…and writes one audit row");
    await expectError(
      () => revokeStudentCard(fx.student.id, rootUser, "again"),
      BusinessRuleError,
      "revoking an already-revoked card is refused",
    );

    const stopped = await resolveStudentScan(V1_URL, ourStaff);
    assert(stopped.outcome === "revoked", "scanning the stopped card is REFUSED at the counter");
    assert(
      stopped.outcome === "revoked" && stopped.reason === "الطالب فقد البطاقة",
      "…and the reason is handed back verbatim, so the refusal can be acted on",
    );

    const reissued = await reissueStudentCard(fx.student.id, rootUser, "بطاقة بديلة");
    assert(reissued.version === 2, "reissuing mints issue 2");
    assert(reissued.revokedAt === null, "…and lifts the stop in the same act");
    assert(reissued.issuedAt !== null, "…stamping when it was issued");
    assert((await auditRows("student.card_reissued")) === 1, "…and writes one audit row");

    const v2 = await buildStudentCard(fx.student.id, rootUser);
    assert(v2.qr.url !== V1_URL, "the new card's square is a different square");

    const oldCard = await resolveStudentScan(V1_URL, ourStaff);
    assert(
      oldCard.outcome === "superseded",
      "THE PREVIOUSLY PRINTED CARD NO LONGER RESOLVES — that is what revocation means",
    );
    assert(
      oldCard.outcome === "superseded" &&
        oldCard.currentVersion === 2 &&
        oldCard.scannedVersion === 1,
      "…and the counter is told which issue is current, so it can say 'you have an old card'",
    );
    assert(
      (await resolveStudentScan(v2.qr.url, ourStaff)).outcome === "valid",
      "the card in the student's hand today scans",
    );

    console.log("\n-- who is looking decides what is shown --");

    const URL2 = v2.qr.url;
    const counter = await resolveStudentScan(URL2, ourStaff);
    const stranger = await resolveStudentScan(URL2, theirStaff);
    const anon = await resolveStudentScan(URL2, null);

    assert(
      counter.outcome === "valid" && counter.identity.tier === "counter",
      "the center that holds the student reaches tier 1",
    );
    assert(
      counter.outcome === "valid" && counter.identity.name === fx.student.name,
      "…and sees the real name",
    );
    assert(
      counter.outcome === "valid" && counter.identity.studentId === fx.student.id,
      "…and gets the student id, which is what lets them check the student in",
    );
    assert(
      counter.outcome === "valid" && counter.counter?.onOurRoster === true,
      "…and is told the student is on their roster",
    );

    for (const [label, res] of [
      ["another center's staff", stranger],
      ["a stranger with a phone camera", anon],
    ] as const) {
      assert(res.outcome === "valid", `${label} still learns the card is genuine`);
      assert(
        res.outcome === "valid" && res.identity.studentId === null,
        `${label} gets NO student id`,
      );
      assert(
        res.outcome === "valid" &&
          res.identity.name !== fx.student.name &&
          (res.identity.name ?? "").endsWith("."),
        `${label} gets a MASKED name`,
      );
      assert(
        res.outcome === "valid" && res.identity.gradeLevel === null && res.identity.track === null,
        `${label} gets NO grade and NO track — those narrow a child to a handful in one school`,
      );
      assert(
        res.outcome === "valid" && res.identity.studentCode === CODE,
        `${label} does get the code — it is printed on the card in the largest figure on it`,
      );
    }
    assert(
      anon.outcome === "valid" && anon.identity.tier === "public",
      "…and the anonymous reader is labelled as such, so the UI need not infer it",
    );
    assert(
      stranger.outcome === "valid" && stranger.identity.tier === "signed_in",
      "…while a signed-in outsider is a tier of its own",
    );
    assert(
      (await resolveStudentScan(URL2, rootUser)).outcome === "valid" &&
        (await resolveStudentScan(URL2, rootUser)).outcome === "valid",
      "a super admin resolves a scan…",
    );
    const rootScan = await resolveStudentScan(URL2, rootUser);
    assert(
      rootScan.outcome === "valid" && rootScan.identity.tier === "signed_in",
      "…but at the SIGNED-IN tier: their full-breadth door is buildStudentCard, which audits",
    );

    console.log("\n-- the teacher who teaches them, and their assistant --");

    for (const [label, caller] of [
      ["the teacher who teaches them", theirTeacher],
      ["their live assistant", theirAssistant],
    ] as const) {
      const res = await resolveStudentScan(URL2, caller);
      assert(
        res.outcome === "valid" && res.identity.tier === "teacher",
        `${label} reaches tier 1`,
      );
      assert(
        res.outcome === "valid" && res.identity.name === fx.student.name,
        `…and sees the real name — which ${label} already reads on their own roster`,
      );
      assert(
        res.outcome === "valid" && res.identity.studentId === fx.student.id,
        "…and gets the student id, which is what the door confirmation keys on",
      );
      assert(
        res.outcome === "valid" && res.door?.studentId === fx.student.id,
        "…and is handed the DOOR, not the counter",
      );
      assert(
        res.outcome === "valid" && res.counter === null,
        "…and is NOT handed the counter: one viewer, one screen",
      );
    }

    for (const [label, caller] of [
      ["a teacher who does NOT teach this student", strangerTeacher],
      ["a SOFT-REMOVED assistant", removedAssistant],
      ["an assistant linked to nobody", unlinkedAssistant],
    ] as const) {
      const res = await resolveStudentScan(URL2, caller);
      assert(
        res.outcome === "valid" && res.identity.tier === "signed_in",
        `${label} stays at tier 2`,
      );
      assert(
        res.outcome === "valid" && res.identity.name !== fx.student.name,
        "…with a masked name",
      );
      assert(
        res.outcome === "valid" && res.identity.studentId === null && res.door === null,
        "…no student id and NO door hand-off",
      );
    }

    await withPlatformContext((tx) =>
      tx.enrollment.updateMany({
        where: { studentId: fx.student.id, courseId: fx.course.id },
        data: { status: "unenrolled", unenrolledAt: new Date() },
      }),
    );
    const afterLeaving = await resolveStudentScan(URL2, theirTeacher);
    assert(
      afterLeaving.outcome === "valid" && afterLeaving.identity.tier === "signed_in",
      "a student who LEFT the group drops their old teacher back to tier 2",
    );
    assert(
      afterLeaving.outcome === "valid" && afterLeaving.door === null,
      "…and takes the door hand-off with them",
    );
    await withPlatformContext((tx) =>
      tx.enrollment.updateMany({
        where: { studentId: fx.student.id, courseId: fx.course.id },
        data: { status: "active", unenrolledAt: null },
      }),
    );
    const afterReturning = await resolveStudentScan(URL2, theirTeacher);
    assert(
      afterReturning.outcome === "valid" && afterReturning.identity.tier === "teacher",
      "…and re-enrolling gives it back, with no other write",
    );

    console.log("\n-- the page is not an oracle --");

    const sig = URL2.split("-").pop() as string;
    const forged = URL2.replace(sig, sig[0] === "0" ? `1${sig.slice(1)}` : `0${sig.slice(1)}`);

    const unusedCode = buildStudentCode("G", "YYYYYY");
    const orphan = `https://edura.test/c/${buildStudentQrPayload(unusedCode, 1)}`;
    assert(
      parseStudentQr(orphan)?.signatureValid === true,
      "…(the probe payload really is correctly signed — otherwise this proves nothing)",
    );

    for (const [label, raw] of [
      ["a forged signature on a real card", forged],
      ["a correctly signed payload for a code nobody holds", orphan],
      ["a bare code, hand-typed into the URL", `https://edura.test/c/${CODE}`],
      ["something that is not a payload at all", "not a url at all"],
    ] as const) {
      const res = await resolveStudentScan(raw, null);
      assert(
        res.outcome === "invalid" || res.outcome === "unreadable",
        `${label} is refused`,
      );
      assert(
        !("identity" in res),
        `${label} discloses NOTHING — no identity comes back, so the page is no oracle`,
      );
    }
    const forgedRes = await resolveStudentScan(forged, null);
    const orphanRes = await resolveStudentScan(orphan, null);
    assert(
      forgedRes.outcome === orphanRes.outcome,
      "a real student's forged card and a code nobody holds are INDISTINGUISHABLE",
    );

    console.log("\n-- what a keyboard-wedge scanner types into the search box --");

    const byUrl = await lookupStudents(URL2, ourStaff);
    const byCode = await lookupStudents(CODE, ourStaff);
    assert(
      byUrl.length === 1 && byUrl[0]!.studentId === fx.student.id,
      "the counter search resolves the whole scanned URL to the student",
    );
    assert(
      JSON.stringify(byUrl) === JSON.stringify(byCode),
      "…and returns EXACTLY what the typed code returns — one lookup, not two",
    );
    const typo = CODE.slice(0, 7) + (CODE[7] === "0" ? "1" : "0");
    assert(
      (await lookupStudents(URL2.replace(CODE, typo), ourStaff)).length === 0,
      "a URL whose code is mistyped resolves to NOBODY — the check character still bites",
    );
  } finally {
    await admin.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[])`, [U]).catch(() => {});
    await admin.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM teacher_assistants WHERE teacher_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [
      [fx.course.id, fx.otherCourse.id],
    ]);
    await admin.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [
      [fx.course.id, fx.otherCourse.id],
    ]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.ours.id, fx.theirs.id]]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite student-qr-credential.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
