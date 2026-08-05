import bcrypt from "bcryptjs";
import { normalizeLocale, send } from "@repo/notifications";
import { platformDb } from "../../db/scope";
import { ExpiredError, NotFoundError, ValidationError } from "../../errors/classes";
import { appBaseUrl } from "../../http/app-url";
import { generateOpaqueToken, hashToken } from "../../utils/random";

/**
 * Password reset — moved to the shared kernel (same precedent as blacklist.ts
 * and collaboration.ts) so apps/superadmin can trigger a reset for a locked-out
 * staff account without a second implementation. apps/www re-exports this file,
 * so every www import path and behaviour is unchanged.
 *
 * `linkBaseUrl` is the ONE addition. It defaults to `appBaseUrl()` — the www
 * origin, exactly as before — because the reset PAGE lives in apps/www and is
 * role-agnostic (it consumes a token; it never asks who you are). A back-office
 * account therefore resets on the public domain and then signs in to the back
 * office. Passing the parameter is how a caller opts out of that default; it
 * exists so the link can never silently follow a per-process env difference
 * (in the superadmin process NEXTAUTH_URL/APP_BASE_URL do not both resolve to
 * the www origin).
 */
const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_TTL_HOURS = RESET_TTL_MS / (60 * 60 * 1000);

export async function requestPasswordReset(
  email: string,
  locale?: string | null,
  opts: { linkBaseUrl?: string } = {},
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

  const mailLocale = normalizeLocale(locale);
  const base = (opts.linkBaseUrl ?? appBaseUrl()).replace(/\/+$/, "");
  const link = `${base}/${mailLocale}/reset-password?token=${result.token}`;

  // The TTL is passed, not restated: the email can no longer claim a validity
  // window that disagrees with RESET_TTL_MS above.
  const outcome = await send(
    "password_reset",
    { email: result.email, locale: mailLocale },
    { link, expiryHours: RESET_TTL_HOURS },
  );
  if (!outcome.delivered) {
    const why = outcome.results.map((r) => `${r.channel}=${r.error ?? r.status}`).join(", ");
    // The LINK is never logged — this line is read in shared log tooling.
    console.error(`[password-reset] reset email was not delivered: ${why}`);
  }
}

/**
 * Signed-in password change — the ONE self-service path, and deliberately NOT
 * better-auth's `changePassword`.
 *
 * better-auth ships its own change/reset writers, and none of them touch
 * `users.token_version` — the column whose bump fires the
 * `users_revoke_sessions` trigger. Wiring one would give the app a second way
 * to set a password that leaves every pre-existing session alive, silently
 * undoing L1. Exactly the reasoning that keeps `sendResetPassword` unset (see
 * the operational-layer notes) and the same principle as ONE SUSPENSION
 * MECHANISM: one column, one writer.
 *
 * So this mirrors `resetPassword` above: hash + bump in the SAME statement, so
 * a change cannot commit without revoking the old sessions. The caller's own
 * session dies with the rest — that is the point of a password change, and the
 * UI signs them back in.
 *
 * `currentPassword` is verified against the stored hash first, so a hijacked
 * live session cannot lock the real owner out without knowing their password.
 * An account with NO password (an unclaimed invite) is refused here: setting a
 * first password is `me/credentials`, which is strictly set-once.
 */
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
      // 400, NOT 401. A mistyped current password is a form error; answering
      // 401 would read to the client as a dead session and sign the user out
      // over a typo.
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
    // L1: the token_version bump revokes every pre-existing session. Since the
    // better-auth migration a DB trigger turns that bump into deletion of the
    // user's auth_sessions rows, so the reset is a hard logout everywhere.
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
