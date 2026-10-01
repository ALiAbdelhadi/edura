import bcrypt from "bcryptjs";
import { platformDb } from "../../db/scope";
import { ConflictError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { writeAdminAudit } from "../../audit/admin-audit";

export type AccountantInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
};

export function createAccountant(actor: SessionUser, input: AccountantInput) {
  return platformDb(
    async (tx) => {
      const existing = await tx.user.findFirst({
        where: { OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
        select: { id: true },
      });
      if (existing) throw new ConflictError("An account with this email or phone already exists");

      const passwordHash = await bcrypt.hash(input.password, 10);
      const accountant = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          role: "accountant",
          status: "active",
          emailVerified: true,
        },
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      });

      await writeAdminAudit(tx, actor, {
        action: "accountant.created",
        targetType: "user",
        targetId: accountant.id,
        before: null,
        after: {
          name: accountant.name,
          email: accountant.email,
          phone: input.phone ?? null,
          role: accountant.role,
          status: accountant.status,
          passwordSet: true,
          emailVerified: true,
        },
      });

      return accountant;
    },
    { actorId: actor.id },
  );
}
