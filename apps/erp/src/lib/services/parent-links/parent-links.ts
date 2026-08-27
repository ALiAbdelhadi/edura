import { scopedDb } from "@/lib/db/scope";
import { generateFamilyCode } from "@/lib/utils/random";
import { notify } from "@/lib/services/notifications/notify";
import {
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ForbiddenError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

export async function getFamilyCode(user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const profile = await tx.studentProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new NotFoundError("Student profile not found");
    return { code: profile.familyLinkCode, familyLinkCode: profile.familyLinkCode };
  });
}

export async function rotateFamilyCode(user: SessionUser) {
  const newCode = generateFamilyCode();
  return scopedDb(user, async (tx) => {
    const existing = await tx.studentProfile.findUnique({ where: { userId: user.id } });
    if (!existing) throw new NotFoundError("Student profile not found");
    const profile = await tx.studentProfile.update({
      where: { userId: user.id },
      data: { familyLinkCode: newCode },
    });
    return { code: profile.familyLinkCode, familyLinkCode: profile.familyLinkCode };
  });
}

type InitiateInput =
  | { code: string }
  | { email: string }
  | { phone: string };

export async function initiateLink(input: InitiateInput, user: SessionUser) {
  const { link, path, notification } = await scopedDb(user, async (tx) => {
    let parentId: string;
    let studentId: string;
    let instantApproval = false;

    if (user.role === "parent") {
      parentId = user.id;

      if ("code" in input) {
        const profile = await tx.studentProfile.findFirst({
          where: { familyLinkCode: input.code },
        });
        if (!profile || !profile.userId) throw new NotFoundError("Invalid or expired family code");
        studentId = profile.userId;
        instantApproval = true;
      } else {
        const where =
          "email" in input
            ? { email: (input as { email: string }).email.toLowerCase(), role: "student" as const }
            : { phone: (input as { phone: string }).phone, role: "student" as const };
        const student = await tx.user.findFirst({ where });
        if (!student) throw new NotFoundError("Student not found");
        studentId = student.id;
      }
    } else {
      studentId = user.id;

      const where =
        "email" in input
          ? { email: (input as { email: string }).email.toLowerCase(), role: "parent" as const }
          : "phone" in input
            ? { phone: (input as { phone: string }).phone, role: "parent" as const }
            : null;
      if (!where) throw new BusinessRuleError("Students must specify email or phone to find parent");
      const parent = await tx.user.findFirst({ where });
      if (!parent) throw new NotFoundError("Parent not found");
      parentId = parent.id;
    }

    const existingApproved = await tx.parentStudentLink.findFirst({
      where: { studentId, status: "approved" },
    });
    if (existingApproved) throw new ConflictError("Student already has an active parent link");

    const existingPending = await tx.parentStudentLink.findFirst({
      where: { parentId, studentId, status: "pending" },
    });
    if (existingPending) throw new ConflictError("A pending link already exists");

    const link = await tx.parentStudentLink.create({
      data: {
        parentId,
        studentId,
        status: instantApproval ? "approved" : "pending",
        initiatedBy: user.role === "parent" ? "parent" : "student",
      },
    });

    const notification = instantApproval
      ? null
      : {
          recipients: [user.role === "parent" ? studentId : parentId],
          type: "parent_link_requested" as const,
          title: "New parent link request",
          body: "Someone wants to link with you. Check your link requests.",
          data: { linkId: link.id },
        };

    const path = "code" in input ? "family_code" : "email" in input ? "email" : "phone";
    return { link, path, notification };
  });

  if (notification) await notify(notification);

  return { ...link, path };
}

export async function listLinks(user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const where =
      user.role === "parent" ? { parentId: user.id } : { studentId: user.id };

    const links = await tx.parentStudentLink.findMany({ where });

    const userIds = [
      ...new Set(links.flatMap((l) => [l.parentId, l.studentId])),
    ];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return links.map((l) => ({
      ...l,
      parentId: byId.get(l.parentId) ?? l.parentId,
      studentId: byId.get(l.studentId) ?? l.studentId,
    }));
  });
}

export async function approveLink(linkId: string, user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const link = await tx.parentStudentLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundError("Link not found");
    if (link.status !== "pending") throw new BusinessRuleError("Link is not pending");

    const counterPartyId =
      link.initiatedBy === "parent" ? link.studentId : link.parentId;
    if (counterPartyId !== user.id) throw new ForbiddenError("Not authorized to approve this link");

    const existingApproved = await tx.parentStudentLink.findFirst({
      where: { studentId: link.studentId, status: "approved" },
    });
    if (existingApproved) throw new ConflictError("Student already has an active parent link");

    const updated = await tx.parentStudentLink.update({
      where: { id: linkId },
      data: { status: "approved" },
    });
    return updated;
  });
}

export async function rejectLink(linkId: string, user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const link = await tx.parentStudentLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundError("Link not found");
    if (link.status !== "pending") throw new BusinessRuleError("Link is not pending");

    const counterPartyId =
      link.initiatedBy === "parent" ? link.studentId : link.parentId;
    if (counterPartyId !== user.id) throw new ForbiddenError("Not authorized to reject this link");

    const updated = await tx.parentStudentLink.update({
      where: { id: linkId },
      data: { status: "rejected" },
    });
    return updated;
  });
}

export async function revokeLink(linkId: string, user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const link = await tx.parentStudentLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundError("Link not found");

    const isParty = link.parentId === user.id || link.studentId === user.id;
    if (!isParty) throw new ForbiddenError("Not a party to this link");

    if (link.status === "revoked") throw new BusinessRuleError("Link already revoked");

    const revokedBy = link.parentId === user.id ? "parent" : "student";
    const updated = await tx.parentStudentLink.update({
      where: { id: linkId },
      data: { status: "revoked", revokedBy },
    });
    return updated;
  });
}

export async function listChildren(user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const links = await tx.parentStudentLink.findMany({
      where: { parentId: user.id, status: "approved" },
    });

    const studentIds = links.map((l) => l.studentId);
    if (studentIds.length === 0) return [];

    const students = await tx.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, email: true, phone: true },
    });

    const profiles = await tx.studentProfile.findMany({
      where: { userId: { in: studentIds } },
      select: {
        userId: true,
        gradeLevelId: true,
        gradeLevel: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    return students.map((s) => {
      const p = profileMap.get(s.id);
      return {
        ...s,
        gradeLevelId: p?.gradeLevelId ?? null,
        gradeLevel: p?.gradeLevel ?? null,
      };
    });
  });
}
