import { Prisma } from "@repo/database";
import { scopedDb, type TenantTx } from "../../db/scope";
import { resolveStudentCode } from "@repo/database/student-code";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { generateFamilyCode, generateInviteCode } from "../../utils/random";
import { maskName, maskPhone } from "../students/disclosure";
import { assertManagedExternalTeacher, writeExternalTeacherAudit } from "./external-teachers";
import { egyptPhoneVariants, toLatinDigits } from "../whatsapp/phone";

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

function norm(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function normalizeNationalId(value: string | null | undefined): string | null {
  const v = norm(value);
  if (!v) return null;
  if (/^\d(\.\d+)?e\+?\d+$/i.test(v)) {
    throw new BusinessRuleError(
      "National ID must be 14 digits — Excel turned it into scientific notation; format the column as Text and export again",
    );
  }
  const digits = toLatinDigits(v).replace(/\D/g, "");
  if (digits.length !== 14) {
    throw new BusinessRuleError("National ID must be 14 digits");
  }
  return digits;
}

export type ManualStudentMatch = {
  found: boolean;
  studentId: string | null;
  onThisCenterRoster: boolean;
  name: string | null;
  phone: string | null;
  studentCode: string | null;
  matchedOn: "phone" | "national_id" | "student_code" | null;
  existingGroups: { courseId: string; title: string; teacherName: string | null }[];
};

export async function lookupStudentForManualEntry(
  acting: SessionUser,
  input: { phone?: string | null; nationalId?: string | null; studentCode?: string | null },
): Promise<ManualStudentMatch> {
  const centerId = centerOf(acting);
  const phone = norm(input.phone);
  const nationalId = normalizeNationalId(input.nationalId);
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

export async function findStudentByKeys(
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
    const variants = egyptPhoneVariants(keys.phone);
    const u = await tx.user.findFirst({
      where: {
        phone: variants.length ? { in: variants } : keys.phone,
        role: "student",
        deletedAt: null,
      },
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

export type ManualStudentInput = {
  fullName: string;
  phone?: string | null;
  nationalId?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  gradeLevelId?: string | null;
  courseId?: string | null;
};

export type ManualStudentResult = {
  studentId: string;
  studentCode: string;
  name: string;
  created: boolean;
  reusedBecause: "phone" | "national_id" | null;
  enrolledInCourseId: string | null;
};

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
            status: "shell",
            passwordHash: null,
          },
        });
      } catch (err) {
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

export type TeacherStudentRow = {
  studentId: string;
  name: string;
  studentCode: string | null;
  phone: string | null;
  dataSource: "system" | "manual";
  groups: { courseId: string; title: string }[];
  alsoWithEnrolledTeacher: boolean;
  activeSubscriptions: number;
};

type StudentsData = {
  courses: { id: string; title: string }[];
  enrollments: { studentId: string; courseId: string; dataSource: "system" | "manual" }[];
  users: { id: string; name: string; phone: string | null }[];
  profiles: { userId: string; studentCode: string | null; fullName: string | null }[];
  otherEnrollments: { studentId: string; teacherId: string | null; systemStatus: string | null }[];
  subs: { studentId: string; n: number }[];
};

export async function listTeacherStudents(
  acting: SessionUser,
  teacherId: string,
): Promise<TeacherStudentRow[]> {
  const centerId = centerOf(acting);

  return scopedDb(acting, async (tx) => {
    const [data] = await tx.$queryRaw<StudentsData[]>`
      WITH cs AS (
        SELECT id, title FROM courses WHERE center_id = ${centerId}::uuid AND teacher_id = ${teacherId}::uuid
      ),
      en AS (
        SELECT student_id, course_id, data_source::text AS data_source FROM enrollments
         WHERE course_id IN (SELECT id FROM cs) AND status = 'active'
      ),
      sid AS (SELECT DISTINCT student_id FROM en)
      SELECT
        (SELECT coalesce(json_agg(json_build_object('id', id, 'title', title)), '[]'::json) FROM cs) AS courses,
        (SELECT coalesce(json_agg(json_build_object(
            'studentId', student_id, 'courseId', course_id, 'dataSource', data_source)), '[]'::json)
           FROM en) AS enrollments,
        (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name, 'phone', phone)), '[]'::json)
           FROM users WHERE id IN (SELECT student_id FROM sid) AND deleted_at IS NULL) AS users,
        (SELECT coalesce(json_agg(json_build_object(
            'userId', user_id, 'studentCode', student_code, 'fullName', full_name)), '[]'::json)
           FROM student_profiles WHERE user_id IN (SELECT student_id FROM sid)) AS profiles,
        (SELECT coalesce(json_agg(json_build_object(
            'studentId', oe.student_id, 'teacherId', oc.teacher_id, 'systemStatus', tp.system_status::text)), '[]'::json)
           FROM enrollments oe
           LEFT JOIN courses oc ON oc.id = oe.course_id
           LEFT JOIN teacher_profiles tp ON tp.user_id = oc.teacher_id
          WHERE oe.student_id IN (SELECT student_id FROM sid)
            AND oe.center_id = ${centerId}::uuid AND oe.status = 'active'
            AND oe.course_id NOT IN (SELECT id FROM cs)) AS "otherEnrollments",
        (SELECT coalesce(json_agg(json_build_object('studentId', student_id, 'n', n)), '[]'::json)
           FROM (SELECT student_id, count(*)::int AS n FROM subscriptions
                  WHERE student_id IN (SELECT student_id FROM sid)
                    AND teacher_id = ${teacherId}::uuid AND status = 'active'
                  GROUP BY student_id) x) AS subs`;

    const courses = data?.courses ?? [];
    if (!courses.length) return [];
    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

    const enrollments = data.enrollments;
    if (!enrollments.length) return [];

    const { users, profiles, otherEnrollments, subs } = data;

    const sharedStudents = new Set(
      otherEnrollments
        .filter((e) => e.teacherId != null && (e.systemStatus ?? "enrolled") === "enrolled")
        .map((e) => e.studentId),
    );

    const userMap = new Map(users.map((u) => [u.id, u]));
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));
    const subCount = new Map(subs.map((s) => [s.studentId, s.n]));

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
