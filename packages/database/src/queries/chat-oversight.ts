import type { TenantTx } from "../client";
import type { Role } from "../generated/client/index";
import { ChatError } from "./chat-scope";
import { toMessageView, otherParticipantId, type MessageView } from "./chat";
import { ADULT_ROLES, isAdultRole, isMinorStudent } from "./chat-minors";

export type OversightConversation = {
  id: string;
  partner: { id: string; name: string | null; role: Role | null };
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  messageCount: number;
  createdAt: Date;
};

export type OversightChild = {
  studentId: string;
  name: string | null;
  isMinor: boolean;
  conversationCount: number;
};

async function assertOversightAllowed(
  db: TenantTx,
  parentId: string,
  studentId: string,
): Promise<void> {
  const link = await db.parentStudentLink.findFirst({
    where: { parentId, studentId, status: "approved" },
    select: { id: true },
  });
  if (!link) {
    throw new ChatError(
      "not_participant",
      "You are not the approved parent of this student",
    );
  }
  if (!(await isMinorStudent(db, studentId))) {
    throw new ChatError(
      "policy_denied",
      "This student is a verified adult; their conversations are private",
    );
  }
}

export async function listOversightChildren(
  db: TenantTx,
  parentId: string,
): Promise<OversightChild[]> {
  const links = await db.parentStudentLink.findMany({
    where: { parentId, status: "approved" },
    select: { studentId: true },
  });
  if (!links.length) return [];

  const ids = links.map((l) => l.studentId);
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const out: OversightChild[] = [];
  for (const studentId of ids) {
    const minor = await isMinorStudent(db, studentId);
    out.push({
      studentId,
      name: nameById.get(studentId) ?? null,
      isMinor: minor,
      conversationCount: minor ? await countAdultConversations(db, studentId) : 0,
    });
  }
  return out;
}

async function adultPartnerIds(db: TenantTx, studentId: string): Promise<Set<string>> {
  const convs = await db.conversation.findMany({
    where: { OR: [{ userAId: studentId }, { userBId: studentId }] },
    select: { userAId: true, userBId: true },
    take: 500,
  });
  const partnerIds = [
    ...new Set(convs.map((c) => otherParticipantId(c, studentId))),
  ];
  if (!partnerIds.length) return new Set();
  const adults = await db.user.findMany({
    where: { id: { in: partnerIds }, role: { in: [...ADULT_ROLES] } },
    select: { id: true },
  });
  return new Set(adults.map((a) => a.id));
}

async function countAdultConversations(
  db: TenantTx,
  studentId: string,
): Promise<number> {
  const adults = await adultPartnerIds(db, studentId);
  if (!adults.size) return 0;
  return db.conversation.count({
    where: {
      OR: [
        { userAId: studentId, userBId: { in: [...adults] } },
        { userBId: studentId, userAId: { in: [...adults] } },
      ],
    },
  });
}

export async function listChildConversations(
  db: TenantTx,
  parentId: string,
  studentId: string,
): Promise<OversightConversation[]> {
  await assertOversightAllowed(db, parentId, studentId);

  const adults = await adultPartnerIds(db, studentId);
  if (!adults.size) return [];

  const convs = await db.conversation.findMany({
    where: {
      OR: [
        { userAId: studentId, userBId: { in: [...adults] } },
        { userBId: studentId, userAId: { in: [...adults] } },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  const partnerIds = convs.map((c) => otherParticipantId(c, studentId));
  const [partners, counts] = await Promise.all([
    db.user.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true, role: true },
    }),
    db.conversationMessage.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: convs.map((c) => c.id) } },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(partners.map((p) => [p.id, p]));
  const countBy = new Map(counts.map((c) => [c.conversationId, c._count._all]));

  return convs.map((c) => {
    const pid = otherParticipantId(c, studentId);
    const p = byId.get(pid);
    return {
      id: c.id,
      partner: { id: pid, name: p?.name ?? null, role: p?.role ?? null },
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      messageCount: countBy.get(c.id) ?? 0,
      createdAt: c.createdAt,
    };
  });
}

export async function getChildThread(
  db: TenantTx,
  parentId: string,
  studentId: string,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number } = {},
): Promise<{
  conversation: OversightConversation;
  messages: MessageView[];
  hasMore: boolean;
}> {
  await assertOversightAllowed(db, parentId, studentId);

  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new ChatError("conversation_not_found");
  if (conv.userAId !== studentId && conv.userBId !== studentId) {
    throw new ChatError("not_participant", "This conversation does not belong to your child");
  }

  const partnerId = otherParticipantId(conv, studentId);
  const partner = await db.user.findFirst({
    where: { id: partnerId },
    select: { id: true, name: true, role: true },
  });
  if (!isAdultRole(partner?.role)) {
    throw new ChatError(
      "policy_denied",
      "Only conversations with teachers, assistants and center staff are visible",
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db.conversationMessage.findMany({
    where: {
      conversationId,
      ...(opts.beforeSeq != null ? { seq: { lt: BigInt(opts.beforeSeq) } } : {}),
    },
    orderBy: { seq: "desc" },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const count = await db.conversationMessage.count({ where: { conversationId } });

  return {
    conversation: {
      id: conv.id,
      partner: {
        id: partnerId,
        name: partner?.name ?? null,
        role: partner?.role ?? null,
      },
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview,
      messageCount: count,
      createdAt: conv.createdAt,
    },
    messages: rows.slice(0, limit).reverse().map(toMessageView),
    hasMore,
  };
}

export type OversightNotice = {
  monitored: boolean;
  minorParticipantId: string | null;
};

export async function oversightNoticeFor(
  db: TenantTx,
  conversationId: string,
): Promise<OversightNotice> {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { userAId: true, userBId: true },
  });
  if (!conv) return { monitored: false, minorParticipantId: null };

  const users = await db.user.findMany({
    where: { id: { in: [conv.userAId, conv.userBId] } },
    select: { id: true, role: true },
  });
  const student = users.find((u) => u.role === "student");
  const other = users.find((u) => u.id !== student?.id);
  if (!student || !isAdultRole(other?.role)) {
    return { monitored: false, minorParticipantId: null };
  }
  if (!(await isMinorStudent(db, student.id))) {
    return { monitored: false, minorParticipantId: null };
  }
  const link = await db.parentStudentLink.findFirst({
    where: { studentId: student.id, status: "approved" },
    select: { id: true },
  });
  return {
    monitored: !!link,
    minorParticipantId: link ? student.id : null,
  };
}

export type AdminConversationRow = {
  id: string;
  participants: { id: string; name: string | null; role: Role | null }[];
  centerId: string | null;
  lastMessageAt: Date;
  messageCount: number;
  involvesMinor: boolean;
  createdAt: Date;
};

export async function adminSearchConversations(
  db: TenantTx,
  opts: {
    q?: string;
    role?: Role;
    centerId?: string;
    from?: Date;
    to?: Date;
    minorsOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: AdminConversationRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  let participantIds: string[] | null = null;
  if (opts.q || opts.role) {
    const users = await db.user.findMany({
      where: {
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: "insensitive" as const } },
                { email: { contains: opts.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(opts.role ? { role: opts.role } : {}),
      },
      select: { id: true },
      take: 500,
    });
    participantIds = users.map((u) => u.id);
    if (!participantIds.length) return { rows: [], total: 0 };
  }

  const where = {
    ...(opts.centerId ? { centerId: opts.centerId } : {}),
    ...(opts.from || opts.to
      ? {
          lastMessageAt: {
            ...(opts.from ? { gte: opts.from } : {}),
            ...(opts.to ? { lte: opts.to } : {}),
          },
        }
      : {}),
    ...(participantIds
      ? {
          OR: [
            { userAId: { in: participantIds } },
            { userBId: { in: participantIds } },
          ],
        }
      : {}),
  };

  const [convs, total] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: opts.offset ?? 0,
      take: limit,
    }),
    db.conversation.count({ where }),
  ]);

  const userIds = [...new Set(convs.flatMap((c) => [c.userAId, c.userBId]))];
  const [users, counts] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    }),
    db.conversationMessage.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: convs.map((c) => c.id) } },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const countBy = new Map(counts.map((c) => [c.conversationId, c._count._all]));

  const studentIds = users.filter((u) => u.role === "student").map((u) => u.id);
  const minors = new Set<string>();
  for (const sid of studentIds) {
    if (await isMinorStudent(db, sid)) minors.add(sid);
  }

  const rows = convs
    .map((c) => ({
      id: c.id,
      participants: [c.userAId, c.userBId].map((id) => ({
        id,
        name: byId.get(id)?.name ?? null,
        role: byId.get(id)?.role ?? null,
      })),
      centerId: c.centerId,
      lastMessageAt: c.lastMessageAt,
      messageCount: countBy.get(c.id) ?? 0,
      involvesMinor: minors.has(c.userAId) || minors.has(c.userBId),
      createdAt: c.createdAt,
    }))
    .filter((r) => (opts.minorsOnly ? r.involvesMinor : true));

  return { rows, total };
}

export async function adminGetThread(
  db: TenantTx,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number } = {},
): Promise<{
  conversation: AdminConversationRow;
  messages: (MessageView & { originalBody: string })[];
  hasMore: boolean;
}> {
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new ChatError("conversation_not_found");

  const users = await db.user.findMany({
    where: { id: { in: [conv.userAId, conv.userBId] } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const rows = await db.conversationMessage.findMany({
    where: {
      conversationId,
      ...(opts.beforeSeq != null ? { seq: { lt: BigInt(opts.beforeSeq) } } : {}),
    },
    orderBy: { seq: "desc" },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  let involvesMinor = false;
  for (const u of users) {
    if (u.role === "student" && (await isMinorStudent(db, u.id))) involvesMinor = true;
  }

  return {
    conversation: {
      id: conv.id,
      participants: [conv.userAId, conv.userBId].map((id) => ({
        id,
        name: byId.get(id)?.name ?? null,
        role: byId.get(id)?.role ?? null,
      })),
      centerId: conv.centerId,
      lastMessageAt: conv.lastMessageAt,
      messageCount: await db.conversationMessage.count({ where: { conversationId } }),
      involvesMinor,
      createdAt: conv.createdAt,
    },
    messages: page.map((m) => ({ ...toMessageView(m), originalBody: m.body })),
    hasMore,
  };
}
