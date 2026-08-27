import type { TenantTx } from "../client";
import type {
  ConversationBlock,
  ConversationReport,
  ReportCategory,
  ReportStatus,
  Role,
} from "../generated/client/index";
import { ChatError, type ChatActor } from "./chat-scope";
import { isAdultRole, isMinorStudent } from "./chat-minors";

export type BlockView = {
  id: string;
  blockedId: string;
  blockedName: string | null;
  blockedRole: Role | null;
  reason: string | null;
  createdAt: Date;
};

export async function blockUser(
  db: TenantTx,
  actor: ChatActor,
  targetUserId: string,
  opts: { reason?: string; conversationId?: string } = {},
): Promise<{ block: ConversationBlock; flaggedAdultBlockingMinor: boolean }> {
  if (targetUserId === actor.id) {
    throw new ChatError("policy_denied", "You cannot block yourself");
  }
  const target = await db.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!target) throw new ChatError("recipient_not_found");

  const existing = await db.conversationBlock.findFirst({
    where: { blockerId: actor.id, blockedId: targetUserId, removedAt: null },
  });
  if (existing) return { block: existing, flaggedAdultBlockingMinor: false };

  const block = await db.conversationBlock.create({
    data: {
      blockerId: actor.id,
      blockedId: targetUserId,
      conversationId: opts.conversationId ?? null,
      reason: opts.reason?.slice(0, 500) ?? null,
    },
  });

  const flagged =
    isAdultRole(actor.role) &&
    target.role === "student" &&
    (await isMinorStudent(db, targetUserId));

  if (flagged) {
    await db.conversationReport.create({
      data: {
        reporterId: actor.id,
        reportedUserId: actor.id,
        conversationId: opts.conversationId ?? null,
        category: "safety_concern",
        details:
          "System-generated: an adult account blocked a minor student. " +
          "Recorded for review — the conversation remains visible to the " +
          "student's parent and to platform staff.",
        involvesMinor: true,
      },
    });
  }

  return { block, flaggedAdultBlockingMinor: flagged };
}

export async function unblockUser(
  db: TenantTx,
  actor: ChatActor,
  targetUserId: string,
): Promise<{ unblocked: boolean }> {
  const res = await db.conversationBlock.updateMany({
    where: { blockerId: actor.id, blockedId: targetUserId, removedAt: null },
    data: { removedAt: new Date() },
  });
  return { unblocked: res.count > 0 };
}

export async function listMyBlocks(
  db: TenantTx,
  actor: ChatActor,
): Promise<BlockView[]> {
  const rows = await db.conversationBlock.findMany({
    where: { blockerId: actor.id, removedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const users = rows.length
    ? await db.user.findMany({
        where: { id: { in: rows.map((r) => r.blockedId) } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    id: r.id,
    blockedId: r.blockedId,
    blockedName: byId.get(r.blockedId)?.name ?? null,
    blockedRole: byId.get(r.blockedId)?.role ?? null,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}

export async function isBlockedPair(
  db: TenantTx,
  a: string,
  b: string,
): Promise<boolean> {
  const hit = await db.conversationBlock.findFirst({
    where: {
      removedAt: null,
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

export type FileReportInput = {
  reportedUserId?: string;
  conversationId?: string;
  groupId?: string;
  messageId?: string;
  category: ReportCategory;
  details?: string;
};

export async function fileReport(
  db: TenantTx,
  actor: ChatActor,
  input: FileReportInput,
): Promise<ConversationReport> {
  let reportedUserId = input.reportedUserId ?? null;

  if (input.conversationId) {
    const conv = await db.conversation.findUnique({
      where: { id: input.conversationId },
      select: { userAId: true, userBId: true },
    });
    if (!conv) throw new ChatError("conversation_not_found");
    if (conv.userAId !== actor.id && conv.userBId !== actor.id) {
      throw new ChatError("not_participant", "Not a participant in this conversation");
    }
    reportedUserId ??= conv.userAId === actor.id ? conv.userBId : conv.userAId;
  } else if (input.groupId) {
    const member = await db.groupMember.findFirst({
      where: { groupId: input.groupId, userId: actor.id, leftAt: null },
      select: { id: true },
    });
    if (!member) throw new ChatError("not_participant", "Not a member of this group");
    if (input.messageId) {
      const msg = await db.groupMessage.findUnique({
        where: { id: input.messageId },
        select: { senderId: true, groupId: true },
      });
      if (msg?.groupId === input.groupId) reportedUserId ??= msg.senderId;
    }
  }

  if (!reportedUserId) {
    throw new ChatError("invalid_body", "Could not determine who is being reported");
  }

  const involvesMinor = await eitherIsMinor(db, actor.id, reportedUserId);

  return db.conversationReport.create({
    data: {
      reporterId: actor.id,
      reportedUserId,
      conversationId: input.conversationId ?? null,
      groupId: input.groupId ?? null,
      messageId: input.messageId ?? null,
      category: input.category,
      details: input.details?.slice(0, 2000) ?? null,
      involvesMinor,
    },
  });
}

async function eitherIsMinor(
  db: TenantTx,
  a: string,
  b: string,
): Promise<boolean> {
  const users = await db.user.findMany({
    where: { id: { in: [a, b] } },
    select: { id: true, role: true },
  });
  for (const u of users) {
    if (u.role === "student" && (await isMinorStudent(db, u.id))) return true;
  }
  return false;
}

export async function listMyReports(
  db: TenantTx,
  actor: ChatActor,
): Promise<ConversationReport[]> {
  return db.conversationReport.findMany({
    where: { reporterId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export type ReportListItem = ConversationReport & {
  reporter: { id: string; name: string | null; role: Role | null } | null;
  reported: { id: string; name: string | null; role: Role | null } | null;
};

export async function listReportsForReview(
  db: TenantTx,
  opts: { status?: ReportStatus; limit?: number; offset?: number } = {},
): Promise<{ reports: ReportListItem[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where = opts.status ? { status: opts.status } : {};
  const [rows, total] = await Promise.all([
    db.conversationReport.findMany({
      where,
      orderBy: [{ involvesMinor: "desc" }, { createdAt: "desc" }],
      skip: opts.offset ?? 0,
      take: limit,
    }),
    db.conversationReport.count({ where }),
  ]);

  const ids = [...new Set(rows.flatMap((r) => [r.reporterId, r.reportedUserId]))];
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    reports: rows.map((r) => ({
      ...r,
      reporter: byId.get(r.reporterId) ?? null,
      reported: byId.get(r.reportedUserId) ?? null,
    })),
    total,
  };
}

export async function resolveReport(
  db: TenantTx,
  reviewerId: string,
  reportId: string,
  input: { status: ReportStatus; resolutionNote?: string },
): Promise<ConversationReport> {
  return db.conversationReport.update({
    where: { id: reportId },
    data: {
      status: input.status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      resolutionNote: input.resolutionNote?.slice(0, 2000) ?? null,
    },
  });
}

export async function listAllBlocks(
  db: TenantTx,
  opts: { limit?: number; offset?: number; activeOnly?: boolean } = {},
): Promise<{ blocks: (ConversationBlock & { blocker: string | null; blocked: string | null })[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where = opts.activeOnly === false ? {} : { removedAt: null };
  const [rows, total] = await Promise.all([
    db.conversationBlock.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.offset ?? 0,
      take: limit,
    }),
    db.conversationBlock.count({ where }),
  ]);
  const ids = [...new Set(rows.flatMap((r) => [r.blockerId, r.blockedId]))];
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return {
    blocks: rows.map((r) => ({
      ...r,
      blocker: byId.get(r.blockerId) ?? null,
      blocked: byId.get(r.blockedId) ?? null,
    })),
    total,
  };
}

export async function softDeleteMessage(
  db: TenantTx,
  actorId: string,
  messageId: string,
  scope: "direct" | "group",
): Promise<void> {
  const data = { deletedAt: new Date(), deletedBy: actorId };
  if (scope === "direct") {
    await db.conversationMessage.updateMany({
      where: { id: messageId, deletedAt: null },
      data,
    });
  } else {
    await db.groupMessage.updateMany({ where: { id: messageId, deletedAt: null }, data });
  }
}
