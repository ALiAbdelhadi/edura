import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectSubjectRequest } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reviewNote: z.string().trim().max(1000).optional() });

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await rejectSubjectRequest(id, user.id, body.reviewNote));
});
