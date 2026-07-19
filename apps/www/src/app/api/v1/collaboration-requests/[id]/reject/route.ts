import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectCollaborationRequest } from "@/lib/services/collaboration/collaboration";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("teacher", "center_admin");
  const { id } = await ctx.params;
  const len = req.headers.get("content-length");
  const body = !len || len === "0" ? {} : await parseJson(req, bodySchema);
  return ok(await rejectCollaborationRequest(id, (body as { reason?: string }).reason, user));
});
