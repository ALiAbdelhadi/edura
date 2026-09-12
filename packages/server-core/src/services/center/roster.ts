import { Prisma } from "@repo/database";
import {
  literalFragments,
  matchesSearchTerms,
  narrowFragments,
  searchTerms,
} from "@repo/database/search-text";
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
import { runEffects, type WithEffects } from "../../db/effects";
import type { TenantTx } from "@repo/database";
import { generateOpaqueToken, hashToken } from "../../utils/random";

const INVITE_EXPIRY_DAYS = 30;

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

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

    const terms = searchTerms(filters.q ?? "");
    const userFilter: Prisma.UserWhereInput = { id: { in: ids }, status: { not: "deleted" } };
    if (terms.length) {
      userFilter.AND = narrowFragments(literalFragments(filters.q ?? ""), (f) => [
        { name: { contains: f, mode: "insensitive" as const } },
        { phone: { contains: f } },
      ]);
    }

    const found = await tx.user.findMany({
      where: userFilter,
      select: { id: true, name: true, email: true, phone: true, status: true },
    });
    const users = terms.length
      ? found.filter((u) => matchesSearchTerms([u.name, u.phone], terms))
      : found;
    const userMap = new Map(users.map((u) => [u.id, u]));

    const profiles = ids.length
      ? await tx.studentProfile.findMany({
          where: { userId: { in: ids } },
          select: { userId: true, studentCode: true },
        })
      : [];
    const codeMap = new Map(profiles.map((p) => [p.userId, p.studentCode]));

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
  const { value, effects } = await scopedDb(acting, (tx) =>
    addRosterStudentTx(tx, acting, studentId),
  );
  await runEffects(effects);
  return value;
}

export async function addRosterStudentTx(
  tx: TenantTx,
  acting: SessionUser,
  studentId: string,
) {
  const centerId = centerOf(acting);
  const entry = await (async () => {
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
  })();

  return {
    value: entry,
    effects: [
      () =>
        notify({
          recipients: [studentId],
          type: "student_added_to_roster",
          title: "You have been added to a center",
          body: "A center has added you to their student roster.",
          data: { centerId },
        }),
    ],
  };
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
      // walletBalance so counter staff can answer "where did my money go" for
      // the family in front of them. Read-only: the centre cannot spend it.
      select: { studentCode: true, walletBalance: true },
    });

    return {
      ...roster,
      user: student,
      studentCode: profile?.studentCode ?? null,
      walletBalance: profile?.walletBalance ?? 0,
    };
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
  return scopedDb(acting, (tx) => updateRosterStudentTx(tx, acting, studentId, body));
}

export async function updateRosterStudentTx(
  tx: TenantTx,
  acting: SessionUser,
  studentId: string,
  body: RosterStudentPatch,
) {
  const centerId = centerOf(acting);
  return (async () => {
    const inRoster = await tx.centerStudentRoster.findFirst({
      where: { studentId, centerId, leftAt: null },
    });
    if (!inRoster) throw new NotFoundError("Student not in roster");

    const userUpdate: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) userUpdate.name = body.name.trim();

    // SECURITY_AUDIT.md (2026-09-11) AUTHZ-01. `email` here is the LOGIN
    // email, and `requestPasswordReset` looks a user up by it — so a centre
    // manager who could set it on any roster student could reset that
    // student's password and own the account, and rosters are mostly minors.
    // The counter legitimately fills in login details for a walk-in SHELL
    // (no password yet — the same case `me/credentials` models); once the
    // student holds a password those identifiers belong to the student and
    // change only through the verified self-service door (M-06). Phone is
    // held to the same rule: it is the WhatsApp channel the invite rides.
    let identityChange: { before: { email: string | null; phone: string | null } } | null = null;
    if (body.email !== undefined || body.phone !== undefined) {
      const target = await tx.user.findUnique({
        where: { id: studentId },
        select: { passwordHash: true, email: true, phone: true },
      });
      if (!target) throw new NotFoundError("Student not in roster");
      if (target.passwordHash !== null) {
        throw new BusinessRuleError(
          "This student has set a password — login email and phone can only be changed by the student",
        );
      }
      identityChange = { before: { email: target.email, phone: target.phone } };
    }
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
    if (identityChange) {
      await tx.auditLog.create({
        data: {
          actorId: acting.id,
          action: "center.roster_student_identity_changed",
          targetType: "user",
          targetId: studentId,
          centerId,
          beforeState: identityChange.before,
          afterState: {
            email: userUpdate.email ?? identityChange.before.email,
            phone: userUpdate.phone ?? identityChange.before.phone,
          },
        },
      });
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
  })();
}

export async function removeRosterStudent(acting: SessionUser, studentId: string) {
  return scopedDb(acting, (tx) => removeRosterStudentTx(tx, acting, studentId));
}

export async function removeRosterStudentTx(
  tx: TenantTx,
  acting: SessionUser,
  studentId: string,
) {
  const centerId = centerOf(acting);
  const res = await tx.centerStudentRoster.updateMany({
    where: { studentId, leftAt: null, centerId },
    data: { leftAt: new Date() },
  });
  if (res.count === 0) throw new NotFoundError("Student not in roster");
  return { removed: true };
}

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

export async function inviteStudent(
  acting: SessionUser,
  input: { email: string; name?: string },
) {
  const centerId = centerOf(acting);
  const { email, name } = input;
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { value, effects } = await scopedDb(acting, (tx) =>
    inviteStudentTx(tx, acting, input),
  );
  await runEffects(effects);
  return value;
}

export async function inviteStudentTx(
  tx: TenantTx,
  acting: SessionUser,
  input: { email: string; name?: string },
) {
  const centerId = centerOf(acting);
  const { email, name } = input;
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const shell = await (async () => {
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
  })();

  return {
    value: {
      invited: true as const,
      token,
      user: {
        id: shell.id,
        email: shell.email,
        status: shell.status,
        name: shell.name,
        role: shell.role,
      },
    },
    effects: [
      () =>
        sendMail({
          to: email,
          subject: "You have been invited to join as a student",
          text: `Use this token to activate your account: ${token}`,
        })
          .then(() => undefined)
          .catch(() => undefined),
    ],
  };
}

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

    const profiles = teacherIds.length
      ? await tx.teacherProfile.findMany({
          where: { userId: { in: teacherIds } },
          select: { userId: true, systemStatus: true },
        })
      : [];
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
  return scopedDb(acting, (tx) => removeRosterTeacherTx(tx, acting, teacherId));
}

export async function removeRosterTeacherTx(
  tx: TenantTx,
  acting: SessionUser,
  teacherId: string,
) {
  const centerId = centerOf(acting);
  await (async () => {
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
  })();
  return { removed: true };
}

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

export async function inviteTeacher(
  acting: SessionUser,
  input: { email: string; name?: string },
) {
  const centerId = centerOf(acting);
  const { email, name } = input;
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);

  const { value, effects } = await scopedDb(acting, (tx) =>
    inviteTeacherTx(tx, acting, input),
  );
  await runEffects(effects);
  return value;
}

export async function inviteTeacherTx(
  tx: TenantTx,
  acting: SessionUser,
  input: { email: string; name?: string },
) {
  const centerId = centerOf(acting);
  const { email, name } = input;
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);

  const { teacher, affiliation, existingUserId } = await (async () => {
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
  })();

  const deliver = existingUserId
    ? () =>
        notify(
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
        )
    : () =>
        sendMail({
          to: email,
          subject: "You have been invited to teach at a center",
          text: `Use this token to activate your account: ${token}`,
        })
          .then(() => undefined)
          .catch(() => undefined);

  return {
    value: {
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
    },
    effects: [deliver],
  };
}
