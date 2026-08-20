import bcrypt from "bcryptjs";
import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireSession } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { emailSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: emailSchema,
    /** Required whenever the account HAS a password — see below. */
    currentPassword: z.string().min(1).optional(),
  })
  .strict();

/**
 * Correct your own login email.
 *
 * WHY THIS EXISTS: an email typed at registration — or typed FOR a student by a
 * receptionist at a walk-in counter — was write-once. `PATCH /me` accepts name,
 * phone and locale and deliberately never accepted `email`, so the only remedy
 * for a typo was asking platform staff to edit the row. On a product whose
 * students are children and whose data is frequently entered by someone else,
 * that is the single most likely field to be wrong and the one nobody could fix.
 *
 * It is a route of its own rather than another key on `PATCH /me` because the
 * conditions below are not profile-editing conditions:
 *
 *   * CURRENT PASSWORD. The login email is the account's recovery address:
 *     whoever controls it can request a reset. A borrowed unlocked phone must
 *     not be enough to redirect that, so a credentialed account re-proves the
 *     password here — the same 400-not-401 treatment as `me/password`, since a
 *     mistyped password is a form error, not a dead session. An account that has
 *     NO password yet (an unclaimed walk-in) is exempt: there is nothing to
 *     prove and refusing would lock the very people this route is for out of
 *     their own correction.
 *   * THE GUARDIAN ADDRESS STAYS A DIFFERENT ADULT'S. `setGuardianContact`
 *     already refuses a guardian email equal to the student's own login email.
 *     Without the mirror image of that rule here, a minor could satisfy the
 *     child-safety gate with an address they own by editing the OTHER side of
 *     the comparison. Both doors now hold the same fact.
 *   * THE NEW ADDRESS IS UNPROVEN. `emailVerified` drops to false, always. The
 *     flag means "we have seen mail reach this inbox", and it has not.
 *
 * The session survives on purpose: nothing about the credential changed, and
 * signing someone out for fixing a typo would teach them not to fix typos.
 * Rate-limited like the other credential doors.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { email, currentPassword } = await parseJson(req, bodySchema);

    const result = await platformDb(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: session.id },
          select: { email: true, passwordHash: true, role: true },
        });
        if (!user) throw new NotFoundError("User not found");

        if (user.email && user.email.toLowerCase() === email) {
          return { email: user.email, changed: false };
        }

        if (user.passwordHash) {
          if (!currentPassword) {
            throw new ValidationError("Current password is required to change the email");
          }
          const matches = await bcrypt.compare(currentPassword, user.passwordHash);
          if (!matches) throw new ValidationError("Current password is incorrect");
        }

        if (user.role === "student") {
          const profile = await tx.studentProfile.findFirst({
            where: { userId: session.id },
            select: { guardianEmail: true },
          });
          if (profile?.guardianEmail && profile.guardianEmail.toLowerCase() === email) {
            throw new BusinessRuleError(
              "Your login email must be different from your guardian's email",
            );
          }
        }

        // Soft-deleted rows are hidden by the client extension, so this check
        // cannot see an address parked on a deleted account. The UNIQUE index
        // still can, and `withErrors` maps that P2002 to a 409 — this pre-check
        // exists to give the ordinary case a sentence a person can act on.
        const taken = await tx.user.findFirst({
          where: { email, id: { not: session.id } },
          select: { id: true },
        });
        if (taken) throw new ConflictError("This email is already in use");

        const updated = await tx.user.update({
          where: { id: session.id },
          data: { email, emailVerified: false },
          select: { email: true },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.id,
            action: "user.email_changed",
            targetType: "user",
            targetId: session.id,
            beforeState: { email: user.email },
            afterState: { email: updated.email },
          },
        });

        return { email: updated.email, changed: true };
      },
      { actorId: session.id },
    );

    return ok({ ...result, emailVerified: false });
  }),
  10,
  10,
);
