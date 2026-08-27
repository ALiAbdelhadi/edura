import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  buildStudentCard,
  reissueStudentCard,
  revokeStudentCard,
} from "@repo/server-core/services/students/student-card";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await buildStudentCard(id, actor));
});

const bodySchema = z.object({
  action: z.enum(["reissue", "revoke"]),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withErrors(async (req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, bodySchema);
  return ok(
    action === "reissue"
      ? await reissueStudentCard(id, actor, reason)
      : await revokeStudentCard(id, actor, reason),
  );
});
