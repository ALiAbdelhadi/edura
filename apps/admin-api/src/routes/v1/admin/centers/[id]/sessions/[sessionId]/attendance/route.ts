import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  adminGetSessionAttendance,
  adminBulkAttendance,
} from "@repo/server-core/backoffice/admin/center-operations";

const putSchema = z
  .object({
    entries: z
      .array(
        z.object({
          studentId: z.uuid(),
          status: z.enum(["present", "absent", "late", "excused", "removed", "counter_only"]),
          notes: z.string().trim().max(500).optional(),
        }),
      )
      .min(1),
  })
  .strict();

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id, sessionId } = await ctx.params;
  return ok(await adminGetSessionAttendance(user, id, sessionId));
});

export const PUT = withRole("super_admin", async (user, req, ctx) => {
  const { id, sessionId } = await ctx.params;
  const { entries } = await parseJson(req, putSchema);
  return ok(await adminBulkAttendance(user, id, sessionId, entries));
});
