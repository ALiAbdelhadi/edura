import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { claimTempStudent } from "@repo/server-core/services/temp-students/temp-students";

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
