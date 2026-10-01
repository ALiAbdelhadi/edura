import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { acceptInvite } from "@repo/server-core/services/auth/invite-accept";
import { loadAcceptedInviteUser } from "@repo/server-core/services/auth/invite-accepted";
import { passwordSchema } from "@repo/server-core/validation/common";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token, password } = await parseJson(req, bodySchema);
    const { userId } = await acceptInvite(token, password);
    return ok(await loadAcceptedInviteUser(userId));
  }),
  20,
  30,
);
