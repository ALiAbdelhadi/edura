// Teacher team management: assistants are real user accounts (role=assistant)
// created/linked by their teacher. Assistants are the primary chat contact
// point for the teacher's students and parents (see chat-policy.ts).
//
// INVITE-BASED SINCE 2026-07-25. The teacher no longer types a password for
// their assistant. The account is created as a SHELL (passwordHash NULL), an
// `assistant_invite` token is emailed, and the assistant sets their own
// password through the claim flow — so the creator never learns the
// credential. The invite link also comes back to the teacher, because an email
// that lands in spam should not strand a hire.
import { platformDb, scopedDb } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { assistantInviteEmail } from "@repo/server-core/mail/templates";
import { claimLink, issueInvite } from "@/lib/services/invites/invite-token";
import {
  deliverInviteEmail,
  inviteExpiryDays,
  type DeliveryResult,
} from "@/lib/services/invites/deliver";

export type InviteOutcome = {
  email: DeliveryResult;
  /** Copyable fallback for the creator — hand it over directly if mail fails. */
  claimLink: string;
  expiresAt: Date;
};

export async function listAssistants(teacher: SessionUser) {
  return scopedDb(teacher, async (tx) => {
    const links = await tx.teacherAssistant.findMany({
      where: { teacherId: teacher.id, removedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (!links.length) return [];
    const users = await tx.user.findMany({
      where: { id: { in: links.map((l) => l.assistantId) } },
      select: { id: true, name: true, email: true, status: true, passwordHash: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return links.map((l) => {
      const u = userMap.get(l.assistantId);
      return {
        id: l.id,
        assistantId: l.assistantId,
        title: l.title,
        createdAt: l.createdAt,
        // Surfaced so the UI can show "invite pending" and offer a re-send
        // instead of leaving a half-created account looking finished.
        pendingClaim: !!u && u.passwordHash === null,
        user: u
          ? { id: u.id, name: u.name, email: u.email, status: u.status }
          : null,
      };
    });
  });
}

/**
 * Create an assistant and email them a single-use claim link.
 *
 * No password is accepted from the teacher — see the module header. An account
 * created here is UNUSABLE until claimed (shell + NULL hash, refused by both
 * password doors), and it always leaves this function with a live invite, so it
 * can never sit in a permanently-can't-log-in state.
 */
export async function createAssistant(
  teacher: SessionUser,
  input: { name: string; email: string; title?: string; locale?: "ar" | "en" },
): Promise<{
  link: { id: string; title: string | null };
  user: { id: string; name: string; email: string | null; status: string };
  existingAccount: boolean;
  invite: InviteOutcome | null;
}> {
  const email = input.email.toLowerCase().trim();
  const locale = input.locale ?? "ar";

  const { link, user, existingAccount, needsInvite } = await scopedDb(
    teacher,
    async (tx) => {
      let assistantUser = await tx.user.findUnique({ where: { email } });

      if (assistantUser) {
        if (assistantUser.role !== "assistant") {
          throw new ConflictError(
            "This email belongs to an existing account with a different role",
          );
        }
        // `shell` is now a legitimate state: an invited assistant who has not
        // claimed yet. Only deleted/suspended accounts are refused.
        if (assistantUser.deletedAt || !["active", "shell"].includes(assistantUser.status)) {
          throw new BusinessRuleError("This assistant account is not active");
        }
        const existing = await tx.teacherAssistant.findUnique({
          where: {
            teacherId_assistantId: {
              teacherId: teacher.id,
              assistantId: assistantUser.id,
            },
          },
        });
        if (existing && !existing.removedAt) {
          throw new ConflictError("This assistant is already on your team");
        }
        if (existing) {
          // Re-activate a previously removed membership.
          const relink = await tx.teacherAssistant.update({
            where: { id: existing.id },
            data: { removedAt: null, title: input.title ?? existing.title },
          });
          return {
            link: relink,
            user: assistantUser,
            existingAccount: true,
            needsInvite: assistantUser.passwordHash === null,
          };
        }
      } else {
        assistantUser = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            role: "assistant",
            // SHELL + no hash: the account cannot be signed into until the
            // invitee claims it and chooses their own password.
            status: "shell",
            passwordHash: null,
          },
        });
      }

      const created = await tx.teacherAssistant.create({
        data: {
          teacherId: teacher.id,
          assistantId: assistantUser.id,
          title: input.title?.trim() || null,
        },
      });
      return {
        link: created,
        user: assistantUser,
        existingAccount: !!assistantUser.passwordHash,
        needsInvite: assistantUser.passwordHash === null,
      };
    },
  );

  const invite = needsInvite
    ? await sendAssistantInvite(
        { id: user.id, name: user.name, email: user.email },
        teacher,
        locale,
      )
    : null;

  return {
    link: { id: link.id, title: link.title },
    user: { id: user.id, name: user.name, email: user.email, status: user.status },
    existingAccount,
    invite,
  };
}

async function sendAssistantInvite(
  assistant: { id: string; name: string; email: string | null },
  teacher: SessionUser,
  locale: "ar" | "en",
): Promise<InviteOutcome> {
  const { token, expiresAt } = await issueInvite({
    userId: assistant.id,
    purpose: "assistant_invite",
    email: assistant.email,
    actorId: teacher.id,
  });
  const link = claimLink(token, locale);

  const email = assistant.email
    ? await deliverInviteEmail({
        to: assistant.email,
        ...assistantInviteEmail({
          locale,
          link,
          assistantName: assistant.name,
          teacherName: teacher.name ?? "",
          expiryDays: inviteExpiryDays(),
        }),
      })
    : ({ status: "no_recipient" } as DeliveryResult);

  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: teacher.id,
          action: "assistant.invited",
          targetType: "user",
          targetId: assistant.id,
          // The token is NEVER written here — only the fact that one was issued.
          afterState: { email: assistant.email, delivery: email.status },
        },
      }),
    { actorId: teacher.id },
  );

  return { email, claimLink: link, expiresAt };
}

/** Re-issue and re-send an assistant's invite. Kills the previous link. */
export async function resendAssistantInvite(
  teacher: SessionUser,
  linkId: string,
  locale: "ar" | "en" = "ar",
): Promise<InviteOutcome> {
  const assistant = await scopedDb(teacher, async (tx) => {
    const link = await tx.teacherAssistant.findFirst({
      where: { id: linkId, teacherId: teacher.id, removedAt: null },
    });
    if (!link) throw new NotFoundError("Assistant not found on your team");
    const user = await tx.user.findUnique({
      where: { id: link.assistantId },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    if (!user) throw new NotFoundError("Assistant account not found");
    // A claimed account has a password of its own. Re-inviting it would be a
    // password-reset door that the teacher controls — refuse; that is what the
    // real reset flow is for.
    if (user.passwordHash !== null) {
      throw new BusinessRuleError(
        "This assistant has already set a password — ask them to use 'forgot password'",
      );
    }
    return user;
  });

  return sendAssistantInvite(assistant, teacher, locale);
}

export async function removeAssistant(teacher: SessionUser, linkId: string) {
  return scopedDb(teacher, async (tx) => {
    const link = await tx.teacherAssistant.findFirst({
      where: { id: linkId, teacherId: teacher.id, removedAt: null },
    });
    if (!link) throw new NotFoundError("Assistant not found on your team");
    await tx.teacherAssistant.update({
      where: { id: link.id },
      data: { removedAt: new Date() },
    });
    return { removed: true };
  });
}
