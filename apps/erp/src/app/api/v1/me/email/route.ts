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
    currentPassword: z.string().min(1).optional(),
  })
  .strict();

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
