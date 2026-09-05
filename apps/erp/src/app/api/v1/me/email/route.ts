import bcrypt from "bcryptjs";
import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireSession } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError, ValidationError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { emailSchema } from "@/lib/validation/common";
import { requestEmailChange } from "@repo/server-core/services/auth/email-change";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: emailSchema,
    currentPassword: z.string().min(1).optional(),
  })
  .strict();

/**
 * SECURITY_AUDIT.md M-06. This used to switch `users.email` on the spot. Now it
 * only re-proves the password and files a REQUEST; the switch happens in
 * POST /api/v1/me/email/confirm with the token mailed to the NEW address, and
 * the OLD address is told. Response shape: `{ email: <current>, pending: true }`.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { email, currentPassword } = await parseJson(req, bodySchema);

    const user = await platformDb((tx) =>
      tx.user.findUnique({
        where: { id: session.id },
        select: { email: true, passwordHash: true, locale: true },
      }),
    );
    if (!user) throw new NotFoundError("User not found");

    if (user.email && user.email.toLowerCase() === email) {
      return ok({ email: user.email, pending: false, changed: false });
    }
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new ValidationError("Current password is required to change the email");
      }
      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) throw new ValidationError("Current password is incorrect");
    }

    const { newEmail } = await requestEmailChange(session.id, email, { locale: user.locale });
    return ok({ email: user.email, pending: true, pendingEmail: newEmail, changed: false });
  }),
  10,
  10,
);
