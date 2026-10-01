import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { parseJson } from "@repo/server-core/validation/zod";
import { confirmGuardianEmail } from "@repo/server-core/services/invites/guardian-verification";

const bodySchema = z.object({ token: z.string().min(1).max(512) }).strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token } = await parseJson(req, bodySchema);
    return ok(await confirmGuardianEmail(token));
  }),
  10,
  60,
);
