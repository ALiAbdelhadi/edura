import { scopedDb } from "@/lib/db/scope";
import { notify } from "@/lib/services/notifications/notify";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

export async function listThreads(user: SessionUser) {
  // Always scope to the caller's center so threads never leak across tenants.
  const centerFilter = user.centerId ? { centerId: user.centerId } : {};

  return scopedDb(user, async (tx) => {
    const threads = await tx.messageThread.findMany({
      where: { participantIds: { has: user.id }, ...centerFilter },
      orderBy: { lastMessageAt: "desc" },
    });

    // No Prisma relation exists between participantIds (String[]) and User, so
    // resolve the participants with a second query and build a Map.
    const participantIds = [...new Set(threads.flatMap((t) => t.participantIds))];
    const users = participantIds.length
      ? await tx.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, name: true, role: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return threads.map((thread) => {
      // Determine the "other" participant for UI convenience.
      const otherId =
        thread.participantIds.find((id) => id !== user.id) ?? thread.participantIds[0];
      const otherParticipant = otherId ? userMap.get(otherId) ?? otherId : undefined;

      const unreadCounts = (thread.unreadCounts as Record<string, number>) ?? {};
      const unreadCount = unreadCounts[user.id] || 0;

      return {
        id: thread.id,
        centerId: thread.centerId,
        lastMessageAt: thread.lastMessageAt,
        lastMessageBody: thread.lastMessageBody,
        unreadCount,
        otherParticipant,
      };
    });
  });
}

export async function getThreadMessages(threadId: string, user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const thread = await tx.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundError("Thread not found");

    if (!thread.participantIds.includes(user.id)) {
      throw new ForbiddenError("Not a participant in this thread");
    }

    // Zero the unread count for this user (read-modify-write within the tx).
    const unreadCounts = (thread.unreadCounts as Record<string, number>) ?? {};
    if ((unreadCounts[user.id] ?? 0) > 0) {
      unreadCounts[user.id] = 0;
      await tx.messageThread.update({
        where: { id: thread.id },
        data: { unreadCounts },
      });
    }

    const messages = await tx.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    // Tag each message so the client knows which side to render it on
    // without needing to pass the session user id through props.
    return messages.map((msg) => ({
      ...msg,
      mine: msg.senderId === user.id,
    }));
  });
}

export async function sendMessage(
  data: { threadId?: string; recipientId?: string; body: string },
  user: SessionUser,
) {
  const { result, recipientId } = await scopedDb(user, async (tx) => {
    let thread;

    if (data.threadId) {
      thread = await tx.messageThread.findUnique({ where: { id: data.threadId } });
      if (!thread) throw new NotFoundError("Thread not found");
      if (!thread.participantIds.includes(user.id)) {
        throw new ForbiddenError("Not a participant in this thread");
      }
    } else if (data.recipientId) {
      // Resolve recipient and enforce rules before doing anything else.
      const recipient = await tx.user.findUnique({
        where: { id: data.recipientId },
        select: { id: true, role: true },
      });
      if (!recipient) throw new NotFoundError("Recipient not found");

      // P11: Students cannot initiate a message to Admin directly
      if (user.role === "student" && recipient.role === "center_admin") {
        throw new ForbiddenError("Students must contact teachers, not admins directly");
      }

      // The User model carries no centerId, so tenancy is anchored on the
      // sender's center (matching prior behavior).
      const threadCenterId = user.centerId;

      // Find existing 2-party thread between these two users.
      const candidates = await tx.messageThread.findMany({
        where: {
          participantIds: { hasEvery: [user.id, data.recipientId] },
          ...(threadCenterId ? { centerId: threadCenterId } : {}),
        },
      });
      thread = candidates.find((t) => t.participantIds.length === 2) ?? null;

      if (!thread) {
        thread = await tx.messageThread.create({
          data: {
            participantIds: [user.id, data.recipientId],
            centerId: threadCenterId ?? null,
            unreadCounts: {
              [data.recipientId]: 0,
              [user.id]: 0,
            },
          },
        });
      }
    } else {
      throw new BusinessRuleError("Must provide threadId or recipientId");
    }

    const message = await tx.message.create({
      data: {
        threadId: thread.id,
        senderId: user.id,
        body: data.body,
      },
    });

    // Increment unread for the recipient and update last-message fields.
    const otherParticipantId = thread.participantIds.find((id) => id !== user.id);
    const unreadCounts = (thread.unreadCounts as Record<string, number>) ?? {};
    if (otherParticipantId) {
      unreadCounts[otherParticipantId] = (unreadCounts[otherParticipantId] ?? 0) + 1;
    }

    await tx.messageThread.update({
      where: { id: thread.id },
      data: {
        lastMessageBody: data.body,
        lastMessageAt: message.createdAt,
        unreadCounts,
      },
    });

    return { result: { ...message, mine: true }, recipientId: otherParticipantId };
  });

  // PRD §6: new chat message notifies the recipient (FCM). Side effect after tx.
  if (recipientId) {
    await notify({
      recipients: [recipientId],
      type: "new_chat_message",
      title: user.name ? `New message from ${user.name}` : "New message",
      body: data.body.length > 120 ? data.body.slice(0, 117) + "…" : data.body,
      data: { threadId: result.threadId, messageId: result.id, senderId: user.id },
    });
  }

  return result;
}
