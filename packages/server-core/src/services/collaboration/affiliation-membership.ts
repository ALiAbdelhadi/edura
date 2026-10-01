import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import {
  BusinessRuleError,
  ExpiredError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";

export function leaveAffiliation(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findUnique({ where: { id } });
    if (!affiliation) throw new NotFoundError("Affiliation not found");
    if (affiliation.teacherId !== user.id) throw new ForbiddenError();

    const activeCourses = await tx.course.count({
      where: {
        centerId: affiliation.centerId,
        teacherId: user.id,
        status: "active",
      },
    });
    if (activeCourses > 0) {
      throw new BusinessRuleError("Cannot leave center while you have active courses");
    }

    await tx.centerTeacherAffiliation.update({
      where: { id },
      data: { status: "removed", removedAt: new Date(), respondedAt: new Date() },
    });

    return { left: true };
  });
}

export function acceptAffiliation(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findUnique({ where: { id } });
    if (!affiliation) throw new NotFoundError("Affiliation not found");
    if (affiliation.teacherId !== user.id) throw new ForbiddenError();
    if (affiliation.status !== "pending") {
      throw new BusinessRuleError(`Affiliation is already ${affiliation.status}`);
    }
    if (affiliation.expiresAt < new Date()) {
      await tx.centerTeacherAffiliation.update({
        where: { id },
        data: { status: "expired" },
      });
      throw new ExpiredError("Invitation has expired");
    }

    return tx.centerTeacherAffiliation.update({
      where: { id },
      data: { status: "active", respondedAt: new Date() },
    });
  });
}

export function declineAffiliation(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findUnique({ where: { id } });
    if (!affiliation) throw new NotFoundError("Affiliation not found");
    if (affiliation.teacherId !== user.id) throw new ForbiddenError();
    if (affiliation.status !== "pending") {
      throw new BusinessRuleError(`Affiliation is already ${affiliation.status}`);
    }

    await tx.centerTeacherAffiliation.update({
      where: { id },
      data: { status: "declined", respondedAt: new Date() },
    });
  });
}
