import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { rejectSubjectRequest } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reviewNote: z.string().trim().max(1000).optional() });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await rejectSubjectRequest(id, user, body.reviewNote));
});
