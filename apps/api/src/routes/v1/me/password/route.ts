import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { passwordSchema } from "@repo/server-core/validation/common";
import { changeOwnPassword } from "@repo/server-core/services/auth/password-reset";

const bodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { currentPassword, newPassword } = await parseJson(req, bodySchema);

    await changeOwnPassword(session.id, currentPassword, newPassword);

    return ok({ sessionsRevoked: true });
  }),
  10,
  10,
);
