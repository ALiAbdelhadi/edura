import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { linkGradeTrack } from "@repo/server-core/services/catalog/catalog-admin";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const createSchema = z.object({
  gradeLevelId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await linkGradeTrack(body.gradeLevelId, body.trackId, actor), { status: 201 });
});
