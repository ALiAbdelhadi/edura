import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  const users = await scopedDb(user, async (tx) => {
    const profiles = await tx.centerAdminProfile.findMany({
      where: { centerId: user.centerId as string },
      select: { userId: true },
    });
    const userIds = profiles.map((p) => p.userId);
    return tx.user.findMany({
      where: { id: { in: userIds }, status: { not: "deleted" } },
      select: { id: true, name: true, email: true, status: true },
    });
  });
  return ok(users);
});
