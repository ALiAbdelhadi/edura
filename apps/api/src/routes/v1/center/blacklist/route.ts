import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { ForbiddenError } from "@repo/server-core/errors/classes";
import { listCenterBlacklist, centerBlacklistStudent } from "@repo/server-core/services/blacklist/blacklist";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  if (!user.centerId) throw new ForbiddenError("No center scope");
  return ok(await listCenterBlacklist(user.centerId));
});

const bodySchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  if (!user.centerId) throw new ForbiddenError("No center scope");
  const { studentId, reason } = await parseJson(req, bodySchema);
  return ok(await centerBlacklistStudent(studentId, reason, user), { status: 201 });
});
