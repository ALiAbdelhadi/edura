import { z } from "zod";
import bcrypt from "bcryptjs";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireSession } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError, ConflictError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { passwordSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    // Optional: an assistant/staff member was INVITED at an address, so their
    // email is already fixed and the client sends password only. A walk-in
    // student has no email yet and must choose one.
    email: z.string().trim().toLowerCase().email().optional(),
    password: passwordSchema,
  })
  .strict();

/**
 * Step 7: first-time credentials for an account claimed via the one-time invite
 * token — a walk-in student, an invited assistant, or an invited staff member.
 *
 * STRICTLY set-once — only allowed while passwordHash is NULL; changing an
 * existing password stays with the normal password flows. That single condition
 * is what makes this safe to expose to three roles instead of one: it can only
 * ever fill an empty credential, never replace a live one.
 */
const CLAIM_ROLES = ["student", "assistant", "center_staff"] as const;
export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { email, password } = await parseJson(req, bodySchema);

    const finalEmail = await platformDb(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: session.id },
          select: { passwordHash: true, role: true, email: true },
        });
        if (!user || !(CLAIM_ROLES as readonly string[]).includes(user.role)) {
          throw new BusinessRuleError("This account cannot claim credentials here");
        }
        if (user.passwordHash !== null) {
          throw new BusinessRuleError("This account already has credentials");
        }

        // An invitee keeps the address they were invited at; only an account
        // with no email at all (a phone-only walk-in) may set one.
        const nextEmail = user.email ?? email;
        if (!nextEmail) {
          throw new BusinessRuleError("An email address is required");
        }
        if (!user.email) {
          const emailTaken = await tx.user.findFirst({
            where: { email: nextEmail, id: { not: session.id } },
            select: { id: true },
          });
          if (emailTaken) throw new ConflictError("This email is already in use");
        }

        await tx.user.update({
          where: { id: session.id },
          data: {
            email: nextEmail,
            passwordHash: await bcrypt.hash(password, 10),
            emailVerified: false,
            // A claimed account is a live account.
            status: "active",
          },
        });
        return nextEmail;
      },
      { actorId: session.id },
    );

    return ok({
      email: finalEmail,
      message: "Credentials set — you can now sign in with them.",
    });
  }),
  10,
  10,
);
