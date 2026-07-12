import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { claimTempStudent } from "@/lib/services/tempStudents/tempStudents";

export const dynamic = "force-dynamic";

// PRD §4.8 / §5.4 step 8 — an already-registered student claims a temp profile's
// history by invite code (records re-pointed to the caller).
const bodySchema = z.object({ inviteCode: z.string().trim().min(1).max(20) });

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const { inviteCode } = await parseJson(req, bodySchema);
  return ok(await claimTempStudent(inviteCode, user));
});
