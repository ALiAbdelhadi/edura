import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { claimTempStudent } from "@/lib/services/temp-students/temp-students";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ inviteCode: z.string().trim().min(1).max(20) });

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const { inviteCode } = await parseJson(req, bodySchema);
  return ok(await claimTempStudent(inviteCode, user));
});
