import { Prisma } from "@repo/database";
import { scopedDb } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { sendMail } from "../../mail/send";
import { generateOpaqueToken, hashToken } from "../../utils/random";

// ---------------------------------------------------------------------------
// CENTER ROSTER — students and teachers.
//
// Extracted VERBATIM out of the apps/www route handlers (roster/**) so both
// apps run one implementation:
//   • www passes the caller's own center actor (owner or staff),
//   • apps/superadmin passes a `superadminAsCenter(centerId)` actor.
//
// `acting` is ALWAYS center_admin-shaped and carries the TARGET centerId, so
// `scopedDb(acting)` → `withTenant(centerId)` → RLS binds every query to that
// center. That is the same mechanism center staff already use (center-actor.ts,
// proven 55/55) — the caller's real id stays available for attribution.
//
// Authorization is NOT done here. Each app's route layer decides who may call
// (www: requireRole / centerStaff sub-role gate; superadmin: requireRole
// "super_admin"). Keeping the gate at the edge is why the www sub-role matrix
// is unchanged by this move.
// ---------------------------------------------------------------------------

const INVITE_EXPIRY_DAYS = 30;

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export async function listRosterStudents(
  acting: SessionUser,
  filters: { blacklisted?: string | null; courseId?: string | null; q?: string | null } = {},
) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const rosterFilter: Prisma.CenterStudentRosterWhereInput = { leftAt: null, centerId };
    if (filters.blacklisted === "true") rosterFilter.blacklisted = true;
    if (filters.blacklisted === "false") rosterFilter.blacklisted = false;

    if (filters.courseId) {
      const enrollments = await tx.enrollment.findMany({
        where: { courseId: filters.courseId, centerId, status: "active" },
        select: { studentId: true },
      });
      rosterFilter.studentId = { in: enrollments.map((e) => e.studentId) };
    }

    const rosters = await tx.centerStudentRoster.findMany({ where: rosterFilter });
    const ids = rosters.map((r) => r.studentId);

    const userFilter: Prisma.UserWhereInput = { id: { in: ids }, status: { not: "deleted" } };
    if (filters.q) userFilter.name = { startsWith: filters.q, mode: "insensitive" };

    const users = await tx.user.findMany({
      where: userFilter,
      select: { id: true, name: true, email: true, phone: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // The printable code (A1Y00HDG) is what a center actually holds a student
    // by — the cards, the counter and the receipt all speak it. The list used
    // to show the raw user UUID instead, which nobody can read over a counter.
    const profiles = ids.length
      ? await tx.studentProfile.findMany({
          where: { userId: { in: ids } },
          select: { userId: true, studentCode: true },
        })
      : [];
    const codeMap = new Map(profiles.map((p) => [p.userId, p.studentCode]));

    // Courses per student = their ACTIVE ENROLLMENTS at THIS center. Enrollment
    // is the roster link, which is what a roster column means; a Subscription is
    // the payment coverage wrapping it and is deliberately NOT what is counted
    // here (the header says courses, so it counts courses).
    //
    // Grouping by (studentId, courseId) counts each COURSE once rather than
    // each ROW: a student who left a course and rejoined it has two rows for it,
    // and only the active one may count. (The partial unique index
    // `enrollments_active_student_course` already forbids two ACTIVE rows for a
    // pair, so this grouping is belt-and-braces — but it makes the count
    // distinct by construction instead of by reference to an index elsewhere.)
    // One query for the whole page, not one per row.
    const enrollmentGroups = ids.length
      ? await tx.enrollment.groupBy({
          by: ["studentId", "courseId"],
          where: { studentId: { in: ids }, centerId, status: "active" },
        })
      : [];
    const coursesByStudent = new Map<string, number>();
    for (const g of enrollmentGroups) {
      coursesByStudent.set(g.studentId, (coursesByStudent.get(g.studentId) ?? 0) + 1);
    }

    return rosters.map((r) => {
      const u = userMap.get(r.studentId);
      return {
        id: r.studentId,
        studentId: r.studentId,
        rosterId: r.id,
        blacklisted: r.blacklisted,
        blacklistReason: r.blacklistReason,
        addedAt: r.addedAt,
        leftAt: r.leftAt,
        coursesCount: coursesByStudent.get(r.studentId) ?? 0,
        studentCode: codeMap.get(r.studentId) ?? null,
        name: u?.name,
        email: u?.email,
        phone: u?.phone,
        status: u?.status,
        user: u ? { name: u.name, email: u.email, phone: u.phone, status: u.status } : null,
      };
    });
  });
}

export async function addRosterStudent(acting: SessionUser, studentId: string) {
  const centerId = centerOf(acting);
  const entry = await scopedDb(acting, async (tx) => {
    const student = await tx.user.findFirst({
      where: { id: studentId, role: "student", status: { not: "deleted" } },
    });
    if (!student) throw new NotFoundError("Student not found");

    const exists = await tx.centerStudentRoster.findFirst({
      where: { centerId, studentId, leftAt: null },
    });
    if (exists) throw new ConflictError("Student already in roster");

    if (student.status === "shell") {
      throw new BusinessRuleError("Use invite for shell accounts");
    }

    try {
      return await tx.centerStudentRoster.create({
        data: { centerId, studentId, addedAt: new Date() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Student already in roster");
      }
      throw err;
    }
  });

  await notify({
    recipients: [studentId],
    type: "student_added_to_roster",
    title: "You have been added to a center",
    body: "A center has added you to their student roster.",
    data: { centerId },
  });

  return entry;
}

export async function getRosterStudent(acting: SessionUser, studentId: string) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const roster = await tx.centerStudentRoster.findFirst({ where: { studentId, centerId } });
    if (!roster) throw new NotFoundError("Student not in roster");

    const student = await tx.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, phone: true, status: true },
    });

    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentId },
      select: { studentCode: true },
    });

    return { ...roster, user: student, studentCode: profile?.studentCode ?? null };
  });
}

export type RosterStudentPatch = {
  name?: string;
  email?: string;
  phone?: string;
  operationalParentName?: string;
  operationalParentPhone?: string;
  blacklisted?: boolean;
  blacklistReason?: string;
};

export async function updateRosterStudent(
  acting: SessionUser,
  studentId: string,
  body: RosterStudentPatch,
) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const inRoster = await tx.centerStudentRoster.findFirst({
      where: { studentId, centerId, leftAt: null },
    });
    if (!inRoster) throw new NotFoundError("Student not in roster");

    const userUpdate: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) userUpdate.name = body.name.trim();
    if (body.email !== undefined) {
      const normalizedEmail = body.email.toLowerCase().trim();
      const existing = await tx.user.findFirst({
        where: { email: normalizedEmail, id: { not: studentId } },
      });
      if (existing) throw new ConflictError("Email already in use");
      userUpdate.email = normalizedEmail;
    }
    if (body.phone !== undefined) userUpdate.phone = body.phone || null;

    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: studentId }, data: userUpdate });
    }

    const rosterUpdate: Prisma.CenterStudentRosterUpdateInput = {};
    if (body.operationalParentName !== undefined)
      rosterUpdate.operationalParentName = body.operationalParentName;
    if (body.operationalParentPhone !== undefined)
      rosterUpdate.operationalParentPhone = body.operationalParentPhone;
    if (body.blacklisted !== undefined) {
      rosterUpdate.blacklisted = body.blacklisted;
      if (body.blacklisted) {
        rosterUpdate.blacklistedAt = new Date();
        rosterUpdate.blacklistedBy = acting.id;
        rosterUpdate.blacklistReason = body.blacklistReason ?? "";
      } else {
        rosterUpdate.blacklistedAt = null;
        rosterUpdate.blacklistedBy = null;
        rosterUpdate.blacklistReason = "";
      }
    }

    let roster: Awaited<ReturnType<typeof tx.centerStudentRoster.update>> | null = null;
    if (Object.keys(rosterUpdate).length > 0) {
      roster = await tx.centerStudentRoster.update({
        where: { centerId_studentId: { centerId, studentId } },
        data: rosterUpdate,
      });
    }

    const updatedUser = await tx.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, phone: true, status: true },
    });

    return { ...(roster ?? {}), user: updatedUser };
  });
}

/** Soft removal from the roster (`leftAt`) — never a hard delete. */
export async function removeRosterStudent(acting: SessionUser, studentId: string) {
  const centerId = centerOf(acting);
  await scopedDb(acting, async (tx) => {
    const res = await tx.centerStudentRoster.updateMany({
      where: { studentId, leftAt: null, centerId },
      data: { leftAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundError("Student not in roster");
  });
  return { removed: true };
}

/**
 * L4: resolves an account by an exact email/phone the caller already holds.
 * Returns ONLY two booleans — never id, name or email — so a single probe
 * reveals no PII beyond existence. Rate limiting stays at the route layer.
 */
export async function lookupStudent(
  acting: SessionUser,
  body: { email?: string; phone?: string },
) {
  const filter: { email?: string; phone?: string } = {};
  if (body.email) filter.email = body.email;
  else if (body.phone) filter.phone = body.phone;

  const student = await scopedDb(acting, (tx) =>
    tx.user.findFirst({
      where: { ...filter, role: "student", status: { not: "deleted" } },
      select: { status: true },
    }),
  );

  const found = student !== null;
  const inviteSendable = !found || student.status === "shell";
  return { found, inviteSendable };
}

/**
 * Create (or reuse) a shell student, put them on the roster, and mint an
 * activation invite. The raw token is returned to the caller; only the route
 * decides whether to echo it (dev/E2E only).
 */
export async function inviteStudent(
  acting: SessionUser,
  input: { email: string; name?: string },
) {
  const centerId = centerOf(acting);
  const { email, name } = input;
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const shell = await scopedDb(acting, async (tx) => {
    const existing = await tx.user.findFirst({ where: { email, status: { not: "deleted" } } });
    if (existing && existing.status !== "shell") {
      throw new BusinessRuleError("Active user with this email exists; use lookup instead");
    }
    if (existing && existing.status === "shell") {
      const pendingInvite = await tx.inviteToken.findFirst({
        where: {
          email,
          purpose: "student_activation",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (pendingInvite) throw new ConflictError("Pending invite already exists for this email");
    }

    const shellUser =
      existing ??
      (await tx.user.create({
        data: {
          email,
          name: name ?? email.split("@")[0],
          role: "student",
          status: "shell",
          passwordHash: null,
        },
      }));

    await tx.centerStudentRoster.upsert({
      where: { centerId_studentId: { centerId, studentId: shellUser.id } },
      create: { centerId, studentId: shellUser.id, addedAt: new Date() },
      update: {},
    });

    await tx.inviteToken.create({
      data: { email, tokenHash, purpose: "student_activation", centerId, expiresAt },
    });

    return shellUser;
  });

  await sendMail({
    to: email,
    subject: "You have been invited to join as a student",
    text: `Use this token to activate your account: ${token}`,
  }).catch(() => {});

  return {
    invited: true as const,
    token,
    user: {
      id: shell.id,
      email: shell.email,
      status: shell.status,
      name: shell.name,
      role: shell.role,
    },
  };
}

// ---------------------------------------------------------------------------
// Teachers
// ---------------------------------------------------------------------------

export async function listRosterTeachers(
  acting: SessionUser,
  filters: { status?: string | null } = {},
) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const filter: Prisma.CenterTeacherAffiliationWhereInput = { centerId };
    if (filters.status) {
      filter.status = filters.status as Prisma.CenterTeacherAffiliationWhereInput["status"];
    }

    const affiliations = await tx.centerTeacherAffiliation.findMany({ where: filter });
    const teacherIds = affiliations.map((a) => a.teacherId);
    const teachers = await tx.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, name: true, email: true, status: true },
    });
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));

    // Off-system teachers appear in this COMBINED list like everyone else —
    // that is the point of the feature. What the list must not do is read their
    // permanent `shell` account as a stalled invite, so the row carries the
    // status and the UI badges on it. One extra indexed query for the page.
    const profiles = teacherIds.length
      ? await tx.teacherProfile.findMany({
          where: { userId: { in: teacherIds } },
          select: { userId: true, systemStatus: true },
        })
      : [];
    // Default-enrolled: a teacher with no profile row predates this feature and
    // is on-platform by definition.
    const systemStatusById = new Map(profiles.map((p) => [p.userId, p.systemStatus]));

    const items = [];
    for (const a of affiliations) {
      const t = teacherMap.get(a.teacherId);
      const teacherCourses = await tx.course.findMany({
        where: { teacherId: a.teacherId, status: "active" },
        select: { subject: true },
      });
      const coursesCount = teacherCourses.length;
      const subjects = [...new Set(teacherCourses.map((c) => c.subject).filter(Boolean))];

      const reviewStats = await tx.review.aggregate({
        where: { teacherId: a.teacherId },
        _avg: { rating: true },
        _count: true,
      });
      const avg = reviewStats._avg.rating;
      const rating = avg ? Math.round(avg * 10) / 10 : 0;
      const reviewsCount = reviewStats._count ?? 0;

      items.push({
        id: a.teacherId,
        teacherId: a.teacherId,
        name: t?.name,
        email: t?.email,
        status: t?.status,
        systemStatus: systemStatusById.get(a.teacherId) ?? "enrolled",
        subjects,
        coursesCount,
        rating,
        reviewsCount,
        affiliation: { ...a },
      });
    }

    return items;
  });
}

export async function removeRosterTeacher(acting: SessionUser, teacherId: string) {
  const centerId = centerOf(acting);
  await scopedDb(acting, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId, status: { in: ["pending", "active"] } },
    });
    if (!affiliation) throw new NotFoundError("Affiliation not found");

    const activeCourses = await tx.course.count({
      where: { centerId, teacherId, status: "active" },
    });
    if (activeCourses > 0) {
      throw new BusinessRuleError("Cannot remove teacher with active courses");
    }

    await tx.centerTeacherAffiliation.update({
      where: { id: affiliation.id },
      data: { status: "removed", removedAt: new Date() },
    });
  });
  return { removed: true };
}

/** L4 — same existence-only contract as `lookupStudent`. */
export async function lookupTeacher(acting: SessionUser, body: { email: string }) {
  const teacher = await scopedDb(acting, (tx) =>
    tx.user.findFirst({
      where: { email: body.email, role: "teacher", status: { not: "deleted" } },
      select: { status: true },
    }),
  );
  const found = teacher !== null;
  const inviteSendable = !found || teacher.status === "shell";
  return { found, inviteSendable };
}

/**
 * Shell-account onboarding for a teacher who is not registered yet. Step 5
 * moved the invite for EXISTING teachers to collaboration requests, so this
 * path deliberately refuses a registered account.
 */
export async function inviteTeacher(
  acting: SessionUser,
  input: { email: string; name?: string },
) {
  const centerId = centerOf(acting);
  const { email, name } = input;
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);

  const { teacher, affiliation, existingUserId } = await scopedDb(acting, async (tx) => {
    const existing = await tx.user.findFirst({ where: { email, status: { not: "deleted" } } });

    if (existing && existing.role !== "teacher") {
      throw new ConflictError("Email exists with a different role");
    }
    if (existing && existing.status !== "shell") {
      throw new ConflictError(
        "This teacher is already registered — send them a collaboration request instead",
      );
    }
    if (existing) {
      const activeAffiliation = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId, teacherId: existing.id, status: { in: ["pending", "active"] } },
      });
      if (activeAffiliation)
        throw new ConflictError("Teacher already has an active or pending affiliation");
    }

    const teacherUser =
      existing ??
      (await tx.user.create({
        data: {
          email,
          name: name ?? email.split("@")[0],
          role: "teacher",
          status: "shell",
          passwordHash: null,
        },
      }));

    const newAffiliation = await tx.centerTeacherAffiliation.create({
      data: {
        centerId,
        teacherId: teacherUser.id,
        status: "pending",
        invitedAt: new Date(),
        expiresAt,
      },
    });

    await tx.inviteToken.create({
      data: { email, tokenHash, purpose: "teacher_activation", centerId, expiresAt },
    });

    return {
      teacher: teacherUser,
      affiliation: newAffiliation,
      existingUserId: existing ? existing.id : null,
    };
  });

  if (existingUserId) {
    await notify(
      {
        recipients: [existingUserId],
        type: "teacher_invited",
        title: "Center invitation",
        body: "You have been invited to join a center as a teacher.",
        data: { centerId },
      },
      {
        to: email,
        subject: "You have been invited to teach at a center",
        text: `Use this token to accept: ${token}`,
      },
    );
  } else {
    await sendMail({
      to: email,
      subject: "You have been invited to teach at a center",
      text: `Use this token to activate your account: ${token}`,
    }).catch(() => {});
  }

  return {
    invited: true as const,
    token,
    existingUser: !!existingUserId,
    user: {
      id: teacher.id,
      email: teacher.email,
      status: teacher.status,
      role: teacher.role,
      name: teacher.name,
    },
    affiliation: { id: affiliation.id, status: affiliation.status },
  };
}
