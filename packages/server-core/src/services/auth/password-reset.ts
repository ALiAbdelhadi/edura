import bcrypt from "bcryptjs";
import { normalizeLocale, send } from "@repo/notifications";
import { platformDb } from "../../db/scope";
import { ExpiredError, NotFoundError, ValidationError } from "../../errors/classes";
import { appBaseUrl } from "../../http/app-url";
import { generateOpaqueToken, hashToken } from "../../utils/random";
import { canSignIn, type LoginApp } from "../../auth/login-policy";

const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_TTL_HOURS = RESET_TTL_MS / (60 * 60 * 1000);

/**
 * `opts.app` names the door the request came through. The two apps share one
 * `users` table, so without it the ERP's public forgot-password form issued
 * reset links for `super_admin` / `accountant` accounts and the ERP reset
 * endpoint set their password — a back-office reset door on the public app
 * (SECURITY_AUDIT.md M-11). A role that cannot sign in to the requesting app
 * gets the same silence an unknown address gets.
 */
export async function requestPasswordReset(
  email: string,
  locale?: string | null,
  opts: { linkBaseUrl?: string; app?: LoginApp } = {},
): Promise<void> {
  const normalized = email.toLowerCase().trim();

  const result = await platformDb(async (tx) => {
    const user = await tx.user.findFirst({
      where: { email: normalized, status: "active" },
    });
    if (!user) return null;
    if (opts.app && !canSignIn(opts.app, user.role)) {
      console.warn(
        `[password-reset] refused: user ${user.id} (${user.role}) cannot sign in to ${opts.app}; no token issued`,
      );
      return null;
    }

    const token = generateOpaqueToken();
    const tokenHash = hashToken(token);
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    return { email: user.email, token };
  });

  if (!result || !result.email) return;

  const mailLocale = normalizeLocale(locale);
  const base = (opts.linkBaseUrl ?? appBaseUrl()).replace(/\/+$/, "");
  const link = `${base}/${mailLocale}/reset-password?token=${result.token}`;

  const outcome = await send(
    "password_reset",
    { email: result.email, locale: mailLocale },
    { link, expiryHours: RESET_TTL_HOURS },
  );
  if (!outcome.delivered) {
    const why = outcome.results.map((r) => `${r.channel}=${r.error ?? r.status}`).join(", ");
    console.error(`[password-reset] reset email was not delivered: ${why}`);
  }
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await platformDb(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      if (!user?.passwordHash) {
        throw new NotFoundError("This account has no password to change");
      }
      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) throw new ValidationError("Current password is incorrect");

      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          tokenVersion: { increment: 1 },
        },
      });
    },
    { actorId: userId },
  );
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await platformDb(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) throw new NotFoundError("Invalid reset token");
    if (row.usedAt) throw new ExpiredError("Reset token already used");
    if (row.expiresAt.getTime() < Date.now()) throw new ExpiredError("Reset token expired");
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
  });
}
