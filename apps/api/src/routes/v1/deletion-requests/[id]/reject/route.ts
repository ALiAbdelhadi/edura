import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { rejectDeletionRequest } from "@repo/server-core/services/center/deletion-requests";

const rejectSchema = z.object({
  note: z.string().optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { note } = await parseJson(req, rejectSchema);
  const { id } = await ctx.params;
  return ok(await rejectDeletionRequest(user, id as string, note));
});
