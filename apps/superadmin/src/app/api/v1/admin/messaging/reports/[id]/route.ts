import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { resolveReport } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["open", "reviewing", "actioned", "dismissed"]),
  resolutionNote: z.string().max(2000).optional(),
});

export const PATCH = withRole("super_admin", async (admin, req, ctx) => {
  const { id } = await ctx.params;
  const data = await parseJson(req, schema);
  return ok(await resolveReport(admin.id, id ?? "", data));
});
