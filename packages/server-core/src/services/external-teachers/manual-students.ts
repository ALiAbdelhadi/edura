// =============================================================================
// MANUAL STUDENT ENTRY — one child, one record.
//
// THE PROBLEM THIS SOLVES. The same child very often studies with an
// on-platform teacher AND an off-system one, sometimes at the same center. If
// typing them in by hand created a second `users` row, that child would have
// two wallets, two attendance histories and two sets of money — and no report
// could ever add them up again. Worse, it would be invisible: two rows with the
// same name look like two students.
//
// THE RELATIONSHIP IS ALREADY MANY-TO-MANY, and deliberately has no join table
// of its own. A student reaches a teacher through
// `enrollments -> courses.teacher_id`, which is exactly a many-to-many between
// students and teachers with the group they meet in carried on the edge. A
// `student_teachers` table beside it would be a SECOND answer to "who teaches
// this child", free to disagree with the first. So this module adds none, and
// `listTeacherStudents` below derives the relation from the enrollments that
// already govern attendance, coverage and money.
//
// DEDUP IS TWO LAYERS, not one:
//   - this module LOOKS UP before it creates, on the two keys a counter
//     actually holds (phone, national ID);
//   - the database refuses a collision anyway (`users.phone` is globally
//     UNIQUE, `student_profiles.national_id` is UNIQUE).
// The lookup is what makes the flow usable; the constraint is what makes it
// true. A race between two receptionists is caught by the second layer.
// =============================================================================

import { Prisma } from "@repo/database";
import { scopedDb, type TenantTx } from "../../db/scope";
import { resolveStudentCode } from "@repo/database/student-code";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { generateFamilyCode, generateInviteCode } from "../../utils/random";
import { assertManagedExternalTeacher, writeExternalTeacherAudit } from "./external-teachers";

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

function norm(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * Egyptian national ID: exactly 14 digits. Validated because it is a UNIQUE
 * dedup key — a mistyped one does not merely store badly, it permanently blocks
 * the real owner of that number from ever being entered.
 */
function normalizeNationalId(value: string | null | undefined): string | null {
  const v = norm(value);
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 14) {
    throw new BusinessRuleError("National ID must be 14 digits");
  }
  return digits;
}

/** "أحمد محمد علي" -> "أحمد م."  — enough to recognise, not enough to harvest. */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 4) return null;
  return `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export type ManualStudentMatch = {
  found: boolean;
  /** Only ever the id of a student this center may already act on. */
  studentId: string | null;
  onThisCenterRoster: boolean;
  /** Full name only when the center already holds this student; masked otherwise. */
  name: string | null;
  phone: string | null;
  studentCode: string | null;
  matchedOn: "phone" | "national_id" | "student_code" | null;
  /** What they already study here — so staff can see it IS the same child. */
  existingGroups: { courseId: string; title: string; teacherName: string | null }[];
};

/**
 * "Do we already know this child?" — run before every manual creation.
 *
 * DISCLOSURE IS TIERED, on purpose. The existing `lookupStudent` (L4) returns
 * booleans only, because a center probing arbitrary emails must learn nothing.
 * Here the caller has already typed an exact phone or national ID, and needs
 * enough back to confirm identity — so:
 *   - already on THIS center's roster -> full name and phone (the center holds
 *     this data already; showing it reveals nothing new);
 *   - exists elsewhere -> MASKED name and last-4 phone, and the id is withheld.
 *     Enough for a human to say "yes, that's him", not enough to build a
 *     directory out of.
 */
export async function lookupStudentForManualEntry(
  acting: SessionUser,
  input: { phone?: string | null; nationalId?: string | null; studentCode?: string | null },
): Promise<ManualStudentMatch> {
  const centerId = centerOf(acting);
  const phone = norm(input.phone);
  const nationalId = normalizeNationalId(input.nationalId);
  // Same rule as the counter: a code with a character wrong in it is NOT a
  // key. Here it matters twice over — a bad match would hand this center a
  // (masked) hit on a child who is not the one in front of them.
  const studentCode = input.studentCode ? resolveStudentCode(input.studentCode) : null;

  if (!phone && !nationalId && !studentCode) {
    throw new BusinessRuleError("Provide a phone, a national ID or a student code");
  }

  const empty: ManualStudentMatch = {
    found: false,
    studentId: null,
    onThisCenterRoster: false,
    name: null,
    phone: null,
    studentCode: null,
    matchedOn: null,
    existingGroups: [],
  };

  return scopedDb(acting, async (tx) => {
    const hit = await findStudentByKeys(tx, { phone, nationalId, studentCode });
    if (!hit) return empty;

    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId, studentId: hit.userId, leftAt: null },
      select: { id: true },
    });
    const onRoster = roster !== null;

    let existingGroups: ManualStudentMatch["existingGroups"] = [];
    if (onRoster) {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: hit.userId, centerId, status: "active" },
        select: { courseId: true },
      });
      const courses = enrollments.length
        ? await tx.course.findMany({
            where: { id: { in: enrollments.map((e) => e.courseId) } },
            select: { id: true, title: true, teacherId: true },
          })
        : [];
      const teachers = courses.length
        ? await tx.user.findMany({
            where: { id: { in: [...new Set(courses.map((c) => c.teacherId))] } },
            select: { id: true, name: true },
          })
        : [];
      const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
      existingGroups = courses.map((c) => ({
        courseId: c.id,
        title: c.title,
        teacherName: teacherName.get(c.teacherId) ?? null,
      }));
    }

    return {
      found: true,
      studentId: onRoster ? hit.userId : null,
      onThisCenterRoster: onRoster,
      name: onRoster ? hit.name : maskName(hit.name),
      phone: onRoster ? hit.phone : maskPhone(hit.phone),
      studentCode: onRoster ? hit.studentCode : null,
      matchedOn: hit.matchedOn,
      existingGroups,
    };
  });
}

/**
 * The dedup lookup itself — the ONE place the keys are defined, so the lookup
 * and the create can never disagree about what counts as "the same child".
 * Order is by strength: a national ID identifies a person, a phone identifies a
 * household, a student code identifies a record we issued.
 */
async function findStudentByKeys(
  tx: TenantTx,
  keys: { phone: string | null; nationalId: string | null; studentCode: string | null },
) {
  if (keys.nationalId) {
    const p = await tx.studentProfile.findUnique({
      where: { nationalId: keys.nationalId },
      select: { userId: true, fullName: true, phone: true, studentCode: true },
    });
    if (p?.userId) {
      const u = await tx.user.findUnique({
        where: { id: p.userId },
        select: { id: true, name: true, phone: true, deletedAt: true },
      });
      if (u && !u.deletedAt) {
        return {
          userId: u.id,
          name: u.name || p.fullName,
          phone: u.phone ?? p.phone,
          studentCode: p.studentCode,
          matchedOn: "national_id" as const,
        };
      }
    }
  }

  if (keys.studentCode) {
    const p = await tx.studentProfile.findUnique({
      where: { studentCode: keys.studentCode },
      select: { userId: true, fullName: true, phone: true, studentCode: true },
    });
    if (p?.userId) {
      const u = await tx.user.findUnique({
        where: { id: p.userId },
        select: { id: true, name: true, phone: true, deletedAt: true },
      });
      if (u && !u.deletedAt) {
        return {
          userId: u.id,
          name: u.name || p.fullName,
          phone: u.phone ?? p.phone,
          studentCode: p.studentCode,
          matchedOn: "student_code" as const,
        };
      }
    }
  }

  if (keys.phone) {
    const u = await tx.user.findFirst({
      where: { phone: keys.phone, role: "student", deletedAt: null },
      select: { id: true, name: true, phone: true },
    });
    if (u) {
      const p = await tx.studentProfile.findUnique({
        where: { userId: u.id },
        select: { studentCode: true, fullName: true },
      });
      return {
        userId: u.id,
        name: u.name || p?.fullName || "",
        phone: u.phone,
        studentCode: p?.studentCode ?? null,
        matchedOn: "phone" as const,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Create-or-reuse
// ---------------------------------------------------------------------------

export type ManualStudentInput = {
  fullName: string;
  phone?: string | null;
  nationalId?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  gradeLevelId?: string | null;
  /** Enrol into this off-system teacher's group in the same step (optional). */
  courseId?: string | null;
};

export type ManualStudentResult = {
  studentId: string;
  studentCode: string;
  name: string;
  /** false = we reused an existing child, which is the important case. */
  created: boolean;
  reusedBecause: "phone" | "national_id" | null;
  enrolledInCourseId: string | null;
};

/**
 * Register (or re-find) a student for an off-system teacher's group.
 *
 * REUSE IS THE DEFAULT AND IS NOT OPTIONAL. When a key matches, the existing
 * child is used — this function has no "create anyway" flag, because a flag
 * like that is how the duplicate gets created at 6pm on a busy evening.
 *
 * A reused child is NOT overwritten. Their name, grade and guardian details
 * belong to whoever holds the account (very often the family themselves), and a
 * second center's typing must not silently rewrite them. The one thing this
 * does add to an existing record is a missing national ID, because that is the
 * dedup key and filling it in makes every future lookup stronger.
 */
export async function createManualStudent(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: ManualStudentInput,
): Promise<ManualStudentResult> {
  const centerId = centerOf(actor.acting);
  const fullName = norm(input.fullName);
  if (!fullName) throw new BusinessRuleError("Student name is required");

  const phone = norm(input.phone);
  const nationalId = normalizeNationalId(input.nationalId);

  return scopedDb(actor.acting, async (tx) => {
    // The teacher must be one this center manages — a manual student is always
    // entered FOR somebody, and that somebody bounds who may be typed in.
    await assertManagedExternalTeacher(tx, centerId, teacherId, { requireExternal: true });

    const existing = await findStudentByKeys(tx, { phone, nationalId, studentCode: null });

    let studentId: string;
    let studentCode: string;
    let created: boolean;
    let reusedBecause: ManualStudentResult["reusedBecause"] = null;

    if (existing) {
      studentId = existing.userId;
      created = false;
      reusedBecause = existing.matchedOn === "student_code" ? null : existing.matchedOn;

      const profile = await tx.studentProfile.findUnique({
        where: { userId: studentId },
        select: { id: true, studentCode: true, nationalId: true },
      });
      if (!profile) throw new NotFoundError("Student profile not found");
      studentCode = profile.studentCode;

      // Backfill the dedup key ONLY when it is missing — never overwrite one.
      if (nationalId && !profile.nationalId) {
        await tx.studentProfile.update({
          where: { id: profile.id },
          data: { nationalId },
        });
      }
    } else {
      created = true;
      let shell;
      try {
        shell = await tx.user.create({
          data: {
            name: fullName,
            phone,
            role: "student",
            // Same shape as every other student the center creates on someone's
            // behalf: no password, so no login, until they claim an invite.
            status: "shell",
            passwordHash: null,
          },
        });
      } catch (err) {
        // The unique index caught what the lookup could not: a concurrent
        // receptionist created the same child a moment ago.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictError(
            "This student was just created by someone else — search again to find them",
          );
        }
        throw err;
      }

      let profile;
      try {
        profile = await tx.studentProfile.create({
          data: {
            userId: shell.id,
            fullName,
            phone,
            nationalId,
            entityType: "invited",
            inviteCode: generateInviteCode(),
            familyLinkCode: generateFamilyCode(),
            gradeLevelId: input.gradeLevelId ?? null,
            guardianEmail: norm(input.guardianEmail),
            guardianPhone: norm(input.guardianPhone),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictError(
            "A student with this national ID already exists — search for them instead",
          );
        }
        throw err;
      }
      studentId = shell.id;
      studentCode = profile.studentCode;
    }

    // Roster membership is idempotent: the same child joining a second teacher
    // at the same center must not produce a second roster row, and a child who
    // previously left rejoins on the SAME row.
    const roster = await tx.centerStudentRoster.findUnique({
      where: { centerId_studentId: { centerId, studentId } },
    });
    if (!roster) {
      await tx.centerStudentRoster.create({
        data: {
          centerId,
          studentId,
          dataSource: "manual",
          operationalParentName: norm(input.guardianName),
          operationalParentPhone: norm(input.guardianPhone),
        },
      });
    } else if (roster.leftAt) {
      await tx.centerStudentRoster.update({
        where: { id: roster.id },
        data: { leftAt: null },
      });
    }

    let enrolledInCourseId: string | null = null;
    if (input.courseId) {
      enrolledInCourseId = await enrollInTeacherCourseTx(tx, {
        centerId,
        teacherId,
        courseId: input.courseId,
        studentId,
        actorId: actor.actorId,
      });
    }

    await writeExternalTeacherAudit(tx, {
      action: created ? "external_teacher.student_created" : "external_teacher.student_linked",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "student",
      targetId: studentId,
      after: {
        teacherId,
        name: fullName,
        phone,
        hasNationalId: nationalId !== null,
        reusedBecause,
        courseId: enrolledInCourseId,
      },
    });

    return {
      studentId,
      studentCode,
      name: fullName,
      created,
      reusedBecause,
      enrolledInCourseId,
    };
  });
}

/**
 * Enrol an existing student into an off-system teacher's group.
 *
 * Shares its body with the one-step create above, so "enrol now" and "enrol
 * later" cannot drift apart in what they check or what they write.
 */
export async function enrollManualStudent(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: { studentId: string; courseId: string },
) {
  const centerId = centerOf(actor.acting);

  return scopedDb(actor.acting, async (tx) => {
    await assertManagedExternalTeacher(tx, centerId, teacherId, { requireExternal: true });

    const onRoster = await tx.centerStudentRoster.findFirst({
      where: { centerId, studentId: input.studentId, leftAt: null },
      select: { blacklisted: true },
    });
    if (!onRoster) throw new NotFoundError("Student is not on this center's roster");
    if (onRoster.blacklisted) {
      throw new BusinessRuleError("Student is blacklisted at this center");
    }

    const courseId = await enrollInTeacherCourseTx(tx, {
      centerId,
      teacherId,
      courseId: input.courseId,
      studentId: input.studentId,
      actorId: actor.actorId,
    });

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.student_enrolled",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "enrollment",
      targetId: input.studentId,
      after: { teacherId, courseId },
    });

    return { enrolled: true as const, courseId };
  });
}

async function enrollInTeacherCourseTx(
  tx: TenantTx,
  input: {
    centerId: string;
    teacherId: string;
    courseId: string;
    studentId: string;
    actorId: string;
  },
) {
  const course = await tx.course.findFirst({
    where: { id: input.courseId, centerId: input.centerId, teacherId: input.teacherId },
    select: { id: true, maxStudents: true },
  });
  if (!course) throw new NotFoundError("Group not found for this teacher");

  const already = await tx.enrollment.findFirst({
    where: { studentId: input.studentId, courseId: course.id, status: "active" },
    select: { id: true },
  });
  // Idempotent rather than an error: the one-step create must not fail on a
  // student who is already in the group.
  if (already) return course.id;

  const activeCount = await tx.enrollment.count({
    where: { courseId: course.id, status: "active" },
  });
  if (activeCount >= course.maxStudents) {
    throw new BusinessRuleError("Group is full", { code: "course_full" });
  }

  try {
    await tx.enrollment.create({
      data: {
        studentId: input.studentId,
        courseId: course.id,
        centerId: input.centerId,
        status: "active",
        enrolledAt: new Date(),
        enrolledBy: input.actorId,
        dataSource: "manual",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return course.id;
    }
    throw err;
  }
  return course.id;
}

// ---------------------------------------------------------------------------
// Read: the teacher's students
// ---------------------------------------------------------------------------

export type TeacherStudentRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  phone: string | null;
  dataSource: "system" | "manual";
  groups: { courseId: string; title: string }[];
  /** True when this same child also studies with an ON-PLATFORM teacher here. */
  alsoWithEnrolledTeacher: boolean;
  activeSubscriptions: number;
};

/**
 * A teacher's students, derived from enrollments — the same edge attendance and
 * money already run on, so this list cannot disagree with them.
 *
 * `alsoWithEnrolledTeacher` is the shared-child case made VISIBLE. It is the
 * thing a center most needs to see and the thing a duplicated record would have
 * hidden: this is one child with one balance, studying under two teachers.
 */
export async function listTeacherStudents(
  acting: SessionUser,
  teacherId: string,
): Promise<TeacherStudentRow[]> {
  const centerId = centerOf(acting);

  return scopedDb(acting, async (tx) => {
    const courses = await tx.course.findMany({
      where: { centerId, teacherId },
      select: { id: true, title: true },
    });
    if (!courses.length) return [];
    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

    const enrollments = await tx.enrollment.findMany({
      where: { courseId: { in: courses.map((c) => c.id) }, status: "active" },
      select: { studentId: true, courseId: true, dataSource: true },
    });
    if (!enrollments.length) return [];

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

    const [users, profiles, otherEnrollments, subs] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, phone: true },
      }),
      tx.studentProfile.findMany({
        where: { userId: { in: studentIds } },
        select: { userId: true, studentCode: true, fullName: true },
      }),
      // Every OTHER group these children attend at this center, so we can say
      // whether an on-platform teacher also has them.
      tx.enrollment.findMany({
        where: {
          studentId: { in: studentIds },
          centerId,
          status: "active",
          courseId: { notIn: courses.map((c) => c.id) },
        },
        select: { studentId: true, courseId: true },
      }),
      tx.subscription.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, teacherId, status: "active" },
        _count: { _all: true },
      }),
    ]);

    const otherCourseIds = [...new Set(otherEnrollments.map((e) => e.courseId))];
    const otherCourses = otherCourseIds.length
      ? await tx.course.findMany({
          where: { id: { in: otherCourseIds } },
          select: { id: true, teacherId: true },
        })
      : [];
    const otherTeacherIds = [...new Set(otherCourses.map((c) => c.teacherId))];
    const otherProfiles = otherTeacherIds.length
      ? await tx.teacherProfile.findMany({
          where: { userId: { in: otherTeacherIds } },
          select: { userId: true, systemStatus: true },
        })
      : [];
    // Default-enrolled: a teacher with no profile row predates this feature and
    // is on-platform by definition.
    const enrolledTeacherIds = new Set(
      otherTeacherIds.filter(
        (id) =>
          (otherProfiles.find((p) => p.userId === id)?.systemStatus ?? "enrolled") ===
          "enrolled",
      ),
    );
    const courseTeacher = new Map(otherCourses.map((c) => [c.id, c.teacherId]));
    const sharedStudents = new Set(
      otherEnrollments
        .filter((e) => enrolledTeacherIds.has(courseTeacher.get(e.courseId) ?? ""))
        .map((e) => e.studentId),
    );

    const userMap = new Map(users.map((u) => [u.id, u]));
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));
    const subCount = new Map(subs.map((s) => [s.studentId, s._count._all]));

    const byStudent = new Map<string, TeacherStudentRow>();
    for (const e of enrollments) {
      const u = userMap.get(e.studentId);
      const p = profileMap.get(e.studentId);
      const row = byStudent.get(e.studentId) ?? {
        studentId: e.studentId,
        name: u?.name || p?.fullName || "",
        studentCode: p?.studentCode ?? null,
        phone: u?.phone ?? null,
        dataSource: e.dataSource,
        groups: [],
        alsoWithEnrolledTeacher: sharedStudents.has(e.studentId),
        activeSubscriptions: subCount.get(e.studentId) ?? 0,
      };
      row.groups.push({ courseId: e.courseId, title: courseTitle.get(e.courseId) ?? "" });
      byStudent.set(e.studentId, row);
    }

    return [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  });
}
