import * as chat from "@repo/database/chat";
import * as groups from "@repo/database/chat-groups";
import * as safety from "@repo/database/chat-safety";
import * as oversight from "@repo/database/chat-oversight";
import type { ReportCategory } from "@repo/database";
import { checkRateLimit } from "../../rate-limit/token-bucket";
import { scopedDb, platformDb, type TenantTx } from "../../db/scope";
import { notifyAfterCommit } from "../notifications/notify";
import { runAfter } from "../../http/after";
import {
  AppError,
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { bridgeMessage, bridgeRead } from "./realtime-bridge";

const limiter: chat.ChatLimiter = (key, capacity, perMinute) =>
  checkRateLimit(key, capacity, perMinute);

function toAppError(err: unknown): unknown {
  if (!(err instanceof chat.ChatError)) return err;
  switch (err.code) {
    case "recipient_not_found":
    case "conversation_not_found":
    case "group_not_found":
      return new NotFoundError(err.message);
    case "policy_denied":
    case "no_relationship":
    case "not_participant":
    case "blocked":
      return new ForbiddenError(err.message);
    case "rate_limited":
      return new AppError(429, "rate_limited", err.message);
    case "invalid_body":
      return new BusinessRuleError(err.message);
    default:
      return new AppError(500, "internal", err.message);
  }
}

async function run<T>(
  user: SessionUser,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  try {
    return await scopedDb(user, fn);
  } catch (err) {
    throw toAppError(err);
  }
}

function actor(user: SessionUser): chat.ChatActor {
  return { id: user.id, role: user.role, centerId: user.centerId ?? null };
}

export function listConversations(
  user: SessionUser,
  opts: { before?: Date; limit?: number },
) {
  return run(user, (tx) => chat.listConversations(tx, user.id, opts));
}

export function createConversation(user: SessionUser, recipientId: string) {
  return run(user, async (tx) => {
    const { conversation } = await chat.getOrCreateConversation(
      tx,
      actor(user),
      recipientId,
      { limiter },
    );
    return chat.getConversationView(tx, user.id, conversation.id);
  });
}

export function getConversationThread(
  user: SessionUser,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number },
) {
  return run(user, async (tx) => {
    const conversation = await chat.getConversationView(tx, user.id, conversationId);
    const { messages, hasMore } = await chat.listMessages(
      tx,
      user.id,
      conversationId,
      opts,
    );
    const notice = await oversight.oversightNoticeFor(tx, conversationId);
    return { conversation, messages, hasMore, oversight: notice };
  });
}

export function listContacts(
  user: SessionUser,
  opts: { search?: string; limit?: number },
) {
  return run(user, (tx) => chat.listContacts(tx, actor(user), opts));
}

export function getUnreadCounts(user: SessionUser) {
  return run(user, async (tx) => {
    const [messages, notifications] = await Promise.all([
      chat.getTotalUnread(tx, user.id),
      tx.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    let children: { studentId: string; unreadMessages: number | null }[] | null = null;
    if (user.role === "parent") {
      const kids = await oversight.listOversightChildren(tx, user.id);
      const unread = await unreadByUser(
        tx,
        kids.filter((k) => k.isMinor).map((k) => k.studentId),
      );
      children = kids.map((kid) => ({
        studentId: kid.studentId,
        unreadMessages: kid.isMinor ? (unread.get(kid.studentId) ?? 0) : null,
      }));
    }

    return { messages, notifications, children };
  });
}

async function unreadByUser(
  tx: TenantTx,
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  const [asA, asB] = await Promise.all([
    tx.conversation.groupBy({
      by: ["userAId"],
      where: { userAId: { in: userIds } },
      _sum: { aUnreadCount: true },
    }),
    tx.conversation.groupBy({
      by: ["userBId"],
      where: { userBId: { in: userIds } },
      _sum: { bUnreadCount: true },
    }),
  ]);
  for (const r of asA) {
    out.set(r.userAId, (out.get(r.userAId) ?? 0) + (r._sum.aUnreadCount ?? 0));
  }
  for (const r of asB) {
    out.set(r.userBId, (out.get(r.userBId) ?? 0) + (r._sum.bUnreadCount ?? 0));
  }
  return out;
}

export async function sendMessage(
  user: SessionUser,
  input: {
    conversationId?: string;
    recipientId?: string;
    body: string;
    clientId?: string;
  },
) {
  const result = await run(user, (tx) =>
    chat.appendMessage(tx, actor(user), input, { limiter }),
  );

  if (!result.duplicate) {
    const bridged = await bridgeMessage({
      message: result.message,
      recipientId: result.recipientId,
      sender: { id: user.id, name: user.name ?? "", role: user.role },
    });
    const recipientOnline = bridged?.recipientOnline ?? false;
    if (!recipientOnline) {
      const recipientId = result.recipientId;
      const message = result.message;
      runAfter(() =>
        notifyAfterCommit({
          recipients: [recipientId],
          type: "new_chat_message",
          title: user.name ? `New message from ${user.name}` : "New message",
          body:
            message.body.length > 120
              ? message.body.slice(0, 117) + "…"
              : message.body,
          data: {
            conversationId: message.conversationId,
            messageId: message.id,
            senderId: user.id,
          },
        }),
      );
    }
  }

  return { ...result.message, duplicate: result.duplicate };
}

export async function markConversationRead(
  user: SessionUser,
  conversationId: string,
) {
  const receipt = await run(user, (tx) =>
    chat.markConversationRead(tx, user.id, conversationId),
  );
  await bridgeRead({
    conversationId: receipt.conversationId,
    readerId: receipt.readerId,
    otherUserId: receipt.otherUserId,
    readAt: receipt.readAt.toISOString(),
  });
  return {
    conversationId: receipt.conversationId,
    readAt: receipt.readAt,
    updatedCount: receipt.updatedCount,
  };
}

export function listGroups(user: SessionUser) {
  return run(user, (tx) => groups.listGroupsForUser(tx, actor(user)));
}

export function createGroup(user: SessionUser, input: groups.CreateGroupInput) {
  return run(user, (tx) => groups.createGroup(tx, actor(user), input));
}

export function getGroupThread(
  user: SessionUser,
  groupId: string,
  opts: { beforeSeq?: number; limit?: number },
) {
  return run(user, async (tx) => {
    const access = await groups.assertGroupAccess(tx, actor(user), groupId, "read");
    const { messages, hasMore } = await groups.listGroupMessages(
      tx,
      actor(user),
      groupId,
      opts,
    );
    const memberCount = await tx.groupMember.count({
      where: { groupId, leftAt: null },
    });
    return {
      group: {
        id: access.group.id,
        kind: access.group.kind,
        title: access.group.title,
        postPolicy: access.group.postPolicy,
        canPost: access.canPost,
        canManage: access.canManage,
        memberCount,
      },
      messages,
      hasMore,
    };
  });
}

export async function postToGroup(
  user: SessionUser,
  groupId: string,
  input: { body: string; clientId?: string },
) {
  const result = await run(user, (tx) =>
    groups.postGroupMessage(tx, actor(user), groupId, input, { limiter }),
  );

  if (!result.duplicate && result.recipientIds.length) {
    const { recipientIds, message } = result;
    runAfter(() =>
      notifyAfterCommit({
        recipients: recipientIds,
        type: "chat_group_message",
        title: user.name ? `${user.name}` : "New group message",
        body:
          message.body.length > 120
            ? message.body.slice(0, 117) + "…"
            : message.body,
        data: { groupId, messageId: message.id, senderId: user.id },
      }),
    );
  }
  return { ...result.message, duplicate: result.duplicate };
}

export function markGroupRead(user: SessionUser, groupId: string) {
  return run(user, (tx) => groups.markGroupRead(tx, actor(user), groupId));
}

export function setGroupMuted(
  user: SessionUser,
  groupId: string,
  muted: boolean,
) {
  return run(user, (tx) => groups.setGroupMuted(tx, actor(user), groupId, muted));
}

export function blockUser(
  user: SessionUser,
  targetUserId: string,
  opts: { reason?: string; conversationId?: string } = {},
) {
  return run(user, async (tx) => {
    const res = await safety.blockUser(tx, actor(user), targetUserId, opts);
    return { blocked: true, flagged: res.flaggedAdultBlockingMinor };
  });
}

export function unblockUser(user: SessionUser, targetUserId: string) {
  return run(user, (tx) => safety.unblockUser(tx, actor(user), targetUserId));
}

export function listBlocks(user: SessionUser) {
  return run(user, (tx) => safety.listMyBlocks(tx, actor(user)));
}

export async function fileReport(
  user: SessionUser,
  input: {
    reportedUserId?: string;
    conversationId?: string;
    groupId?: string;
    messageId?: string;
    category: ReportCategory;
    details?: string;
  },
) {
  const report = await run(user, (tx) => safety.fileReport(tx, actor(user), input));

  runAfter(async () => {
    const admins = await platformDb((tx) =>
      tx.user.findMany({
        where: { role: "super_admin", status: "active", deletedAt: null },
        select: { id: true },
      }),
    );
    if (!admins.length) return;
    await notifyAfterCommit({
      recipients: admins.map((a) => a.id),
      type: "chat_report_filed",
      title: report.involvesMinor
        ? "Safety report involving a minor"
        : "New conversation report",
      body: `${report.category} — reported by ${user.name ?? user.id}`,
      data: { reportId: report.id, involvesMinor: report.involvesMinor },
    });
  });
  return report;
}

export function listOversightChildren(user: SessionUser) {
  return run(user, (tx) => oversight.listOversightChildren(tx, user.id));
}

export function listChildConversations(user: SessionUser, studentId: string) {
  return run(user, (tx) =>
    oversight.listChildConversations(tx, user.id, studentId),
  );
}

export function getChildThread(
  user: SessionUser,
  studentId: string,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number },
) {
  return run(user, (tx) =>
    oversight.getChildThread(tx, user.id, studentId, conversationId, opts),
  );
}
