import bcrypt from "bcryptjs";
import { platformDb } from "../../db/scope";
import { NotFoundError, ValidationError } from "../../errors/classes";
import { requestEmailChange } from "../auth/email-change";

export async function startEmailChange(
  userId: string,
  email: string,
  currentPassword: string | undefined,
) {
  const user = await platformDb((tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true, locale: true },
    }),
  );
  if (!user) throw new NotFoundError("User not found");

  if (user.email && user.email.toLowerCase() === email) {
    return { email: user.email, pending: false as const, changed: false as const };
  }
  if (user.passwordHash) {
    if (!currentPassword) {
      throw new ValidationError("Current password is required to change the email");
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new ValidationError("Current password is incorrect");
  }

  const { newEmail } = await requestEmailChange(userId, email, { locale: user.locale });
  return { email: user.email, pending: true as const, pendingEmail: newEmail, changed: false as const };
}
