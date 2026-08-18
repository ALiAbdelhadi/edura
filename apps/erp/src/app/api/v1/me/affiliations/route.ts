import { withErrors } from "@/lib/errors/http";
import { delegated } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = delegated(async (_req, _ctx, { acting: user }) => {

  const result = await scopedDb(user, async (tx) => {
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

  return ok(result);
});
