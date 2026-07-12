import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import type { DeletionStatus } from "@repo/database";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  if (!user.centerId) throw new ForbiddenError("Admin has no center scope");

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";

  const requests = await scopedDb(user, async (tx) => {
    const rows = await tx.deletionRequest.findMany({
      where: { status: status as DeletionStatus, centerId: user.centerId },
      orderBy: { requestedAt: "desc" },
    });

    // No Prisma relation from DeletionRequest -> User; hydrate the requester.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return rows.map((r) => ({ ...r, userId: byId.get(r.userId) ?? r.userId }));
  });

  return ok(requests);
});
