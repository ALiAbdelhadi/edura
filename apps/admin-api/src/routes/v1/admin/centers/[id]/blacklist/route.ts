import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import {
  adminAddCenterBlacklist,
  adminListCenterBlacklist,
} from "@repo/server-core/backoffice/admin/center-operations";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({ studentId: z.uuid(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await adminListCenterBlacklist(user, id));
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { studentId, reason } = await parseJson(req, bodySchema);
  return ok(await adminAddCenterBlacklist(user, id, studentId, reason), { status: 201 });
});
