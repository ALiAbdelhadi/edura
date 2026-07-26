import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectDeletionRequest } from "@repo/server-core/services/center/deletion-requests";

export const dynamic = "force-dynamic";

const rejectSchema = z.object({
  note: z.string().optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { note } = await parseJson(req, rejectSchema);
  const { id } = await ctx.params;
  return ok(await rejectDeletionRequest(user, id as string, note));
});
