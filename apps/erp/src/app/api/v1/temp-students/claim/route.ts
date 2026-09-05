import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { claimTempStudent } from "@/lib/services/temp-students/temp-students";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ inviteCode: z.string().trim().min(1).max(20) });

// L-06 (SECURITY_AUDIT.md): the code is 40 bits, but it is also shown in the
// UI and typed by hand — a limiter costs nothing and closes the guessing door.
export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("student");
    const { inviteCode } = await parseJson(req, bodySchema);
    return ok(await claimTempStudent(inviteCode, user));
  }),
  10,
  10,
);
