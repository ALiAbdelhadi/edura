// =============================================================================
// Chat domain queries — shared by the Next.js REST layer AND the standalone
// realtime WebSocket server (both pass their own transaction/context wrapper).
// Every function takes a `db: TenantTx` so callers control tenancy/RLS context.
//
// Authorization model (enforced HERE, not in any UI):
//   1. Matrix gate  — chat-policy.ts decides which roles may open a
//      conversation (only checked when the conversation does not exist yet;
//      both participants may always reply inside an existing one).
//   2. Relationship gate — the pair must actually be related through real
//      data: enrollments, teacher teams, parent links, center affiliations.
//      A student cannot cold-message an assistant of a teacher they don't
//      study with, even though the matrix allows student→assistant.
// =============================================================================

import type { TenantTx } from "../client";
import type {
  Conversation,
  ConversationMessage,
  Role,
} from "../generated/client/index";
import {
  conversationInitiationMode,
  type InitiationMode,
} from "./chat-policy";

export const MAX_MESSAGE_LENGTH = 4000;
export const PREVIEW_LENGTH = 140;

// ---------------------------------------------------------------------------
// Errors — transport-agnostic; the REST layer maps codes onto HTTP errors and
// the socket layer onto ack payloads.
// ---------------------------------------------------------------------------
export type ChatErrorCode =
  | "recipient_not_found"
  | "policy_denied"
  | "no_relationship"
  | "conversation_not_found"
  | "not_participant"
  | "invalid_body";

export class ChatError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ChatError";
  }
}

export type ChatActor = {
  id: string;
  role: Role;
  centerId?: string | null;
};

// ---------------------------------------------------------------------------
// Wire types (JSON-safe: BigInt seq → number)
// ---------------------------------------------------------------------------
export type MessageView = {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  body: string;
  clientId: string | null;
  status: "sent" | "delivered" | "read";
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

export type ConversationView = {
  id: string;
  partner: { id: string; name: string | null; role: Role | null };
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  /** Partner's read cursor — my messages up to this instant are "read". */
  partnerLastReadAt: Date | null;
  centerId: string | null;
  createdAt: Date;
};

export type ContactGroup =
  | "assistants"
  | "teachers"
  | "team"
  | "centers"
  | "students"
  | "parents"
  | "platform";

export type ContactView = {
  id: string;
  name: string;
  role: Role;
  group: ContactGroup;
  /** Context line, e.g. the teacher a contact assists or the center name. */
  subtitle: string | null;
  /** Escalation contacts are grouped apart so assistant-first stays the norm. */
  mode: InitiationMode;
};

export function toMessageView(m: ConversationMessage): MessageView {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    seq: Number(m.seq),
    body: m.body,
    clientId: m.clientId,
    status: m.status,
    deliveredAt: m.deliveredAt,
    readAt: m.readAt,
    createdAt: m.createdAt,
  };
}

type PartnerLite = { id: string; name: string; role: Role } | undefined;

function toConversationView(
  c: Conversation,
  viewerId: string,
  partner: PartnerLite,
): ConversationView {
  const isA = c.userAId === viewerId;
  const partnerId = isA ? c.userBId : c.userAId;
  return {
    id: c.id,
    partner: partner
      ? { id: partner.id, name: partner.name, role: partner.role }
      : { id: partnerId, name: null, role: null },
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageSenderId: c.lastMessageSenderId,
    unreadCount: isA ? c.aUnreadCount : c.bUnreadCount,
    partnerLastReadAt: isA ? c.bLastReadAt : c.aLastReadAt,
    centerId: c.centerId,
    createdAt: c.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function canonicalPair(u1: string, u2: string) {
  return u1 < u2 ? { userAId: u1, userBId: u2 } : { userAId: u2, userBId: u1 };
}

export function otherParticipantId(
  c: Pick<Conversation, "userAId" | "userBId">,
  userId: string,
): string {
  return c.userAId === userId ? c.userBId : c.userAId;
}

function assertParticipant(
  c: Pick<Conversation, "userAId" | "userBId">,
  userId: string,
) {
  if (c.userAId !== userId && c.userBId !== userId) {
    throw new ChatError("not_participant", "Not a participant in this conversation");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  );
}

async function activeTeacherIdsForAssistant(
  db: TenantTx,
  assistantId: string,
): Promise<string[]> {
  const rows = await db.teacherAssistant.findMany({
    where: { assistantId, removedAt: null },
    select: { teacherId: true },
  });
  return rows.map((r) => r.teacherId);
}

async function adminCenterId(
  db: TenantTx,
  adminUserId: string,
): Promise<string | null> {
  const profile = await db.centerAdminProfile.findFirst({
    where: { userId: adminUserId },
    select: { centerId: true },
  });
  return profile?.centerId ?? null;
}

async function approvedChildIds(
  db: TenantTx,
  parentId: string,
): Promise<string[]> {
  const rows = await db.parentStudentLink.findMany({
    where: { parentId, status: "approved" },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}

/** Students actively enrolled in any course taught by one of `teacherIds`. */
async function studentsLinkToTeachers(
  db: TenantTx,
  studentIds: string[],
  teacherIds: string[],
): Promise<boolean> {
  if (!studentIds.length || !teacherIds.length) return false;
  const hit = await db.enrollment.findFirst({
    where: {
      studentId: { in: studentIds },
      status: "active",
      course: { teacherId: { in: teacherIds } },
    },
    select: { id: true },
  });
  return !!hit;
}

async function studentsLinkToCenter(
  db: TenantTx,
  studentIds: string[],
  centerId: string,
): Promise<boolean> {
  if (!studentIds.length) return false;
  const [enrollment, roster] = await Promise.all([
    db.enrollment.findFirst({
      where: { studentId: { in: studentIds }, centerId, status: "active" },
      select: { id: true },
    }),
    db.centerStudentRoster.findFirst({
      where: { studentId: { in: studentIds }, centerId, leftAt: null },
      select: { id: true },
    }),
  ]);
  return !!(enrollment || roster);
}

async function teacherAffiliatedWithCenter(
  db: TenantTx,
  teacherIds: string[],
  centerId: string,
): Promise<boolean> {
  if (!teacherIds.length) return false;
  const hit = await db.centerTeacherAffiliation.findFirst({
    where: { teacherId: { in: teacherIds }, centerId, status: "active" },
    select: { id: true },
  });
  return !!hit;
}

/**
 * Relationship gate. Returns the tenant centerId to stamp on the conversation
 * (when one side is a center admin) — throws ChatError("no_relationship")
 * when the pair is not actually related through platform data.
 */
async function assertRelationship(
  db: TenantTx,
  x: { id: string; role: Role },
  y: { id: string; role: Role },
): Promise<{ centerId: string | null }> {
  // Normalize so we match each unordered pair exactly once.
  const [lo, hi] =
    ROLE_ORDER[x.role] <= ROLE_ORDER[y.role] ? [x, y] : [y, x];
  const pair = `${lo.role}:${hi.role}`;

  const fail = () =>
    new ChatError(
      "no_relationship",
      `No platform relationship between ${x.role} and ${y.role}`,
    );

  switch (pair) {
    // (super_admin/accountant pairs intentionally absent: the initiation
    // matrix denies them before this gate is ever reached — back-office
    // staff have no chat.)

    case "center_admin:teacher": {
      const [admin, teacher] =
        lo.role === "center_admin" ? [lo, hi] : [hi, lo];
      const centerId = await adminCenterId(db, admin.id);
      if (!centerId || !(await teacherAffiliatedWithCenter(db, [teacher.id], centerId)))
        throw fail();
      return { centerId };
    }

    case "center_admin:assistant": {
      const [admin, assistant] =
        lo.role === "center_admin" ? [lo, hi] : [hi, lo];
      const centerId = await adminCenterId(db, admin.id);
      const teacherIds = await activeTeacherIdsForAssistant(db, assistant.id);
      if (!centerId || !(await teacherAffiliatedWithCenter(db, teacherIds, centerId)))
        throw fail();
      return { centerId };
    }

    case "center_admin:student": {
      const [admin, student] =
        lo.role === "center_admin" ? [lo, hi] : [hi, lo];
      const centerId = await adminCenterId(db, admin.id);
      if (!centerId || !(await studentsLinkToCenter(db, [student.id], centerId)))
        throw fail();
      return { centerId };
    }

    case "center_admin:parent": {
      const [admin, parent] =
        lo.role === "center_admin" ? [lo, hi] : [hi, lo];
      const centerId = await adminCenterId(db, admin.id);
      const children = await approvedChildIds(db, parent.id);
      if (!centerId || !(await studentsLinkToCenter(db, children, centerId)))
        throw fail();
      return { centerId };
    }

    case "teacher:assistant": {
      const [teacher, assistant] =
        lo.role === "teacher" ? [lo, hi] : [hi, lo];
      const link = await db.teacherAssistant.findFirst({
        where: {
          teacherId: teacher.id,
          assistantId: assistant.id,
          removedAt: null,
        },
        select: { id: true },
      });
      if (!link) throw fail();
      return { centerId: null };
    }

    case "teacher:student": {
      const [teacher, student] = lo.role === "teacher" ? [lo, hi] : [hi, lo];
      if (!(await studentsLinkToTeachers(db, [student.id], [teacher.id])))
        throw fail();
      return { centerId: null };
    }

    case "teacher:parent": {
      const [teacher, parent] = lo.role === "teacher" ? [lo, hi] : [hi, lo];
      const children = await approvedChildIds(db, parent.id);
      if (!(await studentsLinkToTeachers(db, children, [teacher.id])))
        throw fail();
      return { centerId: null };
    }

    case "assistant:student": {
      const [assistant, student] =
        lo.role === "assistant" ? [lo, hi] : [hi, lo];
      const teacherIds = await activeTeacherIdsForAssistant(db, assistant.id);
      if (!(await studentsLinkToTeachers(db, [student.id], teacherIds)))
        throw fail();
      return { centerId: null };
    }

    case "assistant:parent": {
      const [assistant, parent] =
        lo.role === "assistant" ? [lo, hi] : [hi, lo];
      const teacherIds = await activeTeacherIdsForAssistant(db, assistant.id);
      const children = await approvedChildIds(db, parent.id);
      if (!(await studentsLinkToTeachers(db, children, teacherIds)))
        throw fail();
      return { centerId: null };
    }

    default:
      // Matrix allowed a pair we have no relationship rule for — treat as
      // denied rather than silently open. (Keeps the gates conservative.)
      throw fail();
  }
}

const ROLE_ORDER: Record<Role, number> = {
  super_admin: 0,
  accountant: 1,
  center_admin: 2,
  teacher: 3,
  assistant: 4,
  parent: 5,
  student: 6,
};

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export async function getOrCreateConversation(
  db: TenantTx,
  initiator: ChatActor,
  recipientId: string,
): Promise<{
  conversation: Conversation;
  created: boolean;
  recipient: { id: string; name: string; role: Role };
}> {
  if (recipientId === initiator.id) {
    throw new ChatError("policy_denied", "Cannot start a conversation with yourself");
  }
  const recipient = await db.user.findFirst({
    where: { id: recipientId, deletedAt: null, status: "active" },
    select: { id: true, name: true, role: true },
  });
  if (!recipient) throw new ChatError("recipient_not_found");

  const pair = canonicalPair(initiator.id, recipientId);
  const existing = await db.conversation.findUnique({
    where: { userAId_userBId: pair },
  });
  if (existing) return { conversation: existing, created: false, recipient };

  // Only NEW conversations pass the gates — replies are always allowed.
  const mode = conversationInitiationMode(initiator.role, recipient.role);
  if (!mode) {
    throw new ChatError(
      "policy_denied",
      `${initiator.role} may not start a conversation with ${recipient.role}`,
    );
  }
  const { centerId } = await assertRelationship(
    db,
    { id: initiator.id, role: initiator.role },
    { id: recipient.id, role: recipient.role },
  );

  try {
    const conversation = await db.conversation.create({
      data: { ...pair, centerId },
    });
    return { conversation, created: true, recipient };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const raced = await db.conversation.findUnique({
        where: { userAId_userBId: pair },
      });
      if (raced) return { conversation: raced, created: false, recipient };
    }
    throw e;
  }
}

export async function getConversationForUser(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<Conversation> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new ChatError("conversation_not_found");
  assertParticipant(conversation, userId);
  return conversation;
}

export async function listConversations(
  db: TenantTx,
  userId: string,
  opts: { limit?: number; before?: Date } = {},
): Promise<{ conversations: ConversationView[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db.conversation.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      ...(opts.before ? { lastMessageAt: { lt: opts.before } } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const partnerIds = page.map((c) => otherParticipantId(c, userId));
  const partners = partnerIds.length
    ? await db.user.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const partnerMap = new Map(partners.map((p) => [p.id, p]));

  return {
    conversations: page.map((c) =>
      toConversationView(c, userId, partnerMap.get(otherParticipantId(c, userId))),
    ),
    hasMore,
  };
}

export async function getConversationView(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<ConversationView> {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const partnerId = otherParticipantId(conversation, userId);
  const partner = await db.user.findFirst({
    where: { id: partnerId },
    select: { id: true, name: true, role: true },
  });
  return toConversationView(conversation, userId, partner ?? undefined);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export async function listMessages(
  db: TenantTx,
  userId: string,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number } = {},
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  await getConversationForUser(db, userId, conversationId);
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
  return {
    messages: rows.slice(0, limit).reverse().map(toMessageView),
    hasMore,
  };
}

export type AppendMessageInput = {
  conversationId?: string;
  recipientId?: string;
  body: string;
  clientId?: string;
};

export type AppendMessageResult = {
  message: MessageView;
  conversation: Conversation;
  recipientId: string;
  duplicate: boolean;
};

/**
 * Persist a message. `sender` is ALWAYS the authenticated actor — transports
 * must never accept a senderId from the client. Handles clientId idempotency
 * (safe retries after reconnects) and updates the denormalized list state.
 */
export async function appendMessage(
  db: TenantTx,
  sender: ChatActor,
  input: AppendMessageInput,
): Promise<AppendMessageResult> {
  const body = input.body?.trim();
  if (!body) throw new ChatError("invalid_body", "Message cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(
      "invalid_body",
      `Message exceeds ${MAX_MESSAGE_LENGTH} characters`,
    );
  }

  let conversation: Conversation;
  if (input.conversationId) {
    conversation = await getConversationForUser(db, sender.id, input.conversationId);
  } else if (input.recipientId) {
    conversation = (await getOrCreateConversation(db, sender, input.recipientId))
      .conversation;
  } else {
    throw new ChatError(
      "conversation_not_found",
      "conversationId or recipientId is required",
    );
  }
  const recipientId = otherParticipantId(conversation, sender.id);

  if (input.clientId) {
    const dup = await db.conversationMessage.findUnique({
      where: {
        conversationId_clientId: {
          conversationId: conversation.id,
          clientId: input.clientId,
        },
      },
    });
    if (dup) {
      return {
        message: toMessageView(dup),
        conversation,
        recipientId,
        duplicate: true,
      };
    }
  }

  let created: ConversationMessage;
  try {
    created = await db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        body,
        clientId: input.clientId ?? null,
      },
    });
  } catch (e) {
    // clientId retry race — the first attempt won; return it idempotently.
    if (isUniqueViolation(e) && input.clientId) {
      const dup = await db.conversationMessage.findUnique({
        where: {
          conversationId_clientId: {
            conversationId: conversation.id,
            clientId: input.clientId,
          },
        },
      });
      if (dup) {
        return {
          message: toMessageView(dup),
          conversation,
          recipientId,
          duplicate: true,
        };
      }
    }
    throw e;
  }

  const senderIsA = conversation.userAId === sender.id;
  const updated = await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: created.createdAt,
      lastMessagePreview: body.slice(0, PREVIEW_LENGTH),
      lastMessageSenderId: sender.id,
      ...(senderIsA
        ? { bUnreadCount: { increment: 1 } }
        : { aUnreadCount: { increment: 1 } }),
    },
  });

  return {
    message: toMessageView(created),
    conversation: updated,
    recipientId,
    duplicate: false,
  };
}

// ---------------------------------------------------------------------------
// Delivery / read state
// ---------------------------------------------------------------------------

/** Recipient's client confirmed receipt of a single just-sent message. */
export async function markMessageDelivered(
  db: TenantTx,
  messageId: string,
): Promise<Date> {
  const now = new Date();
  await db.conversationMessage.updateMany({
    where: { id: messageId, status: "sent" }, // never downgrade read → delivered
    data: { status: "delivered", deliveredAt: now },
  });
  return now;
}

export type DeliveredSweepGroup = {
  conversationId: string;
  senderId: string;
  maxSeq: number;
  deliveredAt: Date;
};

/**
 * Delivered-on-connect sweep: everything addressed to `userId` that was sent
 * while they were offline becomes "delivered". Returns per-conversation groups
 * so the socket layer can push receipts to each sender.
 */
export async function markDeliveredForUser(
  db: TenantTx,
  userId: string,
): Promise<DeliveredSweepGroup[]> {
  const pending = await db.conversationMessage.findMany({
    where: {
      status: "sent",
      senderId: { not: userId },
      conversation: { OR: [{ userAId: userId }, { userBId: userId }] },
    },
    select: { id: true, conversationId: true, senderId: true, seq: true },
  });
  if (!pending.length) return [];

  const now = new Date();
  await db.conversationMessage.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: "delivered", deliveredAt: now },
  });

  const groups = new Map<string, DeliveredSweepGroup>();
  for (const p of pending) {
    const g = groups.get(p.conversationId);
    const seq = Number(p.seq);
    if (!g) {
      groups.set(p.conversationId, {
        conversationId: p.conversationId,
        senderId: p.senderId,
        maxSeq: seq,
        deliveredAt: now,
      });
    } else if (seq > g.maxSeq) {
      g.maxSeq = seq;
    }
  }
  return [...groups.values()];
}

export type ReadReceipt = {
  conversationId: string;
  readerId: string;
  otherUserId: string;
  readAt: Date;
  updatedCount: number;
};

/** Reader opened the conversation: zero their counter, mark partner's messages read. */
export async function markConversationRead(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<ReadReceipt> {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const now = new Date();

  // Anything not yet delivered is implicitly delivered the moment it is read.
  await db.conversationMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, deliveredAt: null },
    data: { deliveredAt: now },
  });
  const updated = await db.conversationMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { status: "read", readAt: now },
  });

  const isA = conversation.userAId === userId;
  await db.conversation.update({
    where: { id: conversationId },
    data: isA
      ? { aUnreadCount: 0, aLastReadAt: now }
      : { bUnreadCount: 0, bLastReadAt: now },
  });

  return {
    conversationId,
    readerId: userId,
    otherUserId: otherParticipantId(conversation, userId),
    readAt: now,
    updatedCount: updated.count,
  };
}

export async function getTotalUnread(
  db: TenantTx,
  userId: string,
): Promise<number> {
  const [a, b] = await Promise.all([
    db.conversation.aggregate({
      _sum: { aUnreadCount: true },
      where: { userAId: userId },
    }),
    db.conversation.aggregate({
      _sum: { bUnreadCount: true },
      where: { userBId: userId },
    }),
  ]);
  return (a._sum.aUnreadCount ?? 0) + (b._sum.bUnreadCount ?? 0);
}

/** Distinct partner ids of a user's most recent conversations (presence fanout). */
export async function listPartnerIds(
  db: TenantTx,
  userId: string,
  limit = 500,
): Promise<string[]> {
  const rows = await db.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: { userAId: true, userBId: true },
  });
  return [...new Set(rows.map((c) => otherParticipantId(c, userId)))];
}

// ---------------------------------------------------------------------------
// Contacts directory — "who can I start a conversation with?"
// Mirrors the matrix + relationship gates; searchable and capped because a
// teacher/center may have thousands of students (search-first UX at scale).
// ---------------------------------------------------------------------------
export async function listContacts(
  db: TenantTx,
  actor: ChatActor,
  opts: { search?: string; limit?: number } = {},
): Promise<ContactView[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const search = opts.search?.trim() || undefined;

  const nameFilter = search
    ? { name: { contains: search, mode: "insensitive" as const } }
    : {};

  const userPick = { id: true, name: true, role: true } as const;

  const usersByIds = (ids: string[], role: Role) =>
    ids.length
      ? db.user.findMany({
          where: { id: { in: ids }, role, status: "active", ...nameFilter },
          select: userPick,
          orderBy: { name: "asc" },
          take: limit,
        })
      : Promise.resolve([]);

  const contacts: ContactView[] = [];
  const seen = new Set<string>();
  const push = (
    users: { id: string; name: string; role: Role }[],
    group: ContactGroup,
    mode: InitiationMode,
    subtitleOf?: (id: string) => string | null,
  ) => {
    for (const u of users) {
      if (u.id === actor.id || seen.has(u.id)) continue;
      seen.add(u.id);
      contacts.push({
        id: u.id,
        name: u.name,
        role: u.role,
        group,
        mode,
        subtitle: subtitleOf?.(u.id) ?? null,
      });
    }
  };

  // Shared sub-lookups -------------------------------------------------------
  const assistantsOfTeachers = async (teacherIds: string[]) => {
    if (!teacherIds.length)
      return { users: [] as { id: string; name: string; role: Role }[], subtitle: new Map<string, string>() };
    const links = await db.teacherAssistant.findMany({
      where: { teacherId: { in: teacherIds }, removedAt: null },
      select: { assistantId: true, teacherId: true, title: true },
    });
    const teacherNames = new Map(
      (
        await db.user.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, name: true },
        })
      ).map((t) => [t.id, t.name]),
    );
    const subtitle = new Map<string, string>();
    for (const l of links) {
      const tName = teacherNames.get(l.teacherId);
      if (tName && !subtitle.has(l.assistantId)) subtitle.set(l.assistantId, tName);
    }
    const users = await usersByIds(
      links.map((l) => l.assistantId),
      "assistant",
    );
    return { users, subtitle };
  };

  const adminsOfCenters = async (centerIds: string[]) => {
    if (!centerIds.length)
      return { users: [] as { id: string; name: string; role: Role }[], subtitle: new Map<string, string>() };
    const [profiles, centers] = await Promise.all([
      db.centerAdminProfile.findMany({
        where: { centerId: { in: centerIds } },
        select: { userId: true, centerId: true },
      }),
      db.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, name: true },
      }),
    ]);
    const centerNames = new Map(centers.map((c) => [c.id, c.name]));
    const subtitle = new Map<string, string>();
    for (const p of profiles) {
      const cName = centerNames.get(p.centerId);
      if (cName && !subtitle.has(p.userId)) subtitle.set(p.userId, cName);
    }
    const users = await usersByIds(
      profiles.map((p) => p.userId),
      "center_admin",
    );
    return { users, subtitle };
  };

  /** teacherIds + centerIds reachable from a set of students' active enrollments. */
  const reachOfStudents = async (studentIds: string[]) => {
    if (!studentIds.length)
      return { teacherIds: [] as string[], centerIds: [] as string[] };
    const enrollments = await db.enrollment.findMany({
      where: { studentId: { in: studentIds }, status: "active" },
      select: { centerId: true, course: { select: { teacherId: true } } },
    });
    return {
      teacherIds: [...new Set(enrollments.map((e) => e.course.teacherId))],
      centerIds: [...new Set(enrollments.map((e) => e.centerId).filter((id): id is string => !!id))],
    };
  };

  const studentsOfTeachers = async (teacherIds: string[]) => {
    if (!teacherIds.length) return [] as string[];
    const enrollments = await db.enrollment.findMany({
      where: { status: "active", course: { teacherId: { in: teacherIds } } },
      select: { studentId: true },
      // Directory is search-first at scale; a hard cap keeps this bounded.
      take: 2000,
    });
    return [...new Set(enrollments.map((e) => e.studentId))];
  };

  const parentsOfStudents = async (studentIds: string[]) => {
    if (!studentIds.length) return [] as string[];
    const links = await db.parentStudentLink.findMany({
      where: { studentId: { in: studentIds }, status: "approved" },
      select: { parentId: true },
      take: 2000,
    });
    return [...new Set(links.map((l) => l.parentId))];
  };

  // Per-role assembly --------------------------------------------------------
  switch (actor.role) {
    case "student": {
      const reach = await reachOfStudents([actor.id]);
      const assistants = await assistantsOfTeachers(reach.teacherIds);
      push(assistants.users, "assistants", "open", (id) =>
        assistants.subtitle.get(id) ?? null,
      );
      const admins = await adminsOfCenters(reach.centerIds);
      push(admins.users, "centers", "open", (id) => admins.subtitle.get(id) ?? null);
      break;
    }

    case "parent": {
      const children = await approvedChildIds(db, actor.id);
      const reach = await reachOfStudents(children);
      const assistants = await assistantsOfTeachers(reach.teacherIds);
      push(assistants.users, "assistants", "open", (id) =>
        assistants.subtitle.get(id) ?? null,
      );
      const admins = await adminsOfCenters(reach.centerIds);
      push(admins.users, "centers", "open", (id) => admins.subtitle.get(id) ?? null);
      break;
    }

    case "teacher": {
      const team = await assistantsOfTeachers([actor.id]);
      push(team.users, "team", "open");
      const affiliations = await db.centerTeacherAffiliation.findMany({
        where: { teacherId: actor.id, status: "active" },
        select: { centerId: true },
      });
      const admins = await adminsOfCenters(affiliations.map((a) => a.centerId));
      push(admins.users, "centers", "open", (id) => admins.subtitle.get(id) ?? null);
      // Escalation-only reach — grouped apart so assistant-first stays the norm.
      const studentIds = await studentsOfTeachers([actor.id]);
      push(await usersByIds(studentIds, "student"), "students", "escalation");
      const parentIds = await parentsOfStudents(studentIds);
      push(await usersByIds(parentIds, "parent"), "parents", "escalation");
      break;
    }

    case "assistant": {
      const teacherIds = await activeTeacherIdsForAssistant(db, actor.id);
      push(await usersByIds(teacherIds, "teacher"), "teachers", "open");
      const studentIds = await studentsOfTeachers(teacherIds);
      push(await usersByIds(studentIds, "student"), "students", "open");
      const parentIds = await parentsOfStudents(studentIds);
      push(await usersByIds(parentIds, "parent"), "parents", "open");
      const affiliations = teacherIds.length
        ? await db.centerTeacherAffiliation.findMany({
            where: { teacherId: { in: teacherIds }, status: "active" },
            select: { centerId: true },
          })
        : [];
      const admins = await adminsOfCenters([
        ...new Set(affiliations.map((a) => a.centerId)),
      ]);
      push(admins.users, "centers", "open", (id) => admins.subtitle.get(id) ?? null);
      break;
    }

    case "center_admin": {
      const centerId = actor.centerId ?? (await adminCenterId(db, actor.id));
      if (!centerId) break;
      const affiliations = await db.centerTeacherAffiliation.findMany({
        where: { centerId, status: "active" },
        select: { teacherId: true },
      });
      const teacherIds = affiliations.map((a) => a.teacherId);
      push(await usersByIds(teacherIds, "teacher"), "teachers", "open");
      const assistants = await assistantsOfTeachers(teacherIds);
      push(assistants.users, "assistants", "open", (id) =>
        assistants.subtitle.get(id) ?? null,
      );
      const roster = await db.centerStudentRoster.findMany({
        where: { centerId, leftAt: null },
        select: { studentId: true },
        take: 2000,
      });
      const enrolled = await db.enrollment.findMany({
        where: { centerId, status: "active" },
        select: { studentId: true },
        take: 2000,
      });
      const studentIds = [
        ...new Set([
          ...roster.map((r) => r.studentId),
          ...enrolled.map((e) => e.studentId),
        ]),
      ];
      push(await usersByIds(studentIds, "student"), "students", "open");
      const parentIds = await parentsOfStudents(studentIds);
      push(await usersByIds(parentIds, "parent"), "parents", "open");
      break;
    }

    // super_admin / accountant: no chat — back-office staff live in
    // apps/superadmin (no chat surface) and cannot hold a www session.
  }

  return contacts;
}
