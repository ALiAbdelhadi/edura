import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { confirmGuardianEmail } from "@repo/server-core/services/invites/guardian-verification";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(1).max(512) }).strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token } = await parseJson(req, bodySchema);
    return ok(await confirmGuardianEmail(token));
  }),
  10,
  60,
);
