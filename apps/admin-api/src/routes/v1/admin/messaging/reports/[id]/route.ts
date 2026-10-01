import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { resolveReport } from "@repo/server-core/backoffice/admin/messaging";

const schema = z.object({
  status: z.enum(["open", "reviewing", "actioned", "dismissed"]),
  resolutionNote: z.string().max(2000).optional(),
});

export const PATCH = withRole("super_admin", async (admin, req, ctx) => {
  const { id } = await ctx.params;
  const data = await parseJson(req, schema);
  return ok(await resolveReport(admin.id, id ?? "", data));
});
