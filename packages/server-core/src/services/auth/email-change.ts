import { normalizeLocale, send } from "@repo/notifications";
import { platformDb } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ExpiredError,
  NotFoundError,
} from "../../errors/classes";
import { appBaseUrl } from "../../http/app-url";
import { generateOpaqueToken, hashToken } from "../../utils/random";

const CHANGE_TTL_MS = 60 * 60 * 1000;
const CHANGE_TTL_HOURS = CHANGE_TTL_MS / (60 * 60 * 1000);

/** "a***@example.com" — enough for the old inbox to recognise a request it made. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * SECURITY_AUDIT.md M-06. The login email used to switch the moment a password
 * was re-typed: a stolen session (or a walk-in account with no password at all)
 * could move the account to an attacker's inbox, and the next password reset
 * went there. Now the change is a REQUEST: the new address gets a single-use,
 * hashed, 1-hour token; the old address gets a notice; nothing on `users`
 * changes until `confirmEmailChange` runs with that token.
 *
 * Returns the raw token ONLY so tests can walk the flow; the route never
 * exposes it.
 */
export async function requestEmailChange(
  userId: string,
  newEmailRaw: string,
  opts: { locale?: string | null; linkBaseUrl?: string } = {},
): Promise<{ token: string; oldEmail: string | null; newEmail: string }> {
  const newEmail = newEmailRaw.toLowerCase().trim();

  const { token, oldEmail, locale } = await platformDb(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, role: true, locale: true },
      });
      if (!user) throw new NotFoundError("User not found");
      if (user.email && user.email.toLowerCase() === newEmail) {
        throw new BusinessRuleError("This is already your login email");
      }
      if (user.role === "student") {
        const profile = await tx.studentProfile.findFirst({
          where: { userId },
          select: { guardianEmail: true },
        });
        if (profile?.guardianEmail && profile.guardianEmail.toLowerCase() === newEmail) {
          throw new BusinessRuleError(
            "Your login email must be different from your guardian's email",
          );
        }
      }
      const taken = await tx.user.findFirst({
        where: { email: newEmail, id: { not: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictError("This email is already in use");

      // One live request per user: a new request supersedes the old one.
      await tx.emailChangeRequest.deleteMany({ where: { userId, confirmedAt: null } });

      const token = generateOpaqueToken();
      await tx.emailChangeRequest.create({
        data: {
          userId,
          newEmail,
          oldEmail: user.email,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + CHANGE_TTL_MS),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "user.email_change_requested",
          targetType: "user",
          targetId: userId,
          beforeState: { email: user.email },
          afterState: { newEmailMasked: maskEmail(newEmail) },
        },
      });
      return { token, oldEmail: user.email, locale: opts.locale ?? user.locale };
    },
    { actorId: userId },
  );

  const mailLocale = normalizeLocale(locale);
  const base = (opts.linkBaseUrl ?? appBaseUrl()).replace(/\/+$/, "");
  const link = `${base}/${mailLocale}/confirm-email?token=${token}`;

  const confirm = await send(
    "email_change_confirm",
    { email: newEmail, locale: mailLocale, userId },
    { link, expiryHours: CHANGE_TTL_HOURS, newEmail },
  );
  if (!confirm.delivered) {
    console.error(
      `[email-change] confirmation mail was not delivered: ${confirm.results.map((r) => `${r.channel}=${r.error ?? r.status}`).join(", ")}`,
    );
  }
  if (oldEmail && oldEmail.toLowerCase() !== newEmail) {
    void send(
      "email_change_notice",
      { email: oldEmail, locale: mailLocale, userId },
      { newEmailMasked: maskEmail(newEmail) },
    ).catch(() => undefined);
  }

  return { token, oldEmail, newEmail };
}

/**
 * The new address proved it holds the token. The switch bumps `tokenVersion`,
 * which fires `users_revoke_sessions`: every session — including whoever
 * requested the change — signs out and comes back through the login door with
 * the new address. That is the point, not a side effect.
 */
export async function confirmEmailChange(token: string): Promise<{ email: string }> {
  const tokenHash = hashToken(token);
  return platformDb(async (tx) => {
    const row = await tx.emailChangeRequest.findUnique({ where: { tokenHash } });
    if (!row) throw new NotFoundError("Invalid confirmation link");
    if (row.confirmedAt) throw new ExpiredError("This confirmation link was already used");
    if (row.expiresAt.getTime() < Date.now()) throw new ExpiredError("This confirmation link has expired");

    const taken = await tx.user.findFirst({
      where: { email: row.newEmail, id: { not: row.userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictError("This email is already in use");

    // Single use, claimed conditionally so two clicks resolve to one switch.
    const claimed = await tx.emailChangeRequest.updateMany({
      where: { id: row.id, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    if (claimed.count === 0) throw new ExpiredError("This confirmation link was already used");

    const updated = await tx.user.update({
      where: { id: row.userId },
      data: { email: row.newEmail, emailVerified: true, tokenVersion: { increment: 1 } },
      select: { email: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: row.userId,
        action: "user.email_changed",
        targetType: "user",
        targetId: row.userId,
        beforeState: { email: row.oldEmail },
        afterState: { email: updated.email, confirmedFromNewAddress: true },
      },
    });
    return { email: updated.email as string };
  });
}
