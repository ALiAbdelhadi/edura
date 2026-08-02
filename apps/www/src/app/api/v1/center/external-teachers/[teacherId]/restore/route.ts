import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterActor } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { restoreExternalTeacher } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ teacherId: string }> };

/** Undo a soft removal. The teacher lands back on the same records. */
export const POST = withErrors(async (_req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = await (ctx as Ctx).params;
  return ok(await restoreExternalTeacher(actor, teacherId));
});
