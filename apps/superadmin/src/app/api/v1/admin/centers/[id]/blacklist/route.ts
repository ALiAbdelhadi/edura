import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  adminListCenterBlacklist,
  adminAddCenterBlacklist,
} from "@/lib/services/admin/center-operations";

// Goes through the H-04 cascade journal, so lifting restores exactly the
// enrollments the block withdrew.
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ studentId: z.uuid(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await adminListCenterBlacklist(user, id));
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { studentId, reason } = await parseJson(req, bodySchema);
  return ok(await adminAddCenterBlacklist(user, id, studentId, reason), { status: 201 });
});
