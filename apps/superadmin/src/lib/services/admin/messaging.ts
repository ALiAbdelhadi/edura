import * as oversight from "@repo/database/chat-oversight";
import * as safety from "@repo/database/chat-safety";
import type { ReportStatus, Role } from "@repo/database";
import { platformDb } from "@/lib/db/scope";
import { parsePageLimit } from "@/lib/validation/common";

export function searchConversations(filters: {
  q?: string;
  role?: string;
  centerId?: string;
  from?: string;
  to?: string;
  minorsOnly?: string;
  page?: string;
  limit?: string;
}) {
  const { page, limit } = parsePageLimit(filters, 25);
  return platformDb(async (tx) => {
    const { rows, total } = await oversight.adminSearchConversations(tx, {
      q: filters.q?.trim() || undefined,
      role: (filters.role as Role) || undefined,
      centerId: filters.centerId || undefined,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      minorsOnly: filters.minorsOnly === "true",
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows, total, page, limit };
  });
}

export function getThread(
  actorId: string,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number } = {},
) {
  return platformDb(
    async (tx) => {
      const result = await oversight.adminGetThread(tx, conversationId, opts);
      await tx.auditLog.create({
        data: {
          actorId,
          action: "messaging.thread_viewed",
          targetType: "conversation",
          targetId: conversationId,
          afterState: {
            participants: result.conversation.participants.map((p) => p.id),
            involvesMinor: result.conversation.involvesMinor,
            messageCount: result.conversation.messageCount,
          },
        },
      });
      return result;
    },
    { actorId },
  );
}

export function listReports(filters: {
  status?: string;
  page?: string;
  limit?: string;
}) {
  const { page, limit } = parsePageLimit(filters, 50);
  return platformDb(async (tx) => {
    const { reports, total } = await safety.listReportsForReview(tx, {
      status: (filters.status as ReportStatus) || undefined,
      limit,
      offset: (page - 1) * limit,
    });
    return { data: reports, total, page, limit };
  });
}

export function resolveReport(
  actorId: string,
  reportId: string,
  input: { status: ReportStatus; resolutionNote?: string },
) {
  return platformDb(
    async (tx) => {
      const report = await safety.resolveReport(tx, actorId, reportId, input);
      await tx.auditLog.create({
        data: {
          actorId,
          action: "messaging.report_resolved",
          targetType: "conversation_report",
          targetId: reportId,
          afterState: { status: input.status, note: input.resolutionNote ?? null },
        },
      });
      return report;
    },
    { actorId },
  );
}

export function listBlocks(filters: { page?: string; limit?: string; all?: string }) {
  const { page, limit } = parsePageLimit(filters, 50);
  return platformDb(async (tx) => {
    const { blocks, total } = await safety.listAllBlocks(tx, {
      limit,
      offset: (page - 1) * limit,
      activeOnly: filters.all !== "true",
    });
    return { data: blocks, total, page, limit };
  });
}

export function removeMessage(
  actorId: string,
  messageId: string,
  scope: "direct" | "group",
) {
  return platformDb(
    async (tx) => {
      await safety.softDeleteMessage(tx, actorId, messageId, scope);
      await tx.auditLog.create({
        data: {
          actorId,
          action: "messaging.message_removed",
          targetType: scope === "direct" ? "conversation_message" : "group_message",
          targetId: messageId,
        },
      });
      return { removed: true };
    },
    { actorId },
  );
}
