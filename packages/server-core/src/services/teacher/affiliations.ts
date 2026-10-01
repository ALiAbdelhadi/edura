import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";

export async function listMyAffiliations(user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const now = new Date();
    await tx.centerTeacherAffiliation.updateMany({
      where: { teacherId: user.id, status: "pending", expiresAt: { lte: now } },
      data: { status: "expired" },
    });

    const affiliations = await tx.centerTeacherAffiliation.findMany({
      where: { teacherId: user.id },
    });
    const centerIds = affiliations.map((a) => a.centerId);
    const centers = await tx.center.findMany({
      where: { id: { in: centerIds } },
      select: { id: true, name: true, shortId: true },
    });
    const centerMap = new Map(centers.map((c) => [c.id, c]));

    return affiliations.map((a) => ({
      ...a,
      center: centerMap.get(a.centerId),
    }));
  });
}
