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
    email: z.string().trim().toLowerCase().email(),
    password: passwordSchema,
  })
  .strict();

/**
 * Step 7: first-time credentials for a walk-in student who signed in via the
 * one-time claim token. STRICTLY set-once — only allowed while passwordHash is
 * NULL; changing an existing password stays with the normal password flows.
 */
export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { email, password } = await parseJson(req, bodySchema);

    await platformDb(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: session.id },
          select: { passwordHash: true, role: true },
        });
        if (!user || user.role !== "student") {
          throw new BusinessRuleError("Only student accounts can claim credentials here");
        }
        if (user.passwordHash !== null) {
          throw new BusinessRuleError("This account already has credentials");
        }
        const emailTaken = await tx.user.findFirst({
          where: { email, id: { not: session.id } },
          select: { id: true },
        });
        if (emailTaken) throw new ConflictError("This email is already in use");

        await tx.user.update({
          where: { id: session.id },
          data: {
            email,
            passwordHash: await bcrypt.hash(password, 10),
            emailVerified: false,
          },
        });
      },
      { actorId: session.id },
    );

    return ok({ email, message: "Credentials set — you can now sign in with them." });
  }),
  10,
  10,
);
