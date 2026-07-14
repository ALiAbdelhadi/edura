import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { BusinessRuleError, NotFoundError, ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ userId: string }> };

export const DELETE = withErrors(async (_req, ctx) => {
  const adminUser = await requireRole("center_admin");
  const { userId } = await ctx.params;

  if (adminUser.id === userId) {
    throw new ForbiddenError("You cannot remove yourself as admin");
  }

  const result = await scopedDb(adminUser, async (tx) => {
    const profile = await tx.centerAdminProfile.findFirst({
      where: { userId, centerId: adminUser.centerId as string },
    });
    if (!profile) throw new NotFoundError("Admin not found in this center");

    const adminCount = await tx.centerAdminProfile.count({
      where: { centerId: adminUser.centerId as string },
    });
    if (adminCount <= 1) {
      throw new BusinessRuleError("Cannot remove the last admin of a center");
    }

    await tx.centerAdminProfile.deleteMany({
      where: { userId, centerId: adminUser.centerId as string },
    });
    return { removed: true };
  });

  return ok(result);
});
