import bcrypt from "bcryptjs";
import type { SessionUser } from "../../auth/types";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ConflictError } from "../../errors/classes";

const CLAIM_ROLES = ["student", "assistant", "center_staff"] as const;

export function claimCredentials(
  session: SessionUser,
  input: { email?: string; password: string },
): Promise<string> {
  const { email, password } = input;
  return platformDb(
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
          status: "active",
        },
      });
      return nextEmail;
    },
    { actorId: session.id },
  );
}
