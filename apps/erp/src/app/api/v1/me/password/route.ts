import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { passwordSchema } from "@/lib/validation/common";
import { changeOwnPassword } from "@/lib/services/auth/password-reset";

export const dynamic = "force-dynamic";

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
