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

/**
 * Change your own password while signed in.
 *
 * The account is always the SESSION's — there is no userId in the body, so this
 * route cannot be pointed at anyone else. Changing another account's password
 * stays where it belongs: the admin surface sends a reset link and never sees
 * or sets a password (see admin-users).
 *
 * Rate-limited like the other credential doors: a live session still should not
 * be a place to brute-force the current password.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { currentPassword, newPassword } = await parseJson(req, bodySchema);

    await changeOwnPassword(session.id, currentPassword, newPassword);

    // The token_version bump inside the service already revoked every session,
    // including this one — say so, so the client can send the user to sign in
    // again rather than leaving them on a screen whose next request 401s.
    return ok({ sessionsRevoked: true });
  }),
  10,
  10,
);
