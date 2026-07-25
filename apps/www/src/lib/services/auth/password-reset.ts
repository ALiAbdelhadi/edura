import bcrypt from "bcryptjs";
import { platformDb } from "@/lib/db/scope";
import { ExpiredError, NotFoundError } from "@/lib/errors/classes";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";
import { sendMail } from "@/lib/mail/send";
import { normalizeMailLocale, passwordResetEmail } from "@/lib/mail/templates";
import { appBaseUrl } from "@repo/server-core/http/app-url";

const RESET_TTL_MS = 60 * 60 * 1000;

export async function requestPasswordReset(
  email: string,
  locale?: string | null,
): Promise<void> {
  const normalized = email.toLowerCase().trim();

  const result = await platformDb(async (tx) => {
    const user = await tx.user.findFirst({
      where: { email: normalized, status: "active" },
    });
    if (!user) return null;

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

  const mailLocale = normalizeMailLocale(locale);
  // The reset page lives under the [locale] segment, so the link must carry it
  // — otherwise an Arabic user lands on the English form.
  const link = `${appBaseUrl()}/${mailLocale}/reset-password?token=${result.token}`;
  const { subject, html, text } = passwordResetEmail({ link, locale: mailLocale });

  // sendMail never throws: a delivery failure must not turn the deliberately
  // generic "if an account exists…" response into a 500, which would tell an
  // attacker the address IS registered. Failures surface in the server log.
  const outcome = await sendMail({ to: result.email, subject, html, text });
  if (!outcome.sent) {
    console.error(
      `[password-reset] reset email was not delivered${outcome.error ? `: ${outcome.error}` : ""}`,
    );
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await platformDb(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) throw new NotFoundError("Invalid reset token");
    if (row.usedAt) throw new ExpiredError("Reset token already used");
    if (row.expiresAt.getTime() < Date.now()) throw new ExpiredError("Reset token expired");

    // L1: bump the session epoch in the SAME tx as the new hash. Every JWT
    // issued before this reset recorded the old value and is rejected by the
    // NextAuth jwt callback from here on — so a reset after a compromise
    // immediately logs out the attacker's existing session, while a fresh
    // login (which reads the new value) works.
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
