import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { lookupTeacher } from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("center_admin");
    const body = await parseJson(req, bodySchema);
    return ok(await lookupTeacher(user, body));
  }),
  20,
  20,
);
