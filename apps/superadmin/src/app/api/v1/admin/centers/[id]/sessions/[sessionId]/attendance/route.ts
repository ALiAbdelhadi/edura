import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  adminGetSessionAttendance,
  adminBulkAttendance,
} from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

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

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  return ok(await adminGetSessionAttendance(user, id, sessionId));
});

export const PUT = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  const { entries } = await parseJson(req, putSchema);
  return ok(await adminBulkAttendance(user, id, sessionId, entries));
});
