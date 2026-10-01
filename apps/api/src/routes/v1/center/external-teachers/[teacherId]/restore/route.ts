import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { requireCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { restoreExternalTeacher } from "@repo/server-core/services/external-teachers/index";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

type Ctx = { params: Promise<{ teacherId: string }> };

const handlePost = withErrors(async (_req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = await (ctx as Ctx).params;
  return ok(await restoreExternalTeacher(actor, teacherId));
});

export const POST = invalidatesPublicData(handlePost);
