// Messaging scope + child safety — proofs against the LIVE DB, driving the
// REAL authorization module (@repo/database/chat-scope) and the REAL domain
// services. No mocks, no stubbed relationships: every ALLOW and every DENY is
// decided by the same code the HTTP and WebSocket transports call.
//
// Proves, per the approved plan:
//   1.  a student CAN message a teacher they study with;
//   2.  a student CANNOT message a teacher they do NOT study with;
//   3.  a student CAN reach their teacher's assistant, NOT another's;
//   4.  a parent mirrors their child's scope exactly, and only for APPROVED
//       links;
//   5.  an assistant reaches THEIR teacher's students only — never a second
//       teacher's (the Step 8 boundary, and revocation cuts it immediately);
//   6.  a center reaches only its OWN people (center-vs-center isolation),
//       and center_accountant staff reach NOBODY;
//   7.  DRIFT PROOF — the contacts directory returns exactly the set the gate
//       accepts, for every seeded actor;
//   8.  DEFAULT-DENY SWEEP — every Role x Role pair matches an explicit
//       expectation table, and unlisted roles reach nobody;
//   9.  DEFAULT-MINOR — a student with NO date of birth is a minor, an
//       unverified DOB is a minor, and only a VERIFIED 18+ DOB is an adult;
//   10. parent oversight reads a minor's adult threads, is READ-ONLY (unread
//       counters and read receipts provably unchanged), refuses non-linked
//       parents, refuses verified adults, and has no write path;
//   11. rate limiting trips on the shared domain path (REST and socket both
//       call it);
//   12. block halts BOTH directions, keeps history, and stays visible to the
//       super-admin log; report reaches the review queue flagged for a minor;
//   13. group membership is DERIVED — a dropped student loses access even with
//       a stale cached membership row, and owner_only blocks student posts.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import type { Role } from "@repo/database";
import type { TenantTx } from "@repo/database/client";
import * as chat from "@repo/database/chat";
import * as scope from "@repo/database/chat-scope";
import * as groups from "@repo/database/chat-groups";
import * as safety from "@repo/database/chat-safety";
import * as oversight from "@repo/database/chat-oversight";
import * as minors from "@repo/database/chat-minors";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

// This suite DID have cleanup and still left 105 rows in dev — the delete list
// had drifted behind the schema. sweepTagQuietly walks the FK graph instead, so
// it cannot drift. The existing per-table deletes are left in place; the sweep is
// a backstop, and double-deleting is a no-op.
let __sweepTag = "";

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

/** An unlimited limiter for the tests that are not ABOUT rate limiting. */
const allow: scope.ChatLimiter = async () => true;
const deny: scope.ChatLimiter = async () => false;

/** Counting limiter — allows the first N calls, then refuses. */
function budget(n: number): scope.ChatLimiter {
  let used = 0;
  return async () => ++used <= n;
}

const actor = (id: string, role: Role, centerId?: string): scope.ChatActor => ({
  id,
  role,
  centerId: centerId ?? null,
});

async function expectDenied(
  fn: () => Promise<unknown>,
  code: scope.ChatErrorCode | scope.ChatErrorCode[],
  label: string,
) {
  const codes = Array.isArray(code) ? code : [code];
  try {
    await fn();
    assert(false, `${label} — expected denial but call RESOLVED`);
  } catch (e) {
    const err = e as scope.ChatError;
    const ok = err instanceof chat.ChatError && codes.includes(err.code);
    assert(
      ok,
      `${label} -> ${err?.code ?? (e as Error)?.constructor?.name}${
        ok ? "" : ` (expected ${codes.join("|")})`
      }`,
    );
  }
}

async function expectAllowed(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(true, label);
  } catch (e) {
    assert(
      false,
      `${label} — threw ${(e as scope.ChatError)?.code ?? (e as Error)?.message}`,
    );
  }
}

async function main() {
  const tag = "msgtest-" + Math.floor(Math.random() * 1e9).toString(36);
  __sweepTag = tag;
  console.log("Messaging scope + child-safety DB tests —", tag);

  // -------------------------------------------------------------------------
  // FIXTURE: two independent centers, each with its own teacher/assistant/
  // students, plus one parent. Everything below is decided from THIS data.
  // -------------------------------------------------------------------------
  const fx = await withPlatformContext(async (tx) => {
    const mkUser = async (k: string, role: Role) =>
      tx.user.create({
        data: {
          name: `${tag}-${k}`,
          role,
          email: `${tag}-${k}@x.io`,
          status: "active",
          isDemo: true,
        },
      });

    const mkCenter = async (k: string, owner: string) =>
      tx.center.create({
        data: {
          name: `${tag}-${k}`,
          // Keep the discriminator: `tag` alone already fills the column, so
          // slicing tag+k would give both centers the SAME shortId.
          shortId: (k + tag.slice(-10)).toUpperCase(),
          status: "active",
          ownerUserId: owner,
          isDemo: true,
        },
      });

    // --- Center A ---
    const adminA = await mkUser("adminA", "center_admin");
    const centerA = await mkCenter("A", adminA.id);
    await tx.centerAdminProfile.create({
      data: { userId: adminA.id, centerId: centerA.id },
    });
    const receptionA = await mkUser("receptionA", "center_staff");
    await tx.centerStaff.create({
      data: { centerId: centerA.id, staffUserId: receptionA.id, role: "receptionist" },
    });
    const accountantA = await mkUser("accountantA", "center_staff");
    await tx.centerStaff.create({
      data: {
        centerId: centerA.id,
        staffUserId: accountantA.id,
        role: "center_accountant",
      },
    });

    const teacherA = await mkUser("teacherA", "teacher");
    await tx.teacherProfile.create({ data: { userId: teacherA.id } });
    const assistantA = await mkUser("assistantA", "assistant");
    await tx.teacherAssistant.create({
      data: { teacherId: teacherA.id, assistantId: assistantA.id },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: centerA.id,
        teacherId: teacherA.id,
        status: "active",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      },
    });
    const courseA = await tx.course.create({
      data: {
        centerId: centerA.id,
        teacherId: teacherA.id,
        title: `${tag}-courseA`,
        subject: "physics",
        daysOfWeek: [1],
        startTime: "16:00",
        endTime: "18:00",
        startDate: new Date(),
        price: 0,
        maxStudents: 30,
        isDemo: true,
      },
    });

    // studentA: NO dob at all -> minor by default.
    const studentA = await mkUser("studentA", "student");
    await tx.studentProfile.create({
      data: { userId: studentA.id, fullName: `${tag}-studentA`, familyLinkCode: tag + "A" },
    });
    // studentAdult: VERIFIED 20-year-old -> the only route to "adult".
    const studentAdult = await mkUser("studentAdult", "student");
    await tx.studentProfile.create({
      data: {
        userId: studentAdult.id,
        fullName: `${tag}-adult`,
        familyLinkCode: tag + "AD",
        dateOfBirth: new Date("2005-01-01T00:00:00Z"),
        dateOfBirthVerifiedAt: new Date(),
      },
    });
    // studentUnverified: DOB says 30, but NOBODY verified it -> still a minor.
    const studentUnverified = await mkUser("studentUnverified", "student");
    await tx.studentProfile.create({
      data: {
        userId: studentUnverified.id,
        fullName: `${tag}-unver`,
        familyLinkCode: tag + "UV",
        dateOfBirth: new Date("1995-01-01T00:00:00Z"),
        dateOfBirthVerifiedAt: null,
      },
    });
    // studentDropped: enrolled then dropped — used for the group staleness proof.
    const studentDropped = await mkUser("studentDropped", "student");
    await tx.studentProfile.create({
      data: { userId: studentDropped.id, fullName: `${tag}-drop`, familyLinkCode: tag + "DR" },
    });

    for (const s of [studentA, studentAdult, studentUnverified, studentDropped]) {
      await tx.enrollment.create({
        data: {
          studentId: s.id,
          courseId: courseA.id,
          centerId: centerA.id,
          status: "active",
          enrolledBy: s.id,
        },
      });
      await tx.centerStudentRoster.create({
        data: { centerId: centerA.id, studentId: s.id },
      });
    }

    const parentA = await mkUser("parentA", "parent");
    await tx.parentProfile.create({ data: { userId: parentA.id } });
    await tx.parentStudentLink.create({
      data: {
        parentId: parentA.id,
        studentId: studentA.id,
        status: "approved",
        initiatedBy: "parent",
      },
    });
    // Also linked to the verified adult — to prove oversight refuses adults.
    await tx.parentStudentLink.create({
      data: {
        parentId: parentA.id,
        studentId: studentAdult.id,
        status: "approved",
        initiatedBy: "parent",
      },
    });
    // A PENDING link must grant nothing.
    const parentPending = await mkUser("parentPending", "parent");
    await tx.parentProfile.create({ data: { userId: parentPending.id } });
    await tx.parentStudentLink.create({
      data: {
        parentId: parentPending.id,
        studentId: studentA.id,
        status: "pending",
        initiatedBy: "parent",
      },
    });

    // --- Center B (entirely separate) ---
    const adminB = await mkUser("adminB", "center_admin");
    const centerB = await mkCenter("B", adminB.id);
    await tx.centerAdminProfile.create({
      data: { userId: adminB.id, centerId: centerB.id },
    });
    const teacherB = await mkUser("teacherB", "teacher");
    await tx.teacherProfile.create({ data: { userId: teacherB.id } });
    const assistantB = await mkUser("assistantB", "assistant");
    await tx.teacherAssistant.create({
      data: { teacherId: teacherB.id, assistantId: assistantB.id },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: centerB.id,
        teacherId: teacherB.id,
        status: "active",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      },
    });
    const courseB = await tx.course.create({
      data: {
        centerId: centerB.id,
        teacherId: teacherB.id,
        title: `${tag}-courseB`,
        subject: "chem",
        daysOfWeek: [2],
        startTime: "16:00",
        endTime: "18:00",
        startDate: new Date(),
        price: 0,
        maxStudents: 30,
        isDemo: true,
      },
    });
    const studentB = await mkUser("studentB", "student");
    await tx.studentProfile.create({
      data: { userId: studentB.id, fullName: `${tag}-studentB`, familyLinkCode: tag + "B" },
    });
    await tx.enrollment.create({
      data: {
        studentId: studentB.id,
        courseId: courseB.id,
        centerId: centerB.id,
        status: "active",
        enrolledBy: studentB.id,
      },
    });
    await tx.centerStudentRoster.create({
      data: { centerId: centerB.id, studentId: studentB.id },
    });

    return {
      centerA: centerA.id,
      centerB: centerB.id,
      adminA: adminA.id,
      adminB: adminB.id,
      receptionA: receptionA.id,
      accountantA: accountantA.id,
      teacherA: teacherA.id,
      teacherB: teacherB.id,
      assistantA: assistantA.id,
      assistantB: assistantB.id,
      studentA: studentA.id,
      studentAdult: studentAdult.id,
      studentUnverified: studentUnverified.id,
      studentDropped: studentDropped.id,
      studentB: studentB.id,
      parentA: parentA.id,
      parentPending: parentPending.id,
      courseA: courseA.id,
    };
  });

  /**
   * One platform-context transaction per call. Deliberately NOT one big
   * transaction for the whole suite: the drift proof alone runs ~105 gate
   * calls, which would blow the 20s interactive-transaction budget.
   */
  const run = <T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> =>
    withPlatformContext(fn);

  // =========================================================================
  console.log("\n1-3. STUDENT scope — own teachers and their assistants only");
  // =========================================================================
  await run(async (tx) => {
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.teacherA),
      "student -> teacher they DO study with = ALLOWED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.teacherB),
      "no_relationship",
      "student -> teacher they do NOT study with = DENIED",
    );
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.assistantA),
      "student -> their teacher's assistant = ALLOWED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.assistantB),
      "no_relationship",
      "student -> ANOTHER teacher's assistant = DENIED",
    );
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.adminA),
      "student -> own center admin = ALLOWED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.adminB),
      "no_relationship",
      "student -> ANOTHER center's admin = DENIED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.studentA, "student"), fx.studentB),
      "policy_denied",
      "student -> another student = DENIED by the matrix (no student-to-student)",
    );
  });

  // =========================================================================
  console.log("\n4. PARENT scope — exactly the child's, approved links only");
  // =========================================================================
  await run(async (tx) => {
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.parentA, "parent"), fx.teacherA),
      "parent -> child's teacher = ALLOWED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.parentA, "parent"), fx.teacherB),
      "no_relationship",
      "parent -> unrelated teacher = DENIED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.parentPending, "parent"), fx.teacherA),
      "no_relationship",
      "parent with PENDING link reaches nobody = DENIED",
    );
  });

  // =========================================================================
  console.log("\n5. ASSISTANT — their ONE teacher's world only (Step 8 boundary)");
  // =========================================================================
  await run(async (tx) => {
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.assistantA, "assistant"), fx.studentA),
      "assistant -> THEIR teacher's student = ALLOWED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.assistantA, "assistant"), fx.studentB),
      "no_relationship",
      "assistant -> ANOTHER teacher's student = DENIED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.assistantA, "assistant"), fx.teacherB),
      "no_relationship",
      "assistant -> another teacher = DENIED",
    );
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.assistantA, "assistant"), fx.parentA),
      "assistant -> their teacher's student's parent = ALLOWED",
    );
  });

  // Revocation collapses the whole scope on the NEXT call.
  await run(async (tx) => {
    await tx.teacherAssistant.updateMany({
      where: { assistantId: fx.assistantA },
      data: { removedAt: new Date() },
    });
  });
  await run(async (tx) => {
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.assistantA, "assistant"), fx.studentA),
      "no_relationship",
      "REVOKED assistant reaches nobody on the next call = DENIED",
    );
    const contacts = await scope.listContacts(tx, actor(fx.assistantA, "assistant"));
    assert(contacts.length === 0, "REVOKED assistant's directory is empty");
  });
  await run(async (tx) => {
    await tx.teacherAssistant.updateMany({
      where: { assistantId: fx.assistantA },
      data: { removedAt: null },
    });
  });

  // =========================================================================
  console.log("\n6. CENTER isolation + staff sub-roles");
  // =========================================================================
  await run(async (tx) => {
    await expectAllowed(
      () =>
        scope.assertCanReach(tx, actor(fx.adminA, "center_admin", fx.centerA), fx.studentA),
      "center A -> own student = ALLOWED",
    );
    await expectDenied(
      () =>
        scope.assertCanReach(tx, actor(fx.adminA, "center_admin", fx.centerA), fx.studentB),
      "no_relationship",
      "center A -> center B's STUDENT = DENIED",
    );
    await expectDenied(
      () =>
        scope.assertCanReach(tx, actor(fx.adminA, "center_admin", fx.centerA), fx.teacherB),
      "no_relationship",
      "center A -> center B's TEACHER = DENIED",
    );
    await expectDenied(
      () =>
        scope.assertCanReach(
          tx,
          actor(fx.adminA, "center_admin", fx.centerA),
          fx.assistantB,
        ),
      "no_relationship",
      "center A -> center B's ASSISTANT = DENIED",
    );

    // Receptionist: families yes, teaching side no.
    await expectAllowed(
      () => scope.assertCanReach(tx, actor(fx.receptionA, "center_staff"), fx.studentA),
      "receptionist -> own center's student = ALLOWED",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.receptionA, "center_staff"), fx.teacherA),
      "no_relationship",
      "receptionist -> teacher = DENIED (manager tier only)",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.receptionA, "center_staff"), fx.studentB),
      "no_relationship",
      "receptionist -> another center's student = DENIED",
    );

    // center_accountant appears on NO edge at all.
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.accountantA, "center_staff"), fx.studentA),
      "no_relationship",
      "center_accountant -> own center's student = DENIED (no messaging tier)",
    );
    const acc = await scope.listContacts(tx, actor(fx.accountantA, "center_staff"));
    assert(acc.length === 0, "center_accountant's directory is EMPTY");
  });

  // =========================================================================
  console.log("\n7. DRIFT PROOF — directory === gate, for every actor");
  // =========================================================================
  {
    const everyone = [
      [fx.studentA, "student"],
      [fx.parentA, "parent"],
      [fx.teacherA, "teacher"],
      [fx.assistantA, "assistant"],
      [fx.adminA, "center_admin"],
      [fx.receptionA, "center_staff"],
      [fx.accountantA, "center_staff"],
    ] as const;

    // Every user in the fixture is a reach CANDIDATE for every actor.
    const candidates = [
      fx.studentA,
      fx.studentAdult,
      fx.studentUnverified,
      fx.studentDropped,
      fx.studentB,
      fx.parentA,
      fx.parentPending,
      fx.teacherA,
      fx.teacherB,
      fx.assistantA,
      fx.assistantB,
      fx.adminA,
      fx.adminB,
      fx.receptionA,
      fx.accountantA,
    ];

    // One transaction PER ACTOR: the full cross-product is ~105 gate calls,
    // which blows the 20s interactive-transaction budget if run as one unit.
    for (const [id, role] of everyone) {
      const listed = await run(async (tx) =>
        new Set(
          (await scope.listContacts(tx, actor(id, role as Role), { limit: 50 })).map(
            (c) => c.id,
          ),
        ),
      );
      const gated = new Set<string>();
      for (const target of candidates) {
        if (target === id) continue;
        const ok = await run((tx) => scope.canReach(tx, actor(id, role as Role), target));
        if (ok) gated.add(target);
      }
      const onlyListed = [...listed].filter((x) => !gated.has(x));
      const onlyGated = [...gated].filter((x) => !listed.has(x));
      assert(
        onlyListed.length === 0 && onlyGated.length === 0,
        `directory === gate for ${role} (${listed.size} contacts)` +
          (onlyListed.length ? ` | listed-but-denied: ${onlyListed.length}` : "") +
          (onlyGated.length ? ` | allowed-but-hidden: ${onlyGated.length}` : ""),
      );
    }
  }

  // =========================================================================
  console.log("\n8. DEFAULT-DENY SWEEP — every Role x Role pair");
  // =========================================================================
  {
    const ALL_ROLES: Role[] = [
      "super_admin",
      "accountant",
      "center_admin",
      "center_staff",
      "teacher",
      "assistant",
      "parent",
      "student",
    ];
    // The COMPLETE expectation table. Anything not listed must be denied.
    const EXPECTED: Record<string, Role[]> = {
      student: ["teacher", "assistant", "center_admin", "center_staff"],
      parent: ["teacher", "assistant", "center_admin", "center_staff"],
      teacher: ["assistant", "student", "parent", "center_admin", "center_staff"],
      assistant: ["teacher", "student", "parent", "center_admin", "center_staff"],
      center_admin: ["teacher", "assistant", "student", "parent"],
      center_staff: ["teacher", "assistant", "student", "parent"],
      super_admin: [],
      accountant: [],
    };

    let sweepOk = true;
    for (const from of ALL_ROLES) {
      const actualSet = new Set(scope.reachableRoles(from));
      const expectedSet = new Set(EXPECTED[from] ?? []);
      for (const to of ALL_ROLES) {
        if (actualSet.has(to) !== expectedSet.has(to)) {
          sweepOk = false;
          console.error(
            `    ! ${from} -> ${to}: reachable=${actualSet.has(to)} expected=${expectedSet.has(to)}`,
          );
        }
      }
    }
    assert(sweepOk, `all ${ALL_ROLES.length ** 2} role pairs match the expectation table`);
    assert(
      scope.reachableRoles("super_admin").length === 0 &&
        scope.reachableRoles("accountant").length === 0,
      "back-office roles (super_admin, accountant) reach NOBODY",
    );

    // An unlisted role must fail closed rather than throw or default-open.
    const bogus = "auditor_from_the_future" as unknown as Role;
    assert(
      scope.reachableRoles(bogus).length === 0,
      "a role absent from the EDGES table reaches nobody (default-deny)",
    );
    await run(async (tx) => {
      await expectDenied(
        () => scope.assertCanReach(tx, actor(fx.studentA, bogus), fx.teacherA),
        ["policy_denied", "no_relationship"],
        "an unlisted role is DENIED on the real gate (fails closed)",
      );
    });
  }

  // =========================================================================
  console.log("\n9. DEFAULT-MINOR rule");
  // =========================================================================
  await run(async (tx) => {
    assert(
      await minors.isMinorStudent(tx, fx.studentA),
      "student with NO date of birth = MINOR (oversight active)",
    );
    assert(
      await minors.isMinorStudent(tx, fx.studentUnverified),
      "student with an UNVERIFIED 30-year-old DOB = MINOR (verification required)",
    );
    assert(
      !(await minors.isMinorStudent(tx, fx.studentAdult)),
      "student with a VERIFIED 20-year-old DOB = ADULT (the only way out)",
    );
    assert(
      minors.isMinorFromProfile(null),
      "a student with NO profile row at all = MINOR",
    );
    assert(
      minors.isMinorFromProfile({
        dateOfBirth: new Date("1990-01-01"),
        dateOfBirthVerifiedAt: null,
      }),
      "unit: DOB present but unverified = MINOR",
    );
    assert(
      !minors.isMinorFromProfile({
        dateOfBirth: new Date("1990-01-01"),
        dateOfBirthVerifiedAt: new Date(),
      }),
      "unit: DOB present AND verified AND 18+ = adult",
    );
    assert(
      minors.isMinorFromProfile({
        dateOfBirth: new Date(Date.now() - 10 * 365 * 24 * 3600 * 1000),
        dateOfBirthVerifiedAt: new Date(),
      }),
      "unit: verified 10-year-old = MINOR",
    );
  });

  // =========================================================================
  console.log("\n10. PARENT OVERSIGHT of a minor's adult conversations");
  // =========================================================================
  // Seed a real thread between the minor and their teacher, plus one with an
  // unread count so the read-only proof has something to measure.
  const convId = await run(async (tx) => {
    const r = await chat.appendMessage(
      tx,
      actor(fx.teacherA, "teacher"),
      { recipientId: fx.studentA, body: "Homework is due Wednesday." },
      { limiter: allow },
    );
    await chat.appendMessage(
      tx,
      actor(fx.studentA, "student"),
      { conversationId: r.message.conversationId, body: "Got it, thank you." },
      { limiter: allow },
    );
    return r.message.conversationId;
  });

  await run(async (tx) => {
    const children = await oversight.listOversightChildren(tx, fx.parentA);
    const minorChild = children.find((c) => c.studentId === fx.studentA);
    const adultChild = children.find((c) => c.studentId === fx.studentAdult);
    assert(minorChild?.isMinor === true, "oversight lists the MINOR child as minor");
    assert(
      adultChild?.isMinor === false,
      "oversight lists the VERIFIED ADULT child as adult",
    );

    const convs = await oversight.listChildConversations(tx, fx.parentA, fx.studentA);
    assert(
      convs.some((c) => c.id === convId && c.partner.id === fx.teacherA),
      "parent CAN view their minor child's conversation with a teacher",
    );

    const thread = await oversight.getChildThread(tx, fx.parentA, fx.studentA, convId);
    assert(
      thread.messages.length === 2 &&
        thread.messages[0]!.body === "Homework is due Wednesday.",
      "parent reads the full thread contents",
    );
  });

  // READ-ONLY proof: counters and receipts are byte-identical before/after.
  await run(async (tx) => {
    const before = await tx.conversation.findUnique({ where: { id: convId } });
    const msgsBefore = await tx.conversationMessage.findMany({
      where: { conversationId: convId },
      orderBy: { seq: "asc" },
      select: { id: true, status: true, readAt: true, deliveredAt: true },
    });

    await oversight.listChildConversations(tx, fx.parentA, fx.studentA);
    await oversight.getChildThread(tx, fx.parentA, fx.studentA, convId);

    const after = await tx.conversation.findUnique({ where: { id: convId } });
    const msgsAfter = await tx.conversationMessage.findMany({
      where: { conversationId: convId },
      orderBy: { seq: "asc" },
      select: { id: true, status: true, readAt: true, deliveredAt: true },
    });

    assert(
      before!.aUnreadCount === after!.aUnreadCount &&
        before!.bUnreadCount === after!.bUnreadCount,
      "oversight does NOT change unread counters",
    );
    assert(
      before!.aLastReadAt?.getTime() === after!.aLastReadAt?.getTime() &&
        before!.bLastReadAt?.getTime() === after!.bLastReadAt?.getTime(),
      "oversight does NOT move either side's read cursor",
    );
    assert(
      JSON.stringify(msgsBefore) === JSON.stringify(msgsAfter),
      "oversight does NOT change any message's delivery/read state",
    );
  });

  await run(async (tx) => {
    await expectDenied(
      () => oversight.listChildConversations(tx, fx.parentPending, fx.studentA),
      "not_participant",
      "parent with a PENDING link CANNOT view the child's conversations",
    );
    await expectDenied(
      () => oversight.listChildConversations(tx, fx.parentA, fx.studentB),
      "not_participant",
      "parent CANNOT view an unrelated student's conversations",
    );
    await expectDenied(
      () => oversight.listChildConversations(tx, fx.parentA, fx.studentAdult),
      "policy_denied",
      "parent CANNOT view a VERIFIED ADULT child's conversations (privacy)",
    );

    // Disclosure: both sides are told the thread is visible to a parent.
    const notice = await oversight.oversightNoticeFor(tx, convId);
    assert(
      notice.monitored && notice.minorParticipantId === fx.studentA,
      "both participants are told the thread is parent-visible (disclosure)",
    );
  });

  // =========================================================================
  console.log("\n11. RATE LIMITING (the shared domain path REST + socket use)");
  // =========================================================================
  await run(async (tx) => {
    await expectDenied(
      () =>
        chat.appendMessage(
          tx,
          actor(fx.teacherA, "teacher"),
          { conversationId: convId, body: "flood" },
          { limiter: deny },
        ),
      "rate_limited",
      "send is REFUSED when the bucket is empty",
    );

    // 3 allowed, the 4th trips — the same call the socket server makes.
    const b = budget(3);
    let sent = 0;
    let limited = false;
    for (let i = 0; i < 5; i++) {
      try {
        await chat.appendMessage(
          tx,
          actor(fx.teacherA, "teacher"),
          { conversationId: convId, body: `msg ${i}` },
          { limiter: b },
        );
        sent++;
      } catch (e) {
        if ((e as scope.ChatError).code === "rate_limited") limited = true;
      }
    }
    assert(sent === 3 && limited, `exactly 3 of 5 sends succeeded, then rate_limited`);

    // Opening NEW conversations has its own, tighter bucket.
    await expectDenied(
      () =>
        chat.getOrCreateConversation(tx, actor(fx.teacherA, "teacher"), fx.studentAdult, {
          limiter: deny,
        }),
      "rate_limited",
      "opening a NEW conversation is refused when its bucket is empty",
    );
  });

  // =========================================================================
  console.log("\n12. BLOCK & REPORT");
  // =========================================================================
  await run(async (tx) => {
    const msgsBefore = await tx.conversationMessage.count({
      where: { conversationId: convId },
    });

    await safety.blockUser(tx, actor(fx.studentA, "student"), fx.teacherA, {
      reason: "test",
      conversationId: convId,
    });

    await expectDenied(
      () =>
        chat.appendMessage(
          tx,
          actor(fx.studentA, "student"),
          { conversationId: convId, body: "after block" },
          { limiter: allow },
        ),
      "blocked",
      "BLOCKER cannot send after blocking",
    );
    await expectDenied(
      () =>
        chat.appendMessage(
          tx,
          actor(fx.teacherA, "teacher"),
          { conversationId: convId, body: "after block" },
          { limiter: allow },
        ),
      "blocked",
      "BLOCKED party cannot send either (both directions halted)",
    );
    await expectDenied(
      () => scope.assertCanReach(tx, actor(fx.teacherA, "teacher"), fx.studentA),
      "blocked",
      "a blocked pair cannot open a new conversation",
    );

    const msgsAfter = await tx.conversationMessage.count({
      where: { conversationId: convId },
    });
    assert(msgsBefore === msgsAfter, "blocking DELETES NO history");

    // Still fully visible to the platform — a block cannot bury a thread.
    const adminView = await oversight.adminGetThread(tx, convId);
    assert(
      adminView.messages.length === msgsAfter,
      "blocked conversation is STILL fully visible in the super-admin log",
    );
    const stillOverseeable = await oversight.listChildConversations(
      tx,
      fx.parentA,
      fx.studentA,
    );
    assert(
      stillOverseeable.some((c) => c.id === convId),
      "blocked conversation is STILL visible to the minor's parent",
    );

    // Unblock restores messaging.
    await safety.unblockUser(tx, actor(fx.studentA, "student"), fx.teacherA);
    await expectAllowed(
      () =>
        chat.appendMessage(
          tx,
          actor(fx.teacherA, "teacher"),
          { conversationId: convId, body: "after unblock" },
          { limiter: allow },
        ),
      "unblocking restores messaging",
    );
  });

  // An ADULT blocking a MINOR raises a safety_concern for review.
  await run(async (tx) => {
    const res = await safety.blockUser(tx, actor(fx.teacherA, "teacher"), fx.studentA);
    assert(
      res.flaggedAdultBlockingMinor,
      "an ADULT blocking a MINOR is flagged for platform review",
    );
    const { reports } = await safety.listReportsForReview(tx, { status: "open" });
    assert(
      reports.some((r) => r.category === "safety_concern" && r.involvesMinor),
      "the adult-blocks-minor event reaches the super-admin queue",
    );
    await safety.unblockUser(tx, actor(fx.teacherA, "teacher"), fx.studentA);
  });

  await run(async (tx) => {
    const report = await safety.fileReport(tx, actor(fx.studentA, "student"), {
      conversationId: convId,
      category: "harassment",
      details: "test report",
    });
    assert(report.reportedUserId === fx.teacherA, "report infers the reported party");
    assert(
      report.involvesMinor,
      "a report filed BY a minor is flagged involvesMinor (queue priority)",
    );

    const { reports } = await safety.listReportsForReview(tx, {});
    assert(
      reports.some((r) => r.id === report.id),
      "the report appears in the super-admin review queue",
    );
    // Minor-involving reports sort first.
    assert(
      reports.length > 0 && reports[0]!.involvesMinor,
      "minor-involving reports sort to the TOP of the queue",
    );

    // You cannot report a conversation you are not part of.
    await expectDenied(
      () =>
        safety.fileReport(tx, actor(fx.studentB, "student"), {
          conversationId: convId,
          category: "spam",
        }),
      "not_participant",
      "a non-participant CANNOT report someone else's conversation",
    );
  });

  // =========================================================================
  console.log("\n13. GROUP channels — membership is DERIVED, cache is not trusted");
  // =========================================================================
  const groupId = await run(async (tx) => {
    const g = await groups.createGroup(tx, actor(fx.teacherA, "teacher"), {
      kind: "course",
      courseId: fx.courseA,
      isDemo: true,
    });
    return g.id;
  });

  await run(async (tx) => {
    const members = await tx.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: { userId: true },
    });
    const ids = new Set(members.map((m) => m.userId));
    assert(
      ids.has(fx.studentA) && ids.has(fx.studentDropped) && ids.has(fx.teacherA),
      "group membership is derived from the ACTIVE enrollment roster",
    );
    assert(ids.has(fx.assistantA), "the teacher's assistant is a derived member");
    assert(ids.has(fx.parentA), "an enrolled minor's approved parent is a derived member");
    assert(!ids.has(fx.studentB), "another center's student is NOT a member");

    await expectAllowed(
      () => groups.assertGroupAccess(tx, actor(fx.studentA, "student"), groupId, "read"),
      "an enrolled student CAN read the channel",
    );
    await expectDenied(
      () => groups.assertGroupAccess(tx, actor(fx.studentB, "student"), groupId, "read"),
      "not_participant",
      "an outsider CANNOT read the channel",
    );
    await expectDenied(
      () => groups.assertGroupAccess(tx, actor(fx.studentA, "student"), groupId, "post"),
      "policy_denied",
      "owner_only: an enrolled student CANNOT post",
    );
    await expectAllowed(
      () =>
        groups.postGroupMessage(
          tx,
          actor(fx.teacherA, "teacher"),
          groupId,
          { body: "Revision on Friday." },
          { limiter: allow },
        ),
      "the owning teacher CAN post",
    );
    await expectAllowed(
      () =>
        groups.postGroupMessage(
          tx,
          actor(fx.assistantA, "assistant"),
          groupId,
          { body: "Reminder from the assistant." },
          { limiter: allow },
        ),
      "the teacher's assistant CAN post (owner side)",
    );
    await expectDenied(
      () =>
        groups.postGroupMessage(
          tx,
          actor(fx.studentB, "student"),
          groupId,
          { body: "intruder" },
          { limiter: allow },
        ),
      "not_participant",
      "an outsider CANNOT post",
    );
  });

  // THE staleness proof: drop the enrolment but LEAVE the cached member row.
  await run(async (tx) => {
    await tx.enrollment.updateMany({
      where: { studentId: fx.studentDropped, courseId: fx.courseA },
      data: { status: "unenrolled", unenrolledAt: new Date() },
    });
    const cached = await tx.groupMember.findFirst({
      where: { groupId, userId: fx.studentDropped, leftAt: null },
      select: { id: true },
    });
    assert(!!cached, "cached membership row for the dropped student is STILL present");

    await expectDenied(
      () =>
        groups.assertGroupAccess(tx, actor(fx.studentDropped, "student"), groupId, "read"),
      "not_participant",
      "a DROPPED student is denied despite the stale cache row (live derivation wins)",
    );

    // And the cache converges once refreshed.
    await groups.syncGroupMembers(tx, groupId);
    const after = await tx.groupMember.findFirst({
      where: { groupId, userId: fx.studentDropped, leftAt: null },
      select: { id: true },
    });
    assert(!after, "syncGroupMembers marks the dropped student as left");
  });

  // Students/parents can never create channels.
  await run(async (tx) => {
    await expectDenied(
      () =>
        groups.createGroup(tx, actor(fx.studentA, "student"), {
          kind: "course",
          courseId: fx.courseA,
        }),
      "policy_denied",
      "a student CANNOT create a channel",
    );
    await expectDenied(
      () =>
        groups.createGroup(tx, actor(fx.teacherB, "teacher"), {
          kind: "course",
          courseId: fx.courseA,
        }),
      "policy_denied",
      "another center's teacher CANNOT create a channel for this course",
    );
  });

  // =========================================================================
  console.log("\n14. SEED HYGIENE — messaging writes ZERO money rows");
  // =========================================================================
  await run(async (tx) => {
    const userIds = [
      fx.studentA,
      fx.studentAdult,
      fx.teacherA,
      fx.assistantA,
      fx.parentA,
      fx.adminA,
    ];
    const [tx1, pay, sub, points] = await Promise.all([
      tx.transaction.count({
        where: {
          OR: [{ fromEntityId: { in: userIds } }, { toEntityId: { in: userIds } }],
        },
      }),
      tx.payment.count({ where: { studentId: { in: userIds } } }),
      tx.subscription.count({ where: { studentId: { in: userIds } } }),
      tx.pointsLedger.count({ where: { studentId: { in: userIds } } }),
    ]);
    assert(
      tx1 === 0 && pay === 0 && sub === 0 && points === 0,
      `no ledger/payment/subscription/points rows created (${tx1}/${pay}/${sub}/${points})`,
    );
  });

  // -------------------------------------------------------------------------
  console.log("\nCleaning up fixture…");
  await withPlatformContext(async (tx) => {
    const ids = Object.values(fx);
    await tx.groupMessage.deleteMany({ where: { groupId } });
    await tx.groupMember.deleteMany({ where: { groupId } });
    await tx.conversationGroup.deleteMany({ where: { id: groupId } });
    await tx.conversationReport.deleteMany({
      where: { OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }] },
    });
    await tx.conversationBlock.deleteMany({
      where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
    });
    const convs = await tx.conversation.findMany({
      where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
      select: { id: true },
    });
    await tx.conversationMessage.deleteMany({
      where: { conversationId: { in: convs.map((c) => c.id) } },
    });
    await tx.conversation.deleteMany({ where: { id: { in: convs.map((c) => c.id) } } });
    await tx.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await tx.centerStudentRoster.deleteMany({ where: { studentId: { in: ids } } });
    await tx.parentStudentLink.deleteMany({ where: { parentId: { in: ids } } });
    await tx.teacherAssistant.deleteMany({ where: { assistantId: { in: ids } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.course.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.parentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: [fx.centerA, fx.centerB] } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

assertDbEnv(["test"], { intent: "suite messaging-scope.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
    await prisma.$disconnect();
    await admin.end();
  });
