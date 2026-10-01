import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { rejectSubjectRequest } from "@repo/server-core/services/catalog/catalog-admin";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({ reviewNote: z.string().trim().max(1000).optional() });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await rejectSubjectRequest(id, user, body.reviewNote));
});
